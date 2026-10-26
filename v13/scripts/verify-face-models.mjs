// CI smoke test (non-blocking): loads both ONNX models with onnxruntime-web (WASM, in Node) and checks the
// input/output contract that src/face-engine.js and src/face-math.js rely on. Then runs the real-browser smoke test.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as ort from "onnxruntime-web";
import { decodeYunet, DET_SIZE, EMB_SIZE } from "../src/face-math.js";

ort.env.wasm.numThreads = 1;
const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "..", "public", "models");
const load = (f) => ort.InferenceSession.create(readFileSync(join(dir, f)), { executionProviders: ["wasm"] });
let failed = 0;
const check = (cond, msg) => { console.log((cond ? "PASS " : "FAIL ") + msg); if (!cond) failed++; };

const det = await load("face_detection_yunet_2023mar.onnx");
console.log("YuNet inputs: " + det.inputNames.join(",") + " outputs: " + det.outputNames.join(","));
const out = await det.run({ [det.inputNames[0]]: new ort.Tensor("float32", new Float32Array(3 * DET_SIZE * DET_SIZE), [1, 3, DET_SIZE, DET_SIZE]) });
const named = {};
for (const s of [8, 16, 32]) {
  for (const [k, ch] of [["cls", 1], ["obj", 1], ["bbox", 4], ["kps", 10]]) {
    const t = out[`${k}_${s}`];
    check(!!t && t.data.length === (DET_SIZE / s) ** 2 * ch, `YuNet output ${k}_${s} has the expected length`);
    if (t) named[`${k}_${s}`] = t.data;
  }
}
try { check(Array.isArray(decodeYunet(named)), "decodeYunet runs on the real outputs"); } catch (e) { check(false, "decodeYunet: " + e.message); }

const emb = await load("face_recognition_sface_2021dec.onnx");
console.log("SFace inputs: " + emb.inputNames.join(",") + " outputs: " + emb.outputNames.join(","));
const rnd = (seed) => { const a = new Float32Array(3 * EMB_SIZE * EMB_SIZE); let s = seed; for (let i = 0; i < a.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; a[i] = s % 256; } return a; };
const run = async (a) => (await emb.run({ [emb.inputNames[0]]: new ort.Tensor("float32", a, [1, 3, EMB_SIZE, EMB_SIZE]) }))[emb.outputNames[0]].data;
const e1 = await run(rnd(1)), e1b = await run(rnd(1)), e2 = await run(rnd(2));
check(e1.length === 128, "SFace output is 128-d (got " + e1.length + ")");
check(e1.every((v, i) => v === e1b[i]), "SFace is deterministic for identical input");
check(e1.some((v, i) => Math.abs(v - e2[i]) > 1e-4), "SFace output changes with the input");

// Real-browser smoke test on a real face photo (CI only, never blocks the build)
spawnSync(process.execPath, [join(here, "browser-smoke.mjs")], { stdio: "inherit" });
process.exit(failed ? 1 : 0);
