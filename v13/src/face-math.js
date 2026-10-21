// Pure geometry / post-processing for the on-device Face-ID pipeline.
// No DOM and no ONNX Runtime in here, so every function can be unit-tested in Node.
export const DET_SIZE = 640; // YuNet 2023mar: fixed 640x640 NCHW input, BGR, raw 0-255
export const EMB_SIZE = 112; // SFace: 112x112 NCHW input, RGB, raw 0-255, 128-d output
// ArcFace/SFace 5-point template (112x112): right eye, left eye, nose tip, right mouth corner, left mouth corner
export const TEMPLATE = [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]];

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// Fit a w x h frame into a size x size square without distortion (black padding).
export function letterbox(w, h, size = DET_SIZE) {
  const scale = Math.min(size / w, size / h);
  const nw = Math.round(w * scale), nh = Math.round(h * scale);
  return { scale, nw, nh, padX: Math.floor((size - nw) / 2), padY: Math.floor((size - nh) / 2) };
}

export function iou(a, b) {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}
export function nms(dets, thr = 0.3) {
  const sorted = dets.slice().sort((p, q) => q.score - p.score), keep = [];
  for (const d of sorted) if (keep.every((k) => iou(k, d) <= thr)) keep.push(d);
  return keep;
}

// YuNet 2023mar head decoding. `out` maps output name -> Float32Array (cls_N, obj_N, bbox_N, kps_N for N = 8,16,32).
// score = sqrt(cls*obj); box centre = (cell + offset) * stride; box size = exp(v) * stride.
export function decodeYunet(out, size = DET_SIZE, minScore = 0.7, nmsThr = 0.3) {
  const dets = [];
  for (const stride of [8, 16, 32]) {
    const cls = out["cls_" + stride], obj = out["obj_" + stride], bbox = out["bbox_" + stride], kps = out["kps_" + stride];
    if (!cls || !obj || !bbox || !kps) throw new Error("YuNet output missing for stride " + stride);
    const cols = Math.floor(size / stride), rows = Math.floor(size / stride);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const score = Math.sqrt(clamp01(cls[i]) * clamp01(obj[i]));
        if (score < minScore) continue;
        const cx = (c + bbox[i * 4]) * stride, cy = (r + bbox[i * 4 + 1]) * stride;
        const w = Math.exp(bbox[i * 4 + 2]) * stride, h = Math.exp(bbox[i * 4 + 3]) * stride;
        const lm = [];
        for (let k = 0; k < 5; k++) lm.push([(kps[i * 10 + 2 * k] + c) * stride, (kps[i * 10 + 2 * k + 1] + r) * stride]);
        dets.push({ x: cx - w / 2, y: cy - h / 2, w, h, score, lm });
      }
    }
  }
  return nms(dets, nmsThr);
}

// Detector (letterboxed) coordinates -> original video-frame coordinates.
export function toFrame(d, lb) {
  const f = (v, pad) => (v - pad) / lb.scale;
  return {
    x: f(d.x, lb.padX), y: f(d.y, lb.padY), w: d.w / lb.scale, h: d.h / lb.scale, score: d.score,
    lm: d.lm.map(([x, y]) => [f(x, lb.padX), f(y, lb.padY)])
  };
}

// RGBA bytes -> planar float32 (NCHW, no normalisation). order "rgb" for SFace, "bgr" for YuNet.
export function rgbaToPlanar(rgba, w, h, order = "rgb", dst) {
  const n = w * h, out = dst && dst.length === 3 * n ? dst : new Float32Array(3 * n);
  const [c0, c1, c2] = order === "bgr" ? [2, 1, 0] : [0, 1, 2];
  for (let i = 0; i < n; i++) {
    out[i] = rgba[i * 4 + c0]; out[n + i] = rgba[i * 4 + c1]; out[2 * n + i] = rgba[i * 4 + c2];
  }
  return out;
}

// Least-squares similarity transform (rotation + uniform scale + translation) src -> dst (Umeyama, 2-D).
// Returned in canvas setTransform(a,b,c,d,e,f) order: x' = a*x + c*y + e ; y' = b*x + d*y + f.
export function similarityTransform(src, dst = TEMPLATE) {
  const n = src.length;
  let msx = 0, msy = 0, mdx = 0, mdy = 0;
  for (let i = 0; i < n; i++) { msx += src[i][0]; msy += src[i][1]; mdx += dst[i][0]; mdy += dst[i][1]; }
  msx /= n; msy /= n; mdx /= n; mdy /= n;
  let A = 0, B = 0, N = 0;
  for (let i = 0; i < n; i++) {
    const sx = src[i][0] - msx, sy = src[i][1] - msy, dx = dst[i][0] - mdx, dy = dst[i][1] - mdy;
    A += sx * dx + sy * dy; B += sx * dy - sy * dx; N += sx * sx + sy * sy;
  }
  const norm = Math.hypot(A, B);
  if (!(N > 0) || !(norm > 0)) throw new Error("degenerate landmarks");
  const s = norm / N, cos = A / norm, sin = B / norm;
  const a = s * cos, b = s * sin, c = -s * sin, d = s * cos;
  return { a, b, c, d, e: mdx - (a * msx + c * msy), f: mdy - (b * msx + d * msy), scale: s, angle: Math.atan2(sin, cos) };
}
export function applyTransform(t, [x, y]) { return [t.a * x + t.c * y + t.e, t.b * x + t.d * y + t.f]; }

// Visible part of a cover-fitted preview (container aspect = width/height, e.g. 0.75) and the guide circle inside it.
export function viewGeometry(vw, vh, aspect = 0.75, frac = 0.70) {
  const visW = Math.min(vw, vh * aspect), visH = visW / aspect;
  return { cx: vw / 2, cy: vh / 2, D: frac * visW, visW, visH };
}

// Frontal-pose check from the 5 landmarks (right eye, left eye, nose, right mouth, left mouth).
export function poseCheck(lm, lim = {}) {
  const L = { yaw: 0.2, rollDeg: 18, pitchMin: 0.34, pitchMax: 0.68, ...lim };
  const [re, le, no, rm, lmo] = lm;
  const dx = le[0] - re[0], dy = le[1] - re[1];
  const eye = Math.hypot(dx, dy) || 1;
  const roll = (Math.atan2(dy, dx) * 180) / Math.PI;
  const midX = (re[0] + le[0]) / 2, midY = (re[1] + le[1]) / 2, mouthY = (rm[1] + lmo[1]) / 2;
  const yaw = (no[0] - midX) / eye;
  const pitch = (no[1] - midY) / (mouthY - midY || 1);
  const ok = Math.abs(roll) <= L.rollDeg && Math.abs(yaw) <= L.yaw && pitch >= L.pitchMin && pitch <= L.pitchMax;
  return { ok, yaw, pitch, roll, hint: ok ? "" : "سر را صاف و رو‌به‌رو نگه دارید و مستقیم به دوربین نگاه کنید." };
}

// Does one detection fit the guide circle well enough to capture?
export function faceFit(det, geo, o = {}) {
  const P = { minScore: 0.85, maxOff: 0.2, minH: 0.58, maxH: 1.1, ...o };
  if (det.score < P.minScore) return { ok: false, code: "score", hint: "چهره واضح نیست؛ نور را بیشتر کنید." };
  const off = Math.hypot(det.x + det.w / 2 - geo.cx, det.y + det.h / 2 - geo.cy) / geo.D;
  if (off > P.maxOff) return { ok: false, code: "center", hint: "چهره را وسط دایره ببرید." };
  const r = det.h / geo.D;
  if (r < P.minH) return { ok: false, code: "far", hint: "کمی نزدیک‌تر شوید." };
  if (r > P.maxH) return { ok: false, code: "near", hint: "کمی دورتر شوید." };
  const pose = poseCheck(det.lm);
  if (!pose.ok) return { ok: false, code: "pose", hint: pose.hint };
  return { ok: true, pose };
}
export function isStable(prev, cur, D) {
  if (!prev) return false;
  return Math.abs(prev.x + prev.w / 2 - (cur.x + cur.w / 2)) < 0.05 * D
    && Math.abs(prev.y + prev.h / 2 - (cur.y + cur.h / 2)) < 0.05 * D
    && Math.abs(prev.h - cur.h) < 0.06 * D;
}

// Image-quality helpers on the aligned 112x112 crop.
export function grayFromRgba(rgba, w, h) {
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  return g;
}
export function meanOf(g) { let s = 0; for (let i = 0; i < g.length; i++) s += g[i]; return g.length ? s / g.length : 0; }
// Variance of the Laplacian: low value = blurry.
export function laplacianVar(g, w, h) {
  let s = 0, s2 = 0, n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, l = g[i - 1] + g[i + 1] + g[i - w] + g[i + w] - 4 * g[i];
    s += l; s2 += l * l; n++;
  }
  return n ? s2 / n - (s / n) * (s / n) : 0;
}
