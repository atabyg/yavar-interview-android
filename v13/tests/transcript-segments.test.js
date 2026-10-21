import test from "node:test";
import assert from "node:assert/strict";
import { checkSegmentCitations, labelTranscript, segmentTranscript } from "../src/transcript-segments.js";
import { A, doc, get, rowOf } from "./contract-fixtures.js";

const TEXT = "first line of the interview\n\nsecond line with a number 3 here\r\nthird line";

test("segmentation is deterministic: one segment per non-empty line with stable ids", () => {
  const a = segmentTranscript(TEXT);
  assert.deepEqual(a.map((s) => s.id), ["seg-001", "seg-002", "seg-003"]);
  assert.equal(a[1].text, "second line with a number 3 here");
  assert.deepEqual(segmentTranscript(TEXT), a);
  assert.equal(labelTranscript(TEXT).split("\n")[2], "[seg-003] third line");
  assert.deepEqual(segmentTranscript(""), []);
  assert.deepEqual(segmentTranscript(null), []);
});

test("a very long line is split at sentence ends into bounded chunks", () => {
  const sentence = "This is one sentence of moderate length used for splitting.";
  const long = Array.from({ length: 30 }, () => sentence).join(" ");
  const segs = segmentTranscript(long, 200);
  assert.ok(segs.length > 5);
  assert.ok(segs.every((s) => s.text.length <= 200));
  assert.equal(segs.map((s) => s.text).join(" "), long);
});

test("segment citations are cross-checked against the stored transcript", () => {
  const evOk = "second line with a number 3";
  const row = rowOf(doc([
    A("F01-A01", "ok", evOk, { evidence: [{ text: evOk, source_segment_ids: ["seg-002"] }] }),
    A("F01-A02", "wrong segment", evOk, { evidence: [{ text: evOk, source_segment_ids: ["seg-003"] }] }),
    A("F01-A03", "unknown segment", evOk, { evidence: [{ text: evOk, source_segment_ids: ["seg-099"] }] }),
    A("F01-A04", "no citation", evOk, { evidence: [{ text: evOk }] })
  ]));
  const out = checkSegmentCitations(row, TEXT);
  assert.equal(get(out, "F01-A01").segmentCitationOk, true);
  assert.equal(get(out, "F01-A02").segmentCitationOk, false);
  assert.equal(get(out, "F01-A03").segmentCitationOk, false);
  assert.equal(get(out, "F01-A04").segmentCitationOk, undefined);
  assert.ok(out.warnings.some((w) => w.includes("F01-A02")));
  assert.ok(out.warnings.some((w) => w.includes("F01-A03") && w.includes("seg-099")));
  assert.equal(get(out, "F01-A02").answered, true); // citation problems warn only; they never delete an answer
  assert.equal(checkSegmentCitations(row, "").warnings.length, row.warnings.length);
});
