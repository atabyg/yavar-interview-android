// CI-only, NON-BLOCKING browser smoke test of the Face-ID pipeline.
// Loads the BUILT assets (dist/ort, dist/models) in a real Chrome, runs src/face-engine.js on a public-domain face photo
// (NASA astronaut portrait bundled with scikit-image) and compares with OpenCV's own YuNet+SFace output on the same photo.
// Always exits 0: read the PASS/FAIL lines in the log. Skipped unless CI=true (or FACE_SMOKE=1).
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = process.env.SMOKE_DIST || join(root, "dist");
const work = join(tmpdir(), "yavar-face-smoke");
const sel = join(work, "selftest");
const say = (ok, msg) => console.log((ok ? "PASS " : "FAIL ") + "[browser] " + msg);
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".json": "application/json", ".png": "image/png", ".onnx": "application/octet-stream", ".css": "text/css" };

const PY_REF = `
import sys, json
import numpy as np, cv2
from skimage import data
yunet, sface, out = sys.argv[1], sys.argv[2], sys.argv[3]
bgr = cv2.cvtColor(data.astronaut(), cv2.COLOR_RGB2BGR)
cv2.imwrite(out + "/astronaut.png", bgr)
det = cv2.FaceDetectorYN.create(yunet, "", (bgr.shape[1], bgr.shape[0]), 0.8, 0.3, 5000)
_, faces = det.detect(bgr)
if faces is None or len(faces) == 0:
    print("OpenCV found no face"); sys.exit(2)
f = faces[0]
rec = cv2.FaceRecognizerSF.create(sface, "")
feat = rec.feature(rec.alignCrop(bgr, f)).ravel().astype(float)
feat = feat / np.linalg.norm(feat)
json.dump({"embedding": feat.tolist(), "face": [float(x) for x in f.tolist()], "opencv": cv2.__version__}, open(out + "/reference.json", "w"))
print("opencv", cv2.__version__, "face box", [round(float(x), 1) for x in f[:4]], "score", round(float(f[14]), 3))
`;

function startServer() {
  const server = createServer((req, res) => {
    try {
      const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
      let file;
      if (url === "/__selftest.html") file = join(work, "selftest.html");
      else if (url.startsWith("/__selftest/")) file = join(sel, url.slice("/__selftest/".length));
      else file = join(dist, url === "/" ? "index.html" : url);
      const base = url.startsWith("/__selftest") ? work : dist;
      if (!normalize(file).startsWith(normalize(base) + sep) && normalize(file) !== normalize(base)) { res.writeHead(403); res.end(); return; }
      if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end("not found"); return; }
      res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream", "Content-Length": statSync(file).size });
      res.end(readFileSync(file));
    } catch (e) { res.writeHead(500); res.end(String(e)); }
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function main() {
  if (process.env.CI !== "true" && !process.env.FACE_SMOKE) { console.log("browser smoke test skipped (set FACE_SMOKE=1 to run locally)"); return; }
  for (const f of ["index.html", "ort/ort.wasm.min.mjs", "ort/ort-wasm-simd-threaded.wasm", "models/face_detection_yunet_2023mar.onnx", "models/face_recognition_sface_2021dec.onnx"]) {
    if (!existsSync(join(dist, f))) { say(false, "missing built asset dist/" + f); return; }
  }
  mkdirSync(sel, { recursive: true });
  for (const f of ["face-engine.js", "face-math.js", "face-id.js", "daily.js"]) copyFileSync(join(root, "src", f), join(sel, f));
  copyFileSync(join(root, "scripts", "face-selftest.html"), join(work, "selftest.html"));

  // 1) reference photo + OpenCV reference output
  if (!process.env.SMOKE_SKIP_PYTHON) {
    const pip = (extra) => spawnSync("python3", ["-m", "pip", "install", "--quiet", "--disable-pip-version-check", ...extra, "opencv-python-headless", "scikit-image"], { encoding: "utf8" });
    let r = pip([]);
    if (r.status !== 0) r = pip(["--break-system-packages"]);
    if (r.status !== 0) { say(false, "pip install opencv-python-headless scikit-image failed: " + String(r.stderr || "").slice(-300)); return; }
    const p = spawnSync("python3", ["-c", PY_REF, join(dist, "models/face_detection_yunet_2023mar.onnx"), join(dist, "models/face_recognition_sface_2021dec.onnx"), sel], { encoding: "utf8" });
    say(p.status === 0, "OpenCV reference: " + (String(p.stdout || "") + String(p.stderr || "")).trim().split("\n").slice(-3).join(" | ").slice(0, 300));
    if (p.status !== 0) return;
  }
  if (!existsSync(join(sel, "astronaut.png"))) { say(false, "test photo missing"); return; }

  // 2) Playwright, installed in a throw-away folder (no browser download: uses the Chrome that ships on the runner)
  let pwDir = process.env.SMOKE_PW;
  if (!pwDir) {
    mkdirSync(join(work, "pw"), { recursive: true });
    const n = spawnSync("npm", ["install", "--prefix", join(work, "pw"), "--no-audit", "--no-fund", "playwright-core@1.56.0"], { encoding: "utf8" });
    if (n.status !== 0) { say(false, "npm install playwright-core failed: " + String(n.stderr || "").slice(-300)); return; }
    pwDir = join(work, "pw", "node_modules", "playwright-core");
  }
  const { chromium } = await import(pathToFileURL(join(pwDir, "index.mjs")).href);
  const chrome = [process.env.SMOKE_CHROME, process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean).find((x) => existsSync(x));
  if (!chrome) spawnSync("npx", ["playwright-core", "install", "chromium"], { cwd: work, stdio: "inherit" });
  const server = await startServer();
  let browser;
  try {
    browser = await chromium.launch({ executablePath: chrome || undefined, headless: true, args: ["--no-sandbox", "--disable-gpu"] });
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.log("FAIL [browser] page error: " + e.message));
    page.on("console", (m) => { if (m.type() === "error") console.log("[browser console] " + m.text().slice(0, 300)); });
    await page.goto("http://127.0.0.1:" + server.address().port + "/__selftest.html");
    const lines = await Promise.race([
      page.evaluate(() => window.__done),
      new Promise((_, rej) => setTimeout(() => rej(new Error("selftest timed out after 240 s")), 240000))
    ]);
    console.log(lines);
  } catch (e) {
    say(false, "browser run failed: " + (e && e.message ? e.message : e));
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.close();
  }
}

main().catch((e) => say(false, "smoke test crashed: " + (e && e.message ? e.message : e))).finally(() => process.exit(0));
