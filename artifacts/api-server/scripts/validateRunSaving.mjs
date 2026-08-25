import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { rm } from "node:fs/promises";

globalThis.require = createRequire(import.meta.url);

const artifactDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const workspaceDir = path.resolve(artifactDir, "../..");
const outputDir = path.resolve(
  artifactDir,
  `.run-saving-tests-${process.pid}-${randomUUID().slice(0, 8)}`,
);
const outputFiles = [
  path.resolve(outputDir, "api.run-saving.test.mjs"),
  path.resolve(outputDir, "mobile.run-saving.test.mjs"),
];

let exitCode = 1;

try {
  await rm(outputDir, { recursive: true, force: true });
  await esbuild({
    entryPoints: {
      "api.run-saving.test": path.resolve(
        artifactDir,
        "src/tests/runSaving.integration.test.ts",
      ),
      "mobile.run-saving.test": path.resolve(
        workspaceDir,
        "artifacts/hexrunner/scripts/runSaving.mobile.test.ts",
      ),
    },
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: outputDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "warning",
    external: ["*.node", "pg-native"],
    plugins: [esbuildPluginPino({ transports: ["pino-pretty"] })],
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';
globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);`,
    },
  });

  const result = spawnSync(
    process.execPath,
    ["--test", "--test-concurrency=1", ...outputFiles],
    { cwd: workspaceDir, stdio: "inherit", env: process.env },
  );
  exitCode = result.status ?? 1;
} finally {
  await rm(outputDir, { recursive: true, force: true });
}

process.exitCode = exitCode;