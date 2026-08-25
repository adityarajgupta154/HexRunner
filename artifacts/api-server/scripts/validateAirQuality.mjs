import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import { rm } from "node:fs/promises";

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
