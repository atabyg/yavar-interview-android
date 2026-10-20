import test from "node:test";
import assert from "node:assert/strict";
import { cosine, normalize, findMatch, qrPayload, parseQr, checksum, toVectorString, fromVectorString } from "../src/face-id.js";

test("normalize + cosine", () => {
  const a = normalize([1, 2, 3]);
  assert.ok(Math.abs(cosine(a, a) - 1) < 1e-9);
});
test("match / new / ambiguous", () => {
  const faces = [{ caseNumber: "123456", embedding: normalize([1, 0, 0, 0]) }];
  assert.equal(findMatch([0.99, 0.05, 0, 0], faces).caseNumber, "123456");
  assert.equal(findMatch([0, 1, 0, 0], faces).status, "new");
  const two = [...faces, { caseNumber: "654321", embedding: normalize([0.99, 0.02, 0, 0]) }];
  assert.equal(findMatch([1, 0.01, 0, 0], two).status, "ambiguous");
});
test("vector string round trip keeps the match", () => {
  const v = normalize(Array.from({ length: 128 }, (_, i) => Math.sin(i * 1.7)));
  const back = fromVectorString(toVectorString(v));
  assert.ok(cosine(v, back) > 0.999);
  assert.equal(fromVectorString("bad"), null);
});
test("QR payload round trip and tamper detection", () => {
  assert.equal(parseQr(qrPayload("123456")), "123456");
  assert.equal(parseQr("YAVAR:123456:" + (checksum("123456") === "00" ? "01" : "00")), null);
});
