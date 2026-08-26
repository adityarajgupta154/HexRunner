import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rm } from "node:fs/promises";
import { build } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";

globalThis.require = createRequire(import.meta.url);
const artifactDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceDir = path.resolve(artifactDir, "../..");
const outputDir = path.resolve(
  artifactDir,
  `.interaction-tests-${process.pid}-${randomUUID().slice(0, 8)}`,
);
const outputFile = path.resolve(
  outputDir,
  "liveInteractions.integration.test.mjs",
);
let exitCode = 1;
try {
  await rm(outputDir, { recursive: true, force: true });
  await build({
    entryPoints: {
      "liveInteractions.integration.test": path.resolve(
        artifactDir,
        "src/tests/liveInteractions.integration.test.ts",
      ),
    },
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: outputDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "warning",
    external: ["*.node", "pg-native", "sharp"],
    plugins: [esbuildPluginPino({ transports: ["pino-pretty"] })],
    banner: {
      js: `import { createRequire as cr } from 'node:module';import p from 'node:path';import u from 'node:url';globalThis.require=cr(import.meta.url);globalThis.__filename=u.fileURLToPath(import.meta.url);globalThis.__dirname=p.dirname(globalThis.__filename);`,
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