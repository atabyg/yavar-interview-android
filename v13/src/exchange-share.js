// Builds the hand-off for an external AI (voice + prompt + plain transcript) and opens the Android share sheet.
// Default format is the JSON contract YAVAR_CASE_RESULT v1 (no client name in the files); the legacy coded-text format stays available.
import { getAudioSegments } from "./db";
import { audioFileName, buildExchangePrompt, promptFileName, transcriptFileName, audioExt } from "./exchange.js";
import { blobToWav } from "./audio-utils";
import { dayKey } from "./daily";
import { buildJsonExchangePrompt } from "./contract.js";
import { labelTranscript } from "./transcript-segments.js";
import { saveFiles } from "./native";

// Descriptors of the records for the JSON prompt (names only; never the client name).
const toCases = (list) => list.map((r) => ({
  recordId: r.id, caseNumber: r.caseNumber || "", dateJalali: dayKey(r.createdAt),
  audioFiles: Array.from({ length: Math.max(1, r.segs || 1) }, (_, k) => audioFileName(r, k)),
  transcriptFile: transcriptFileName(r)
}));

export async function exchangeFiles(records, key, opts = {}) {
  const format = opts.format === "text" ? "text" : "json";
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
    const stored = String(rec.transcript || "").trim();
    const transcriptText = (format === "json" && stored ? labelTranscript(stored) : stored) ||
      "NO_TRANSCRIPT_AVAILABLE: این پرونده هنوز متن گفت‌وگو ندارد. اگر رابط مقصد صوت را نمی‌پذیرد، ابتدا در یاور تبدیل آفلاین Whisper را اجرا کنید.";
    const header = format === "json"
      ? [
        "YAVAR PLAIN TRANSCRIPT v2\n",
        "RECORD_ID: " + rec.id + "\n",
        "CASE_NUMBER: " + (rec.caseNumber || "") + "\n",
        "DATE_JALALI: " + dayKey(rec.createdAt) + "\n",
        "SEGMENT_LABELS: every line starts with a stable id such as [seg-001]; cite it in source_segment_ids\n",
        "SOURCE: saved transcript or explicit no-transcript notice\n"
      ]
      : [
        "YAVAR PLAIN TRANSCRIPT v1\n",
        "RECORD_ID: " + rec.id + "\n",
        "CASE_NUMBER: " + (rec.caseNumber || "") + "\n",
        "DATE_JALALI: " + dayKey(rec.createdAt) + "\n",
        "CLIENT_NAME: " + String(rec.candidate || "") + "\n",
        "SOURCE: saved transcript or explicit no-transcript notice\n"
      ];
    attachments.push({
      blob: new Blob([...header, "TRANSCRIPT_BEGIN\n", transcriptText, "\nTRANSCRIPT_END\n"], { type: "text/plain;charset=utf-8" }),
      name: transcriptName
    });
    prepared.push({ ...rec, segs: segments.length, exchangeAudioFiles: names, exchangeTranscriptFile: transcriptName });
  }
  const promptText = format === "json" ? buildJsonExchangePrompt(toCases(prepared), { dayKey: key }) : buildExchangePrompt(prepared, { dayKey: key });
  const prompt = new Blob([promptText], { type: "text/plain;charset=utf-8" });
  return [{ blob: prompt, name: promptFileName(records, key) }, ...attachments];
}

export async function shareExchangePack(records, key, opts = {}) {
  const files = await exchangeFiles(records, key, opts);
  if (files.length < 2) throw new Error("فایل صوتی برای ارسال پیدا نشد.");
  return saveFiles(files);
}

export async function shareExchangePromptOnly(records, key, opts = {}) {
  const promptText = opts.format === "text" ? buildExchangePrompt(records, { dayKey: key }) : buildJsonExchangePrompt(toCases(records), { dayKey: key });
  return saveFiles([{ blob: new Blob([promptText], { type: "text/plain;charset=utf-8" }), name: promptFileName(records, key) }]);
}
