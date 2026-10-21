import test from "node:test";
import assert from "node:assert/strict";
import {
  TEMPLATE, letterbox, iou, nms, decodeYunet, toFrame, rgbaToPlanar, similarityTransform, applyTransform,
  viewGeometry, poseCheck, faceFit, isStable, laplacianVar, grayFromRgba, meanOf
} from "../src/face-math.js";

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e, `${a} !~ ${b}`);

test("letterbox keeps aspect and centres the frame", () => {
  const p = letterbox(480, 640); assert.deepEqual([p.scale, p.nw, p.nh, p.padX, p.padY], [1, 480, 640, 80, 0]);
  const l = letterbox(640, 480); assert.deepEqual([l.nw, l.nh, l.padX, l.padY], [640, 480, 0, 80]);
});

test("iou and nms keep the best of overlapping boxes", () => {
  const a = { x: 0, y: 0, w: 10, h: 10, score: 0.9 }, b = { x: 1, y: 1, w: 10, h: 10, score: 0.8 }, c = { x: 50, y: 50, w: 10, h: 10, score: 0.7 };
  assert.ok(iou(a, b) > 0.6); assert.equal(iou(a, c), 0);
  assert.deepEqual(nms([b, c, a]).map((d) => d.score), [0.9, 0.7]);
});

test("decodeYunet decodes cell, log-size and landmarks", () => {
  const out = {};
  for (const s of [8, 16, 32]) {
    const n = (640 / s) ** 2;
    out["cls_" + s] = new Float32Array(n); out["obj_" + s] = new Float32Array(n);
    out["bbox_" + s] = new Float32Array(n * 4); out["kps_" + s] = new Float32Array(n * 10);
  }
  const i = 5 * 20 + 7; // stride 32, row 5, col 7
  out.cls_32[i] = 1; out.obj_32[i] = 0.81;
  out.bbox_32.set([0.5, 0.5, Math.log(2), Math.log(3)], i * 4);
  out.kps_32.set([1, 1, 2, 1, 1.5, 2, 1, 3, 2, 3], i * 10);
  const d = decodeYunet(out);
  assert.equal(d.length, 1);
  // Float32 storage of log() values => compare with a small tolerance
  near(d[0].score, 0.9, 1e-6); near(d[0].x, 7.5 * 32 - 32, 1e-3); near(d[0].y, 5.5 * 32 - 48, 1e-3); near(d[0].w, 64, 1e-3); near(d[0].h, 96, 1e-3);
  assert.deepEqual(d[0].lm[0], [(1 + 7) * 32, (1 + 5) * 32]);
  assert.throws(() => decodeYunet({}), /missing/);
});

test("toFrame removes letterbox padding and scale", () => {
  const lb = letterbox(320, 480); // scale 4/3 -> 427x640, padX 106
  const f = toFrame({ x: lb.padX + 100, y: 40, w: 80, h: 120, score: 1, lm: [[lb.padX + 200, 400]] }, lb);
  near(f.x, 100 / lb.scale); near(f.y, 40 / lb.scale); near(f.w, 80 / lb.scale); near(f.lm[0][0], 200 / lb.scale);
});

test("rgbaToPlanar order and values", () => {
  const px = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]);
  assert.deepEqual(Array.from(rgbaToPlanar(px, 2, 1, "rgb")), [10, 40, 20, 50, 30, 60]);
  assert.deepEqual(Array.from(rgbaToPlanar(px, 2, 1, "bgr")), [30, 60, 20, 50, 10, 40]);
});

test("similarityTransform recovers an exact similarity and maps landmarks onto the template", () => {
  const ang = (12 * Math.PI) / 180, s = 1.7, tx = 30, ty = -20;
  // src = inverse-ish transform of the template: rotate by -ang, scale by 1/s, translate
  const src = TEMPLATE.map(([x, y]) => {
    const rx = (x * Math.cos(-ang) - y * Math.sin(-ang)) / s, ry = (x * Math.sin(-ang) + y * Math.cos(-ang)) / s;
    return [rx + tx, ry + ty];
  });
  const t = similarityTransform(src);
  src.forEach((p, i) => { const q = applyTransform(t, p); near(q[0], TEMPLATE[i][0], 1e-6); near(q[1], TEMPLATE[i][1], 1e-6); });
  near(t.scale, s, 1e-9); near(t.angle, ang, 1e-9);
  const id = similarityTransform(TEMPLATE);
  near(id.a, 1, 1e-9); near(id.b, 0, 1e-9); near(id.e, 0, 1e-9); near(id.f, 0, 1e-9);
  assert.throws(() => similarityTransform([[1, 1], [1, 1], [1, 1], [1, 1], [1, 1]]), /degenerate/);
});

test("viewGeometry for portrait and landscape frames", () => {
  const p = viewGeometry(480, 640); near(p.D, 336); near(p.cx, 240); near(p.cy, 320);
  const l = viewGeometry(640, 480); near(l.visW, 360); near(l.D, 252);
});

const frontal = TEMPLATE.map(([x, y]) => [x * 3 + 100, y * 3 + 80]);
test("poseCheck accepts frontal and rejects turned or rolled heads", () => {
  assert.equal(poseCheck(frontal).ok, true);
  const turned = frontal.map((p) => p.slice()); turned[2][0] += 40;
  assert.equal(poseCheck(turned).ok, false);
  const rolled = frontal.map(([x, y]) => [x, y + (x - 100) * 0.6]);
  assert.equal(poseCheck(rolled).ok, false);
});

test("faceFit gives specific hints", () => {
  const geo = viewGeometry(480, 640);
  const box = (cx, cy, h, score = 0.95) => ({ x: cx - h * 0.4, y: cy - h / 2, w: h * 0.8, h, score, lm: frontal });
  assert.equal(faceFit(box(240, 320, 300), geo).ok, true);
  assert.equal(faceFit(box(240, 320, 300, 0.5), geo).code, "score");
  assert.equal(faceFit(box(40, 320, 300), geo).code, "center");
  assert.equal(faceFit(box(240, 320, 120), geo).code, "far");
  assert.equal(faceFit(box(240, 320, 420), geo).code, "near");
  const bad = { ...box(240, 320, 300), lm: frontal.map((p, i) => (i === 2 ? [p[0] + 80, p[1]] : p)) };
  assert.equal(faceFit(bad, geo).code, "pose");
});

test("isStable compares centre and size relative to the circle", () => {
  const a = { x: 100, y: 100, w: 200, h: 250 };
  assert.equal(isStable(a, { x: 104, y: 103, w: 200, h: 252 }, 336), true);
  assert.equal(isStable(a, { x: 160, y: 100, w: 200, h: 250 }, 336), false);
  assert.equal(isStable(null, a, 336), false);
});

test("laplacianVar: flat image is 0, textured image is larger; gray/mean helpers", () => {
  const flat = new Float32Array(64).fill(100);
  assert.equal(laplacianVar(flat, 8, 8), 0);
  const chk = new Float32Array(64).map((_, i) => ((i % 8) + Math.floor(i / 8)) % 2 ? 255 : 0);
  assert.ok(laplacianVar(chk, 8, 8) > 1000);
  const g = grayFromRgba(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]), 2, 1);
  near(g[0], 255, 0.01); near(meanOf(g), 127.5, 0.01);
});
