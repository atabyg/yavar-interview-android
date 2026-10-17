// Settings remain compatible with v8 storage so an upgrade keeps existing interviews.
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
const KEY = "yavar8.settings";
export const DEFAULTS = {
  apiKey: "",
  apiKeys: { openai: "", groq: "", gemini: "", mistral: "" },
  transcribeProvider: "offline", transcribeModel: "whisper-large-v3",
  analyzeProvider: "groq", analyzeModel: "openai/gpt-oss-20b",
  questionSet: "critical12", autoProcess: false, autoProcessConsentVersion: 1,
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
  if (!obj.analyzeProvider && obj.apiKey) obj.analyzeProvider = "openai";
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
