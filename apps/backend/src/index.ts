import { buildServer, startServer, validateServerConfig } from "./server.js";

const { videoRootDir } = validateServerConfig();
await startServer(buildServer({ videoRootDir }));
