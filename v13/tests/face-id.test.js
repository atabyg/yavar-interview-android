import test from "node:test";
import assert from "node:assert/strict";
import {
  cosine, normalize, averageEmbeddings, findMatch, chooseCaseNumber, addTemplate, scoreFaces,
  toVectorString, fromVectorString, qrPayload, parseQr, checksum, MATCH_THRESHOLD
} from "../src/face-id.js";

const unit = (...v) => normalize(v);

test("normalize, cosine and average", () => {
  const a = normalize([1, 2, 3]);
  assert.ok(Math.abs(cosine(a, a) - 1) < 1e-9);
  assert.equal(cosine([1, 0], [1, 0, 0]), -1);
  assert.ok(Math.abs(cosine(averageEmbeddings([[1, 0], [0, 1]]), unit(1, 1)) - 1) < 1e-9);
});

test("findMatch: match, new and ambiguous (best template of each person)", () => {
  const faces = [{ caseNumber: "123456", templates: [unit(1, 0, 0, 0), unit(0.9, 0.3, 0, 0)] }];
  assert.equal(findMatch([0.99, 0.05, 0, 0], faces).caseNumber, "123456");
  assert.equal(findMatch([0, 1, 0, 0], faces).status, "new");
  assert.equal(findMatch([1, 0, 0, 0], []).status, "new");
  const two = [...faces, { caseNumber: "654321", templates: [unit(0.99, 0.02, 0, 0)] }];
  const m = findMatch([1, 0.01, 0, 0], two);
  assert.equal(m.status, "ambiguous"); assert.equal(m.candidates.length, 2);
  assert.ok(scoreFaces([1, 0, 0, 0], two)[0].score >= MATCH_THRESHOLD);
});

test("chooseCaseNumber: typed number is reused unless bound to another face", () => {
  const faces = [{ caseNumber: "111111", templates: [unit(1, 0)] }];
  assert.equal(chooseCaseNumber("222222", faces, ["222222"]), "222222");
  const n = chooseCaseNumber("111111", faces, []);
  assert.match(n, /^\d{6}$/); assert.notEqual(n, "111111");
  const fresh = chooseCaseNumber("", faces, ["333333"]);
  assert.match(fresh, /^\d{6}$/); assert.ok(!["111111", "333333"].includes(fresh));
});

test("addTemplate: dedupes, grows to the limit, then replaces the most redundant", () => {
  const a = unit(1, 0, 0), b = unit(0, 1, 0), c = unit(0, 0, 1), d = unit(1, 1, 0), e = unit(0, 1, 1);
  assert.equal(addTemplate([a], unit(1, 0.01, 0)).length, 1);
  let t = [a]; for (const x of [b, c, d, e]) t = addTemplate(t, x);
  assert.equal(t.length, 5);
  const f = unit(1, 0, 1);
  const r = addTemplate(t, f, 5);
  assert.equal(r.length, 5); assert.ok(r.some((x) => cosine(x, f) > 0.999));
});

test("portable vector string round trip keeps the match and rejects junk", () => {
  const v = normalize(Array.from({ length: 128 }, (_, i) => Math.sin(i * 1.7)));
  const back = fromVectorString(toVectorString(v));
  assert.ok(cosine(v, back) > 0.998);
  assert.equal(fromVectorString("bad"), null);
  assert.equal(fromVectorString("YFV1:@@@"), null);
});

test("QR payload round trip and tamper detection", () => {
  assert.equal(parseQr(qrPayload("123456")), "123456");
  assert.equal(parseQr("YAVAR:123456:" + (checksum("123456") === "00" ? "01" : "00")), null);
  assert.equal(parseQr(null), null);
});
