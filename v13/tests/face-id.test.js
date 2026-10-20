import test from "node:test";
import assert from "node:assert/strict";
import { cosine, normalize, findMatch, qrPayload, parseQr, checksum } from "../src/face-id.js";

test("normalize + cosine", () => {
  const a = normalize([1, 2, 3]);
  assert.ok(Math.abs(cosine(a, a) - 1) < 1e-9);
});
test("match / new / ambiguous", () => {
  const p = normalize([1, 0, 0, 0]);
  const faces = [{ caseNumber: "123456", embedding: p }];
  assert.equal(findMatch([0.99, 0.05, 0, 0], faces).caseNumber, "123456");
  assert.equal(findMatch([0, 1, 0, 0], faces).status, "new");
  const two = [...faces, { caseNumber: "654321", embedding: normalize([0.99, 0.02, 0, 0]) }];
  assert.equal(findMatch([1, 0.01, 0, 0], two).status, "ambiguous");
});
test("QR payload round trip and tamper detection", () => {
  assert.equal(parseQr(qrPayload("123456")), "123456");
  assert.equal(parseQr("YAVAR:123456:" + (checksum("123456") === "00" ? "01" : "00")), null);
});
