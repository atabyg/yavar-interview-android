import test from "node:test";
import assert from "node:assert/strict";
import { looksLikeContractJson, parseContractResults, summarizeChanges, verifyEvidenceAgainstTranscript } from "../src/contract.js";
import { A, doc, get, rowOf } from "./contract-fixtures.js";

test("extractor finds JSON inside code fences and prose, several objects, arrays, and reports broken JSON", () => {
  const a = doc([A("F01-A01", "a", "evidence a")], { case_id: "rec1" });
  const b = doc([A("F01-A01", "b", "evidence b")], { case_id: "rec2" });
  const text = "intro\n```json\n" + JSON.stringify(a, null, 2) + "\n```\nsecond:\n" + JSON.stringify(b) + "\n{not json}";
  const { rows, errors } = parseContractResults(text);
  assert.deepEqual(rows.map((r) => r.recordId), ["rec1", "rec2"]);
  assert.ok(Array.isArray(errors));
  assert.equal(parseContractResults(JSON.stringify([a, b])).rows.length, 2);
  const broken = parseContractResults('{"contract": "YAVAR_CASE_RESULT", "results": [');
  assert.equal(broken.rows.length, 0);
  assert.ok(broken.errors.length >= 1);
  assert.equal(looksLikeContractJson(JSON.stringify(a)), true);
  assert.equal(looksLikeContractJson("#YAVAR_RESULT v1\nQ12-01: x"), false);
  assert.equal(parseContractResults("no json here").rows.length, 0);
});

test("evidence must exist in the stored transcript (digits, Arabic letters and half-spaces are normalised)", () => {
  const TRANSCRIPT = "hello. \u0645\u0646 \u06f3 \u0633\u0627\u0644 \u062f\u0631 \u0627\u0646\u0628\u0627\u0631 \u06a9\u0627\u0631 \u06a9\u0631\u062f\u0645. \u062f\u0648\u0634\u0646\u0628\u0647 \u0628\u0627\u06cc\u062f \u0628\u0647 \u062f\u0627\u062f\u06af\u0627\u0647 \u0628\u0631\u0648\u0645.";
  const EV_DIGIT = "\u0645\u0646 3 \u0633\u0627\u0644 \u062f\u0631 \u0627\u0646\u0628\u0627\u0631 \u06a9\u0627\u0631 \u06a9\u0631\u062f\u0645"; // Latin digit instead of the Persian one
  const EV_YEH = "\u062f\u0648\u0634\u0646\u0628\u0647 \u0628\u0627\u064a\u062f \u0628\u0647 \u062f\u0627\u062f\u06af\u0627\u0647 \u0628\u0631\u0648\u0645"; // Arabic yeh (U+064A)
  const EV_MISSING = "this sentence was never spoken in the interview";
  const SHIFT = "night work is impossible";
  const row = rowOf(doc([
    A("F01-A03", "three years", EV_DIGIT),
    A("F01-A01", "court monday", EV_YEH),
    A("F01-A05", SHIFT, EV_MISSING)
  ]));
  const out = verifyEvidenceAgainstTranscript(row, TRANSCRIPT);
  assert.equal(get(out, "F01-A03").evidenceVerified, true);
  assert.equal(get(out, "F01-A01").evidenceVerified, true);
  const bad = get(out, "F01-A05");
  assert.equal(bad.answered, false);
  assert.equal(bad.status, "needs_human_review");
  assert.equal(bad.proposedAnswer, SHIFT);
  assert.equal(out.stats.answered, 2);
  assert.ok(out.warnings.some((w) => w.includes("F01-A05")));
  const noText = verifyEvidenceAgainstTranscript(row, "");
  assert.ok(noText.warnings.length > row.warnings.length);
  assert.equal(get(noText, "F01-A03").answered, true);
});

test("field-interview scenarios from the specification stay conservative", () => {
  const T = {
    morning: "اگر شیفت صبح باشد، اتوبوس از جلوی مرکز رد می‌شود",
    night: "برای شیفت شب باید فکری بکنم",
    chat: "سلام، خوبی؟ امروز خیلی شلوغ است",
    bus: "برای کار صبح اگر ماشین نباشد با اتوبوس می‌روم",
    idOk: "مدرک شناسایی‌ام کامل است",
    idNo: "کارت ملی هنوز دستم نرسیده",
    cut: "برای شروع کار باید ...",
    warehouse: "یه مدتی انبار کار می‌کردم، فکر کنم حدود دو سال",
    gone: "بعدش دیگه کار گیرم نیومد"
  };
  const transcript = [
    T.morning + ". " + T.night + ".",
    T.chat + ". " + T.bus + ".",
    T.idOk + ".",
    "later: " + T.idNo + ".",
    T.cut,
    T.warehouse + "، " + T.gone + "."
  ].join("\n");
  const row = verifyEvidenceAgainstTranscript(rowOf(doc([
    // 1) indirect answer: only the morning shift is clear, the night shift is unknown
    { form_code: "F02", field_code: "F02-C10", value: T.morning, status: "needs_human_review", basis: "explicit", confidence: "medium", review_required: true, notes: "night shift unknown", evidence: [{ text: T.morning }], contradictions: [] },
    // 2) side talk is not recorded, the relevant answer is recorded with evidence
    A("F02-C02", T.bus, T.bus, { confidence: "medium" }),
    // 3) contradiction: both statements kept, no value chosen
    { form_code: "F02", field_code: "F02-C07", value: null, status: "contradictory", basis: "none", confidence: "medium", review_required: true, evidence: [], contradictions: [{ text: T.idOk }, { text: T.idNo }] },
    // 4) unintelligible audio is never guessed
    { form_code: "F01", field_code: "F01-A06", value: T.cut, status: "unclear", basis: "none", confidence: "low", review_required: true, evidence: [{ text: T.cut }], contradictions: [] },
    // 5) scattered answer keeps the speaker's own precision
    A("F01-A03", T.warehouse, T.warehouse, { confidence: "medium" }),
    // 6) multi-speaker: attribution uncertain
    { form_code: "F02", field_code: "F02-C06", value: null, status: "needs_human_review", basis: "none", confidence: "low", review_required: true, notes: "speaker unknown", evidence: [], contradictions: [] }
  ])), transcript);
  assert.equal(row.stats.answered, 2);
  assert.equal(get(row, "F02-C02").evidenceVerified, true);
  assert.equal(get(row, "F01-A03").evidenceVerified, true);
  assert.equal(get(row, "F02-C10").answered, false);
  assert.equal(get(row, "F02-C10").proposedAnswer, T.morning);
  assert.equal(get(row, "F02-C07").status, "contradictory");
  assert.equal(get(row, "F01-A06").status, "unclear");
  assert.equal(get(row, "F01-A06").answered, false);
  assert.equal(get(row, "F02-C06").status, "needs_human_review");
  assert.ok(row.referralAnswers.every((a) => !(a.answer + a.proposedAnswer).includes(T.chat)));

  const oneVersusThree = rowOf(doc([{ form_code: "F01", field_code: "F01-A03", value: null, status: "contradictory", basis: "none", confidence: "medium", review_required: true, evidence: [], contradictions: [{ text: "one year" }, { text: "three years" }] }]));
  assert.equal(get(oneVersusThree, "F01-A03").status, "contradictory");
  assert.equal(get(oneVersusThree, "F01-A03").answered, false);
});

test("change summary reports added, changed, cleared and overwritten human-reviewed answers", () => {
  const prev = [
    { code: "F01-A01", answered: true, answer: "x", reviewStatus: "human_reviewed" },
    { code: "F01-A02", answered: true, answer: "y" },
    { code: "F01-A03", answered: true, answer: "z" }
  ];
  const next = [
    { code: "F01-A01", answered: true, answer: "x", status: "answered" },
    { code: "F01-A02", answered: true, answer: "changed", status: "answered" },
    { code: "F01-A03", answered: false, answer: "", status: "needs_human_review" },
    { code: "F01-A04", answered: true, answer: "new", status: "answered" }
  ];
  assert.deepEqual(summarizeChanges(prev, next), { added: 1, changed: 1, unchanged: 1, cleared: 1, needsReview: 1, humanReviewedOverwritten: 1 });
});
