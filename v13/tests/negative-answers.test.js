import test from "node:test";
import assert from "node:assert/strict";
import { analyze } from "../src/openai.js";

const NEG = "ندارد";
const NOT_STATED = "ثبت نشده در متن";

test("in-app analysis keeps an explicit negative answer and blanks an explicit not-stated marker", async () => {
  const previous = globalThis.fetch;
  const modelResult = {
    summary: "s",
    formAnswers: [
      { code: "F01-A04", answer: NEG, evidence: "evidence one", confidence: "بالا" },
      { code: "F01-A05", answer: NOT_STATED, evidence: "", confidence: "پایین" }
    ]
  };
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(modelResult) } }] }), {
    status: 200, headers: { "Content-Type": "application/json" }
  });
  try {
    const result = await analyze("some transcript", { candidate: "x", position: "y" }, { provider: "mistral", key: "k", model: "m", questions: [] });
    const neg = result.formAnswers.find((q) => q.code === "F01-A04");
    const none = result.formAnswers.find((q) => q.code === "F01-A05");
    assert.equal(neg.answered, true);
    assert.equal(neg.answer, NEG);
    assert.equal(neg.status, "answered");
    assert.equal(neg.basis, "explicit");
    assert.equal(none.answered, false);
    assert.equal(none.answer, "");
    assert.equal(none.status, "not_stated");
    assert.equal(result.formAnswers.length, 21);
  } finally {
    globalThis.fetch = previous;
  }
});
