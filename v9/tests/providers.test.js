import test from "node:test";
import assert from "node:assert/strict";
import { ANALYSIS_PROVIDERS, DEFAULTS, loadSettings } from "../src/settings.js";
import { analyze, COMPETENCIES, testProviderKey } from "../src/openai.js";

test("only four explicitly configured limited-free analysis providers are exposed", () => {
  assert.deepEqual(Object.keys(ANALYSIS_PROVIDERS), ["groq", "gemini", "cerebras", "openrouter"]);
  for (const [id, provider] of Object.entries(ANALYSIS_PROVIDERS)) {
    assert.ok(provider.models.includes(provider.defaultModel), id + " default model must be selectable");
    assert.ok(provider.keyUrl.startsWith("https://"), id + " must link to its official key page");
    assert.equal(typeof DEFAULTS.apiKeys[id], "string", id + " must have persisted key storage");
  }
  assert.deepEqual(ANALYSIS_PROVIDERS.openrouter.models, ["openrouter/free"]);
});

test("legacy/retired model selections migrate to provider free-tier defaults", async () => {
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: () => JSON.stringify({ analyzeProvider: "cerebras", analyzeModel: "retired-model", apiKeys: { cerebras: "saved-user-key" } }),
    setItem: () => {}
  };
  try {
    const settings = await loadSettings();
    assert.equal(settings.analyzeProvider, "cerebras");
    assert.equal(settings.analyzeModel, ANALYSIS_PROVIDERS.cerebras.defaultModel);
    assert.equal(settings.apiKeys.cerebras, "saved-user-key");
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});

test("OpenRouter checks the supplied key using its key-status endpoint", async () => {
  const previous = globalThis.fetch;
  let requestedUrl = "";
  let authorization = "";
  globalThis.fetch = async (url, init) => {
    requestedUrl = String(url);
    authorization = init.headers.Authorization;
    return new Response(JSON.stringify({ data: { label: "test", usage: 0 } }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    assert.deepEqual(await testProviderKey("openrouter", "test-user-key"), ["openrouter/free"]);
    assert.equal(requestedUrl, "https://openrouter.ai/api/v1/key");
    assert.equal(authorization, "Bearer test-user-key");
  } finally {
    globalThis.fetch = previous;
  }
});

test("Cerebras discovery returns only models selected for the limited-free integration", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    data: [{ id: "zai-glm-4.7" }, { id: "llama3.1-8b" }, { id: "gpt-oss-120b" }, { id: "paid-or-unknown-model" }]
  }), { status: 200, headers: { "Content-Type": "application/json" } });
  try {
    assert.deepEqual(await testProviderKey("cerebras", "test-user-key"), ["gpt-oss-120b", "llama3.1-8b", "zai-glm-4.7"]);
  } finally {
    globalThis.fetch = previous;
  }
});

test("analysis request uses OpenRouter Free and still validates the complete structured answer", async () => {
  const previous = globalThis.fetch;
  const modelResult = {
    summary: "نمونه",
    verdict: "مشروط / نیازمند بررسی بیشتر",
    competencies: COMPETENCIES.map((name) => ({ name, score: 8, note: "نمونهٔ شاهد" })),
    strengths: [], weaknesses: [], redFlags: [], followUp: []
  };
  let requestUrl = "";
  let sentModel = "";
  globalThis.fetch = async (url, init) => {
    requestUrl = String(url);
    sentModel = JSON.parse(init.body).model;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(modelResult) } }] }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });
  };
  try {
    const result = await analyze("نمونه متن مصاحبه", { candidate: "آزمون", position: "کارشناس" }, {
      provider: "openrouter", key: "test-user-key", model: "openrouter/free", questions: []
    });
    assert.equal(requestUrl, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(sentModel, "openrouter/free");
    assert.equal(result.provider, "openrouter");
    assert.equal(result.overall, 80);
    assert.equal(result.competencies.length, 6);
  } finally {
    globalThis.fetch = previous;
  }
});
