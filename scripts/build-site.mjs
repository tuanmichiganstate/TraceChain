import {
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const buildDirectory = fileURLToPath(new URL("../dist/", import.meta.url));
const clientDirectory = fileURLToPath(new URL("../dist/client/", import.meta.url));
const workerSource = fileURLToPath(
  new URL("../sites/worker.ts", import.meta.url),
);
const serverDirectory = fileURLToPath(
  new URL("../dist/server/", import.meta.url),
);
const workerOutput = fileURLToPath(
  new URL("../dist/server/index.js", import.meta.url),
);
const packageCatalogPath = fileURLToPath(
  new URL("../dist-scorm/package-catalog.json", import.meta.url),
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

const hostedAppShell = await readFile(
  join(clientDirectory, "index.html"),
);
for (const route of [
  "platform",
  "learner",
  "instructor",
  "author",
  "admin",
]) {
  await writeFile(
    join(clientDirectory, `${route}.html`),
    hostedAppShell,
  );
}

const packageCatalog = JSON.parse(
  await readFile(packageCatalogPath, "utf8"),
);
if (
  packageCatalog?.schemaVersion !== "2.0.0" ||
  !Array.isArray(packageCatalog.packages) ||
  packageCatalog.packages.length === 0
) {
  throw new Error(
    "The hosted build requires a verified SCORM package catalog.",
  );
}
const hostedPackageDirectory = join(
  clientDirectory,
  "scorm-packages",
);
await mkdir(hostedPackageDirectory, { recursive: true });
const hostedPackages = [];
for (const artifact of packageCatalog.packages) {
  if (
    artifact.configurationSchemaVersion !== "2" ||
    !["OPERATIONS", "AUDIT"].includes(artifact.activityType) ||
    (artifact.presetId.startsWith("audit-")
      ? artifact.activityType !== "AUDIT"
      : artifact.activityType !== "OPERATIONS") ||
    typeof artifact.supportProfile !== "string" ||
    typeof artifact.deliveryPurpose !== "string" ||
    typeof artifact.outcomeStrategy !== "string" ||
    typeof artifact.contentPackId !== "string" ||
    typeof artifact.contentPackVersion !== "string" ||
    typeof artifact.scoringBlueprintId !== "string" ||
    typeof artifact.scoringBlueprintVersion !== "string"
  ) {
    throw new Error(
      `SCORM artifact lacks Configuration Schema V2 metadata: ${artifact.filename}`,
    );
  }
  const source = join(repositoryRoot, artifact.filename);
  const bytes = await readFile(source);
  if (bytes.byteLength !== artifact.sizeBytes) {
    throw new Error(
      `SCORM artifact size does not match its catalog: ${artifact.filename}`,
    );
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== artifact.sha256) {
    throw new Error(
      `SCORM artifact hash does not match its catalog: ${artifact.filename}`,
    );
  }
  const targetName = `${artifact.sha256}.zip`;
  await writeFile(join(hostedPackageDirectory, targetName), bytes);
  hostedPackages.push({
    ...artifact,
    downloadPath: `/scorm-packages/${targetName}`,
  });
}
await writeFile(
  join(hostedPackageDirectory, "catalog.json"),
  `${JSON.stringify(
    { ...packageCatalog, packages: hostedPackages },
    null,
    2,
  )}\n`,
  "utf8",
);

await mkdir(serverDirectory, { recursive: true });
await build({
  entryPoints: [workerSource],
  outfile: workerOutput,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  logLevel: "info",
});

console.log(`Sites build prepared from ${repositoryRoot}`);
