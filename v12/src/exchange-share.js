// Builds the two-file hand-off (voice + coded prompt) and opens the Android share sheet.
import { getAudioSegments } from "./db";
import { audioFileName, buildExchangePrompt, promptFileName } from "./exchange.js";
import { saveFiles } from "./native";

export async function exchangeFiles(records, key) {
  const files = [{ blob: new Blob([buildExchangePrompt(records, { dayKey: key })], { type: "text/plain;charset=utf-8" }), name: promptFileName(records, key) }];
  for (const rec of records) {
    const segs = await getAudioSegments(rec.id);
    segs.forEach((blob, k) => files.push({ blob, name: audioFileName({ ...rec, mime: rec.mime || blob.type }, k) }));
  }
  return files;
}

export async function shareExchangePack(records, key) {
  const files = await exchangeFiles(records, key);
  if (files.length < 2) throw new Error("فایل صوتی برای ارسال پیدا نشد.");
  return saveFiles(files);
}

export async function shareExchangePromptOnly(records, key) {
  const files = await exchangeFiles([], key);
  void files;
  return saveFiles([{ blob: new Blob([buildExchangePrompt(records, { dayKey: key })], { type: "text/plain;charset=utf-8" }), name: promptFileName(records, key) }]);
}
