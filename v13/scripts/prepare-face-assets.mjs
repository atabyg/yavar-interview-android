// Copies the ONNX Runtime Web files the Face-ID feature needs into public/ort so Vite ships them inside the APK.
// They are loaded at runtime from ./ort/ (no CDN, no network). Run automatically by `npm run build` / `npm run dev`.
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "onnxruntime-web", "dist");
const dst = join(root, "public", "ort");

if (!existsSync(src)) {
  console.error("prepare-face-assets: onnxruntime-web is not installed (run `npm ci` first).");
  process.exit(1);
}
const available = readdirSync(src);
const needed = ["ort.wasm.min.mjs", "ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"];
const missing = needed.filter((n) => !available.includes(n));
if (missing.length) {
  console.error("prepare-face-assets: missing " + missing.join(", ") + " in onnxruntime-web/dist. Found: " +
    available.filter((n) => /wasm/i.test(n)).join(", "));
  process.exit(1);
}
mkdirSync(dst, { recursive: true });
for (const n of needed) copyFileSync(join(src, n), join(dst, n));
console.log("prepare-face-assets: copied " + needed.map((n) => n + " (" + Math.round(statSync(join(dst, n)).size / 1024) + " KB)").join(", "));
