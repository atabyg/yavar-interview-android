import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ANALYSIS_STATUSES, CONFIDENCES, CONTRACT_ID, CONTRACT_VERSION, FIELD_BASES, FIELD_CODES, FIELD_STATUSES,
  buildJsonExchangePrompt, contractToRow, looksLikeContractJson, parseContractResults, summarizeChanges,
  validateCaseResult, verifyEvidenceAgainstTranscript
} from "../src/contract.js";

const A = (code, value, text, over = {}) => ({
  form_code: code.slice(0, 3), field_code: code, value, status: "answered", basis: "explicit",
  evidence: [{ text, source_segment_ids: ["seg-001"] }], confidence: "high", review_required: false, contradictions: [], ...over
});
const N = (code) => ({
  form_code: code.slice(0, 3), field_code: code, value: null, status: "not_stated", basis: "none",
  evidence: [], confidence: null, review_required: false, contradictions: []
});
const doc = (results, over = {}) => ({
  contract: CONTRACT_ID, contract_version: CONTRACT_VERSION, case_id: "rec1", case_number: "۱۲۳۴۵۶", date_jalali: "۱۴۰۵/۰۷/۲۶",
  analysis: { status: "complete", provider: "test", model: "m" }, results, ...over
});
const rowOf = (d) => { const v = validateCaseResult(d); assert.equal(v.ok, true, v.blocking.join(" ")); return contractToRow(v); };
const get = (row, code) => row.referralAnswers.find((a) => a.code === code);

test("a valid document is accepted and mapped to the import row without any AI call", () => {
  const row = rowOf(doc([A("F01-A01", "دوشنبه باید به دادگاه برود", "دوشنبه باید به دادگاه بروم", { confidence: "medium" })]));
  assert.equal(row.recordId, "rec1");
  assert.equal(row.caseNumber, "123456");
  assert.equal(row.date, "1405/07/26");
  assert.equal(row.isReferralFormat, true);
  assert.equal(row.referralAnswers.length, 21);
  const a = get(row, "F01-A01");
  assert.equal(a.answered, true);
  assert.equal(a.confidence, "متوسط");
  assert.equal(a.status, "answered");
  assert.equal(a.basis, "explicit");
  assert.deepEqual(a.sourceSegmentIds, ["seg-001"]);
  assert.equal(row.stats.answered, 1);
  assert.equal(row.stats.overall, null);
  assert.equal(row.stats.verdict, null);
  assert.equal(row.hasContent, true);
  assert.equal(get(row, "F01-A02").status, "not_provided");
  assert.ok(row.warnings.some((w) => w.includes("اصلاً در خروجی نیامده")));
});

test("answered without evidence is not accepted: the value survives only as a proposal for human review", () => {
  const row = rowOf(doc([A("F01-A04", "قسط دارد", "", { evidence: [] })]));
  const a = get(row, "F01-A04");
  assert.equal(a.answered, false);
  assert.equal(a.status, "needs_human_review");
  assert.equal(a.proposedAnswer, "قسط دارد");
  assert.equal(a.answer, "");
  assert.equal(row.stats.answered, 0);
  assert.ok(row.warnings.some((w) => w.includes("F01-A04") && w.includes("بدون شاهد")));
});

test("missing confidence on an answered field is reported and treated as low", () => {
  const row = rowOf(doc([A("F01-A01", "پاسخ", "شاهد معتبر", { confidence: null })]));
  assert.equal(get(row, "F01-A01").confidence, "پایین");
  assert.equal(get(row, "F01-A01").reviewRequired, true);
  assert.ok(row.warnings.some((w) => w.includes("سطح اطمینان")));
});

test("contradictory fields keep both statements, need two pieces of evidence and never auto-select a value", () => {
  const good = rowOf(doc([{
    form_code: "F02", field_code: "F02-C07", value: null, status: "contradictory", basis: "none", evidence: [], confidence: "medium", review_required: true,
    contradictions: [{ text: "مدرک شناسایی‌ام کامل است", source_segment_ids: ["seg-003"] }, { text: "کارت ملی هنوز دستم نرسیده", source_segment_ids: ["seg-009"] }]
  }]));
  const a = get(good, "F02-C07");
  assert.equal(a.status, "contradictory");
  assert.equal(a.answered, false);
  assert.equal(a.answer, "");
  assert.equal(a.contradictions.length, 2);
  assert.equal(a.reviewRequired, true);

  const withValue = rowOf(doc([{ form_code: "F02", field_code: "F02-C07", value: "کامل است", status: "contradictory", basis: "none", evidence: [], contradictions: [{ text: "الف" }, { text: "ب" }] }]));
  assert.equal(get(withValue, "F02-C07").answer, "");
  assert.equal(get(withValue, "F02-C07").proposedAnswer, "کامل است");
  assert.ok(withValue.warnings.some((w) => w.includes("خودسرانه")));

  const oneSided = rowOf(doc([{ form_code: "F02", field_code: "F02-C07", value: null, status: "contradictory", basis: "none", evidence: [], contradictions: [{ text: "فقط یک گفته" }] }]));
  assert.equal(get(oneSided, "F02-C07").status, "needs_human_review");
});

test("unknown field codes are rejected with a readable error and unknown keys are reported, not ignored", () => {
  const d = doc([
    A("F01-A01", "پاسخ", "شاهد کوتاه معتبر"),
    { ...A("F03-X01", "x", "y"), form_code: "F03" },
    { ...A("F02-C01", "پاسخ", "عبارت شاهد"), form_code: "F01" }
  ], { extra_key: 1 });
  const v = validateCaseResult(d);
  assert.equal(v.ok, true);
  assert.equal(v.fields.length, 1);
  assert.ok(v.errors.some((e) => e.includes("F03-X01")));
  assert.ok(v.errors.some((e) => e.includes("F02-C01") && e.includes("form_code")));
  assert.ok(v.warnings.some((w) => w.includes("extra_key")));
});

test("duplicate field codes keep the first value and warn", () => {
  const row = rowOf(doc([A("F01-A01", "نخست", "شاهد نخست معتبر"), A("F01-A01", "دوم", "شاهد دوم معتبر")]));
  assert.equal(get(row, "F01-A01").answer, "نخست");
  assert.ok(row.warnings.some((w) => w.includes("F01-A01") && w.includes("بیش از یک بار")));
});

test("incompatible version, wrong id, failed analysis and bad structure block the whole result", () => {
  const v2 = validateCaseResult(doc([], { contract_version: "2.0" }));
  assert.equal(v2.ok, false);
  assert.match(v2.blocking[0], /سازگار نیست/);
  assert.equal(validateCaseResult(doc([], { contract_version: "abc" })).ok, false);
  assert.equal(validateCaseResult(doc([], { contract: "OTHER" })).ok, false);
  assert.equal(validateCaseResult(doc([], { case_id: "" })).ok, false);
  assert.equal(validateCaseResult(doc([], { analysis: { status: "failed" } })).ok, false);
  assert.equal(validateCaseResult(doc("nope")).ok, false);
  assert.equal(validateCaseResult(null).ok, false);
  const parsed = parseContractResults(JSON.stringify(doc([], { contract_version: "2.0" })));
  assert.equal(parsed.rows.length, 0);
  assert.ok(parsed.errors.length >= 1);
});

test("a negative answer is a real answer and stays distinct from not_stated and from a field never sent", () => {
  const row = rowOf(doc([A("F01-A04", "بدهی ندارد", "من بدهی ندارم"), N("F01-A02")]));
  const neg = get(row, "F01-A04");
  assert.equal(neg.answered, true);
  assert.equal(neg.answer, "بدهی ندارد");
  const ns = get(row, "F01-A02");
  assert.equal(ns.answered, false);
  assert.equal(ns.status, "not_stated");
  assert.equal(get(row, "F01-A03").status, "not_provided");
});

test("inference is not allowed for official fields and a missing basis goes to human review", () => {
  const inferred = rowOf(doc([A("F02-C08", "احتمالاً پول کافی دارد", "با پول نقد", { basis: "inferred" })]));
  assert.equal(get(inferred, "F02-C08").status, "needs_human_review");
  const noBasis = rowOf(doc([A("F02-C08", "پول نقد دارد", "با پول نقد", { basis: undefined })]));
  assert.equal(get(noBasis, "F02-C08").status, "needs_human_review");
  const corrected = rowOf(doc([A("F02-C08", "پول نقد دارد", "با پول نقد", { basis: "corrected" })]));
  assert.equal(get(corrected, "F02-C08").answered, true);
});

test("extractor finds JSON inside code fences and prose, several objects, arrays, and reports broken JSON", () => {
  const a = doc([A("F01-A01", "الف", "شاهد الف معتبر")], { case_id: "rec1" });
  const b = doc([A("F01-A01", "ب", "شاهد ب معتبر")], { case_id: "rec2" });
  const text = "توضیح اضافه\n```json\n" + JSON.stringify(a, null, 2) + "\n```\nو این پرونده دوم:\n" + JSON.stringify(b) + "\n{نامرتبط}";
  const { rows, errors } = parseContractResults(text);
  assert.deepEqual(rows.map((r) => r.recordId), ["rec1", "rec2"]);
  assert.ok(Array.isArray(errors));
  assert.equal(parseContractResults(JSON.stringify([a, b])).rows.length, 2);
  const broken = parseContractResults('{"contract": "YAVAR_CASE_RESULT", "results": [');
  assert.equal(broken.rows.length, 0);
  assert.ok(broken.errors.length >= 1);
  assert.equal(looksLikeContractJson(JSON.stringify(a)), true);
  assert.equal(looksLikeContractJson("#YAVAR_RESULT v1\nQ12-01: x"), false);
  assert.equal(parseContractResults("متن بدون JSON").rows.length, 0);
});

test("evidence must exist in the stored transcript (digits, Arabic letters and half-spaces are normalised)", () => {
  const transcript = "سلام. من ۳ سال در انبار کار کردم و می‌خواهم دوباره کار کنم. دوشنبه باید به دادگاه بروم.";
  const row = rowOf(doc([
    A("F01-A03", "سه سال کار کرده", "من 3 سال در انبار کار کردم"),
    A("F01-A01", "دوشنبه دادگاه", "دوشنبه بياد به دادگاه بروم"),
    A("F01-A05", "شب‌کاری نمی‌تواند", "شب کاری نمی‌توانم انجام بدهم")
  ]));
  const out = verifyEvidenceAgainstTranscript(row, transcript);
  assert.equal(get(out, "F01-A03").evidenceVerified, true);
  assert.equal(get(out, "F01-A01").evidenceVerified, true);
  const bad = get(out, "F01-A05");
  assert.equal(bad.answered, false);
  assert.equal(bad.status, "needs_human_review");
  assert.equal(bad.proposedAnswer, "شب‌کاری نمی‌تواند");
  assert.equal(out.stats.answered, 2);
  assert.ok(out.warnings.some((w) => w.includes("F01-A05") && w.includes("شاهد در متن")));
  const noText = verifyEvidenceAgainstTranscript(row, "");
  assert.ok(noText.warnings.some((w) => w.includes("موجود نیست")));
  assert.equal(get(noText, "F01-A03").answered, true);
});

test("field-interview scenarios from the specification stay conservative", () => {
  const transcript = [
    "اگر شیفت صبح باشد، اتوبوس از جلوی مرکز رد می‌شود. برای شیفت شب باید فکری بکنم.",
    "سلام، خوبی؟ امروز خیلی شلوغ است. راستی، برای کار صبح اگر ماشین نباشد با اتوبوس می‌روم.",
    "مدرک شناسایی‌ام کامل است.",
    "چند دقیقه بعد: کارت ملی هنوز دستم نرسیده.",
    "برای شروع کار باید ...",
    "یه مدتی انبار کار می‌کردم، فکر کنم حدود دو سال، بعدش دیگه کار گیرم نیومد."
  ].join("\n");
  const row = verifyEvidenceAgainstTranscript(rowOf(doc([
    // 1) پاسخ غیرمستقیم: فقط شیفت صبح روشن است؛ شیفت شب نامعلوم
    { form_code: "F02", field_code: "F02-C10", value: "شیفت صبح: اتوبوس از جلوی مرکز رد می‌شود", status: "needs_human_review", basis: "explicit", confidence: "medium", review_required: true, notes: "وضعیت شیفت شب نامعلوم است", evidence: [{ text: "اگر شیفت صبح باشد، اتوبوس از جلوی مرکز رد می‌شود" }], contradictions: [] },
    // 2) گفت‌وگوی جانبی: احوال‌پرسی ثبت نمی‌شود، پاسخ مرتبط با شاهد ثبت می‌شود
    A("F02-C02", "اگر ماشین نباشد با اتوبوس می‌رود", "برای کار صبح اگر ماشین نباشد با اتوبوس می‌روم", { confidence: "medium" }),
    // 3) تناقض
    { form_code: "F02", field_code: "F02-C07", value: null, status: "contradictory", basis: "none", confidence: "medium", review_required: true, evidence: [], contradictions: [{ text: "مدرک شناسایی‌ام کامل است" }, { text: "کارت ملی هنوز دستم نرسیده" }] },
    // 4) صدای نامفهوم: حدس زده نمی‌شود
    { form_code: "F01", field_code: "F01-A06", value: "برای شروع کار باید [نامفهوم]", status: "unclear", basis: "none", confidence: "low", review_required: true, evidence: [{ text: "برای شروع کار باید ..." }], contradictions: [] },
    // 5) پاسخ پراکنده با همان دقت
    A("F01-A03", "حدود دو سال در انبار کار کرده و بعد کاری پیدا نکرده", "یه مدتی انبار کار می‌کردم، فکر کنم حدود دو سال", { confidence: "medium" }),
    // 6) چند گوینده: انتساب نامطمئن
    { form_code: "F02", field_code: "F02-C06", value: null, status: "needs_human_review", basis: "none", confidence: "low", review_required: true, notes: "گوینده نامشخص؛ صدای پس‌زمینه", evidence: [], contradictions: [] }
  ])), transcript);
  assert.equal(row.stats.answered, 2);
  assert.equal(get(row, "F02-C02").evidenceVerified, true);
  assert.equal(get(row, "F01-A03").evidenceVerified, true);
  assert.equal(get(row, "F02-C10").answered, false);
  assert.match(get(row, "F02-C10").proposedAnswer, /شیفت صبح/);
  assert.equal(get(row, "F02-C07").status, "contradictory");
  assert.equal(get(row, "F01-A06").status, "unclear");
  assert.equal(get(row, "F01-A06").answered, false);
  assert.equal(get(row, "F02-C06").status, "needs_human_review");
  assert.ok(row.referralAnswers.every((a) => !/سلام|خوبی|شلوغ/.test(a.answer + a.proposedAnswer)));

  const oneVersusThree = rowOf(doc([{ form_code: "F01", field_code: "F01-A03", value: null, status: "contradictory", basis: "none", confidence: "medium", review_required: true, evidence: [], contradictions: [{ text: "یک سال کار کردم" }, { text: "سه سال کار کردم" }] }]));
  assert.equal(get(oneVersusThree, "F01-A03").status, "contradictory");
  assert.equal(get(oneVersusThree, "F01-A03").answered, false);
});

test("change summary reports added, changed, cleared and overwritten human-reviewed answers", () => {
  const prev = [
    { code: "F01-A01", answered: true, answer: "الف", reviewStatus: "human_reviewed" },
    { code: "F01-A02", answered: true, answer: "ب" },
    { code: "F01-A03", answered: true, answer: "ج" }
  ];
  const next = [
    { code: "F01-A01", answered: true, answer: "الف", status: "answered" },
    { code: "F01-A02", answered: true, answer: "تغییر", status: "answered" },
    { code: "F01-A03", answered: false, answer: "", status: "needs_human_review" },
    { code: "F01-A04", answered: true, answer: "جدید", status: "answered" }
  ];
  assert.deepEqual(summarizeChanges(prev, next), { added: 1, changed: 1, unchanged: 1, cleared: 1, needsReview: 1, humanReviewedOverwritten: 1 });
});

test("the schema file stays in sync with the code constants", () => {
  const schema = JSON.parse(readFileSync(new URL("../docs/contracts/YAVAR_CASE_RESULT.v1.schema.json", import.meta.url), "utf8"));
  const f = schema.$defs.field.properties;
  assert.deepEqual(f.status.enum, [...FIELD_STATUSES]);
  assert.deepEqual(f.basis.enum, [...FIELD_BASES]);
  assert.deepEqual(f.confidence.enum, [...CONFIDENCES, null]);
  assert.deepEqual(f.field_code.enum, [...FIELD_CODES]);
  assert.deepEqual(schema.properties.analysis.properties.status.enum, [...ANALYSIS_STATUSES]);
  assert.equal(schema.properties.contract.const, CONTRACT_ID);
  assert.deepEqual(Object.keys(schema.properties).sort(), ["analysis", "case_id", "case_number", "contract", "contract_version", "date_jalali", "forms_reference", "results", "summary", "warnings"]);
});

test("the JSON prompt carries the contract, every field code, the key rules and only an unfilled template", () => {
  const cases = [{ recordId: "rec1", caseNumber: "123456", dateJalali: "1405/07/26", audioFiles: ["yavar-rec1-1.wav"], transcriptFile: "yavar-rec1-transcript.txt" }];
  const p = buildJsonExchangePrompt(cases, {});
  assert.match(p, /YAVAR_CASE_RESULT/);
  for (const code of FIELD_CODES) assert.ok(p.includes(code), code);
  for (const s of FIELD_STATUSES) assert.ok(p.includes(s), s);
  assert.match(p, /yavar-rec1-transcript\.txt/);
  assert.match(p, /پاسخ منفی/);
  assert.match(p, /هرگز یکی را خودسرانه انتخاب نکن/);
  const parsed = parseContractResults(p);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].recordId, "rec1");
  assert.equal(parsed.rows[0].hasContent, false);
});
