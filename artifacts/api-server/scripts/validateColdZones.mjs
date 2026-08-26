import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { rm } from "node:fs/promises";

globalThis.require = createRequire(import.meta.url);
const artifactDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outdir = path.resolve(artifactDir, `.cold-zone-tests-${process.pid}-${randomUUID().slice(0, 8)}`);
try {
  await build({
    entryPoints: [path.resolve(artifactDir, "src/tests/equityZones.test.ts")],
    platform: "node", bundle: true, format: "esm", outdir, outExtension: { ".js": ".mjs" },
    external: ["*.node", "pg-native", "sharp"], plugins: [esbuildPluginPino({ transports: ["pino-pretty"] })],
    banner: { js: `import { createRequire as __createRequire } from "node:module"; globalThis.require = __createRequire(import.meta.url);` },
  });
  process.exitCode = spawnSync(process.execPath, ["--test", path.resolve(outdir, "equityZones.test.mjs")], { stdio: "inherit" }).status ?? 1;
} finally {
  await rm(outdir, { recursive: true, force: true });
}