import { copyFile, mkdir, readdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const buildDirectory = fileURLToPath(new URL("../dist/", import.meta.url));
const clientDirectory = fileURLToPath(new URL("../dist/client/", import.meta.url));
const workerSource = fileURLToPath(
  new URL("../sites/worker.mjs", import.meta.url),
);
const serverDirectory = fileURLToPath(
  new URL("../dist/server/", import.meta.url),
);
const workerOutput = fileURLToPath(
  new URL("../dist/server/index.js", import.meta.url),
);

const clientEntries = await readdir(buildDirectory, { withFileTypes: true });
await mkdir(clientDirectory, { recursive: true });

for (const entry of clientEntries) {
  if (entry.name === "client" || entry.name === "server") continue;

  await rename(
    join(buildDirectory, entry.name),
    join(clientDirectory, entry.name),
  );
}

await mkdir(serverDirectory, { recursive: true });
await copyFile(workerSource, workerOutput);

console.log(`Sites build prepared from ${repositoryRoot}`);
