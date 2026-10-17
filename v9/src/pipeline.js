// Resumable pipeline. Offline transcripts are never uploaded for transcription.
import { getAudioSegments, getInterview, patchInterview } from "./db";
import { getSettings, analysisKey, transcriptionKey } from "./settings";
import { analyze, friendly, transcribe } from "./openai";
import { questionSetFor } from "./questions";
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
    if (!iv) throw new Error("پروندهٔ مصاحبه پیدا نشد.");
    if (!iv.transcript) {
      if (s.transcribeProvider === "offline") throw new Error("متن آفلاین در دسترس نیست. پشتیبانی فارسی تشخیص گفتار روی گوشی را بررسی کنید یا ارائه‌دهندهٔ تبدیل صوت را در تنظیمات تغییر دهید.");
      const key = transcriptionKey(s);
      if (!key) throw new Error("برای تبدیل صوت ابری، کلید ارائه‌دهندهٔ انتخاب‌شده را در تنظیمات وارد کنید.");
      const segs = await getAudioSegments(id);
      if (!segs.length) throw new Error("فایل صوتی پیدا نشد.");
      const previousProvider = iv.transcribeProviderUsed || "openai";
      const texts = iv.segTexts && previousProvider === s.transcribeProvider ? [...iv.segTexts] : [];
      for (let i = texts.length; i < segs.length; i++) {
        await patchInterview(id, { status: "transcribing", error: "", step: "تبدیل صوت به متن (" + (i + 1) + " از " + segs.length + ")" });
        texts.push(await transcribe(segs[i], "part" + (i + 1) + "." + ext(iv.mime), { provider: s.transcribeProvider, key, model: s.transcribeModel }));
        await patchInterview(id, { segTexts: texts, transcribeProviderUsed: s.transcribeProvider }, true);
      }
      await patchInterview(id, { transcript: texts.join("\n\n").trim(), status: "transcribed", step: "" });
      iv = await getInterview(id);
    }
    if ((iv.transcript || "").trim().length < 20) throw new Error("متن قابل‌استفاده برای تحلیل کافی نیست. نویز یا صدای کم را بررسی کنید و متن را بازبینی کنید.");
    stage = "analyze";
    const key = analysisKey(s);
    if (!key) throw new Error("برای تحلیل و امتیازدهی، کلید ارائه‌دهندهٔ تحلیل را در تنظیمات وارد کنید.");
    if (!iv.analysis) {
      await patchInterview(id, { status: "analyzing", error: "", step: "تحلیل و امتیازدهی بر اساس پرسش‌نامهٔ انتخابی" });
      const qs = questionSetFor(iv.questionSet || s.questionSet);
      const a = await analyze(iv.transcript, iv, { provider: s.analyzeProvider, key, model: s.analyzeModel, questions: qs.questions, questionSetLabel: qs.label });
      await patchInterview(id, { analysis: a, status: "done", step: "", failedAt: null, error: "" });
    } else {
      await patchInterview(id, { status: "done", step: "", failedAt: null, error: "" });
    }
  } catch (e) {
    await patchInterview(id, { status: "error", failedAt: stage, error: friendly(e), step: "" });
  } finally { running.delete(id); }
}
export async function reanalyze(id) {
  await patchInterview(id, { analysis: null, status: "transcribed", error: "" });
  return processInterview(id);
}
