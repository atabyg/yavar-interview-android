import test from "node:test";
import assert from "node:assert/strict";
import { audioFileName, buildExchangePrompt, buildPatch, computeStats, formAnswersFromQa, formSpec, matchRecord, parseResults, transcriptFileName } from "../src/exchange.js";
import { QUESTION_SETS } from "../src/questions.js";
import { REFERRAL_FORM_REFERENCE, REFERRAL_QUESTIONS } from "../src/referral-forms.js";

const stamp = Date.UTC(2026, 9, 17, 21, 0, 0); // 1405/07/26 in Tehran
const rec = { id: "rec1", caseNumber: "123456", candidate: "نمونه", createdAt: stamp, questionSet: "critical12", segs: 1, mime: "audio/webm" };

const RESULT = [
  "#YAVAR_RESULT v1",
  "RECORD_ID: rec1",
  "CASE_NUMBER: ۱۲۳۴۵۶",
  "DATE_JALALI: ۱۴۰۵/۰۷/۲۶",
  "FORM: Q12",
  "Q12-01: سه سال مددکار بوده",
  "Q12-01.EVIDENCE: سه سال کار کردم",
  "Q12-01.CONF: HIGH",
  "Q12-02: EMPTY",
  "Q12-02.EVIDENCE: EMPTY",
  "Q12-02.CONF: EMPTY",
  "C1: ۸/۱۰",
  "C2: 6",
  "C3: 7",
  "C4: 9",
  "C5: 5",
  "C6: 7",
  "SUMMARY: خلاصهٔ کوتاه",
  "STRENGTHS: الف | ب",
  "#END_RESULT"
].join("\n");

test("referral form reference matches the attached scope and protects professional-only fields", () => {
  assert.equal(REFERRAL_FORM_REFERENCE.pages, 22);
  assert.deepEqual(REFERRAL_FORM_REFERENCE.formsPresent, ["F00", "F01", "F02", "F03", "F04", "F05", "F06", "F07", "F08"]);
  assert.deepEqual(REFERRAL_FORM_REFERENCE.formsMissing, ["F09"]);
  assert.equal(REFERRAL_FORM_REFERENCE.f01.length, 6);
  assert.equal(REFERRAL_FORM_REFERENCE.f02.length, 15);
  assert.equal(REFERRAL_QUESTIONS.length, 21);
  assert.ok(REFERRAL_FORM_REFERENCE.aiRules.some((rule) => rule.includes("F02.B")));
});

test("form specs expose stable codes for quick, 12 and 24 question forms", () => {
  assert.equal(formSpec("quick").items.length, QUESTION_SETS.quick.questions.length);
  assert.equal(formSpec("quick").items[4].code, "Q5-05");
  assert.equal(formSpec("critical12").items[11].code, "Q12-12");
  assert.equal(formSpec("full").items[23].code, "Q24-24");
});

test("prompt carries record identity, audio file name, referral form fields and plain-text interoperability", () => {
  const p = buildExchangePrompt([rec], {});
  assert.match(p, /RECORD_ID: rec1/);
  assert.match(p, /DATE_JALALI: 1405\/07\/26/);
  assert.match(p, /FORM: REFERRAL/);
  assert.match(p, /yavar-rec1-1\.webm/);
  assert.match(p, /F02-C15\.CONF:/);
  assert.match(p, /F01-A01/);
  assert.match(p, /امتیاز رسمی/);
  assert.doesNotMatch(p, /C6\.NOTE:/);
  assert.doesNotMatch(p, /OVERALL:/);
  assert.match(p, /NOT encrypted/);
  assert.match(p, /NO Base64/);
  assert.match(p, /SOURCE_TRANSCRIPT_FILE/);
});

test("a blank prompt template is never accepted as a result", () => {
  const rows = parseResults(buildExchangePrompt([rec], {}));
  assert.ok(rows.length >= 1);
  assert.equal(rows.some((r) => r.hasContent), false);
});

test("parser reads coded answers, Persian digits, EMPTY markers and calculates totals", () => {
  const rows = parseResults(RESULT);
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.setId, "critical12");
  assert.equal(r.caseNumber, "123456");
  assert.equal(r.date, "1405/07/26");
  assert.equal(r.answers.length, 12);
  assert.equal(r.answers[0].answered, true);
  assert.equal(r.answers[0].confidence, "بالا");
  assert.equal(r.answers[1].answered, false);
  assert.equal(r.comps[0].score, 8);
  assert.equal(r.stats.answered, 1);
  assert.equal(r.stats.coverage, 8);
  assert.equal(r.stats.overall, 70);
  assert.equal(r.stats.verdict, "پیشنهاد استخدام");
  assert.deepEqual(r.strengths, ["الف", "ب"]);
  assert.equal(r.hasContent, true);
});

test("referral-only results preserve evidence and never invent official scoring", () => {
  const rows = parseResults([
    "#YAVAR_RESULT v1",
    "RECORD_ID: rec1",
    "CASE_NUMBER: ۱۲۳۴۵۶",
    "DATE_JALALI: ۱۴۰۵/۰۷/۲۶",
    "FORM: REFERRAL",
    "F01-A01: مراجعهٔ دوره‌ای دوشنبه",
    "F01-A01.EVIDENCE: دوشنبه باید به دادگاه بروم",
    "F01-A01.CONF: HIGH",
    "F02-C01: ابتدا به مددکار تماس می‌گیرم",
    "F02-C01.EVIDENCE: با مددکار تماس می‌گیرم",
    "F02-C01.CONF: MEDIUM",
    "#END_RESULT"
  ].join("\n"));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].referralAnswers.length, 21);
  assert.equal(rows[0].referralAnswers.find((a) => a.code === "F01-A01").answered, true);
  assert.equal(rows[0].hasContent, true);
  const analysis = buildPatch(rec, rows[0]).analysis;
  assert.equal(analysis.overall, null);
  assert.equal(analysis.verdict, "پیش‌نویس فرم ارجاع — تأییدنشده");
  assert.equal(analysis.competencies.length, 0);
  assert.equal(analysis.formAnswers.length, 21);
});

test("overall is not invented when a competency score is missing", () => {
  const s = computeStats(12, [{ answered: true }], [{ score: 5 }, { score: null }]);
  assert.equal(s.overall, null);
  assert.equal(s.verdict, null);
});

test("matching uses record id first, then case number plus Jalali date", () => {
  const r = parseResults(RESULT)[0];
  assert.equal(matchRecord(r, [rec]).record.id, "rec1");
  const noId = { ...r, recordId: "" };
  const m = matchRecord(noId, [rec, { ...rec, id: "other", caseNumber: "999999" }]);
  assert.equal(m.record.id, "rec1");
  assert.equal(m.how, "شمارهٔ پرونده + تاریخ");
  const wrongDay = matchRecord({ ...noId, date: "1405/01/01" }, [rec]);
  assert.equal(wrongDay.record, null);
});

test("applying a result produces a complete analysis for the existing exports", () => {
  const patch = buildPatch(rec, parseResults(RESULT)[0]);
  assert.equal(patch.status, "done");
  assert.equal(patch.analysis.overall, 70);
  assert.equal(patch.analysis.formAnswers.length, 12);
  assert.equal(patch.analysis.competencies.length, 6);
  assert.ok(Array.isArray(patch.analysis.strengths));
  assert.equal(patch.questionSet, "critical12");
});

test("in-app AI question pairs map to the same coded answers", () => {
  const q = QUESTION_SETS.critical12.questions;
  const out = formAnswersFromQa("critical12", [{ question: "x", answer: "پاسخ نمونه", matchedQuestion: q[0], confidence: "بالا", evidence: "شاهد" }]);
  assert.equal(out.length, 12);
  assert.equal(out[0].answered, true);
  assert.equal(out[0].code, "Q12-01");
  assert.equal(out[1].answered, false);
});


test("external hand-off filenames are readable plain filenames for cross-model use", () => {
  const ready = { ...rec, exchangeAudioFiles: ["yavar-rec1-1.wav"], exchangeTranscriptFile: "yavar-rec1-transcript.txt" };
  assert.equal(audioFileName(ready, 0), "yavar-rec1-1.wav");
  assert.equal(transcriptFileName(ready), "yavar-rec1-transcript.txt");
  const prompt = buildExchangePrompt([ready], {});
  assert.match(prompt, /yavar-rec1-1\.wav/);
  assert.match(prompt, /yavar-rec1-transcript\.txt/);
  assert.match(prompt, /NO password/);
});
