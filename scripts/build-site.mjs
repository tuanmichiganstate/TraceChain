import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const workerSource = fileURLToPath(
  new URL("../sites/worker.mjs", import.meta.url),
);
const serverDirectory = fileURLToPath(
  new URL("../dist/server/", import.meta.url),
);
const workerOutput = fileURLToPath(
  new URL("../dist/server/index.js", import.meta.url),
);

await mkdir(serverDirectory, { recursive: true });
await copyFile(workerSource, workerOutput);

console.log(`Sites build prepared from ${repositoryRoot}`);
