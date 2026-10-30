import test from "node:test";
import assert from "node:assert/strict";
import { buildPatch, matchRecord } from "../src/exchange.js";
import { parseContractResults, verifyEvidenceAgainstTranscript } from "../src/contract.js";
import { A, doc } from "./contract-fixtures.js";

const SPOKEN = "she said she has no debts at all";

test("a contract result is matched to its record, verified and saved as an analysis without touching the transcript", () => {
  const item = { id: "rec1", caseNumber: "123456", candidate: "client", createdAt: Date.now(), questionSet: "critical12", transcript: "hello. " + SPOKEN + ". bye" };
  const { rows } = parseContractResults(JSON.stringify(doc([A("F01-A04", "no debts", SPOKEN)])));
  assert.equal(rows.length, 1);
  const match = matchRecord(rows[0], [item]);
  assert.equal(match.record, item);
  const checked = verifyEvidenceAgainstTranscript(rows[0], item.transcript);
  const patch = buildPatch(item, checked);
  assert.equal(patch.status, "done");
  assert.equal(patch.analysis.formId, "referral");
  assert.equal(patch.analysis.overall, null);
  assert.equal(patch.analysis.formAnswers.length, 21);
  const a = patch.analysis.formAnswers.find((x) => x.code === "F01-A04");
  assert.equal(a.answered, true);
  assert.equal(a.evidenceVerified, true);
  assert.equal(a.status, "answered");
  assert.equal(Object.prototype.hasOwnProperty.call(patch, "transcript"), false);
});

test("an answer whose evidence is not in the stored transcript is saved as needing review, never as answered", () => {
  const item = { id: "rec1", caseNumber: "123456", candidate: "client", createdAt: Date.now(), transcript: "completely different words were spoken here" };
  const { rows } = parseContractResults(JSON.stringify(doc([A("F01-A04", "no debts", SPOKEN)])));
  const patch = buildPatch(item, verifyEvidenceAgainstTranscript(rows[0], item.transcript));
  const a = patch.analysis.formAnswers.find((x) => x.code === "F01-A04");
  assert.equal(a.answered, false);
  assert.equal(a.status, "needs_human_review");
  assert.equal(a.proposedAnswer, "no debts");
  assert.equal(patch.analysis.answeredCount, 0);
});
