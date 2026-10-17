import * as XLSX from "xlsx";
import type { CaseFile } from "./types";
import { QUESTIONS } from "./rules";
import { statusLabel, questionLabel } from "./format";
import { runFinalTranscriptReview } from "./v3-review";

/** Creates a user-triggered workbook; raw transcript/audio are intentionally excluded. */
export function buildCaseWorkbook(file: CaseFile): XLSX.WorkBook {
  const summary = [
    ["گزارش مصاحبه یاورشهرها — نسخه ۳"],
    ["شماره پرونده", file.code || "تکمیل نشده"],
    ["نام مددجو / مستعار", file.clientName || file.alias || "تکمیل نشده"],
    ["مرکز", file.center || "تکمیل نشده"],
    ["کارشناس", file.expertName || "تکمیل نشده"],
    ["کارشناس دوم", file.secondExpertName || "تکمیل نشده"],
    ["نوع مصاحبه", file.kind === "urgent" ? "فوری" : "کامل"],
    ["تاریخ ایجاد", file.createdAt],
    ["یادداشت", "این فایل خروجی کمکی است؛ تصمیم نهایی و امتیازدهی رسمی با کارشناس است."],
  ];
  const questions = [
    ["شناسه", "سؤال", "وضعیت", "امتیاز کارشناس", "شاهد ثبت‌شده", "تأیید گوینده مددجو", "یادداشت کارشناس"],
    ...QUESTIONS.map((question) => {
      const answer = file.answers[question.id];
      return [
        questionLabel(question.id),
        question.text,
        answer ? statusLabel(answer.status) : "تکمیل نشده",
        answer?.expertScore ?? "",
        answer?.evidenceText ?? "",
        answer?.speakerConfirmedClient ? "بله" : "خیر",
        answer?.note ?? "",
      ];
    }),
  ];
  const review = [
    ["شدت", "کد", "شرح"],
    ...runFinalTranscriptReview(file).map((issue) => [
      issue.severity === "error" ? "خطا" : issue.severity === "warning" ? "هشدار" : "اطلاع",
      issue.code,
      issue.message,
    ]),
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summary), "خلاصه");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(questions), "سؤالات");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(review), "بازبینی نهایی");
  return workbook;
}

export function downloadCaseWorkbook(file: CaseFile): void {
  const safeCode = (file.code || file.id.slice(0, 8)).replace(/[^\p{L}\p{N}_-]/gu, "_").slice(0, 40);
  XLSX.writeFile(buildCaseWorkbook(file), `yavar-report-${safeCode}.xlsx`, { compression: true });
}
