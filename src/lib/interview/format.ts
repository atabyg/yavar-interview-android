import type { AnswerStatus, CaseStatus, Speaker } from "./types.ts";

const DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function faNum(value: number | string): string {
  return String(value).replace(/[0-9]/g, (digit) => DIGITS[Number(digit)] ?? digit);
}

export function questionLabel(id: string): string {
  const number = Number(id.slice(1));
  return id.startsWith("H") ? `ح${faNum(number)}` : faNum(number);
}

export function speakerLabel(speaker: Speaker): string {
  if (speaker === "client") return "مددجو";
  if (speaker === "interviewer") return "مصاحبه‌کننده";
  return "نامشخص / هم‌پوشانی";
}

export function statusLabel(status: AnswerStatus): string {
  const labels: Record<AnswerStatus, string> = {
    answered: "پاسخ داده شد",
    partial: "ناقص",
    unanswered: "بی‌پاسخ",
    contradictory: "متناقض",
    unclear: "نامشخص",
    needs_review: "بازبینی لازم",
  };
  return labels[status];
}

export function caseStatusLabel(status: CaseStatus): string {
  const labels: Record<CaseStatus, string> = {
    draft: "پیش‌نویس",
    recording: "جلسه ناقص",
    review: "در بازبینی",
    signed: "امضای پیشنهاد ثبت شد",
  };
  return labels[status];
}

export function clock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return faNum(`${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`);
}

export function faDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(date);
  } catch {
    return iso.slice(0, 16);
  }
}

export function fileStamp(caseId: string, date = new Date()): string {
  const day = date.toISOString().slice(0, 10).replace(/-/g, "");
  const short = caseId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "case";
  return `case_${short}_interview_${day}`;
}

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
