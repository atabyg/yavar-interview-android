import test from "node:test";
import assert from "node:assert/strict";
import { isNoSpeechMark, noSpeechMark } from "../src/no-speech.js";

test("a no-speech marker is recognised and real text never is", () => {
  assert.equal(isNoSpeechMark(noSpeechMark(3)), true);
  assert.equal(isNoSpeechMark("  " + noSpeechMark(12) + "\n"), true);
  assert.equal(isNoSpeechMark(noSpeechMark("x")), false);
  assert.equal(isNoSpeechMark("real spoken words"), false);
  assert.equal(isNoSpeechMark(""), false);
  assert.equal(isNoSpeechMark(null), false);
  assert.equal(isNoSpeechMark(noSpeechMark(1) + " and more text"), false);
});

test("markers carry the one-based part number", () => {
  assert.ok(noSpeechMark(2).includes("2"));
  assert.notEqual(noSpeechMark(1), noSpeechMark(2));
});
