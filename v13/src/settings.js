// Settings remain compatible with v8 storage so an upgrade keeps existing interviews.
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
const KEY = "yavar8.settings";

// Only models/providers with a documented free or limited-free path are offered here.
// API keys are user-owned; never bundle a shared key in this public app.
export const ANALYSIS_PROVIDERS = {
  groq: {
    label: "Groq",
    models: ["openai/gpt-oss-20b", "openai/gpt-oss-120b"],
    defaultModel: "openai/gpt-oss-20b",
    keyUrl: "https://console.groq.com/keys"
  },
  gemini: {
    label: "Google Gemini",
    models: ["gemini-3.7-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite"],
    defaultModel: "gemini-3.7-flash",
    keyUrl: "https://aistudio.google.com/apikey"
  },
  cerebras: {
    label: "Cerebras",
    models: ["zai-glm-4.7", "gpt-oss-120b", "llama3.1-8b"],
    defaultModel: "zai-glm-4.7",
    keyUrl: "https://cloud.cerebras.ai/platform"
  },
  openrouter: {
    label: "OpenRouter — مسیریاب مدل‌های رایگان",
    models: ["openrouter/free"],
    defaultModel: "openrouter/free",
    keyUrl: "https://openrouter.ai/settings/keys"
  },
  mistral: {
    label: "Mistral AI",
    models: ["mistral-small-latest", "ministral-8b-latest", "ministral-3b-latest"],
    defaultModel: "mistral-small-latest",
    keyUrl: "https://console.mistral.ai/api-keys"
  },
  huggingface: {
    label: "Hugging Face — اعتبار رایگان محدود",
    models: ["openai/gpt-oss-120b"],
    defaultModel: "openai/gpt-oss-120b",
    keyUrl: "https://huggingface.co/settings/tokens"
  }
};
export const DEFAULTS = {
  apiKey: "",
  apiKeys: { openai: "", groq: "", gemini: "", mistral: "", cerebras: "", openrouter: "", huggingface: "" },
  transcribeProvider: "offline", transcribeModel: "whisper-large-v3",
  analyzeProvider: "groq", analyzeModel: "openai/gpt-oss-20b",
  questionSet: "critical12", autoProcess: false, autoProcessConsentVersion: 1, autoExportAfterAnalysis: false,
  speechEnhancement: true, smartTranscriptCleanup: true,
  interviewer: "", org: "سازمان خدمات و مشارکت‌های اجتماعی شهرداری تهران", lastFolder: null
};
let cache = null;
export async function loadSettings() {
  let raw = null;
  try { if (Capacitor.isNativePlatform()) raw = (await Preferences.get({ key: KEY })).value; } catch (e) {}
  if (!raw) { try { raw = localStorage.getItem(KEY); } catch (e) {} }
  let obj = {};
  try { obj = raw ? JSON.parse(raw) : {}; } catch (e) {}
  const apiKeys = { ...DEFAULTS.apiKeys, ...(obj.apiKeys || {}) };
  if (!apiKeys.openai && obj.apiKey) apiKeys.openai = obj.apiKey;
  if (["gpt-4o-transcribe", "gpt-4o-mini-transcribe", "whisper-1"].includes(obj.transcribeModel)) {
    obj.transcribeModel = "gpt-4o-mini-transcribe";
    if (!obj.transcribeProvider || obj.transcribeProvider === "offline") obj.transcribeProvider = "openai";
  }
  // v11: keep old keys/data for compatibility, but default to documented limited-free models.
  if (!ANALYSIS_PROVIDERS[obj.analyzeProvider]) obj.analyzeProvider = "groq";
  const currentProvider = ANALYSIS_PROVIDERS[obj.analyzeProvider];
  if (!currentProvider.models.includes(obj.analyzeModel)) obj.analyzeModel = currentProvider.defaultModel;
  if (!["offline", "groq"].includes(obj.transcribeProvider)) obj.transcribeProvider = "offline";
  if (obj.transcribeProvider === "offline") obj.transcribeModel = "whisper-tiny-q5_1-fa";
  else if (!["whisper-large-v3", "whisper-large-v3-turbo"].includes(obj.transcribeModel)) obj.transcribeModel = "whisper-large-v3";
  if (obj.autoProcessConsentVersion !== 1) { obj.autoProcess = false; obj.autoProcessConsentVersion = 1; }
  cache = { ...DEFAULTS, ...obj, apiKeys };
  return cache;
}
export const getSettings = () => cache || { ...DEFAULTS, apiKeys: { ...DEFAULTS.apiKeys } };
export async function saveSettings(patch) {
  const prev = getSettings();
  cache = { ...prev, ...patch, apiKeys: patch.apiKeys ? { ...(prev.apiKeys || DEFAULTS.apiKeys), ...patch.apiKeys } : (prev.apiKeys || { ...DEFAULTS.apiKeys }), autoProcessConsentVersion: 1 };
  const raw = JSON.stringify(cache);
  try { localStorage.setItem(KEY, raw); } catch (e) {}
  try { if (Capacitor.isNativePlatform()) await Preferences.set({ key: KEY, value: raw }); } catch (e) {}
  return cache;
}
export const analysisKey = (s = getSettings()) => (s.apiKeys && s.apiKeys[s.analyzeProvider]) || (s.analyzeProvider === "openai" ? s.apiKey : "") || "";
export const transcriptionKey = (s = getSettings()) => (s.apiKeys && s.apiKeys[s.transcribeProvider]) || (s.transcribeProvider === "openai" ? s.apiKey : "") || "";
