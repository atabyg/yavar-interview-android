// Resumable interview pipeline. Offline voice transcription stays on-device and never uploads audio.
import { getAudioSegments, getInterview, patchInterview } from "./db";
import { getSettings, analysisKey, transcriptionKey } from "./settings";
import { analyze, friendly, transcribe } from "./openai";
import { questionSetFor } from "./questions";
import { OfflineWhisper } from "./native-bridge";
import { transcribeOfflineBlob } from "./offline-transcriber";
import { transcriptStageError } from "./transcript-quality.js";

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

    if (!iv.transcript || options.forceTranscribe === true) {
      const segs = await getAudioSegments(id);
      if (!segs.length) throw new Error("فایل صوتی پیدا نشد.");

      const transcribeProvider = options.transcribeProvider || s.transcribeProvider;
      if (transcribeProvider === "offline") {
        // Publish progress before native plugin/model checks so the UI cannot appear stuck on "recorded".
        await patchInterview(id, {
          status: "transcribing",
          error: "",
          step: "بررسی موتور و مدل آفلاین گفتار…"
        });
        let model;
        try {
          model = await OfflineWhisper.modelStatus();
        } catch (error) {
          throw new Error("موتور آفلاین تبدیل گفتار روی این گوشی در دسترس نیست (" + String((error && error.message) || error || "") + "). وضعیت مدل و نصب برنامه را بررسی کنید.");
        }
        if (!model || !model.downloaded) {
          throw new Error("مدل آفلاین همراه برنامه آماده نشد. فضای خالی گوشی را بررسی کنید و نسخهٔ کامل یاور را دوباره نصب کنید.");
        }
        const priorProvider = iv.transcribeProviderUsed || "";
        const texts = !options.forceFreshTranscription && iv.segTexts && priorProvider === "offline" ? [...iv.segTexts] : [];
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
        const key = transcriptionKey(transcribeProvider === s.transcribeProvider ? s : { ...s, transcribeProvider });
        if (!key) throw new Error("برای تبدیل صوت ابری، کلید ارائه‌دهندهٔ انتخاب‌شده را در تنظیمات وارد کنید.");
        const previousProvider = iv.transcribeProviderUsed || "";
        const texts = !options.forceFreshTranscription && iv.segTexts && previousProvider === transcribeProvider ? [...iv.segTexts] : [];
        for (let i = texts.length; i < segs.length; i++) {
          await patchInterview(id, {
            status: "transcribing",
            error: "",
            step: "تبدیل صوت به متن (" + (i + 1) + " از " + segs.length + ")"
          });
          texts.push(await transcribe(segs[i], "part" + (i + 1) + "." + ext(iv.mime), {
            provider: transcribeProvider, key, model: s.transcribeModel
          }));
          await patchInterview(id, { segTexts: texts, transcribeProviderUsed: transcribeProvider }, true);
        }
        await patchInterview(id, { transcript: texts.join("\n\n").trim(), status: "transcribed", step: "" });
      }
      iv = await getInterview(id);
    }

    const transcriptError = transcriptStageError(iv.transcript, options.transcribeOnly === true);
    if (transcriptError) throw new Error(transcriptError);

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
        step: "متن آماده است؛ برای استخراج پیش‌نویس فرم و شواهد گفت‌وگو (بدون امتیاز رسمی)، کلید سرویس تحلیل را در تنظیمات وارد کنید."
      });
      return;
    }
    if (!iv.analysis) {
      await patchInterview(id, { status: "analyzing", error: "", step: "استخراج پیش‌نویس فرم و شواهد گفت‌وگو" });
      const qs = questionSetFor(iv.questionSet || s.questionSet);
      const a = await analyze(iv.transcript, iv, {
        provider: s.analyzeProvider,
        key,
        model: s.analyzeModel,
        questions: qs.questions,
        questionSetLabel: qs.label,
        smartTranscriptCleanup: iv.smartTranscriptCleanup === undefined ? s.smartTranscriptCleanup !== false : iv.smartTranscriptCleanup
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
  const before = await getInterview(id);
  if (!before) throw new Error("پروندهٔ مصاحبه پیدا نشد.");
  const previousAnalysis = before.analysis || null;
  const reviewed = Array.isArray(previousAnalysis && previousAnalysis.formAnswers)
    ? previousAnalysis.formAnswers.filter((item) => item && item.reviewStatus === "human_reviewed")
    : [];
  await patchInterview(id, { analysis: null, status: "transcribed", error: "" });
  await processInterview(id);

  // Re-analysis may improve AI suggestions, but must not erase human-reviewed fields.
  if (reviewed.length) {
    const latest = await getInterview(id);
    if (latest) {
      const base = latest.analysis || previousAnalysis || {};
      const freshAnswers = Array.isArray(base.formAnswers) ? base.formAnswers : [];
      const reviewedByCode = new Map(reviewed.map((item) => [item.code, item]));
      const merged = freshAnswers.map((item) => reviewedByCode.has(item.code) ? reviewedByCode.get(item.code) : item);
      const present = new Set(freshAnswers.map((item) => item.code));
      for (const item of reviewed) if (!present.has(item.code)) merged.push(item);
      await patchInterview(id, {
        analysis: {
          ...base,
          formAnswers: merged,
          humanReviewPreservedAt: Date.now(),
          humanReviewPreservedAfterReanalysisError: !latest.analysis
        }
      });
    }
  }
  return getInterview(id);
}
