// On-device face detection (YuNet) + embedding (SFace) through ONNX Runtime Web (WASM, single thread).
// ORT, its wasm and both models ship inside the APK (public/ort, public/models): no network at runtime.
import {
  DET_SIZE, EMB_SIZE, letterbox, decodeYunet, toFrame, rgbaToPlanar, similarityTransform,
  grayFromRgba, meanOf, laplacianVar
} from "./face-math.js";
import { normalize } from "./face-id.js";

export class FaceEngineError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// WebAssembly SIMD probe (same bytes as GoogleChromeLabs/wasm-feature-detect).
const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
export function simdSupported() {
  try { return typeof WebAssembly === "object" && WebAssembly.validate(SIMD_PROBE); } catch (e) { return false; }
}
const root = () => new URL("./", document.baseURI).href;

let runtimeP = null, detP = null, embP = null;

function runtime() {
  if (!runtimeP) {
    runtimeP = (async () => {
      if (!simdSupported()) {
        throw new FaceEngineError("simd", "نسخهٔ Android System WebView این گوشی قدیمی است و تشخیص چهره را پشتیبانی نمی‌کند؛ آن را از Google Play به‌روزرسانی کنید.");
      }
      let ort;
      try { ort = await import(/* @vite-ignore */ root() + "ort/ort.wasm.min.mjs"); }
      catch (e) { throw new FaceEngineError("runtime", "اجزای تشخیص چهره (ONNX Runtime) در این نسخهٔ برنامه پیدا نشد."); }
      ort.env.wasm.wasmPaths = root() + "ort/";
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      return ort;
    })();
    runtimeP.catch(() => { runtimeP = null; });
  }
  return runtimeP;
}

async function loadSession(ort, file, minBytes) {
  let res = null;
  try { res = await fetch(root() + "models/" + file); } catch (e) { res = null; }
  if (!res || !res.ok) throw new FaceEngineError("model", "فایل مدل چهره (" + file + ") در این نسخهٔ برنامه نیست.");
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length < minBytes) throw new FaceEngineError("model", "فایل مدل چهره (" + file + ") ناقص است.");
  try {
    return await ort.InferenceSession.create(bytes, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
  } catch (e) {
    throw new FaceEngineError("model", "بارگذاری مدل چهره ناموفق بود: " + (e && e.message ? e.message : e));
  }
}

// Loads runtime + both models once (sequentially, to keep peak memory low on 3-4 GB phones).
export function prepare() {
  const rt = runtime();
  if (!detP) {
    detP = rt.then((ort) => loadSession(ort, "face_detection_yunet_2023mar.onnx", 100000));
    detP.catch(() => { detP = null; });
  }
  if (!embP) {
    embP = Promise.all([rt, detP]).then(([ort]) => loadSession(ort, "face_recognition_sface_2021dec.onnx", 30000000));
    embP.catch(() => { embP = null; });
  }
  return Promise.all([rt, detP, embP]).then(([ort, det, emb]) => ({ ort, det, emb }));
}

// Free the models (called when the scan screen closes) so Whisper/recording get the memory back.
export async function releaseEngine() {
  const sessions = [detP, embP];
  detP = null; embP = null;
  for (const p of sessions) {
    try { const s = p && await p; if (s && s.release) await s.release(); } catch (e) { /* ignore */ }
  }
}

// ---------- detection ----------
let detCtx = null, detPlanar = null;
function detBuffers() {
  if (!detCtx) {
    const c = document.createElement("canvas"); c.width = c.height = DET_SIZE;
    detCtx = c.getContext("2d", { willReadFrequently: true });
    detPlanar = new Float32Array(3 * DET_SIZE * DET_SIZE);
  }
  return detCtx;
}

// Faces in VIDEO-FRAME coordinates, biggest first. Each: { x, y, w, h, score, lm: [[x,y] x5] }.
export async function detectFaces(video) {
  const { ort, det } = await prepare();
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return [];
  const ctx = detBuffers(), lb = letterbox(vw, vh);
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, DET_SIZE, DET_SIZE);
  ctx.drawImage(video, 0, 0, vw, vh, lb.padX, lb.padY, lb.nw, lb.nh);
  const px = ctx.getImageData(0, 0, DET_SIZE, DET_SIZE).data;
  rgbaToPlanar(px, DET_SIZE, DET_SIZE, "bgr", detPlanar);
  const res = await det.run({ [det.inputNames[0]]: new ort.Tensor("float32", detPlanar, [1, 3, DET_SIZE, DET_SIZE]) });
  const named = {};
  for (const n of det.outputNames) named[n] = res[n].data;
  return decodeYunet(named).map((d) => toFrame(d, lb)).sort((a, b) => b.w * b.h - a.w * a.h);
}

// ---------- alignment, quality, embedding ----------
let embCtx = null, embPlanar = null;
function embBuffers() {
  if (!embCtx) {
    const c = document.createElement("canvas"); c.width = c.height = EMB_SIZE;
    embCtx = c.getContext("2d", { willReadFrequently: true });
    embPlanar = new Float32Array(3 * EMB_SIZE * EMB_SIZE);
  }
  return embCtx;
}

// Warp the face so its 5 landmarks land on the ArcFace template. Returns a SHARED 112x112 canvas:
// use it (cropQuality / embedAligned) before calling alignedCanvas again.
export function alignedCanvas(video, lm) {
  const g = embBuffers(), t = similarityTransform(lm);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = "#000"; g.fillRect(0, 0, EMB_SIZE, EMB_SIZE);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  g.setTransform(t.a, t.b, t.c, t.d, t.e, t.f);
  g.drawImage(video, 0, 0);
  g.setTransform(1, 0, 0, 1, 0, 0);
  return g.canvas;
}

export function cropQuality(canvas) {
  const px = canvas.getContext("2d").getImageData(0, 0, EMB_SIZE, EMB_SIZE).data;
  const gray = grayFromRgba(px, EMB_SIZE, EMB_SIZE);
  return { bright: meanOf(gray), sharp: laplacianVar(gray, EMB_SIZE, EMB_SIZE) };
}

// 128-d L2-normalised SFace embedding of an aligned 112x112 crop (raw 0-255 RGB, as OpenCV does).
export async function embedAligned(canvas) {
  const { ort, emb } = await prepare();
  embBuffers();
  const px = canvas.getContext("2d").getImageData(0, 0, EMB_SIZE, EMB_SIZE).data;
  rgbaToPlanar(px, EMB_SIZE, EMB_SIZE, "rgb", embPlanar);
  const res = await emb.run({ [emb.inputNames[0]]: new ort.Tensor("float32", embPlanar, [1, 3, EMB_SIZE, EMB_SIZE]) });
  return normalize(Array.from(res[emb.outputNames[0]].data));
}
