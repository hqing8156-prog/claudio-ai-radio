const path = require("node:path");

async function main() {
  const apiDir = process.argv[2];
  if (!apiDir) throw new Error("Missing api-enhanced project path.");
  process.chdir(apiDir);
  process.env.PORT = process.env.PORT || "4000";
  process.env.NO_VERSION_CHECK = "1";
  const generateConfig = require(path.join(apiDir, "generateConfig"));
  await generateConfig();
  const { serveNcmApi } = require(path.join(apiDir, "server"));
  await serveNcmApi({
    port: Number(process.env.PORT || 4000),
    checkVersion: false
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
