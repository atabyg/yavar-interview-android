// Builds the two-file hand-off (voice + coded prompt) and opens the Android share sheet.
import { getAudioSegments } from "./db";
import { audioFileName, buildExchangePrompt, promptFileName, transcriptFileName, audioExt } from "./exchange.js";
import { blobToWav } from "./audio-utils";
import { dayKey } from "./daily";
import { saveFiles } from "./native";

export async function exchangeFiles(records, key) {
  const prepared = [];
  const attachments = [];
  for (const rec of records) {
    const segments = await getAudioSegments(rec.id);
    const names = [];
    for (let k = 0; k < segments.length; k++) {
      const original = segments[k];
      let blob = original;
      let ext = audioExt(original.type || rec.mime);
      try {
        // Standard unencrypted PCM WAV is easier to decode across external tools than browser-specific WebM.
        blob = await blobToWav(original, 16000);
        ext = "wav";
      } catch (error) {
        // Preserve the source audio if this phone's WebView cannot decode it; the plain transcript still travels.
      }
      const name = "yavar-" + rec.id + "-" + (k + 1) + "." + ext;
      names.push(name);
      attachments.push({ blob, name });
    }
    const transcriptName = transcriptFileName(rec);
    const transcriptText = String(rec.transcript || "").trim() ||
      "NO_TRANSCRIPT_AVAILABLE: این پرونده هنوز متن گفت‌وگو ندارد. اگر رابط مقصد صوت را نمی‌پذیرد، ابتدا در یاور تبدیل آفلاین Whisper را اجرا کنید.";
    attachments.push({
      blob: new Blob([
        "YAVAR PLAIN TRANSCRIPT v1\n",
        "RECORD_ID: " + rec.id + "\n",
        "CASE_NUMBER: " + (rec.caseNumber || "") + "\n",
        "DATE_JALALI: " + dayKey(rec.createdAt) + "\n",
        "CLIENT_NAME: " + String(rec.candidate || "") + "\n",
        "SOURCE: saved transcript or explicit no-transcript notice\n",
        "TRANSCRIPT_BEGIN\n", transcriptText, "\nTRANSCRIPT_END\n"
      ], { type: "text/plain;charset=utf-8" }),
      name: transcriptName
    });
    prepared.push({ ...rec, segs: segments.length, exchangeAudioFiles: names, exchangeTranscriptFile: transcriptName });
  }
  const prompt = new Blob([buildExchangePrompt(prepared, { dayKey: key })], { type: "text/plain;charset=utf-8" });
  return [{ blob: prompt, name: promptFileName(records, key) }, ...attachments];
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
