import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function arg(name, fallback = undefined) {
  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1];
  return fallback;
}

function flag(name) {
  return process.argv.includes(name);
}

const playlistIds = process.argv.filter((value) => /^\d{5,}$/.test(value));
const base = (arg("--base", process.env.NETEASE_API_BASE || "http://localhost:4000")).replace(/\/$/, "");
const output = path.resolve(root, arg("--out", "data/playlists.json"));
const level = arg("--level", "standard");
const includeUrl = flag("--with-url");
const dryRun = flag("--dry-run");
const mergeExisting = flag("--merge");

if (!playlistIds.length) {
  console.error("Usage: npm run import:netease -- <playlistId...> [--base http://localhost:4000] [--with-url] [--level standard|higher|exhigh|lossless|hires] [--dry-run] [--merge]");
  process.exit(1);
}

async function getJson(apiPath, params = {}) {
  const url = new URL(`${base}${apiPath}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${apiPath} failed with HTTP ${response.status}`);
  }
  const data = await response.json();
  if (data.code && data.code !== 200) {
    throw new Error(`${apiPath} failed with API code ${data.code}: ${data.msg || data.message || "unknown error"}`);
  }
  return data;
}

function hashColor(seed) {
  const colors = ["#8fd7ff", "#ffd36e", "#91f0b3", "#f49ab1", "#c8a2ff", "#ff9f68"];
  const sum = [...String(seed)].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[sum % colors.length];
}

function toTrack(song, urlInfo, playlist) {
  const artists = song.ar || song.artists || [];
  const album = song.al || song.album || {};
  return {
    id: String(song.id),
    title: song.name || "Untitled",
    artist: artists.map((item) => item.name).filter(Boolean).join(" / ") || "Unknown Artist",
    album: album.name || "",
    mood: "netease import",
    bpm: null,
    color: hashColor(song.id || song.name),
    duration: Math.max(30, Math.round((song.dt || song.duration || urlInfo?.time || 180000) / 1000)),
    url: urlInfo?.url || "",
    cover: album.picUrl || "",
    source: "netease",
    sourceId: String(song.id),
    sourceIds: [String(song.id)],
    playlists: [
      {
        id: String(playlist.id),
        name: playlist.name || ""
      }
    ],
    fee: song.fee,
    level: urlInfo?.level || ""
  };
}

function dedupeKey(track) {
  return `${track.title} :: ${track.artist}`;
}

async function readExistingImport() {
  try {
    const existing = JSON.parse(await readFile(output, "utf8"));
    const tracks = Array.isArray(existing.tracks) ? existing.tracks : [];
    return {
      playlist: existing.playlist || {
        id: "existing",
        name: "Existing Library",
        creator: "",
        cover: "",
        trackCount: tracks.length
      },
      playlists: existing.playlists || (existing.playlist ? [existing.playlist] : []),
      tracks
    };
  } catch {
    return null;
  }
}

async function readPlaylist(playlistId) {
  console.log(`Reading playlist ${playlistId} from ${base}`);
  const detail = await getJson("/playlist/detail", { id: playlistId });
  const playlist = detail.playlist;
  const songs = playlist?.tracks || [];
  if (!songs.length) throw new Error("No tracks returned. Private playlists may need cookie in the Enhanced API service.");

  let urlById = new Map();
  if (includeUrl) {
    const ids = songs.map((song) => song.id).join(",");
    const urlData = await getJson("/song/url/v1", { id: ids, level });
    urlById = new Map((urlData.data || []).map((item) => [String(item.id), item]));
  }

  return {
    playlist: {
      id: String(playlistId),
      name: playlist.name || "",
      creator: playlist.creator?.nickname || "",
      cover: playlist.coverImgUrl || "",
      trackCount: songs.length
    },
    tracks: songs.map((song) => toTrack(song, urlById.get(String(song.id)), playlist))
  };
}

function mergeImports(imports) {
  const tracksByIdentity = new Map();
  for (const item of imports) {
    for (const track of item.tracks) {
      const key = dedupeKey(track);
      const existing = tracksByIdentity.get(key);
      if (!existing) {
        tracksByIdentity.set(key, track);
        continue;
      }

      if (!existing.sourceIds.includes(track.sourceId)) {
        existing.sourceIds.push(track.sourceId);
      }
      const playlist = track.playlists[0];
      if (!existing.playlists.some((source) => source.id === playlist.id)) {
        existing.playlists.push(playlist);
      }
      if (!existing.url && track.url) existing.url = track.url;
      if (!existing.cover && track.cover) existing.cover = track.cover;
      if (!existing.level && track.level) existing.level = track.level;
    }
  }
  return [...tracksByIdentity.values()];
}

async function main() {
  const imports = [];
  const existing = mergeExisting ? await readExistingImport() : null;
  if (existing) {
    imports.push({
      playlist: existing.playlist,
      tracks: existing.tracks
    });
  }
  for (const playlistId of playlistIds) {
    imports.push(await readPlaylist(playlistId));
  }

  const tracks = mergeImports(imports);
  const result = {
    source: "netease",
    importedAt: new Date().toISOString(),
    playlist: imports.length === 1 ? imports[0].playlist : {
      id: [existing?.playlist?.id, ...playlistIds].filter(Boolean).join("+"),
      name: `Merged NetEase Radio (${imports.length} sources)`,
      creator: imports.map((item) => item.playlist.creator).filter(Boolean).join(" / "),
      cover: imports[0]?.playlist.cover || "",
      trackCount: tracks.length
    },
    playlists: [
      ...(existing?.playlists || []),
      ...imports.filter((item) => item !== existing).map((item) => item.playlist)
    ].filter(Boolean),
    tracks
  };

  if (!dryRun) {
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }

  const playable = result.tracks.filter((track) => track.url).length;
  const originalCount = imports.reduce((sum, item) => sum + item.tracks.length, 0);
  const duplicateCount = originalCount - result.tracks.length;
  console.log(`${dryRun ? "Parsed" : "Wrote"} ${result.tracks.length} unique tracks from ${imports.length} sources${dryRun ? "" : ` to ${output}`}`);
  if (duplicateCount) console.log(`Removed ${duplicateCount} duplicate tracks`);
  if (includeUrl) console.log(`${playable}/${result.tracks.length} tracks include a playable URL`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
