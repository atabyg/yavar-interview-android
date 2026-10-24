import test from "node:test";
import assert from "node:assert/strict";
import { NO_SPEECH_MARK, joinSegmentTexts, segmentText } from "../src/segment-text.js";

test("a silent segment becomes a visible marker instead of aborting the transcription", () => {
  assert.equal(segmentText("  "), NO_SPEECH_MARK);
  assert.equal(segmentText(null), NO_SPEECH_MARK);
  assert.equal(segmentText(" hello "), "hello");
  const j = joinSegmentTexts(["first part", NO_SPEECH_MARK, "third part"]);
  assert.equal(j.transcript, "first part\n\n" + NO_SPEECH_MARK + "\n\nthird part");
  assert.equal(j.speechSegments, 2);
  assert.equal(j.emptySegments, 1);
  assert.equal(j.allEmpty, false);
});

test("only a recording without any speech at all is an error", () => {
  assert.equal(joinSegmentTexts([NO_SPEECH_MARK, ""]).allEmpty, true);
  assert.equal(joinSegmentTexts([]).allEmpty, false);
  assert.equal(joinSegmentTexts(undefined).transcript, "");
});
