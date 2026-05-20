import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const APP_VERSION = "2026-05-20-radio-followup-queue-v43";

const clients = new Set();
let state = {
  playing: false,
  index: Math.floor(Math.random() * 100000),
  volume: 0.72,
  weatherLocation: null,
  lastHostLine: "欢迎回来。今晚先从一首不急着抵达的歌开始。",
  queue: [],
  history: []
};

let generationId = 0;

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

const weatherLabels = new Map([
  [0, "晴"],
  [1, "大致晴朗"],
  [2, "多云"],
  [3, "阴"],
  [45, "有雾"],
  [48, "雾凇"],
  [51, "小毛毛雨"],
  [53, "毛毛雨"],
  [55, "大毛毛雨"],
  [61, "小雨"],
  [63, "雨"],
  [65, "大雨"],
  [71, "小雪"],
  [73, "雪"],
  [75, "大雪"],
  [80, "阵雨"],
  [81, "强阵雨"],
  [82, "暴雨"],
  [95, "雷雨"]
]);

function addNeteaseCookie(url) {
  if (process.env.NETEASE_COOKIE) {
    url.searchParams.set("cookie", process.env.NETEASE_COOKIE);
  }
  return url;
}

function json(res, value, status = 200) {
  const body = JSON.stringify(value, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body);
}

async function readJson(file) {
  return JSON.parse(await readFile(path.join(DATA_DIR, file), "utf8"));
}

async function readText(file) {
  return readFile(path.join(DATA_DIR, file), "utf8");
}

async function writeJson(file, value) {
  await writeFile(path.join(DATA_DIR, file), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function loadPlaylist() {
  return readJson("playlists.json");
}

async function getTaste() {
  return readJson("taste.json");
}

async function getMemory() {
  try {
    return await readJson("memory.json");
  } catch {
    return {
      chatCount: 0,
      preferences: [],
      recentAsks: [],
      artistAliases: {},
      lastRecommendations: [],
      pendingArtistAlias: null,
      pendingArtistIntent: null,
      updatedAt: null
    };
  }
}

async function rememberChat(prompt) {
  const memory = await getMemory();
  const text = normalizeText(prompt);
  const hints = [
    ["r&b", /r&b|rnb|rb|soul|布鲁斯/],
    ["emo", /emo|伤感|丧|emo歌/],
    ["纯音/OST", /纯音|ost|bgm|原声|配乐|前奏/],
    ["写代码", /写代码|coding|工作|专注/],
    ["夜晚慢歌", /夜|晚上|深夜|慢|放松/],
    ["中文歌", /中文|国语|华语/],
    ["英文歌", /英文|英语|欧美|外文|english|western/],
    ["散步", /散步|走路|步行|walk/],
    ["暧昧暖歌", /暧昧|暖昧|温柔|暖|心动|甜/],
    ["日语歌", /日语|日文|jpop|j-pop|动漫/]
  ];
  for (const [label, pattern] of hints) {
    if (pattern.test(text) && !memory.preferences.includes(label)) {
      memory.preferences.push(label);
    }
  }
  memory.chatCount += 1;
  memory.recentAsks = [prompt, ...memory.recentAsks.filter((item) => item !== prompt)].slice(0, 8);
  memory.artistAliases ||= {};
  memory.lastRecommendations ||= [];
  memory.updatedAt = new Date().toISOString();
  await writeJson("memory.json", memory);
  return memory;
}

async function rememberRecommendations(memory, recommendations) {
  memory.lastRecommendations = (recommendations || [])
    .map((item) => Number(item.index))
    .filter((index) => Number.isInteger(index))
    .slice(0, 40);
  await writeJson("memory.json", memory);
  return memory;
}

async function getPlan() {
  return readText("routines.md");
}

function dayPart() {
  const hour = new Date().getHours();
  if (hour < 6) return "late night";
  if (hour < 11) return "morning";
  if (hour < 18) return "afternoon";
  if (hour < 22) return "evening";
  return "late night";
}

function dayPartLabel(value = dayPart()) {
  return {
    morning: "早上",
    afternoon: "下午",
    evening: "晚上",
    "late night": "深夜"
  }[value] || value;
}

function weatherMood(weather) {
  const text = `${weather.text || ""}`.toLowerCase();
  if (text.includes("雨") || text.includes("rain")) return "下雨，偏低 BPM、暖色、松一点的歌";
  if (text.includes("雪") || text.includes("snow")) return "下雪，偏安静、空旷、慢一点的歌";
  if (text.includes("晴") || text.includes("clear")) return "晴朗，适合更明亮、有步行感的歌";
  if (text.includes("阴") || text.includes("云") || text.includes("cloud")) return "多云或阴天，适合柔和、有内省感的歌";
  if (weather.temp >= 30) return "天气偏热，适合清爽、轻快、低压迫感的歌";
  if (weather.temp <= 8) return "天气偏冷，适合温暖、厚一点的声音";
  return "天气平稳，按当前情绪自然衔接";
}

async function getWeather() {
  const key = process.env.OPENWEATHER_API_KEY;
  const city = process.env.CITY || "Shanghai";
  const location = state.weatherLocation;

  if (key) {
    const url = new URL("https://api.openweathermap.org/data/2.5/weather");
    if (location?.lat && location?.lon) {
      url.searchParams.set("lat", location.lat);
      url.searchParams.set("lon", location.lon);
    } else {
      url.searchParams.set("q", city);
    }
    url.searchParams.set("appid", key);
    url.searchParams.set("units", "metric");
    url.searchParams.set("lang", "zh_cn");
    const response = await fetch(url);
    if (!response.ok) throw new Error(`OpenWeather failed: ${response.status}`);
    const data = await response.json();
    return {
      city: data.name || location?.label || city,
      text: data.weather?.[0]?.description || "未知",
      temp: Math.round(data.main?.temp || 0),
      source: "openweather"
    };
  }

  if (location?.lat && location?.lon) {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", location.lat);
    url.searchParams.set("longitude", location.lon);
    url.searchParams.set("current", "temperature_2m,weather_code,precipitation");
    url.searchParams.set("timezone", "auto");
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Open-Meteo failed: ${response.status}`);
    const data = await response.json();
    const code = data.current?.weather_code;
    return {
      city: location.label || "当前位置",
      text: weatherLabels.get(code) || "当地天气",
      temp: Math.round(data.current?.temperature_2m || 0),
      precipitation: data.current?.precipitation || 0,
      source: "open-meteo"
    };
  }

  return {
    city,
    text: "cloudy",
    temp: 24,
    source: "mock"
  };
}

async function getLyric(songId) {
  if (!songId) return { lyric: "", source: "none" };
  const base = (process.env.NETEASE_API_BASE || "http://localhost:4000").replace(/\/$/, "");
  try {
    const url = addNeteaseCookie(new URL(`${base}/lyric`));
    url.searchParams.set("id", songId);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Lyric failed: ${response.status}`);
    const data = await response.json();
    return {
      lyric: data.lrc?.lyric || data.klyric?.lyric || "",
      tlyric: data.tlyric?.lyric || "",
      source: "netease"
    };
  } catch {
    return { lyric: "", source: "none" };
  }
}

async function getSongUrl(songId) {
  if (!songId) return { url: "", source: "none" };
  const base = (process.env.NETEASE_API_BASE || "http://localhost:4000").replace(/\/$/, "");
  const level = process.env.NETEASE_AUDIO_LEVEL || "standard";
  try {
    const url = addNeteaseCookie(new URL(`${base}/song/url/v1`));
    url.searchParams.set("id", songId);
    url.searchParams.set("level", level);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Song URL failed: ${response.status}`);
    const data = await response.json();
    const item = data.data?.[0];
    return {
      url: item?.url || "",
      level: item?.level || level,
      type: item?.type || "",
      time: item?.time || 0,
      code: item?.code || data.code,
      source: "netease"
    };
  } catch (error) {
    return { url: "", error: error.message, source: "none" };
  }
}

async function claudeChat(messages, system) {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) return null;

  const model = process.env.CLAUDE_MODEL || process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      system,
      messages: messages.map((item) => ({
        role: item.role === "assistant" ? "assistant" : "user",
        content: item.content
      })),
      max_tokens: 220,
      temperature: 0.85
    })
  });
  if (!response.ok) throw new Error(`Claude failed: ${response.status}`);
  const data = await response.json();
  return (data.content || []).filter((block) => block.type === "text").map((block) => block.text).join("\n").trim() || null;
}

async function openAiChat(messages) {
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const baseUrl = process.env.DEEPSEEK_API_KEY
    ? (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com")
    : (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1");
  const model = process.env.DEEPSEEK_API_KEY
    ? (process.env.DEEPSEEK_MODEL || "deepseek-chat")
    : (process.env.OPENAI_MODEL || "gpt-4.1-mini");
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.85,
      max_tokens: 180
    })
  });
  if (!response.ok) throw new Error(`LLM failed: ${response.status}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || null;
}

async function aiChat(messages, system) {
  return (await claudeChat(messages, system)) || (await openAiChat(system ? [{ role: "system", content: system }, ...messages] : messages));
}

function fallbackHostLine({ track, nextTrack, weather, plan }) {
  const album = track.album ? `《${track.album}》` : "这张作品";
  const seed = [...`${track.title}${track.artist}${track.album || ""}`].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const lines = [
    `${track.artist} 的 ${track.title} 放在 ${album} 里听，重心会落在旋律的走向和声线的质感上。先别急着判断，让它把气氛铺开。`,
    `${track.title} 的开头适合慢一点听，留意鼓点、和声和人声的位置。${track.artist} 把气口留得很清楚，细节会自己浮出来。`,
    `现在这首是 ${track.title}。如果只抓一个细节，我会听 ${track.artist} 怎么处理副歌前后的张力，那里面有它真正的情绪变化。`,
    `${track.title} 不需要被说得很满，先让 ${track.artist} 的音色站出来。旋律和伴奏之间的距离，就是这首歌最耐听的地方。`,
    `从 ${album} 里抽出 ${track.title}，比较值得听的是编曲层次：底色不厚，但情绪有起伏，适合把注意力慢慢收回来。`,
    `${track.artist} 在 ${track.title} 里给得很克制，适合把注意力放到旋律尾音和伴奏细节上。它不是猛地推人，而是慢慢靠近。`,
    `这一首 ${track.title} 先听氛围，再听结构。${track.artist} 没有把情绪一下推到顶，所以留白反而更明显。`,
    `${track.title} 的标题很直接，但真正有意思的是声音里的层次。${track.artist} 把空间留出来，让旋律自己往前走。`,
    `${track.title} 适合从低频和节拍听起，别急着追歌词。${track.artist} 的处理不算外放，反而让 ${album} 的质地更明显。`,
    `这首 ${track.title} 的好处在于它不慌，旋律推进得有分寸。${track.artist} 把情绪压在表面以下，听起来会有一点呼吸感。`,
    `${album} 里的 ${track.title} 适合先听主歌怎么铺垫，再听副歌有没有把画面打开。它的路线比爆发更重要。`,
    `${track.artist} 的 ${track.title} 有一个很适合夜里听的点：它不靠强烈的段落变化抓人，而是靠声音的纹理慢慢靠近。`,
    `如果现在不想太用力听，就让 ${track.title} 先做背景。${track.artist} 的旋律线很清楚，放低一点反而更容易进入。`,
    `${track.title} 这一类歌，最怕被介绍得太满。我们只抓它的节奏、音色和一点点留白，让 ${track.artist} 自己把气氛带出来。`,
    `把 ${track.title} 放在 ${album} 的语境里，会更容易听见它的轻重。${track.artist} 没有急着把答案交出来，这正适合继续往下听。`,
    `这首歌的入口不是一句结论，而是几个细节：鼓点的松紧、人声的距离、和声出现的位置。${track.title} 在这些地方挺有味道。`,
    `${track.artist} 的 ${track.title} 听起来像是先把灯光调暗，再慢慢把旋律推到前面。它的速度不快，但很稳。`,
    `现在放 ${track.title}，我会把注意力给到编曲的边角：那些不抢耳的部分，往往决定一首歌耐不耐听。`,
    `${track.title} 的情绪不是一下子涌上来的，它更像慢慢压低音量后的靠近。${track.artist} 把这份克制处理得很清楚。`,
    `${album} 里的这首 ${track.title}，适合听它怎么从开头走到副歌。不是每一首歌都要爆发，有些歌靠的是路线。`,
    `如果把 ${track.title} 看成一段声音场景，${track.artist} 最值得注意的是人声和伴奏之间的距离。这个距离让歌有了可回放的空间。`,
    `${track.title} 的旋律不一定第一秒就抓住人，但它会在中段慢慢显形。越往后听，越能感觉到 ${track.artist} 的处理。`,
    `${track.artist} 这首 ${track.title} 不急着制造高潮，它更像把情绪摊平，让你自己挑一个细节进去听。`,
    `现在先听 ${track.title}。它在 ${album} 里有一种稳定的质感，适合把注意力从外面收回来，慢慢放到声音里面。`
  ];
  return lines[seed % lines.length];
}

function sanitizeHostLine(line, track) {
  const fallback = fallbackHostLine({ track });
  const cleaned = String(line || "")
    .replace(/\s+/g, " ")
    .split(/(?<=[。！？!?；;])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence && !/(下一首|下首|后面接|后面会|接下来|顺着|转场|会接|先接|播完|下一段)/.test(sentence))
    .join("");
  if (cleaned.length < 18) return fallback;
  return cleaned.slice(0, 220);
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function trackText(track) {
  return normalizeText([
    track.title,
    track.artist,
    track.album,
    track.mood,
    track.source,
    ...(track.playlists || []).map((item) => item.name)
  ].filter(Boolean).join(" "));
}

function cleanQuery(query) {
  return normalizeText(query)
    .replace(/我想听|想听|我要听|来一首|播放|直接|帮我|推荐|找一首|找点|挑选|挑|查询|查|搜索|搜|歌曲|音乐|专辑里的歌|专辑里|专辑|album|里面的歌|里的歌|的歌|有几首|多少首|几首|呢|吧|呀/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function expandedQueryAliases(query) {
  const compact = compactText(query);
  const aliases = [];
  const pairs = [
    [/五百英里|五百里|500英里|五佰英里/, ["five hundred miles", "500 miles"]],
    [/圣诞快乐劳伦斯先生|圣诞快乐.*劳伦斯|劳伦斯先生|圣诞先生劳伦斯|merrychristmasmrlawrence/, [
      "merry christmas mr lawrence",
      "merry christmas mr. lawrence",
      "merry christmas mr.lawrence",
      "メリークリスマスmrローレンス",
      "メリークリスマスミスターローレンス"
    ]]
  ];
  for (const [pattern, values] of pairs) {
    if (pattern.test(compact)) aliases.push(...values);
  }
  return [...new Set(aliases)];
}

function compactText(value) {
  return normalizeText(value)
    .replace(/[龍竜]/g, "龙")
    .replace(/[’‘`]/g, "'")
    .replace(/[\s\-_:：()[\]【】《》"'.,，。!?！？/\\]+/g, "");
}

function hasJapaneseKana(value) {
  return /[\u3040-\u30ff]/.test(String(value || ""));
}

function looksJapaneseTrack(track) {
  const rawText = `${track.title || ""} ${track.artist || ""} ${track.album || ""}`;
  return hasJapaneseKana(rawText)
    || /j-pop|japanese|anime|初音|東方|坂本|米津|radwimps|aimer|yoasobi|宇多田|椎名|オリジナル|サウンドトラック/i.test(rawText);
}

function looksChineseTrack(track) {
  const rawText = `${track.title || ""} ${track.artist || ""}`;
  if (looksJapaneseTrack(track)) return false;
  return /[\u4e00-\u9fff]/.test(rawText);
}

const artistAliases = [
  ["黄老板", ["stevie hoang", "ed sheeran"]],
  ["霉霉", ["taylor swift"]],
  ["打雷姐", ["lana del rey"]],
  ["火星哥", ["bruno mars"]],
  ["断眉", ["charlie puth"]],
  ["骚当", ["adam levine", "maroon 5"]],
  ["姆爷", ["eminem"]],
  ["盆栽哥", ["the weeknd"]],
  ["戳爷", ["troye sivan"]],
  ["鳖姐", ["lady gaga"]],
  ["日日", ["rihanna"]],
  ["结石姐", ["jessie j"]],
  ["啪姐", ["dua lipa"]],
  ["比伯", ["justin bieber"]],
  ["黄宣", ["yellow"]],
  ["ow", ["oh wonder"]],
  ["周董", ["周杰伦", "jay chou"]],
  ["医生", ["陈奕迅", "eason chan"]],
  ["老林", ["林俊杰", "jj lin"]],
  ["薛", ["薛之谦"]],
  ["教授", ["坂本龙一", "坂本龍一", "ryuichi sakamoto"]]
];

function aliasTargetsForQuery(query) {
  const normalized = normalizeText(query);
  const compactQuery = compactText(query);
  return artistAliases
    .filter(([alias]) => {
      const aliasCompact = compactText(alias);
      if (/^[a-z0-9]{1,2}$/.test(aliasCompact)) {
        return new RegExp(`(^|[^a-z0-9])${aliasCompact}([^a-z0-9]|$)`, "i").test(normalized);
      }
      return compactQuery.includes(aliasCompact);
    })
    .flatMap(([, targets]) => targets);
}

function userAliasTargetsForQuery(query, memory) {
  const aliases = memory?.artistAliases || {};
  const compactQuery = compactText(query);
  return Object.entries(aliases)
    .filter(([alias]) => compactQuery.includes(compactText(alias)))
    .flatMap(([, target]) => Array.isArray(target) ? target : [target])
    .filter(Boolean);
}

function queryStyleFlags(query) {
  const normalized = normalizeText(query);
  return {
    chinese: /华语|国语|中文|内地|港台|mandopop|c-?pop/i.test(normalized),
    english: /英文|英语|欧美|外文|english|western/i.test(normalized),
    love: /情歌|爱情|恋爱|失恋|甜歌|emo|伤感|心动|想你|爱|喜欢|love/i.test(normalized),
    warmWalk: /暧昧|暖昧|温柔|暖|散步|走路|步行|walk|心动|微醺/i.test(normalized),
    japanese: /日语|日文|日系|日本|jpop|j-pop|anime/i.test(normalized),
    rnb: /r&b|rnb|rb|soul|布鲁斯|节奏布鲁斯/i.test(normalized),
    ost: /ost|原声|影视|电影|电视剧|动漫|bgm|配乐/i.test(normalized),
    noIntro: /(?:不要|不想要|别|没有|没|少点|少一点|短|不带).{0,4}(?:前奏|intro)|(?:前奏).{0,4}(?:短|少|不要|没有|没|不带)/i.test(normalized),
    intro: /前奏|intro/i.test(normalized) && !/(?:不要|不想要|别|没有|没|少点|少一点|短|不带).{0,4}(?:前奏|intro)|(?:前奏).{0,4}(?:短|少|不要|没有|没|不带)/i.test(normalized)
  };
}

const musicStyleRules = [
  { key: "electronic", query: /电子|电音|合成器|synth|edm|future|house|techno/i, track: /electronic|synth|edm|future|house|techno|neon|电音|电子/i, score: 32 },
  { key: "rock", query: /摇滚|吉他|rock|punk|alternative|indie/i, track: /rock|punk|alternative|guitar|indie|band|摇滚|吉他/i, score: 32 },
  { key: "rap", query: /说唱|嘻哈|饶舌|rap|hip.?hop|trap/i, track: /rap|hip hop|hip-hop|trap|说唱|嘻哈/i, score: 32 },
  { key: "jazz", query: /爵士|蓝调|jazz|blues|swing|bossa/i, track: /jazz|blues|swing|bossa|sax|爵士|蓝调/i, score: 32 },
  { key: "folk", query: /民谣|folk|乡村|country|木吉他/i, track: /folk|country|acoustic|guitar|民谣|乡村|吉他/i, score: 28 },
  { key: "classical", query: /古典|交响|管弦|classical|orchestra|symphony/i, track: /classical|orchestra|symphony|concerto|sonata|piano|violin|古典|交响|钢琴|小提琴/i, score: 30 },
  { key: "piano", query: /钢琴|piano|琴/i, track: /piano|钢琴|琴/i, score: 30 },
  { key: "instrumental", query: /纯音|纯音乐|无人声|instrumental/i, track: /instrumental|piano|ambient|bgm|ost|soundtrack|纯音乐|钢琴|配乐/i, score: 34 },
  { key: "lofi", query: /lofi|lo-fi|低保真|白噪|学习|专注/i, track: /lofi|lo-fi|chill|study|ambient|soft|night|dream/i, score: 28 },
  { key: "dance", query: /跳舞|律动|蹦迪|dance|disco|funk/i, track: /dance|disco|funk|groove|party|club/i, score: 30 },
  { key: "citypop", query: /city pop|citypop|城市流行|昭和/i, track: /city pop|citypop|昭和|japanese|j-pop/i, score: 32 },
  { key: "female", query: /女声|女歌手|女生|female/i, track: /taylor|lana|aimer|yoasobi|adele|rihanna|selena|王菲|邓紫棋|孙燕姿|田馥甄|张靓颖|女声/i, score: 22 },
  { key: "male", query: /男声|男歌手|男生|male/i, track: /jay|eason|bruno|stevie|westlife|林俊杰|陈奕迅|周杰伦|薛之谦|男声/i, score: 22 },
  { key: "vocalFast", query: /没有前奏|没前奏|不要前奏|不带前奏|短前奏|前奏短|直接开唱|一上来就唱/i, track: /love|heart|you|我|你|爱|恋|miss|kiss|baby|tonight/i, score: 22 }
];

function contextualPrompt(prompt, memory) {
  const normalized = normalizeText(prompt);
  const referencesPreviousAsk = /这种|这个|那种|继续|接着|按刚才|刚才|上面|那个方向|这个方向/.test(normalized);
  const explicitFreshAsk = /我想听|我要听|想听|听|来一首|播放|找|推荐|搜索|搜|查询|查/.test(normalized) && !referencesPreviousAsk;
  if (explicitFreshAsk) return prompt;
  if (!/英文|英语|欧美|外文|中文|华语|国语|这种|这个|那种|继续|要/.test(normalized)) return prompt;
  const recent = (memory?.recentAsks || [])
    .filter((item) => item && item !== prompt)
    .slice(0, 2)
    .join(" ");
  return recent ? `${prompt} ${recent}` : prompt;
}

function findArtistMatches(playlist, query, memory) {
  const cleaned = cleanQuery(query);
  const queryCompact = compactText(cleaned);
  const aliasTargets = [...aliasTargetsForQuery(query), ...userAliasTargetsForQuery(query, memory)].map(compactText);
  const directTargets = queryCompact.length >= 3 ? [queryCompact] : [];
  const targets = [...new Set([...directTargets, ...aliasTargets].filter((item) => item.length >= 2))];
  if (!targets.length) return [];
  return playlist.tracks.map((track, index) => {
    const artistCompact = compactText(track.artist);
    const artistParts = String(track.artist || "")
      .split(/\s*(?:\/|,|&|、|和|feat\.?|ft\.?|with)\s*/i)
      .map(compactText)
      .filter(Boolean);
    const score = targets.reduce((best, target) => {
      if (artistCompact === target) return Math.max(best, 190);
      if (artistParts.includes(target)) return Math.max(best, 185);
      if (artistCompact.includes(target)) return Math.max(best, 160);
      return best;
    }, 0);
    return score ? { index, track, score } : null;
  }).filter(Boolean).sort((a, b) => b.score - a.score);
}

function looksLikeSpecificArtistRequest(prompt) {
  const normalized = normalizeText(prompt);
  const cleaned = cleanQuery(prompt);
  const styles = queryStyleFlags(prompt);
  if (Object.values(styles).some(Boolean)) return false;
  if (aliasTargetsForQuery(prompt).length) return false;
  if (!/(听|播|播放|找|搜索|搜|查|推荐)/.test(normalized)) return false;
  if (!/(的歌|歌曲|音乐|歌手|artist)/i.test(normalized)) return false;
  if (!cleaned) return false;
  return compactText(cleaned).length <= 16;
}

function displayArtistRequest(prompt, recommendations, memory) {
  const aliasTargets = [...aliasTargetsForQuery(prompt), ...userAliasTargetsForQuery(prompt, memory)];
  if (aliasTargets.length) return aliasTargets[0];
  const cleaned = cleanQuery(prompt);
  if (cleaned) return cleaned;
  return recommendations[0]?.track?.artist || "这个歌手";
}

function looksLikeBareArtistName(prompt) {
  const normalized = normalizeText(prompt);
  const compact = compactText(normalized);
  if (!compact || compact.length > 24) return false;
  if (/[？?。！!，,]/.test(prompt)) return false;
  if (/听|播|播放|推荐|找|搜|查|检索|查询|歌|音乐|一下|也|吗|为什么|怎么|什么|谁|哪/.test(normalized)) return false;
  return /[\u4e00-\u9fffA-Za-z]/.test(normalized);
}

async function rememberArtistAlias(memory, alias, artistName) {
  const cleanAlias = cleanQuery(alias || "");
  const cleanArtist = cleanQuery(artistName || artistName);
  if (!cleanAlias || !cleanArtist) return memory;
  memory.artistAliases ||= {};
  memory.artistAliases[cleanAlias] = cleanArtist;
  memory.pendingArtistAlias = null;
  memory.pendingArtistIntent = null;
  await writeJson("memory.json", memory);
  return memory;
}

function cleanAlbumQuery(query) {
  const normalized = normalizeText(query);
  const match = normalized.match(/(?:我想听|想听|我要听|来一首|播放|直接|帮我|推荐|找一首|找点|挑选|挑|查询|查|搜索|搜)?\s*(.+?)(?:专辑|album)/i);
  const candidate = match?.[1] || cleanQuery(query);
  return cleanQuery(candidate)
    .replace(/里面|里|的$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function searchTracks(playlist, query, limit = 5) {
  const normalized = normalizeText(query);
  const cleaned = cleanQuery(query);
  const albumMode = /专辑|album/i.test(query);
  const effectiveQuery = albumMode ? (cleanAlbumQuery(query) || cleaned) : cleaned;
  const aliasTargets = aliasTargetsForQuery(query);
  const queryAliases = expandedQueryAliases(effectiveQuery);
  const styleFlags = queryStyleFlags(query);
  const expandedQuery = [effectiveQuery, ...queryAliases, ...aliasTargets].filter(Boolean).join(" ");
  const queryStopWords = new Set(["and", "the", "of", "a", "an", "to", "in", "on", "for", "的", "里"]);
  const tokens = normalized.split(/[ ,，。！？!?、]+/).filter((token) => token && !queryStopWords.has(token));
  const cleanTokens = expandedQuery.split(/[ ,，。！？!?、]+/).filter((token) => token && !queryStopWords.has(token));
  const queryCompacts = [effectiveQuery || normalized, ...queryAliases].map(compactText).filter(Boolean);
  const moodHints = [
    ["纯音", ["instrumental", "ost", "original motion picture", "soundtrack", "piano", "bgm", "ambient"]],
    ["r&b", ["r&b", "rnb", "r b", "soul", "neo soul", "rhythm", "blues"]],
    ["rnb", ["r&b", "rnb", "r b", "soul", "neo soul", "rhythm", "blues"]],
    ["rb", ["r&b", "rnb", "r b", "soul", "neo soul", "rhythm", "blues"]],
    ["说唱", ["rap", "hip hop", "hip-hop", "trap"]],
    ["摇滚", ["rock", "alternative", "punk", "guitar"]],
    ["爵士", ["jazz", "swing", "bossa", "sax"]],
    ["写代码", ["synth", "ambient", "lofi", "instrumental", "ost", "bgm"]],
    ["放松", ["soft", "slow", "dream", "ambient", "piano", "night"]],
    ["前奏", ["intro", "ost", "soundtrack", "instrumental", "bgm"]],
    ["日语", ["j-pop", "japanese", "anime", "ost"]]
  ];

  return playlist.tracks.map((track, index) => {
    const text = trackText(track);
    const titleCompact = compactText(track.title);
    const albumCompact = compactText(track.album);
    const artistCompact = compactText(track.artist);
    const combinedCompact = compactText(`${track.title} ${track.artist} ${track.album}`);
    const rawText = `${track.title} ${track.artist} ${track.album || ""}`;
    let score = 0;
    if (styleFlags.chinese && looksChineseTrack(track)) score += 46;
    if (styleFlags.chinese && looksJapaneseTrack(track)) score -= 90;
    if (styleFlags.english && /[a-z]/i.test(`${track.title}${track.artist}`) && !/[\u4e00-\u9fff]/.test(track.title)) score += 38;
    if (styleFlags.love && /爱|恋|情|心|你|我|想|念|梦|泪|痛|伤|别|吻|抱|喜欢|love|heart|kiss|miss|tears|without you/i.test(rawText)) score += 34;
    if (styleFlags.warmWalk && /warm|soft|sweet|summer|walk|somewhere|wonder|love|heart|light|moon|night|dream|温柔|暖|夏|心|爱|恋|梦|月|夜|海/i.test(rawText)) score += 28;
    if (styleFlags.japanese && looksJapaneseTrack(track)) score += 46;
    if (styleFlags.rnb && /r&b|rnb|soul|blues|rhythm|stevie hoang|boyz ii men|usher|ne-yo|mariah|bruno mars/i.test(rawText)) score += 34;
    if (styleFlags.ost && /ost|原声|soundtrack|from "|电影|电视剧|anime|bgm|配乐|theme/i.test(rawText)) score += 34;
    if (styleFlags.intro && /intro|前奏|instrumental|overture|prelude|opening|op\.|theme|bgm|配乐/i.test(rawText)) score += 34;
    if (styleFlags.noIntro && /intro|前奏|instrumental|overture|prelude|opening|op\.|theme|bgm|配乐|纯音乐|piano|钢琴|soundtrack|ost/i.test(rawText)) score -= 80;
    for (const rule of musicStyleRules) {
      if (rule.query.test(normalized) && rule.track.test(rawText)) score += rule.score;
    }
    for (const target of aliasTargets) {
      const targetCompact = compactText(target);
      if (artistCompact.includes(targetCompact)) score += 80;
      if (combinedCompact.includes(targetCompact)) score += 30;
    }
    for (const queryCompact of queryCompacts) {
      if (albumMode && albumCompact === queryCompact) score += 90;
      if (albumMode && albumCompact.includes(queryCompact)) score += 70;
      if (albumMode && queryCompact.includes(albumCompact) && albumCompact.length > 3) score += 36;
      if (!albumMode && titleCompact === queryCompact) score += 120;
      if (!albumMode && titleCompact.includes(queryCompact)) score += 54;
      if (!albumMode && combinedCompact.includes(queryCompact)) score += 16;
      if (albumMode && (titleCompact.includes(queryCompact) || artistCompact.includes(queryCompact))) score += 12;
    }
    if (effectiveQuery && text.includes(effectiveQuery)) score += albumMode ? 10 : 18;
    for (const token of tokens) {
      if (albumMode && /专辑|album|挑选|挑|找|搜|搜索|推荐|播放|歌曲|音乐|的歌|有几首|多少首|几首/.test(token)) continue;
      if (text.includes(token)) score += token.length > 1 ? 4 : 1;
    }
    for (const token of cleanTokens) {
      if (albumMode && normalizeText(track.album).includes(token)) score += token.length > 1 ? 14 : 1;
      else if (text.includes(token)) score += token.length > 1 ? 8 : 1;
    }
    for (const [hint, words] of moodHints) {
      if (normalized.includes(hint)) {
        if (words.some((word) => text.includes(word))) score += 4;
        if (hint === "纯音" && !/[a-z\u4e00-\u9fa5]{8,}/i.test(track.artist || "")) score += 1;
      }
    }
    if (normalized.includes("直接") || normalized.includes("播放")) score += 1;
    if (styleFlags.noIntro && !looksNoIntroBlocked(track)) score += 18;
    return { index, track, score, blockedByNoIntro: styleFlags.noIntro && looksNoIntroBlocked(track) };
  })
    .filter((item) => item.score > 0 && !item.blockedByNoIntro)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit);
}

function profileFromPlaylist(playlist) {
  const tracks = playlist.tracks || [];
  const countBy = (getter) => {
    const counts = new Map();
    for (const track of tracks) {
      const value = getter(track);
      if (!value) continue;
      counts.set(value, (counts.get(value) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count }));
  };
  const topArtists = countBy((track) => track.artist);
  const topAlbums = countBy((track) => track.album);
  const text = tracks.map(trackText).join(" ");
  const styleRules = [
    ["OST / 电影原声", /ost|original motion picture|soundtrack|原声|配乐/g],
    ["R&B / Soul", /r&b|rnb|soul|blues/g],
    ["日语 / 动漫感", /j-pop|japanese|anime|初音|東方|sound horizon/g],
    ["华语流行", /华语|国语|mandopop|周杰伦|林俊杰|五月天/g],
    ["电子 / 合成器", /synth|electronic|edm|future|neon/g],
    ["安静纯音", /instrumental|piano|ambient|bgm|lofi/g],
    ["摇滚 / 吉他", /rock|guitar|punk|alternative/g],
    ["夜晚慢歌", /night|moon|slow|dream|雨|夜/g]
  ];
  const styles = styleRules.map(([name, pattern]) => ({
    name,
    count: (text.match(pattern) || []).length
  })).filter((item) => item.count > 0).sort((a, b) => b.count - a.count).slice(0, 8);
  const playlists = playlist.playlists || (playlist.playlist ? [playlist.playlist] : []);
  const summary = [
    `曲库共 ${tracks.length} 首，来自 ${playlists.length || 1} 个来源。`,
    topArtists.length ? `高频歌手包括 ${topArtists.slice(0, 4).map((item) => item.name).join("、")}。` : "",
    styles.length ? `整体气质偏 ${styles.slice(0, 4).map((item) => item.name).join("、")}。` : "",
    topAlbums.length ? `反复出现的专辑/作品集有《${topAlbums.slice(0, 3).map((item) => item.name).join("》《")}》。` : ""
  ].filter(Boolean).join("");
  return { trackCount: tracks.length, playlists, topArtists, topAlbums, styles, summary };
}

function isCountQuestion(prompt) {
  const normalized = normalizeText(prompt);
  return /导入.*多少|歌单.*数量|曲库.*数量/.test(normalized)
    || (/多少首|几首/.test(normalized) && cleanQuery(prompt).length < 2);
}

function isSongCountQuestion(prompt) {
  const normalized = normalizeText(prompt);
  if (/推荐|给我|来|放|播放|想听|我要听|我想听/.test(normalized)) return false;
  return /多少首|几首/.test(normalized) && cleanQuery(prompt).length >= 2;
}

function extractArtistNameFragment(prompt) {
  const normalized = normalizeText(prompt);
  const patterns = [
    /(?:歌手名|艺名|名字|姓名).{0,4}(?:含|带|有|包含)(.+?)(?:的)?歌手/,
    /(?:歌手名|艺名|名字|姓名).{0,4}(?:含|带|有|包含)(.+?)(?:有哪些|有谁|是谁|$)/,
    /(?:含|带|包含)(.+?)(?:的)?歌手(?:有哪些|有谁|是谁|$)/
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match?.[1]) continue;
    const fragment = match[1].replace(/哪些|有谁|是谁|吗|呢|呀|吧|的/g, "").trim();
    if (compactText(fragment)) return fragment;
  }
  return "";
}

function findArtistsByNameFragment(playlist, fragment, limit = 20) {
  const target = compactText(fragment);
  if (!target) return [];
  const artists = new Map();
  for (const track of playlist.tracks || []) {
    const names = String(track.artist || "")
      .split(/\s*(?:\/|,|&|、|和|feat\.?|ft\.?|with)\s*/i)
      .map((name) => name.trim())
      .filter(Boolean);
    for (const name of names) {
      if (!compactText(name).includes(target)) continue;
      const item = artists.get(name) || { name, count: 0, examples: [] };
      item.count += 1;
      if (item.examples.length < 2) item.examples.push(track.title);
      artists.set(name, item);
    }
  }
  return [...artists.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-Hans-CN"))
    .slice(0, limit);
}

function findTitleMatches(playlist, query, limit = 20) {
  const cleaned = cleanQuery(query);
  const queryVariants = [cleaned, ...expandedQueryAliases(cleaned)]
    .map(compactText)
    .filter(Boolean);
  if (!queryVariants.length) return [];
  const queryTokens = cleaned.split(/[ ,，。！？!?、]+/).filter((token) => token.length > 1);
  return playlist.tracks.map((track, index) => {
    const titleCompact = compactText(track.title);
    const artistCompact = compactText(track.artist);
    const albumCompact = compactText(track.album);
    let score = 0;
    for (const queryCompact of queryVariants) {
      if (titleCompact === queryCompact) score = Math.max(score, 140);
      if (titleCompact.includes(queryCompact)) score = Math.max(score, 105);
      if (queryCompact.includes(titleCompact) && titleCompact.length > 2) score = Math.max(score, 80);
    }
    if (score > 0) {
      if (/圣诞快乐劳伦斯先生|劳伦斯先生|merrychristmasmrlawrence/.test(compactText(query))
        && /坂本|sakamoto|ryuichi/i.test(`${track.artist} ${track.album || ""}`)) {
        score += 35;
      }
      for (const token of queryTokens) {
        const tokenCompact = compactText(token);
        if (titleCompact.includes(tokenCompact)) score += 10;
        if (artistCompact.includes(tokenCompact)) score += 2;
        if (albumCompact.includes(tokenCompact)) score += 1;
      }
    }
    return { index, track, score };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit);
}

function wantsMusicSearch(prompt) {
  return /听|播放|找|搜|搜索|检索|查|查询|推荐|歌|音乐|bgm|BGM|纯音|前奏|写代码|放松|来一首|r&b|rnb|rb|soul|华语|国语|中文|英文|英语|欧美|外文|日语|日文|日系|日本|jpop|j-pop|情歌|说唱|摇滚|爵士|hip.?hop|ost|电子|电音|合成器|民谣|乡村|古典|交响|钢琴|女声|男声|lofi|lo-fi|city.?pop|跳舞|律动|没有前奏|没前奏|不要前奏|直接开唱/i.test(prompt);
}

function wantsChatAutoplay(prompt) {
  const normalized = normalizeText(prompt);
  if (isCountQuestion(prompt) || isSongCountQuestion(prompt)) return false;
  if (/从曲库|检索|搜索|搜|查询|查一下|查找|推荐|候选|找几首|列几首|有哪些|有什么/i.test(normalized)) return false;
  return /(^|[，。！？\s])(我要听|我想听|想听|来点|来首|放一首|播放|给我放|给我播|接下来听|下一首听|换成|切到)/i.test(normalized);
}

function confidentMatches(matches) {
  const topScore = matches[0]?.score || 0;
  if (topScore >= 24) return matches;
  return [];
}

function needsMusicClarification(prompt, matches) {
  const cleaned = cleanQuery(prompt);
  const compact = compactText(cleaned);
  const aliases = aliasTargetsForQuery(prompt);
  const styles = queryStyleFlags(prompt);
  const hasStyle = Object.values(styles).some(Boolean);
  if (!wantsMusicSearch(prompt)) return false;
  if (aliases.length || hasStyle) return false;
  if (!matches.length) return true;
  if (compact.length <= 2) return true;
  return (matches[0]?.score || 0) < 24;
}

function looksNoIntroBlocked(track) {
  const rawText = `${track.title} ${track.artist} ${track.album || ""} ${track.mood || ""}`;
  return /intro|前奏|instrumental|overture|prelude|opening|op\.|theme|bgm|配乐|纯音乐|piano|钢琴|soundtrack|ost|original motion picture|original soundtrack|score/i.test(rawText);
}

function wantsSpecificSongPlayback(prompt) {
  const normalized = normalizeText(prompt);
  if (/歌手|的歌|风格|歌单|推荐|几首|哪些|有什么|从曲库|检索|搜索|查询|搜/.test(normalized)) return false;
  return /(我要听|我想听|想听|播放|放一首|放|播|来一首|给我放|给我播)/.test(normalized);
}

function sanitizeStationReply(reply, fallback) {
  const text = String(reply || "").trim();
  if (!text) return fallback;
  if (/这味道我懂|味道我懂|安排上|拿捏|氛围感|懂你|宝藏|绝绝子|狠狠|冲一波|老歌单/i.test(text)) return fallback;
  return text;
}

function wantsAddLastRecommendations(prompt) {
  return /(?:全部|全都|都|这些|这几首|上面|刚才).{0,8}(?:添加|加入|加到|放到|排到).{0,8}(?:列表|队列|播放列表|后面)|(?:添加|加入|加到|放到|排到).{0,8}(?:全部|全都|这些|这几首|上面|刚才)/.test(normalizeText(prompt));
}

function wantsCurrentTrackAnswer(prompt) {
  const normalized = normalizeText(prompt);
  return /这首|当前|现在播|正在播|这歌|这首歌/.test(normalized)
    && /讲|什么意思|介绍|背景|谁唱|歌手|专辑|歌词|说什么|来源|哪张|什么歌/.test(normalized);
}

function plainLyricText(lyric = "") {
  return lyric
    .split(/\r?\n/)
    .map((line) => line.replace(/\[[^\]]+\]/g, "").trim())
    .filter(Boolean)
    .slice(0, 10)
    .join("\n");
}

function wantsWebFacts(prompt) {
  return /电影|影视|出自|来源|原声|奖|获奖|奖项|提名|格莱美|奥斯卡|金球|背景|创作|发行|年代|哪部/.test(normalizeText(prompt));
}

async function lookupTrackFacts(track) {
  const query = `${track.title} ${track.artist} ${track.album || ""}`.replace(/[()[\]【】《》]/g, " ").slice(0, 180);
  const searchUrl = new URL("https://en.wikipedia.org/w/api.php");
  searchUrl.searchParams.set("action", "query");
  searchUrl.searchParams.set("list", "search");
  searchUrl.searchParams.set("srsearch", query);
  searchUrl.searchParams.set("format", "json");
  searchUrl.searchParams.set("origin", "*");
  const searchResponse = await fetch(searchUrl, { headers: { "user-agent": "ClaudioAIRadio/1.0" } });
  if (!searchResponse.ok) throw new Error(`Wikipedia search failed: ${searchResponse.status}`);
  const searchData = await searchResponse.json();
  const pages = (searchData.query?.search || []).slice(0, 3);
  const extracts = [];
  for (const page of pages) {
    const extractUrl = new URL("https://en.wikipedia.org/w/api.php");
    extractUrl.searchParams.set("action", "query");
    extractUrl.searchParams.set("prop", "extracts");
    extractUrl.searchParams.set("exintro", "1");
    extractUrl.searchParams.set("explaintext", "1");
    extractUrl.searchParams.set("pageids", String(page.pageid));
    extractUrl.searchParams.set("format", "json");
    extractUrl.searchParams.set("origin", "*");
    const extractResponse = await fetch(extractUrl, { headers: { "user-agent": "ClaudioAIRadio/1.0" } });
    if (!extractResponse.ok) continue;
    const extractData = await extractResponse.json();
    const item = extractData.query?.pages?.[page.pageid];
    if (item?.extract) {
      extracts.push({
        title: item.title,
        url: `https://en.wikipedia.org/?curid=${page.pageid}`,
        extract: item.extract.slice(0, 1200)
      });
    }
  }
  return extracts;
}

async function answerCurrentTrackQuestion(prompt, payload, memory) {
  const track = payload.track;
  const lyric = await getLyric(track.sourceId || track.id);
  const lyricText = plainLyricText(`${lyric.lyric || ""}\n${lyric.tlyric || ""}`);
  let webFacts = [];
  if (wantsWebFacts(prompt)) {
    try {
      webFacts = await lookupTrackFacts(track);
    } catch {
      webFacts = [];
    }
  }
  const fallback = [
    `现在这首是 ${track.title}，${track.artist}。`,
    track.album ? `它收在《${track.album}》里。` : "",
    webFacts.length ? `我查到的公开资料里，最接近的是 ${webFacts.map((item) => item.title).join("、")}。` : "",
    lyricText ? "从歌词看，它更像是在讲一段关系里的靠近、犹豫或自我确认；具体情绪可以顺着正在唱的句子听。" : "这首没有拿到完整歌词，我先按标题、歌手和听感来判断：它更适合当作氛围来听。"
  ].filter(Boolean).join("");
  try {
    const reply = await aiChat(
      [{ role: "user", content: [
        `用户问：${prompt}`,
        `当前歌曲：${track.title}`,
        `歌手：${track.artist}`,
        `专辑：${track.album || "未知"}`,
        `当前 AI DJ 口播：${payload.lastHostLine || "暂无"}`,
        lyricText ? `歌词摘录：\n${lyricText}` : "歌词摘录：暂无",
        webFacts.length
          ? `联网检索资料：\n${webFacts.map((item, index) => `${index + 1}. ${item.title}\n${item.extract}\nSource: ${item.url}`).join("\n\n")}`
          : wantsWebFacts(prompt)
            ? "联网检索资料：没有查到稳定资料；不要编造电影来源或奖项。"
            : "联网检索资料：用户未要求事实检索。",
        `最近聊天偏好：${memory.preferences.join("、") || "暂无"}`
      ].join("\n") }],
      [
        "你是一个懂音乐的电台朋友。用户问的是当前正在播放的歌，不要推荐新歌，不要排队，不要说候选。",
        "如果用户问电影来源、奖项、创作背景，优先依据联网检索资料；资料里没有就明确说没查到稳定来源，不要编造。",
        "如果引用联网资料，回答末尾用简短的“来源：标题”列出资料标题，不要贴长链接。",
        "如果歌词不足，不要编造事实；可以说“我只能按标题/听感判断”。",
        "回答要自然，像聊天，2 到 5 句。"
      ].join("\n")
    );
    return reply || fallback;
  } catch {
    return fallback;
  }
}

async function answerNormalChat(prompt, payload, memory, taste, weather) {
  const fallback = "我明白，你是在纠正我刚才的理解。我不会继续乱排歌；你可以直接告诉我“教授”指哪位歌手，或者说一个更完整的名字，我再按你的意思找。";
  try {
    const reply = await aiChat(
      [{ role: "user", content: [
        `用户说：${prompt}`,
        `当前歌曲：${payload.track.title} / ${payload.track.artist} / ${payload.track.album || "未知专辑"}`,
        `最近几轮：${memory.recentAsks.slice(0, 6).join(" / ")}`,
        `已记住偏好：${memory.preferences.join("、") || "暂无"}`,
        `隐藏上下文，不要主动提：${weather.city} ${weather.text} ${weather.temp}C`
      ].join("\n") }],
      [
        `你是 ${taste.stationName} 的电台聊天伙伴，不是只会选歌的按钮。`,
        "用户可能在纠正你、追问你、闲聊，或继续上一轮上下文。先接住话，再决定是否需要问清楚。",
        "如果用户在纠正你选错了，不要继续推荐，不要道歉模板化；要承认理解偏了，并问一个具体澄清问题。",
        "如果用户没有明确要求播放/推荐/找歌，不要输出候选歌，不要说“这味道我懂”。",
        "回答自然短一点，像朋友聊天。"
      ].join("\n")
    );
    return reply || fallback;
  } catch {
    return fallback;
  }
}

function trackWeatherScore(track, weather) {
  const haystack = `${track.title} ${track.artist} ${track.album || ""} ${track.mood || ""}`.toLowerCase();
  let score = 0;
  const text = `${weather.text || ""}`.toLowerCase();
  if (text.includes("雨") || text.includes("rain")) {
    if (track.bpm && track.bpm <= 90) score += 3;
    if (/rain|雨|night|moon|slow|soft|dream|blue|cloud/.test(haystack)) score += 2;
  }
  if (text.includes("晴") || text.includes("clear")) {
    if (track.bpm && track.bpm >= 90) score += 2;
    if (/sun|晴|夏|walk|city|light|day|dance/.test(haystack)) score += 2;
  }
  if (weather.temp >= 30 && /summer|夏|sea|blue|清|city/.test(haystack)) score += 2;
  if (weather.temp <= 8 && /winter|冬|warm|夜|雪|moon/.test(haystack)) score += 2;
  return score;
}

async function chooseNextIndex(playlist) {
  while (state.queue.length) {
    const queued = Number(state.queue.shift());
    if (Number.isInteger(queued) && queued >= 0 && queued < playlist.tracks.length && queued !== state.index % playlist.tracks.length) {
      return queued;
    }
  }
  const weather = await getWeather();
  const current = state.index % playlist.tracks.length;
  const candidates = playlist.tracks.map((track, index) => ({ track, index }))
    .filter((item) => item.index !== current)
    .slice(0, 80);
  candidates.sort((a, b) => {
    const score = trackWeatherScore(b.track, weather) - trackWeatherScore(a.track, weather);
    return score || a.index - b.index;
  });
  if (trackWeatherScore(candidates[0]?.track || {}, weather) > 0) return candidates[0].index;
  return (current + 1) % playlist.tracks.length;
}

async function generateHostLine(track, nextTrack) {
  const [taste, weather, memory] = await Promise.all([getTaste(), getWeather(), getMemory()]);
  const system = [
    `你是 ${taste.stationName} 的 AI 电台主播，不是助手。`,
    taste.persona,
    `用户喜欢：${taste.favoriteMoods.join("、")}。`,
    memory.preferences.length ? `最近聊天里显露的偏好：${memory.preferences.join("、")}。` : "",
    `用户不喜欢：${taste.dislikes.join("、")}。`,
    "你的任务是生成一段有质感的电台口播：只围绕当前歌曲、歌手、专辑标题、听感、可能的时代气质和文化氛围娓娓道来。",
    "不要重复固定句式。不要主动说时间、天气、日程。不要说“今天还有几个日程节点”。",
    "不要提下一首、后面接什么、接下来播放什么，也不要写转场说明。",
    "表达要有变化：可以从旋律、编曲、人声距离、节奏松紧、专辑语境、年代气质、影视场景、听感入口等不同角度切入，避免连续几首都用同一种比喻。",
    "如果不知道真实年代、奖项、轶事，不要编造；可以写成听感判断，比如“它听起来像把人带回……”。",
    "输出中文，2 到 4 句，70 到 150 字。像深夜电台，不要列表，不要标题。"
  ].filter(Boolean).join("\n");

  const user = [
    `隐藏上下文，不要主动提：${dayPartLabel()} / ${weather.city} ${weather.text} ${weather.temp}C / ${weatherMood(weather)}`,
    `正在播放：${track.title}`,
    `歌手：${track.artist}`,
    `专辑：${track.album || "未知"}`,
    `标签/来源：${track.mood || track.source || "未知"}`,
    `时长：${track.duration || "未知"} 秒`,
  ].join("\n");

  try {
    const result = await aiChat([{ role: "user", content: user }], system);
    return sanitizeHostLine(result, track);
  } catch {
    return fallbackHostLine({ track, nextTrack, weather });
  }
}

async function fillHostLineAsync(trackIndex) {
  const currentGeneration = ++generationId;
  const playlist = await loadPlaylist();
  const track = playlist.tracks[trackIndex % playlist.tracks.length];
  const nextTrack = playlist.tracks[(trackIndex + 1) % playlist.tracks.length];
  try {
    const line = await generateHostLine(track, nextTrack);
    if (currentGeneration !== generationId || state.index % playlist.tracks.length !== trackIndex % playlist.tracks.length) return;
    state.lastHostLine = line;
    state.history = [{ id: crypto.randomUUID(), at: new Date().toISOString(), track, line }, ...state.history].slice(0, 20);
    await broadcast();
  } catch {
    // Keep the current line; playback should never wait on narration.
  }
}

async function currentPayload() {
  const playlist = await loadPlaylist();
  const track = playlist.tracks[state.index % playlist.tracks.length];
  const nextTrack = playlist.tracks[(state.index + 1) % playlist.tracks.length];
  return {
    ...state,
    index: state.index % playlist.tracks.length,
    track,
    nextTrack,
    library: {
      trackCount: playlist.tracks.length,
      playlistName: playlist.playlist?.name || playlist.name || "Local Radio",
      source: playlist.source || "local"
    },
    weather: await getWeather(),
    dayPart: dayPart()
  };
}

async function broadcast() {
  const payload = `data: ${JSON.stringify(await currentPayload())}\n\n`;
  for (const client of clients) client.write(payload);
}

async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function handleApi(req, res, pathname) {
  if (pathname === "/api/stream") {
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive"
    });
    clients.add(res);
    res.write(`data: ${JSON.stringify(await currentPayload())}\n\n`);
    req.on("close", () => clients.delete(res));
    return;
  }

  if (req.method === "GET" && pathname === "/api/now") return json(res, await currentPayload());
  if (req.method === "GET" && pathname === "/api/health") return json(res, {
    ok: true,
    version: APP_VERSION,
    port: PORT,
    hasClaudeKey: Boolean(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY),
    hasDeepSeekKey: Boolean(process.env.DEEPSEEK_API_KEY),
    hasNeteaseCookie: Boolean(process.env.NETEASE_COOKIE),
    aiProvider: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY
      ? "claude"
      : process.env.DEEPSEEK_API_KEY
        ? "deepseek"
        : process.env.OPENAI_API_KEY
          ? "openai-compatible"
          : "fallback",
    neteaseApiBase: process.env.NETEASE_API_BASE || "http://localhost:4000"
  });
  if (req.method === "GET" && pathname === "/api/taste") return json(res, await getTaste());
  if (req.method === "GET" && pathname === "/api/plan/today") return json(res, { markdown: await getPlan() });
  if (req.method === "GET" && pathname === "/api/library") {
    const playlist = await loadPlaylist();
    return json(res, {
      trackCount: playlist.tracks.length,
      playlist: playlist.playlist || null,
      playlists: playlist.playlists || [],
      source: playlist.source || "local"
    });
  }
  if (req.method === "GET" && pathname === "/api/profile") {
    const playlist = await loadPlaylist();
    return json(res, {
      profile: profileFromPlaylist(playlist),
      memory: await getMemory()
    });
  }
  if (req.method === "GET" && pathname === "/api/lyric") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    return json(res, await getLyric(url.searchParams.get("id")));
  }
  if (req.method === "GET" && pathname === "/api/song-url") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    return json(res, await getSongUrl(url.searchParams.get("id")));
  }

  if (req.method === "POST" && pathname === "/api/weather/location") {
    const body = await parseBody(req);
    const lat = Number(body.lat);
    const lon = Number(body.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return json(res, { error: "invalid location" }, 400);
    state.weatherLocation = {
      lat: lat.toFixed(5),
      lon: lon.toFixed(5),
      label: String(body.label || "当前位置").slice(0, 40)
    };
    await broadcast();
    return json(res, await currentPayload());
  }

  if (req.method === "POST" && pathname === "/api/state") {
    const body = await parseBody(req);
    state = { ...state, ...body };
    await broadcast();
    return json(res, await currentPayload());
  }

  if (req.method === "GET" && pathname === "/api/next") {
    const playlist = await loadPlaylist();
    state.index = await chooseNextIndex(playlist);
    const track = playlist.tracks[state.index];
    state.lastHostLine = "";
    fillHostLineAsync(state.index);
    await broadcast();
    return json(res, await currentPayload());
  }

  if (req.method === "POST" && pathname === "/api/play") {
    const body = await parseBody(req);
    const playlist = await loadPlaylist();
    const index = Number(body.index);
    if (!Number.isInteger(index) || index < 0 || index >= playlist.tracks.length) {
      return json(res, { error: "invalid track index" }, 400);
    }
    state.index = index;
    state.playing = true;
    state.lastHostLine = "";
    fillHostLineAsync(state.index);
    await broadcast();
    return json(res, await currentPayload());
  }

  if (req.method === "DELETE" && pathname.startsWith("/api/history/")) {
    const id = decodeURIComponent(pathname.split("/").pop());
    const indexMatch = id.match(/^index-(\d+)$/);
    if (indexMatch) {
      const index = Number(indexMatch[1]);
      state.history = state.history.filter((_, itemIndex) => itemIndex !== index);
    } else {
      state.history = state.history.filter((item) => item.id !== id);
    }
    await broadcast();
    return json(res, await currentPayload());
  }

  if (req.method === "POST" && pathname === "/api/chat") {
    const body = await parseBody(req);
    const payload = await currentPayload();
    const playlist = await loadPlaylist();
    const taste = await getTaste();
    const weather = payload.weather;
    const prompt = String(body.message || "").slice(0, 1000);
    const memory = await rememberChat(prompt);
    if (wantsAddLastRecommendations(prompt)) {
      const indexes = (memory.lastRecommendations || [])
        .map(Number)
        .filter((index) => Number.isInteger(index) && index >= 0 && index < playlist.tracks.length && index !== state.index % playlist.tracks.length);
      if (!indexes.length) {
        return json(res, {
          reply: "我这里没有可接上的上一批候选。你先搜一组歌，我会记住那组结果，然后你说“全部加入列表”就能接上。",
          recommendations: [],
          queued: false,
          queuePreview: [],
          memory
        });
      }
      state.queue = indexes;
      await broadcast();
      return json(res, {
        reply: `已把刚才这 ${indexes.length} 首加到后续播放列表。`,
        recommendations: indexes.slice(0, 12).map((index) => ({
          index,
          title: playlist.tracks[index].title,
          artist: playlist.tracks[index].artist,
          album: playlist.tracks[index].album || "",
          sourceId: playlist.tracks[index].sourceId || playlist.tracks[index].id || "",
          score: 0
        })),
        queued: true,
        queuePreview: indexes.slice(0, 12).map((index) => ({
          index,
          title: playlist.tracks[index].title,
          artist: playlist.tracks[index].artist,
          album: playlist.tracks[index].album || ""
        })),
        memory
      });
    }
    if (wantsCurrentTrackAnswer(prompt)) {
      return json(res, {
        reply: await answerCurrentTrackQuestion(prompt, payload, memory),
        recommendations: [],
        queued: false,
        queuePreview: [],
        memory
      });
    }
    if (isSongCountQuestion(prompt)) {
      const matches = findTitleMatches(playlist, prompt, 20);
      const query = cleanQuery(prompt);
      const recommendations = matches.slice(0, 8).map((item) => ({
        index: item.index,
        title: item.track.title,
        artist: item.track.artist,
        album: item.track.album || "",
        sourceId: item.track.sourceId || item.track.id || "",
        score: item.score
      }));
      await rememberRecommendations(memory, matches);
      return json(res, {
        reply: matches.length
          ? `我在曲库里找到 ${matches.length} 首标题接近“${query}”的歌，先把最像的放出来。`
          : `我按“${query}”查了歌名，曲库里暂时没有特别稳的同名结果。`,
        recommendations,
        memory
      });
    }
    if (isCountQuestion(prompt)) {
      return json(res, {
        reply: `你现在导入了 ${playlist.tracks.length} 首歌。`,
        recommendations: [],
        memory
      });
    }

    const artistNameFragment = extractArtistNameFragment(prompt);
    if (artistNameFragment) {
      const artists = findArtistsByNameFragment(playlist, artistNameFragment, 24);
      return json(res, {
        reply: artists.length
          ? `名字里带“${artistNameFragment}”的歌手我找到 ${artists.length} 个：${artists.map((artist) => `${artist.name}（${artist.count}首）`).join("、")}。`
          : `曲库里暂时没找到名字带“${artistNameFragment}”的歌手。`,
        recommendations: [],
        queued: false,
        queuePreview: [],
        memory
      });
    }

    const aliasDefinition = normalizeText(prompt).match(/^(.{1,16}?)(?:就是|是|指的是|指)(.{1,30})$/);
    if (aliasDefinition) {
      const alias = cleanQuery(aliasDefinition[1]);
      const artistName = cleanQuery(aliasDefinition[2]);
      const matches = findArtistMatches(playlist, `我要听${artistName}的歌`, memory);
      await rememberArtistAlias(memory, alias, artistName);
      await rememberRecommendations(memory, matches);
      return json(res, {
        reply: matches.length
          ? `记住了，“${alias}”我以后按 ${artistName} 找。曲库里有 ${matches.length} 首，下面先列出来。`
          : `记住了，“${alias}”我以后按 ${artistName} 理解。不过现在曲库里还没找到这个名字。`,
        recommendations: matches.slice(0, 12).map((item) => ({
          index: item.index,
          title: item.track.title,
          artist: item.track.artist,
          album: item.track.album || "",
          sourceId: item.track.sourceId || item.track.id || "",
          score: item.score
        })),
        queued: false,
        queuePreview: [],
        memory
      });
    }

    if (memory.pendingArtistAlias && looksLikeBareArtistName(prompt)) {
      const artistName = cleanQuery(prompt);
      const pendingAlias = memory.pendingArtistAlias;
      const pendingIntent = memory.pendingArtistIntent;
      await rememberArtistAlias(memory, pendingAlias, artistName);
      const continuationPrompt = `我要听${artistName}的歌`;
      const matches = findArtistMatches(playlist, continuationPrompt, memory);
      const queuedIndexes = pendingIntent === "play"
        ? matches.map((item) => item.index).filter((index) => index !== state.index % playlist.tracks.length)
        : [];
      if (queuedIndexes.length) state.queue = queuedIndexes;
      await rememberRecommendations(memory, matches);
      return json(res, {
        reply: matches.length
          ? queuedIndexes.length
            ? `明白了，“${pendingAlias}”就是 ${artistName}。我把曲库里 ${matches.length} 首都排到后面了。`
            : `明白了，“${pendingAlias}”就是 ${artistName}。曲库里找到 ${matches.length} 首，下面这些可以点播放。`
          : `明白了，“${pendingAlias}”就是 ${artistName}。不过曲库里暂时没找到这个名字。`,
        recommendations: matches.slice(0, 12).map((item) => ({
          index: item.index,
          title: item.track.title,
          artist: item.track.artist,
          album: item.track.album || "",
          sourceId: item.track.sourceId || item.track.id || "",
          score: item.score
        })),
        queued: queuedIndexes.length > 0,
        queuePreview: queuedIndexes.slice(0, 12).map((index) => ({
          index,
          title: playlist.tracks[index].title,
          artist: playlist.tracks[index].artist,
          album: playlist.tracks[index].album || ""
        })),
        memory
      });
    }

    if (looksLikeBareArtistName(prompt)) {
      const bareArtistMatches = findArtistMatches(playlist, `我要听${prompt}的歌`, memory);
      if (bareArtistMatches.length) {
        await rememberRecommendations(memory, bareArtistMatches);
        return json(res, {
          reply: `曲库里有 ${bareArtistMatches.length} 首 ${cleanQuery(prompt)}，下面这些可以点播放。`,
          recommendations: bareArtistMatches.slice(0, 12).map((item) => ({
            index: item.index,
            title: item.track.title,
            artist: item.track.artist,
            album: item.track.album || "",
            sourceId: item.track.sourceId || item.track.id || "",
            score: item.score
          })),
          queued: false,
          queuePreview: [],
          memory
        });
      }
    }

    if (!wantsMusicSearch(prompt)) {
      return json(res, {
        reply: await answerNormalChat(prompt, payload, memory, taste, weather),
        recommendations: [],
        queued: false,
        queuePreview: [],
        memory
      });
    }

    const shouldTryTitleSearch = wantsSpecificSongPlayback(prompt)
      || expandedQueryAliases(cleanQuery(prompt)).length > 0
      || /检索|搜索|搜|查|查询/.test(normalizeText(prompt));
    const titleMatches = shouldTryTitleSearch ? findTitleMatches(playlist, prompt, 12) : [];
    const rememberedAliasTargets = userAliasTargetsForQuery(prompt, memory);
    const artistMatches = titleMatches.length
      ? []
      : rememberedAliasTargets.length
        ? findArtistMatches(playlist, `我要听${rememberedAliasTargets[0]}的歌`, memory)
        : findArtistMatches(playlist, prompt, memory);
    const explicitArtistMode = artistMatches.length > 0;
    const explicitTitleMode = titleMatches.length > 0;
    const likelyUnknownArtistRequest = !explicitTitleMode
      && !explicitArtistMode
      && /(听|播放|找|搜|搜索|推荐|查)/.test(normalizeText(prompt))
      && /(?:的歌|歌手|歌曲|音乐)/.test(normalizeText(prompt))
      && compactText(cleanQuery(prompt)).length <= 16;
    if (!explicitArtistMode && (looksLikeSpecificArtistRequest(prompt) || likelyUnknownArtistRequest)) {
      const query = cleanQuery(prompt) || prompt;
      memory.pendingArtistAlias = query;
      memory.pendingArtistIntent = wantsChatAutoplay(prompt) ? "play" : "search";
      await writeJson("memory.json", memory);
      return json(res, {
        reply: `我不确定“${query}”具体指哪位歌手，所以先不乱排歌。你告诉我完整歌手名，或者说“教授就是 XXX”，我再按这个名字找。`,
        recommendations: [],
        queued: false,
        queuePreview: [],
        memory
      });
    }
    const searchPrompt = explicitArtistMode ? prompt : contextualPrompt(prompt, memory);
    const rawRecommendations = explicitTitleMode ? titleMatches : explicitArtistMode ? artistMatches : searchTracks(playlist, searchPrompt, 12);
    if (needsMusicClarification(searchPrompt, rawRecommendations)) {
      const query = cleanQuery(prompt) || prompt;
      if (/(?:的歌|歌手|歌曲|音乐)/.test(normalizeText(prompt)) && compactText(query).length <= 16) {
        memory.pendingArtistAlias = query;
        memory.pendingArtistIntent = wantsChatAutoplay(prompt) ? "play" : "search";
        await writeJson("memory.json", memory);
      }
      return json(res, {
        reply: `我不太确定你说的“${query}”具体指什么，所以先不乱排歌。你是指某个歌手、某首歌，还是一种风格？`,
        recommendations: [],
        queued: false,
        queuePreview: [],
        memory
      });
    }
    const recommendations = confidentMatches(rawRecommendations);
    await rememberRecommendations(memory, recommendations);
    const queuedIndexes = wantsChatAutoplay(prompt)
      ? recommendations
        .map((item) => item.index)
        .filter((index) => index !== state.index % playlist.tracks.length)
        .slice(0, (explicitArtistMode || explicitTitleMode) ? recommendations.length : 12)
      : [];
    if (queuedIndexes.length) {
      state.queue = queuedIndexes;
    }
    const albumMode = /专辑|album/i.test(prompt);
    const recommendationText = recommendations.length
      ? recommendations.map((item, itemIndex) => `${itemIndex + 1}. ${item.track.title} - ${item.track.artist}${item.track.album ? `《${item.track.album}》` : ""}`).join("\n")
      : "";
    const fallback = recommendations.length
      ? recommendations.length === 1
        ? `有，就这一首最稳：${recommendations[0].track.title}。`
        : albumMode
          ? `有，我先按专辑名把最贴近的几首挑出来。`
          : `有，先从这几首里挑。`
      : `我没抓到足够稳的候选，所以先不排歌。你可以再给我一个歌手、语言、年代、情绪，或者说“按刚才那个方向继续”。`;
    if (!recommendations.length) {
      return json(res, {
        reply: fallback,
        recommendations: [],
        queued: false,
        queuePreview: [],
        memory
      });
    }
    const queueNotice = queuedIndexes.length
      ? queuedIndexes.length === 1
        ? `我把《${playlist.tracks[queuedIndexes[0]].title}》排到下一首了，当前这首播完后自动接上。`
        : explicitArtistMode
          ? `我把 ${displayArtistRequest(prompt, recommendations, memory)} 在曲库里的 ${queuedIndexes.length} 首都排到后面了，下一首先接《${playlist.tracks[queuedIndexes[0]].title}》。`
          : `我把这个方向排到后面了，下一首先接《${playlist.tracks[queuedIndexes[0]].title}》，后面还有 ${queuedIndexes.length - 1} 首候选。`
      : "";
    let reply = queueNotice || fallback;
    try {
      const generated = await aiChat(
        [{ role: "user", content: [
          `当前歌曲：${payload.track.title} / ${payload.track.artist}`,
          `曲库数量：${playlist.tracks.length}`,
          `已记住的偏好：${memory.preferences.join("、") || "暂无"}`,
          `最近用户问过：${memory.recentAsks.slice(0, 4).join(" / ")}`,
          `本轮用于理解的上下文：${searchPrompt}`,
          `隐藏上下文，不要主动提：${weather.city} ${weather.text} ${weather.temp}C`,
          recommendationText ? `本地检索候选：\n${recommendationText}` : "本地检索候选：无",
          `用户说：${prompt}`
        ].join("\n") }],
        [
          `你是 ${taste.stationName} 的电台伙伴。你可以正常聊天，也可以帮用户从本地曲库里找歌。`,
          "用户常用很短的口语，比如“r&b呢”“来点纯音”“换个甜的”。你要像真正懂音乐的朋友一样接住，不要解释使用方法。",
          "如果用户是在闲聊，就像朋友一样自然回答，不要强行推荐歌。",
          "如果用户想听歌或搜歌，要优先基于“本地检索候选”回答，语气自然，少说套话。不要说“你可以说……”。",
          "不要主动提天气，除非用户明确问天气或要求按天气推荐。",
          "不要使用固定模板，不要每次都说“收到”。回复尽量像一句电台聊天，短一点。"
        ].join("\n")
      );
      if (!queueNotice) reply = sanitizeStationReply(generated, fallback);
    } catch {
      if (!queueNotice) reply = fallback;
    }
    return json(res, {
      reply,
      queued: queuedIndexes.length > 0,
      queuePreview: queuedIndexes.slice(0, 12).map((index) => ({
        index,
        title: playlist.tracks[index].title,
        artist: playlist.tracks[index].artist,
        album: playlist.tracks[index].album || ""
      })),
      recommendations: recommendations.map((item) => ({
        index: item.index,
        title: item.track.title,
        artist: item.track.artist,
        album: item.track.album || "",
        sourceId: item.track.sourceId || item.track.id || "",
        score: item.score
      })),
      memory,
      provider: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY
        ? "claude"
        : process.env.DEEPSEEK_API_KEY
          ? "deepseek"
          : process.env.OPENAI_API_KEY
            ? "openai-compatible"
            : "fallback"
    });
  }

  json(res, { error: "not found" }, 404);
}

async function serveStatic(req, res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));
  if (!filePath.startsWith(PUBLIC_DIR) || !existsSync(filePath)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath);
  res.writeHead(200, { "content-type": mime[ext] || "application/octet-stream" });
  res.end(await readFile(filePath));
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url.pathname);
    await serveStatic(req, res, url.pathname);
  } catch (error) {
    json(res, { error: error.message }, 500);
  }
}).listen(PORT, () => {
  console.log(`Claudio AI Radio running at http://localhost:${PORT}`);
});
