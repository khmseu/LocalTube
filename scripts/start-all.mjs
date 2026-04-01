import { spawn } from "node:child_process";

const processes = [];

const startProcess = (label, command) => {
  const child = spawn(command, {
    shell: true,
    stdio: "inherit",
  });

  child.on("exit", (code) => {
    if (code !== 0) {
      console.error(`${label} exited with code ${code ?? "unknown"}`);
      shutdown(code ?? 1);
    }
  });

  processes.push(child);
  return child;
};

const shutdown = (exitCode = 0) => {
  for (const child of processes) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  process.exit(exitCode);
};

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log("LocalTube frontend: http://127.0.0.1:4173");
console.log("LocalTube backend API: http://127.0.0.1:3000");

startProcess("backend", "npm run start:backend");
startProcess("frontend", "npm run start:frontend");
