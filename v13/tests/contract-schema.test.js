import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ANALYSIS_STATUSES, CONFIDENCES, CONTRACT_ID, FIELD_BASES, FIELD_CODES, FIELD_STATUSES,
  buildJsonExchangePrompt, parseContractResults
} from "../src/contract.js";

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
  assert.ok(p.includes("contradictions"));
  assert.ok(p.includes("not_stated"));
  const parsed = parseContractResults(p);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].recordId, "rec1");
  assert.equal(parsed.rows[0].hasContent, false);
});
