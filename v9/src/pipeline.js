// Resumable interview pipeline. Offline voice transcription stays on-device and never uploads audio.
import { getAudioSegments, getInterview, patchInterview } from "./db";
import { getSettings, analysisKey, transcriptionKey } from "./settings";
import { analyze, friendly, transcribe } from "./openai";
import { questionSetFor } from "./questions";
import { OfflineWhisper } from "./native-bridge";
import { transcribeOfflineBlob } from "./offline-transcriber";

const running = new Set();
const ext = (mime) => (/mp4/.test(mime) ? "m4a" : /ogg/.test(mime) ? "ogg" : "webm");
export const isRunning = (id) => running.has(id);

export async function processInterview(id, options = {}) {
  if (running.has(id)) return;
  running.add(id);
  let stage = "transcribe";
  try {
    const s = getSettings();
    let iv = await getInterview(id);
    if (!iv) throw new Error("پروندهٔ مصاحبه پیدا نشد.");

    if (!iv.transcript) {
      const segs = await getAudioSegments(id);
      if (!segs.length) throw new Error("فایل صوتی پیدا نشد.");

      if (s.transcribeProvider === "offline") {
        let model;
        try {
          model = await OfflineWhisper.modelStatus();
        } catch (error) {
          throw new Error("تبدیل کاملاً آفلاین فقط در نسخهٔ اندروید در دسترس است.");
        }
        if (!model || !model.downloaded) {
          throw new Error("برای تبدیل کاملاً آفلاین، در تنظیمات روی «دانلود مدل آفلاین» بزنید. مدل یک بار دانلود می‌شود و پس از آن بدون اینترنت و کلید API کار می‌کند.");
        }
        const priorProvider = iv.transcribeProviderUsed || "";
        const texts = iv.segTexts && priorProvider === "offline" ? [...iv.segTexts] : [];
        for (let i = texts.length; i < segs.length; i++) {
          await patchInterview(id, {
            status: "transcribing",
            error: "",
            step: "تبدیل کاملاً آفلاین گفت‌وگو با Whisper (" + (i + 1) + " از " + segs.length + ")"
          });
          const text = await transcribeOfflineBlob(segs[i], i);
          if (!text.trim()) throw new Error("مدل آفلاین از بخش " + (i + 1) + " متن قابل‌استفاده‌ای نساخت. صدای ضبط‌شده محفوظ است.");
          texts.push(text);
          await patchInterview(id, { segTexts: texts, transcribeProviderUsed: "offline" }, true);
        }
        await patchInterview(id, {
          transcript: texts.join("\n\n").trim(),
          status: "transcribed",
          step: "",
          error: ""
        });
      } else {
        const key = transcriptionKey(s);
        if (!key) throw new Error("برای تبدیل صوت ابری، کلید ارائه‌دهندهٔ انتخاب‌شده را در تنظیمات وارد کنید.");
        const previousProvider = iv.transcribeProviderUsed || "";
        const texts = iv.segTexts && previousProvider === s.transcribeProvider ? [...iv.segTexts] : [];
        for (let i = texts.length; i < segs.length; i++) {
          await patchInterview(id, {
            status: "transcribing",
            error: "",
            step: "تبدیل صوت به متن (" + (i + 1) + " از " + segs.length + ")"
          });
          texts.push(await transcribe(segs[i], "part" + (i + 1) + "." + ext(iv.mime), {
            provider: s.transcribeProvider, key, model: s.transcribeModel
          }));
          await patchInterview(id, { segTexts: texts, transcribeProviderUsed: s.transcribeProvider }, true);
        }
        await patchInterview(id, { transcript: texts.join("\n\n").trim(), status: "transcribed", step: "" });
      }
      iv = await getInterview(id);
    }

    if ((iv.transcript || "").trim().length < 20) {
      throw new Error("متن قابل‌استفاده برای تحلیل کافی نیست. نویز یا صدای کم را بررسی کنید و متن را بازبینی کنید.");
    }

    if (options.transcribeOnly) {
      await patchInterview(id, { status: "transcribed", error: "", step: "" });
      return;
    }

    stage = "analyze";
    const key = analysisKey(s);
    if (!key) {
      await patchInterview(id, {
        status: "transcribed",
        error: "",
        step: "متن آماده است؛ برای تحلیل و امتیازدهی هوش مصنوعی، کلید سرویس تحلیل را در تنظیمات وارد کنید."
      });
      return;
    }
    if (!iv.analysis) {
      await patchInterview(id, { status: "analyzing", error: "", step: "تحلیل و امتیازدهی بر اساس پرسش‌نامهٔ انتخابی" });
      const qs = questionSetFor(iv.questionSet || s.questionSet);
      const a = await analyze(iv.transcript, iv, {
        provider: s.analyzeProvider,
        key,
        model: s.analyzeModel,
        questions: qs.questions,
        questionSetLabel: qs.label
      });
      await patchInterview(id, { analysis: a, status: "done", step: "", failedAt: null, error: "" });
    } else {
      await patchInterview(id, { status: "done", step: "", failedAt: null, error: "" });
    }
  } catch (e) {
    await patchInterview(id, { status: "error", failedAt: stage, error: friendly(e), step: "" });
  } finally {
    running.delete(id);
  }
}

export async function reanalyze(id) {
  await patchInterview(id, { analysis: null, status: "transcribed", error: "" });
  return processInterview(id);
}
