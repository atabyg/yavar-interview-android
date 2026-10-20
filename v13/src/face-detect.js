// Offline face detection + alignment (MediaPipe BlazeFace, bundled files, no network).
// Needs: v13/assets/models/blaze_face_short_range.tflite and the wasm folder at ./mediapipe-wasm
let det = null;
export async function detector() {
  if (det) return det;
  const { FilesetResolver, FaceDetector } = await import("@mediapipe/tasks-vision");
  const fs = await FilesetResolver.forVisionTasks("./mediapipe-wasm");
  det = await FaceDetector.createFromOptions(fs, {
    baseOptions: { modelAssetPath: "./models/blaze_face_short_range.tflite" },
    runningMode: "VIDEO", minDetectionConfidence: 0.7
  });
  return det;
}
// -> { cx, cy, w, h (normalized 0..1), eyes: [[x,y],[x,y]] (pixels) } or null; null if not exactly one face
export function detect(video, ts) {
  const r = det.detectForVideo(video, ts);
  if (!r.detections || r.detections.length !== 1) return null;
  const d = r.detections[0], b = d.boundingBox, W = video.videoWidth, H = video.videoHeight;
  const k = d.keypoints || [];
  return { cx: (b.originX + b.width / 2) / W, cy: (b.originY + b.height / 2) / H, w: b.width / W, h: b.height / H,
    box: b, eyes: k.length >= 2 ? [[k[0].x * W, k[0].y * H], [k[1].x * W, k[1].y * H]] : null };
}
// Rotate so the eyes are level, crop around the face, scale to 112x112.
export function alignedCrop(video, f) {
  const c = document.createElement("canvas"); c.width = c.height = 112;
  const g = c.getContext("2d");
  const side = Math.max(f.box.width, f.box.height) * 1.35;
  const angle = f.eyes ? Math.atan2(f.eyes[1][1] - f.eyes[0][1], f.eyes[1][0] - f.eyes[0][0]) : 0;
  const mx = f.box.originX + f.box.width / 2, my = f.box.originY + f.box.height / 2;
  g.translate(56, 56); g.rotate(-angle); g.scale(112 / side, 112 / side); g.translate(-mx, -my);
  g.drawImage(video, 0, 0);
  return c;
}
// Sharpness (variance of Laplacian) on the crop; blur => low value.
export function sharpness(canvas) {
  const t = document.createElement("canvas"); t.width = t.height = 64;
  const g = t.getContext("2d"); g.drawImage(canvas, 0, 0, 64, 64);
  const d = g.getImageData(0, 0, 64, 64).data, gr = new Float32Array(4096);
  for (let i = 0; i < 4096; i++) gr[i] = 0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2];
  let s = 0, s2 = 0, n = 0;
  for (let y = 1; y < 63; y++) for (let x = 1; x < 63; x++) {
    const l = gr[y * 64 + x - 1] + gr[y * 64 + x + 1] + gr[(y - 1) * 64 + x] + gr[(y + 1) * 64 + x] - 4 * gr[y * 64 + x];
    s += l; s2 += l * l; n++;
  }
  return s2 / n - (s / n) ** 2;
}
