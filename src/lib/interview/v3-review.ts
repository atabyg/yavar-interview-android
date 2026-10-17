import type { CaseFile, Segment, Speaker } from "./types";
import { QUESTIONS } from "./rules";

export type SuggestedRole = "client" | "interviewer" | "overlap";
export interface SegmentReview {
  segmentId: string;
  suggestedSpeaker: SuggestedRole;
  speakerConfidence: number;
  questionId: string | null;
  questionConfidence: number;
  needsHumanReview: boolean;
}
export interface MetadataSuggestions {
  caseCode?: string;
  clientName?: string;
  expertName?: string;
  center?: string;
  clientDetails?: string;
  expertDetails?: string;
  sourceSegmentIds: string[];
}
export interface MissingField {
  id: string;
  label: string;
  missing: boolean;
}
export interface FinalReviewIssue {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  questionId?: string;
}

/** Normalize Persian/Arabic variants for matching only. Original transcript is never modified. */
export function normalizeFa(value: string): string {
  return value
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("fa-IR");
}

const INTERVIEWER_CUES = [
  "بگویید", "توضیح دهید", "چه می کنید", "چه می‌کنید", "چرا", "چگونه",
  "کدام", "چه کسی", "چه زمانی", "اگر ", "آیا ", "نام ببرید", "تعریف کنید",
];
const CLIENT_CUES = [
  "من ", "منم", "برای من", "خانواده ام", "خانواده‌ام", "کار کردم", "می خواهم",
  "می‌خواهم", "برنامه ام", "برنامه‌ام", "فکر می کنم", "فکر می‌کنم", "می توانم",
  "می‌توانم", "دارم ", "ندارم ", "بودم ", "خواهم ",
];

function countCues(text: string, cues: string[]): number {
  return cues.reduce((sum, cue) => sum + (text.includes(normalizeFa(cue)) ? 1 : 0), 0);
}

/**
 * Conservative offline suggestion. This is not speaker diarization: ambiguous turns stay overlap.
 * A human can always override it; no official answer or score is changed here.
 */
export function suggestSpeaker(textRaw: string): { speaker: SuggestedRole; confidence: number } {
  const text = normalizeFa(textRaw);
  if (!text) return { speaker: "overlap", confidence: 0 };
  const questionLike = /[؟?]\s*$/.test(text) || countCues(text, INTERVIEWER_CUES) >= 2;
  const clientCues = countCues(text, CLIENT_CUES);
  if (questionLike && clientCues === 0) return { speaker: "interviewer", confidence: /[؟?]\s*$/.test(text) ? 0.78 : 0.68 };
  if (clientCues >= 2 && !questionLike) return { speaker: "client", confidence: 0.62 };
  if (clientCues === 1 && !questionLike && text.split(" ").length >= 7) return { speaker: "client", confidence: 0.53 };
  return { speaker: "overlap", confidence: 0.25 };
}

function tokens(text: string): Set<string> {
  return new Set(normalizeFa(text).split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= 3));
}

/** Match a segment to a question as a review hint, not as proof the question was answered. */
export function suggestQuestion(textRaw: string): { questionId: string | null; confidence: number } {
  const source = tokens(textRaw);
  if (source.size < 3) return { questionId: null, confidence: 0 };
  let bestId: string | null = null;
  let best = 0;
  let second = 0;
  for (const question of QUESTIONS) {
    const qTokens = tokens(question.text);
    let common = 0;
    for (const token of qTokens) if (source.has(token)) common++;
    const score = common / Math.max(3, Math.min(source.size, qTokens.size));
    if (score > best) { second = best; best = score; bestId = question.id; }
    else if (score > second) second = score;
  }
  if (best < 0.24 || best - second < 0.07) return { questionId: null, confidence: best };
  return { questionId: bestId, confidence: Math.min(0.85, best) };
}

export function reviewSegment(segment: Segment): SegmentReview {
  const role = suggestSpeaker(segment.textRaw);
  const question = suggestQuestion(segment.textRaw);
  return {
    segmentId: segment.id,
    suggestedSpeaker: role.speaker,
    speakerConfidence: role.confidence,
    questionId: question.questionId,
    questionConfidence: question.confidence,
    needsHumanReview: role.speaker === "overlap" || role.confidence < 0.7 || question.questionId !== null,
  };
}

function capture(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1]?.trim().replace(/[،؛,.]+$/g, "");
    if (value && value.length <= 100) return value;
  }
  return undefined;
}

/** Metadata are suggestions only; callers must not overwrite a non-empty manually-entered field. */
export function suggestMetadata(segments: Segment[]): MetadataSuggestions {
  const text = segments.map((s) => s.textRaw).join("\n");
  const caseCode = capture(text, [
    /(?:شماره|کد)\s*(?:پرونده|پیگیری)\s*(?:است|:|：)?\s*([A-Za-z0-9۰-۹٠-٩-]{3,30})/i,
    /پرونده\s*(?:شماره|کد)\s*([A-Za-z0-9۰-۹٠-٩-]{3,30})/i,
  ]);
  const clientName = capture(text, [
    /(?:نام مددجو|مددجو(?:ی)? به نام|اسم مددجو)\s*(?:است|:|：)?\s*([\p{L}‌ -]{2,70})/u,
  ]);
  const expertName = capture(text, [
    /(?:نام کارشناس|کارشناس(?: مصاحبه)? به نام|مصاحبه‌کننده)\s*(?:است|:|：)?\s*([\p{L}‌ -]{2,70})/u,
  ]);
  const center = capture(text, [
    /(?:نام مرکز|مرکز)\s*(?:است|:|：)?\s*([\p{L}‌ -]{2,70})/u,
  ]);
  const clientDetails = capture(text, [/(?:مشخصات مددجو|اطلاعات مددجو)\s*(?:است|:|：)?\s*([^\n]{5,200})/u]);
  const expertDetails = capture(text, [/(?:مشخصات کارشناس|اطلاعات کارشناس)\s*(?:است|:|：)?\s*([^\n]{5,200})/u]);
  const ids = segments.filter((s) => {
    const t = normalizeFa(s.textRaw);
    return /پرونده|مددجو|کارشناس|مرکز/.test(t);
  }).map((s) => s.id);
  return { caseCode, clientName, expertName, center, clientDetails, expertDetails, sourceSegmentIds: ids };
}

export function getMissingCaseFields(file: Partial<CaseFile>): MissingField[] {
  const fields: Array<[string, string, unknown]> = [
    ["code", "شماره پرونده", file.code],
    ["clientName", "نام مددجو یا نام مستعار", file.clientName ?? file.alias],
    ["center", "مرکز", file.center],
    ["expertName", "نام کارشناس", file.expertName],
  ];
  return fields.map(([id, label, value]) => ({ id, label, missing: typeof value !== "string" || !value.trim() }));
}

export function questionCompletionFromSegments(segments: Segment[]): Record<string, { seen: boolean; hasClientEvidence: boolean; needsReview: boolean }> {
  const progress: Record<string, { seen: boolean; hasClientEvidence: boolean; needsReview: boolean }> = {};
  for (const question of QUESTIONS) progress[question.id] = { seen: false, hasClientEvidence: false, needsReview: false };
  for (const segment of segments) {
    const review = reviewSegment(segment);
    if (!review.questionId) continue;
    const item = progress[review.questionId];
    item.seen = true;
    if (segment.speaker === "client" || (review.suggestedSpeaker === "client" && review.speakerConfidence >= 0.5)) item.hasClientEvidence = true;
    if (review.needsHumanReview || segment.speaker === "overlap") item.needsReview = true;
  }
  return progress;
}

/** End-of-session quality checks only. Never returns eligibility or referral decisions. */
export function runFinalTranscriptReview(file: CaseFile): FinalReviewIssue[] {
  const issues: FinalReviewIssue[] = [];
  const missing = getMissingCaseFields(file).filter((item) => item.missing);
  for (const field of missing) issues.push({ severity: "error", code: "missing_" + field.id, message: `فیلد «${field.label}» تکمیل نشده است.` });
  if (!file.segments.length) issues.push({ severity: "error", code: "empty_transcript", message: "هیچ قطعه متنی برای بازبینی ثبت نشده است." });
  for (const segment of file.segments) {
    const review = reviewSegment(segment);
    if (review.suggestedSpeaker === "overlap" || review.speakerConfidence < 0.7) {
      issues.push({ severity: "warning", code: "speaker_review", message: `گوینده این بخش نیازمند تأیید انسانی است: «${segment.textRaw.slice(0, 90)}»` });
    }
    if (/[\p{L}]{1,2}\s+[\p{L}]{1,2}/u.test(segment.textRaw)) {
      issues.push({ severity: "info", code: "possible_asr_fragment", message: "احتمال خطای تشخیص یا قطعه‌بندی متن وجود دارد؛ متن صوت با transcript تطبیق داده شود." });
    }
  }
  const activeQuestionIds = file.kind === "urgent" ? new Set(["H01", "H03", "H05", "H06", "H07", "H08"]) : null;
  for (const question of QUESTIONS) {
    if (activeQuestionIds && !activeQuestionIds.has(question.id)) continue;
    const answer = file.answers[question.id];
    if (!answer || answer.status === "unanswered" || !answer.evidenceText.trim()) {
      issues.push({ severity: question.critical ? "error" : "warning", code: "question_unanswered", questionId: question.id, message: `سؤال ${question.id} فاقد شاهد ثبت‌شده است؛ پیش از بستن گزارش بازبینی شود.` });
    } else if (answer.status !== "answered" || !answer.speakerConfirmedClient) {
      issues.push({ severity: "warning", code: "question_needs_review", questionId: question.id, message: `وضعیت پاسخ سؤال ${question.id} یا انتساب گوینده نیازمند تأیید کارشناس است.` });
    }
  }
  if (file.cloudAiConsent) issues.push({ severity: "info", code: "cloud_ai_used", message: "پیش از خروجی، مشخص کنید چه داده‌ای به سرویس ابری ارسال شده و آیا نسخه گزارش برای اشتراک‌گذاری مجاز است." });
  return issues;
}

/** Avoid silently assigning official answers. This function only creates a display-safe speaker suggestion. */
export function suggestedSpeakerForUi(segment: Segment): Speaker {
  return reviewSegment(segment).suggestedSpeaker;
}
