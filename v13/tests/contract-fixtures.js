// Shared fixtures for the YAVAR_CASE_RESULT tests (not a test file itself).
import assert from "node:assert/strict";
import { CONTRACT_ID, CONTRACT_VERSION, contractToRow, validateCaseResult } from "../src/contract.js";

export const A = (code, value, text, over = {}) => ({
  form_code: code.slice(0, 3), field_code: code, value, status: "answered", basis: "explicit",
  evidence: [{ text, source_segment_ids: ["seg-001"] }], confidence: "high", review_required: false, contradictions: [], ...over
});
export const N = (code) => ({
  form_code: code.slice(0, 3), field_code: code, value: null, status: "not_stated", basis: "none",
  evidence: [], confidence: null, review_required: false, contradictions: []
});
export const doc = (results, over = {}) => ({
  contract: CONTRACT_ID, contract_version: CONTRACT_VERSION, case_id: "rec1", case_number: "\u06f1\u06f2\u06f3\u06f4\u06f5\u06f6", date_jalali: "\u06f1\u06f4\u06f0\u06f5/\u06f0\u06f7/\u06f2\u06f6",
  analysis: { status: "complete", provider: "test", model: "m" }, results, ...over
});
export const rowOf = (d) => { const v = validateCaseResult(d); assert.equal(v.ok, true, v.blocking.join(" ")); return contractToRow(v); };
export const get = (row, code) => row.referralAnswers.find((a) => a.code === code);
