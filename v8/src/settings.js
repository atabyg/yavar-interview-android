// The API key and settings live until the user deletes them: stored in native SharedPreferences
// AND mirrored in localStorage. Nothing here ever expires or clears itself.
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

const KEY = "yavar8.settings";
export const DEFAULTS = {
  apiKey: "",
  transcribeModel: "gpt-4o-transcribe",
  analyzeModel: "gpt-4o-mini",
  autoProcess: true,
  interviewer: "",
  org: "سازمان خدمات و مشارکت‌های اجتماعی شهرداری تهران",
  lastFolder: null,
};
let cache = null;

export async function loadSettings() {
  let raw = null;
  try { if (Capacitor.isNativePlatform()) raw = (await Preferences.get({ key: KEY })).value; } catch (e) { /* ignore */ }
  if (!raw) { try { raw = localStorage.getItem(KEY); } catch (e) { /* ignore */ } }
  let obj = {};
  try { obj = raw ? JSON.parse(raw) : {}; } catch (e) { obj = {}; }
  cache = { ...DEFAULTS, ...obj };
  return cache;
}
export const getSettings = () => cache || { ...DEFAULTS };
export async function saveSettings(patch) {
  cache = { ...getSettings(), ...patch };
  const raw = JSON.stringify(cache);
  try { localStorage.setItem(KEY, raw); } catch (e) { /* ignore */ }
  try { if (Capacitor.isNativePlatform()) await Preferences.set({ key: KEY, value: raw }); } catch (e) { /* ignore */ }
  return cache;
}
