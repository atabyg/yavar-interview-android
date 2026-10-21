import test from "node:test";
import assert from "node:assert/strict";
import { parseContractResults, validateCaseResult } from "../src/contract.js";
import { A, N, doc, get, rowOf } from "./contract-fixtures.js";

const NEG = "بدهی ندارد";

test("a valid document is accepted and mapped to the import row without any AI call", () => {
  const row = rowOf(doc([A("F01-A01", "court on monday", "evidence one", { confidence: "medium" })]));
  assert.equal(row.recordId, "rec1");
  assert.equal(row.caseNumber, "123456");
  assert.equal(row.date, "1405/07/26");
  assert.equal(row.isReferralFormat, true);
  assert.equal(row.referralAnswers.length, 21);
  const a = get(row, "F01-A01");
  assert.equal(a.answered, true);
  assert.equal(a.confidence, "\u0645\u062a\u0648\u0633\u0637");
  assert.equal(a.status, "answered");
  assert.equal(a.basis, "explicit");
  assert.deepEqual(a.sourceSegmentIds, ["seg-001"]);
  assert.equal(row.stats.answered, 1);
  assert.equal(row.stats.overall, null);
  assert.equal(row.stats.verdict, null);
  assert.equal(row.hasContent, true);
  assert.equal(get(row, "F01-A02").status, "not_provided");
  assert.ok(row.warnings.some((w) => w.includes("20")));
});

test("answered without evidence is not accepted: the value survives only as a proposal for human review", () => {
  const row = rowOf(doc([A("F01-A04", "has installments", "x", { evidence: [] })]));
  const a = get(row, "F01-A04");
  assert.equal(a.answered, false);
  assert.equal(a.status, "needs_human_review");
  assert.equal(a.proposedAnswer, "has installments");
  assert.equal(a.answer, "");
  assert.equal(row.stats.answered, 0);
  assert.ok(row.warnings.some((w) => w.includes("F01-A04") && w.includes("needs") === false && w.includes("\u0628\u062f\u0648\u0646 \u0634\u0627\u0647\u062f")));
});

test("missing confidence on an answered field is reported and treated as low", () => {
  const row = rowOf(doc([A("F01-A01", "answer", "evidence one", { confidence: null })]));
  assert.equal(get(row, "F01-A01").confidence, "\u067e\u0627\u06cc\u06cc\u0646");
  assert.equal(get(row, "F01-A01").reviewRequired, true);
  assert.ok(row.warnings.some((w) => w.includes("F01-A01") && w.includes("\u0627\u0637\u0645\u06cc\u0646\u0627\u0646")));
});

test("contradictory fields keep both statements, need two pieces of evidence and never auto-select a value", () => {
  const two = [{ text: "first statement", source_segment_ids: ["seg-003"] }, { text: "second statement", source_segment_ids: ["seg-009"] }];
  const good = rowOf(doc([{ form_code: "F02", field_code: "F02-C07", value: null, status: "contradictory", basis: "none", evidence: [], confidence: "medium", review_required: true, contradictions: two }]));
  const a = get(good, "F02-C07");
  assert.equal(a.status, "contradictory");
  assert.equal(a.answered, false);
  assert.equal(a.answer, "");
  assert.equal(a.contradictions.length, 2);
  assert.equal(a.reviewRequired, true);

  const withValue = rowOf(doc([{ form_code: "F02", field_code: "F02-C07", value: "picked one", status: "contradictory", basis: "none", evidence: [], contradictions: two }]));
  assert.equal(get(withValue, "F02-C07").answer, "");
  assert.equal(get(withValue, "F02-C07").proposedAnswer, "picked one");
  assert.ok(withValue.warnings.some((w) => w.includes("F02-C07")));

  const oneSided = rowOf(doc([{ form_code: "F02", field_code: "F02-C07", value: null, status: "contradictory", basis: "none", evidence: [], contradictions: [two[0]] }]));
  assert.equal(get(oneSided, "F02-C07").status, "needs_human_review");
});

test("unknown field codes are rejected with a readable error and unknown keys are reported, not ignored", () => {
  const d = doc([
    A("F01-A01", "answer", "evidence one"),
    { ...A("F03-X01", "x", "y"), form_code: "F03" },
    { ...A("F02-C01", "answer", "evidence two"), form_code: "F01" }
  ], { extra_key: 1 });
  const v = validateCaseResult(d);
  assert.equal(v.ok, true);
  assert.equal(v.fields.length, 1);
  assert.ok(v.errors.some((e) => e.includes("F03-X01")));
  assert.ok(v.errors.some((e) => e.includes("F02-C01") && e.includes("form_code")));
  assert.ok(v.warnings.some((w) => w.includes("extra_key")));
});

test("duplicate field codes keep the first value and warn", () => {
  const row = rowOf(doc([A("F01-A01", "first", "evidence one"), A("F01-A01", "second", "evidence two")]));
  assert.equal(get(row, "F01-A01").answer, "first");
  assert.ok(row.warnings.some((w) => w.includes("F01-A01")));
});

test("incompatible version, wrong id, failed analysis and bad structure block the whole result", () => {
  const v2 = validateCaseResult(doc([], { contract_version: "2.0" }));
  assert.equal(v2.ok, false);
  assert.ok(v2.blocking.length >= 1);
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
  const row = rowOf(doc([A("F01-A04", NEG, "evidence one"), N("F01-A02")]));
  const neg = get(row, "F01-A04");
  assert.equal(neg.answered, true);
  assert.equal(neg.answer, NEG);
  const ns = get(row, "F01-A02");
  assert.equal(ns.answered, false);
  assert.equal(ns.status, "not_stated");
  assert.equal(get(row, "F01-A03").status, "not_provided");
});

test("inference is not allowed for official fields and a missing basis goes to human review", () => {
  const inferred = rowOf(doc([A("F02-C08", "maybe", "evidence one", { basis: "inferred" })]));
  assert.equal(get(inferred, "F02-C08").status, "needs_human_review");
  const noBasis = rowOf(doc([A("F02-C08", "cash", "evidence one", { basis: undefined })]));
  assert.equal(get(noBasis, "F02-C08").status, "needs_human_review");
  const corrected = rowOf(doc([A("F02-C08", "cash", "evidence one", { basis: "corrected" })]));
  assert.equal(get(corrected, "F02-C08").answered, true);
});
