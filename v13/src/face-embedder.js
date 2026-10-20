// Offline face embedding. Needs a bundled model: v13/assets/models/face-embed.onnx
// (e.g. MobileFaceNet / ArcFace-mobile, input 1x3x112x112 float32 in [-1,1], output 128/512-d).
// No network is used; the model file ships inside the APK. Add dependency: onnxruntime-web.
let sessionP = null;
export const MODEL_URL = "./models/face-embed.onnx";

async function session() {
  if (!sessionP) sessionP = (async () => {
    const ort = await import("onnxruntime-web");
    ort.env.wasm.numThreads = 1;
    return { ort, s: await ort.InferenceSession.create(MODEL_URL, { executionProviders: ["wasm"] }) };
  })();
  return sessionP;
}
export async function modelAvailable() {
  try { const r = await fetch(MODEL_URL, { method: "HEAD" }); return r.ok; } catch (e) { return false; }
}
// canvas: a 112x112 crop of the face (user aligns the face inside the on-screen oval).
export async function embed(canvas) {
  const { ort, s } = await session();
  const { data } = canvas.getContext("2d").getImageData(0, 0, 112, 112);
  const f = new Float32Array(3 * 112 * 112);
  for (let i = 0; i < 112 * 112; i++) for (let c = 0; c < 3; c++) f[c * 112 * 112 + i] = (data[i * 4 + c] - 127.5) / 128;
  const out = await s.run({ [s.inputNames[0]]: new ort.Tensor("float32", f, [1, 3, 112, 112]) });
  return Array.from(out[s.outputNames[0]].data);
}
