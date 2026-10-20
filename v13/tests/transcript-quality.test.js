import test from "node:test";
import assert from "node:assert/strict";
import { transcriptGuidance, sanitizeQaPairs } from "../src/transcript-quality.js";

test("smart cleanup asks the model not to invent words and to exclude ambient speech", () => {
  const prompt = transcriptGuidance(true);
  assert.match(prompt, /اختراع|نساز/);
  assert.match(prompt, /صدای محیط/);
  assert.match(prompt, /گوینده نامشخص/);
  assert.match(prompt, /پرسش‌نامه/);
});

test("conservative mode still forbids unsupported reconstruction", () => {
  const prompt = transcriptGuidance(false);
  assert.match(prompt, /شواهد روشن/);
  assert.match(prompt, /نساز/);
});

test("Q/A sanitation normalizes roles, limits rows, and rejects rows without a question", () => {
  const got = sanitizeQaPairs([
    { question: "سؤال یک", answer: "جواب", questionSpeaker: "interviewer", answerSpeaker: "candidate", confidence: "بالا" },
    { question: "", answer: "بی‌پرسش" },
    ...Array.from({ length: 15 }, (_, i) => ({ question: "سؤال " + i, answer: "جواب" }))
  ]);
  assert.equal(got.length, 12);
  assert.equal(got[0].questionSpeaker, "مصاحبه‌گر");
  assert.equal(got[0].answerSpeaker, "متقاضی");
  assert.equal(got[0].confidence, "بالا");
  assert.equal(got[1].confidence, "پایین");
});

test("short transcript is valid for transcription-only flow but not semantic analysis", () => {
  assert.equal(transcriptStageError("سلام", true), "");
  assert.match(transcriptStageError("سلام", false), /تحلیل کافی نیست/);
});

test("empty transcription is always rejected, even in transcription-only flow", () => {
  assert.match(transcriptStageError("", true), /متن قابل‌استفاده‌ای تولید نکرد/);
  assert.match(transcriptStageError("   ", false), /متن قابل‌استفاده‌ای تولید نکرد/);
});

test("long enough transcript can proceed to analysis", () => {
  assert.equal(transcriptStageError("این یک متن نمونه با طول کافی برای تحلیل است.", false), "");
});
