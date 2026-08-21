import { build } from "esbuild";
import { build as viteBuild } from "vite";
import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const watch = process.argv.includes("--watch");

async function bundle(entry, outfile, format) {
  const options = {
    entryPoints: [resolve(root, entry)],
    outfile: resolve(root, "dist", outfile),
    bundle: true,
    format,
    platform: "browser",
    target: "chrome114",
    sourcemap: true,
    logLevel: "info",
  };
  if (!watch) return build(options);
  const { context } = await import("esbuild");
  const ctx = await context(options);
  return ctx.watch();
}

await viteBuild({ root, build: { watch: watch ? {} : null } });
await mkdir(resolve(root, "dist"), { recursive: true });
await cp(resolve(root, "public", "manifest.json"), resolve(root, "dist", "manifest.json"));
await Promise.all([
  bundle("src/content/index.ts", "content.js", "iife"),
  bundle("src/background/service-worker.ts", "service-worker.js", "esm"),
]);
