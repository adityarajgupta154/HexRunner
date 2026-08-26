import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import { rm } from "node:fs/promises";

globalThis.require = createRequire(import.meta.url);

const artifactDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const workspaceDir = path.resolve(artifactDir, "../..");
const outputDir = path.resolve(
  artifactDir,
  `.air-quality-tests-${process.pid}-${randomUUID().slice(0, 8)}`,
);
const outputFile = path.resolve(outputDir, "air-quality.test.mjs");

let exitCode = 1;

try {
  await rm(outputDir, { recursive: true, force: true });
  await esbuild({
    entryPoints: [path.resolve(artifactDir, "src/tests/airQuality.test.ts")],
    platform: "node",
    bundle: true,
    format: "esm",
    outfile: outputFile,
    logLevel: "warning",
    external: ["*.node", "pg-native"],
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';
globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);`,
    },
  });

  const result = spawnSync(process.execPath, ["--test", outputFile], {
    cwd: workspaceDir,
    stdio: "inherit",
    env: process.env,
  });
  exitCode = result.status ?? 1;
} finally {
  await rm(outputDir, { recursive: true, force: true });
}

process.exitCode = exitCode;
