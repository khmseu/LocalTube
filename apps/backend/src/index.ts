import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse } from "dotenv";
import { expand } from "dotenv-expand";
import { buildServer, startServer, validateServerConfig } from "./server.js";

const envPath =
  process.env.DOTENV_CONFIG_PATH ?? join(process.cwd(), ".env");
const parsed = parse(readFileSync(envPath, { encoding: "utf8" }));
expand({ parsed });

// Expand tilde after dotenv-expand (not a shell/env var, needs separate handling)
for (const [key, value] of Object.entries(parsed)) {
  parsed[key] = value.replace(/^~(?=\/|$)/, homedir());
}

Object.assign(process.env, parsed);

const { videoRootDirs } = validateServerConfig();
await startServer(buildServer({ videoRootDirs }));
