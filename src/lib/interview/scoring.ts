import { CRITICAL_IDS, RULES_META, scopeIds } from "./rules.ts";
import type { Answer, CaseFile, InterviewKind } from "./types.ts";

export const MAX_DEDUCTION_FULL = 8;
export const CRITICAL_MIN = 18;
export const CRITICAL_MAX = 24;

export type Suggestion =
  | "red_line"
  | "incomplete"
  | "deduction_undocumented"
  | "critical_gate_closed"
  | "urgent_prohibited_direct"
  | "urgent_needs_full_or_specialist"
  | "urgent_conditional_review"
  | "urgent_defer_full"
  | "urgent_alternate"
  | "direct_referral_review"
  | "conditional_review"
  | "defer_complete_info"
  | "defer_or_alternate";

export const SUGGESTION_LABEL: Record<Suggestion, string> = {
  red_line: "خط قرمز بر امتیاز مقدم است؛ تصمیم عددی معتبر نیست",
  incomplete: "امتیاز همهٔ سؤال‌های این نسخه هنوز ثبت نشده",
  deduction_undocumented: "کسر رفتاری درخواستی مستند نیست؛ پیشنهاد بازه‌ای داده نمی‌شود",
  critical_gate_closed: "دروازه حیاتی برقرار نیست؛ ورود به تصمیم نهایی مجاز نیست",
  urgent_prohibited_direct: "نسخه فوری؛ ارجاع مستقیم ممنوع است",
  urgent_needs_full_or_specialist: "صفر حل‌نشده یا دروازه بالینی؛ تکمیل مصاحبه کامل یا ارزیابی تخصصی لازم است",
  urgent_conditional_review: "۹ تا ۱۲ از ۱۲: فقط پیشنهاد ارجاع مشروط با پایش تشدیدشده؛ ارجاع مستقیم ممنوع است",
  urgent_defer_full: "۶ تا ۸ از ۱۲: تعویق تا تکمیل مصاحبه کامل",
  urgent_alternate: "کمتر از ۶ از ۱۲: مسیر جایگزین یا ارزیابی تخصصی",
  direct_referral_review: "پیشنهاد بازبینی برای ارجاع مستقیم — تصمیم نهایی نیست",
  conditional_review: "پیشنهاد مشروط برای بازبینی انسانی — تصمیم نهایی نیست",
  defer_complete_info: "تعویق و تکمیل اطلاعات — پیشنهاد بازبینی، نه تصمیم نهایی",
  defer_or_alternate: "تعویق یا مسیر جایگزین — پیشنهاد بازبینی، نه تصمیم نهایی",
};

export interface EvalResult {
  raw: number;
  maxRaw: number;
  missingIds: string[];
  ignoredInvalidFullScoreIds: string[];
  deductionApplied: number;
  deductionClamped: boolean;
  deductionRejected: string | null;
  net: number;
  criticalSum: number | null;
  criticalMax: number;
  unresolvedZeroIds: string[];
  criticalGatePassed: boolean;
  redLines: string[];
  suggestion: Suggestion;
  notes: string[];
}

export function attributionReliable(answer: Answer): boolean {
  return (
    answer.speakerConfirmedClient &&
    answer.evidenceText.trim().length > 0 &&
    answer.evidenceOrigin !== "none" &&
    answer.status !== "unanswered" &&
    answer.status !== "unclear" &&
    answer.status !== "needs_review"
  );
}

/** Full marks require a reliable client attribution and an explicit answered status. */
export function scoreAllowed(score: 0 | 1 | 2, answer: Answer): boolean {
  if (score !== 2) return true;
  return attributionReliable(answer) && answer.status === "answered";
}

export function redLinesOf(c: CaseFile): string[] {
  const lines: string[] = [];
  if (!c.consentRecorded || !c.consentExplained) {
    lines.push("نبود رضایت آگاهانهٔ مکتوب برای مصاحبه، ضبط یا پردازش");
  }
  if (!c.dischargeConfirmed) lines.push("نبود تأیید مرجع ترخیص");
  if (c.psychCrisis) lines.push("بحران روانی یا قصد آسیب");
  if (c.medicalUnstable) lines.push("ناپایداری پزشکی");
  if (c.noSafeNight) lines.push("نبود محل امن برای شب اول");
  if (c.clinicalGateActive && !c.clinicalCleared) {
    lines.push("دروازه بالینی فعال بدون تأیید حرفه‌ای");
  }
  return lines;
}

function readScore(answer: Answer | undefined): { score: 0 | 1 | 2 | null; invalidFull: boolean } {
  if (!answer || answer.expertScore === null) return { score: null, invalidFull: false };
  const value = answer.expertScore;
  if (value !== 0 && value !== 1 && value !== 2) return { score: null, invalidFull: true };
  if (value === 2 && !scoreAllowed(2, answer)) return { score: null, invalidFull: true };
  return { score: value, invalidFull: false };
}

function resolveDeduction(c: CaseFile): { applied: number; clamped: boolean; rejected: string | null } {
  const d = c.deduction;
  const requested = Math.round(d.requested);
  const documented =
    d.evidence.trim().length > 0 &&
    d.contextTime.trim().length > 0 &&
    d.repetition.trim().length > 0 &&
    d.baseline.trim().length > 0 &&
    d.confoundersChecked;

  if (c.kind === "urgent") {
    const emotion = Math.min(2, Math.max(0, Math.round(d.urgentEmotion ?? 0)));
    const craving = Math.min(2, Math.max(0, Math.round(d.urgentCraving ?? 0)));
    const dimensions = emotion + craving;
    if (dimensions === 0 && requested <= 0) return { applied: 0, clamped: false, rejected: null };
    if (!documented) {
      return { applied: 0, clamped: false, rejected: "کسر فوری بدون شاهد توصیفی، زمان/زمینه، تکرار، خط پایه و بررسی عوامل مخدوش‌کننده اعمال نشد." };
    }
    if (dimensions === 0) {
      return { applied: 0, clamped: false, rejected: "در نسخه فوری، مقدار کسر باید فقط از دو محور آرامش/تنظیم هیجان (حداکثر ۲) و فوریت رهایی/ولع (حداکثر ۲) تعیین شود." };
    }
    return { applied: dimensions, clamped: false, rejected: null };
  }

  if (requested <= 0) return { applied: 0, clamped: false, rejected: null };
  if (!documented) {
    return {
      applied: 0,
      clamped: false,
      rejected: "کسر بدون شرح شاهد، زمان و زمینه، تکرار، خط پایه و بررسی عوامل مخدوش‌کننده اعمال نشد.",
    };
  }
  if (requested > MAX_DEDUCTION_FULL) {
    return { applied: MAX_DEDUCTION_FULL, clamped: true, rejected: null };
  }
  return { applied: requested, clamped: false, rejected: null };
}

export function evaluate(c: CaseFile): EvalResult {
  const ids = scopeIds(c.kind);
  const missingIds: string[] = [];
  const ignoredInvalidFullScoreIds: string[] = [];
  let raw = 0;
  for (const id of ids) {
    const read = readScore(c.answers[id]);
    if (read.invalidFull) ignoredInvalidFullScoreIds.push(id);
    if (read.score === null) missingIds.push(id);
    else raw += read.score;
  }

  const ded = resolveDeduction(c);
  const net = raw - ded.applied;
  const redLines = redLinesOf(c);

  let criticalSum: number | null = null;
  let criticalGatePassed = false;
  const unresolvedZeroIds: string[] = [];
  if (c.kind === "full") {
    let sum = 0;
    let missingCritical = false;
    for (const id of CRITICAL_IDS) {
      const read = readScore(c.answers[id]);
      if (read.score === null) missingCritical = true;
      else sum += read.score;
      if (read.score === 0 && !c.answers[id]?.zeroResolved) unresolvedZeroIds.push(id);
    }
    criticalSum = missingCritical ? null : sum;
    criticalGatePassed = !missingCritical && sum >= CRITICAL_MIN && unresolvedZeroIds.length === 0;
  } else {
    for (const id of ids) {
      const read = readScore(c.answers[id]);
      if (read.score === 0 && !c.answers[id]?.zeroResolved) unresolvedZeroIds.push(id);
    }
  }

  const notes: string[] = [
    "خروجی سامانه به‌تنهایی تصمیم نهایی ارجاع نیست.",
  ];
  if (!RULES_META.pdfVerified) {
    notes.push("معیارهای تفصیلی ۰ و ۱ و ۲ از PDF شیوه‌نامه بارگذاری نشده‌اند؛ امتیاز را فقط کارشناس وارد می‌کند.");
  }
  if (c.kind === "urgent") {
    notes.push("شش سؤال نسخه فوری مطابق شیوه‌نامه: ح۱، ح۳، ح۵، ح۶، ح۷ و ح۸. ارجاع مستقیم ممنوع است؛ مصاحبه کامل ظرف دو هفته پس از شروع کار و پیگیری ۳۰روزه لازم است.");
    if (unresolvedZeroIds.length) notes.push("در نسخه فوری صفر حل‌نشده وجود دارد؛ برای تصمیم نهایی، مصاحبه کامل یا ارزیابی تخصصی لازم است.");
  }
  if (c.synthetic) notes.push("این پرونده آموزشی و مصنوعی است و نباید مبنای ارجاع واقعی شود.");
  if (ded.rejected) notes.push(ded.rejected);
  if (ded.clamped) notes.push("کسر درخواستی بیش از سقف ۸ بود و روی ۸ محدود شد.");
  if (ignoredInvalidFullScoreIds.length) {
    notes.push("امتیاز ۲ بدون شاهد معتبر یا با انتساب نامطمئن در جمع وارد نشده است.");
  }
  if (missingIds.length) notes.push("سؤال بی‌امتیاز در این نسخه وجود دارد.");

  let suggestion: Suggestion;
  if (redLines.length > 0) suggestion = "red_line";
  else if (missingIds.length > 0 || ignoredInvalidFullScoreIds.length > 0) suggestion = "incomplete";
  else if (ded.rejected !== null) suggestion = "deduction_undocumented";
  else if (c.kind === "urgent" && (unresolvedZeroIds.length > 0 || (c.clinicalGateActive && !c.clinicalCleared))) suggestion = "urgent_needs_full_or_specialist";
  else if (c.kind === "urgent" && net >= 9) suggestion = "urgent_conditional_review";
  else if (c.kind === "urgent" && net >= 6) suggestion = "urgent_defer_full";
  else if (c.kind === "urgent") suggestion = "urgent_alternate";
  else if (!criticalGatePassed) suggestion = "critical_gate_closed";
  else if (net >= 40) suggestion = "direct_referral_review";
  else if (net >= 30) suggestion = "conditional_review";
  else if (net >= 20) suggestion = "defer_complete_info";
  else suggestion = "defer_or_alternate";

  return {
    raw,
    maxRaw: ids.length * 2,
    missingIds,
    ignoredInvalidFullScoreIds,
    deductionApplied: ded.applied,
    deductionClamped: ded.clamped,
    deductionRejected: ded.rejected,
    net,
    criticalSum,
    criticalMax: CRITICAL_MAX,
    unresolvedZeroIds,
    criticalGatePassed,
    redLines,
    suggestion,
    notes,
  };
}

export function closeBlockers(c: CaseFile, result: EvalResult): string[] {
  const blocks: string[] = [];
  if (!c.consentRecorded || !c.consentExplained) blocks.push("رضایت آگاهانه ثبت نشده است");
  if (!c.expertName.trim() || !c.secondExpertName.trim()) blocks.push("نام هر دو کارشناس لازم است");
  if (
    c.expertName.trim() &&
    c.secondExpertName.trim() &&
    c.expertName.trim() === c.secondExpertName.trim()
  ) {
    blocks.push("تأیید دوم باید به نام فرد دیگری باشد؛ برنامه تأیید دوگانه را یکی نمی‌کند");
  }
  if (c.kind === "urgent" && !c.urgentReason.trim()) blocks.push("علت استفاده از نسخه فوری ثبت نشده است");
  if (result.redLines.length > 0) blocks.push("وجود خط قرمز باز است؛ تأیید/تصمیم نهایی تا رفع مانع متوقف می‌شود");
  if (c.kind === "full" && !result.criticalGatePassed) blocks.push("دروازه حیاتی برقرار نیست؛ ح۱ تا ح۱۲ باید حداقل ۱۸ از ۲۴ و بدون صفر حل‌نشده داشته باشند");
  if (result.suggestion === "incomplete" || result.suggestion === "deduction_undocumented") {
    blocks.push("جمع‌بندی هنوز قابل امضا نیست");
  }
  if (c.kind === "urgent" && (result.unresolvedZeroIds.length > 0 || (c.clinicalGateActive && !c.clinicalCleared))) {
    blocks.push("نسخه فوری دارای صفر حل‌نشده یا دروازه بالینی است؛ مصاحبه کامل یا ارزیابی تخصصی پیش از تصمیم لازم است");
  }
  if (!c.expertApprovedAt) blocks.push("تأیید کارشناس اول ثبت نشده است");
  if (!c.secondApprovedAt) blocks.push("تأیید کارشناس دوم ثبت نشده است");
  return blocks;
}

export function bandForNet(net: number, kind: InterviewKind): Suggestion {
  if (kind === "urgent") return "urgent_prohibited_direct";
  if (net >= 40) return "direct_referral_review";
  if (net >= 30) return "conditional_review";
  if (net >= 20) return "defer_complete_info";
  return "defer_or_alternate";
}

export function canonicalBody(c: CaseFile, result: EvalResult): string {
  const ids = scopeIds(c.kind);
  return JSON.stringify({
    rules: RULES_META.version,
    pdfVerified: RULES_META.pdfVerified,
    caseId: c.id,
    kind: c.kind,
    synthetic: c.synthetic,
    scores: ids.map((id) => ({
      id,
      score: c.answers[id]?.expertScore ?? null,
      status: c.answers[id]?.status ?? "unanswered",
      zeroResolved: c.answers[id]?.zeroResolved ?? false,
    })),
    raw: result.raw,
    deductionApplied: result.deductionApplied,
    net: result.net,
    redLines: result.redLines,
    suggestion: result.suggestion,
    criticalGatePassed: result.criticalGatePassed,
  });
}
