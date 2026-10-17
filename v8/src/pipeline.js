// Runs outside React, so it keeps going when you switch screens. Every step is saved: a retry resumes, never restarts.
import { getAudioSegments, getInterview, patchInterview } from "./db";
import { getSettings } from "./settings";
import { analyze, friendly, transcribe } from "./openai";

const running = new Set();
const ext = (mime) => (/mp4/.test(mime) ? "m4a" : /ogg/.test(mime) ? "ogg" : "webm");

export const isRunning = (id) => running.has(id);

export async function processInterview(id) {
  if (running.has(id)) return;
  running.add(id);
  let stage = "transcribe";
  try {
    const s = getSettings();
    let iv = await getInterview(id);
    if (!s.apiKey) { await patchInterview(id, { status: "error", failedAt: "transcribe", error: "کلید API در تنظیمات وارد نشده است." }); return; }
    const opts = { key: s.apiKey, model: s.transcribeModel };

    if (!iv.transcript) {
      const segs = await getAudioSegments(id);
      if (!segs.length) throw new Error("فایل صوتی پیدا نشد.");
      const texts = iv.segTexts ? [...iv.segTexts] : [];
      for (let i = texts.length; i < segs.length; i++) {
        await patchInterview(id, { status: "transcribing", error: "", step: `تبدیل صدا به متن (${i + 1} از ${segs.length})` });
        texts.push(await transcribe(segs[i], `part${i + 1}.${ext(iv.mime)}`, opts));
        await patchInterview(id, { segTexts: texts }, true);
      }
      await patchInterview(id, { transcript: texts.join("\n\n").trim(), status: "transcribed", step: "" });
      iv = await getInterview(id);
    }

    stage = "analyze";
    if ((iv.transcript || "").length < 40) throw new Error("متن مصاحبه برای تحلیل کافی نیست (صدا خالی یا بسیار کوتاه بود).");
    if (!iv.analysis) {
      await patchInterview(id, { status: "analyzing", error: "", step: "تحلیل و امتیازدهی" });
      const a = await analyze(iv.transcript, iv, { key: s.apiKey, model: s.analyzeModel });
      await patchInterview(id, { analysis: a, status: "done", step: "", failedAt: null });
    } else await patchInterview(id, { status: "done", step: "" });
  } catch (e) {
    await patchInterview(id, { status: "error", failedAt: stage, error: friendly(e), step: "" });
  } finally { running.delete(id); }
}

// Redo analysis only (e.g. after changing the model) keeping the transcript.
export async function reanalyze(id) { await patchInterview(id, { analysis: null, status: "transcribed" }); return processInterview(id); }
