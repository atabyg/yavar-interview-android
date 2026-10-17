import { QUESTIONS } from "./rules.ts";
import type { Answer, AuditEvent, CaseFile, Deduction } from "./types.ts";

const EDU_TEXT = "نمونهٔ آموزشی مصنوعی. این متن گفتهٔ هیچ مددجویی نیست و فقط برای دیدن موتور امتیاز است.";

export function blankAnswer(): Answer {
  return {
    evidenceText: "",
    evidenceOrigin: "none",
    segmentIds: [],
    speakerConfirmedClient: false,
    status: "unanswered",
    expertScore: null,
    zeroResolved: false,
    note: "",
  };
}

export function blankDeduction(): Deduction {
  return {
    requested: 0,
    evidence: "",
    contextTime: "",
    repetition: "",
    baseline: "",
    confoundersChecked: false,
  };
}

export function createEmptyCase(over: Partial<CaseFile> = {}): CaseFile {
  const answers: Record<string, Answer> = {};
  for (const question of QUESTIONS) answers[question.id] = blankAnswer();
  const now = new Date().toISOString();
  const base: CaseFile = {
    id: crypto.randomUUID(),
    synthetic: false,
    code: "",
    alias: "",
    center: "",
    expertName: "",
    secondExpertName: "",
    consentRecorded: false,
    consentExplained: false,
    consentRefused: false,
    dischargeConfirmed: false,
    psychCrisis: false,
    medicalUnstable: false,
    noSafeNight: false,
    clinicalGateActive: false,
    clinicalCleared: false,
    kind: "full",
    urgentReason: "",
    status: "draft",
    createdAt: now,
    updatedAt: now,
    segments: [],
    answers,
    deduction: blankDeduction(),
    audioStored: false,
    recordingSeconds: 0,
    expertApprovedAt: null,
    secondApprovedAt: null,
    cloudAsrConsent: false,
    cloudAiConsent: false,
    audit: [],
  };
  return {
    ...base,
    ...over,
    answers: over.answers ?? base.answers,
    deduction: over.deduction ?? base.deduction,
    segments: over.segments ?? base.segments,
    audit: over.audit ?? base.audit,
  };
}

export function withAudit(file: CaseFile, action: string, detail: string): CaseFile {
  const event: AuditEvent = { at: new Date().toISOString(), action, detail };
  return { ...file, audit: [...file.audit, event].slice(-200) };
}

export function createEducationalCase(): CaseFile {
  const file = createEmptyCase({
    synthetic: true,
    code: "EDU",
    alias: "آموزشی",
    center: "مرکز آموزشی",
    expertName: "کارشناس آموزشی الف",
    secondExpertName: "کارشناس آموزشی ب",
    consentRecorded: true,
    consentExplained: true,
    dischargeConfirmed: true,
    kind: "full",
    status: "review",
  });
  for (const question of QUESTIONS) {
    file.answers[question.id] = {
      evidenceText: EDU_TEXT,
      evidenceOrigin: "manual_hearing",
      segmentIds: [],
      speakerConfirmedClient: true,
      status: "answered",
      expertScore: 2,
      zeroResolved: false,
      note: "",
    };
  }
  file.segments = [
    {
      id: crypto.randomUUID(),
      speaker: "interviewer",
      textRaw: "این پرسش آموزشی است.",
      startSec: 0,
      endSec: 2,
      confidence: null,
      origin: "manual",
    },
    {
      id: crypto.randomUUID(),
      speaker: "client",
      textRaw: EDU_TEXT,
      startSec: 2,
      endSec: 8,
      confidence: null,
      origin: "manual",
    },
  ];
  file.audit = [{ at: file.createdAt, action: "synthetic_case", detail: "educational" }];
  return file;
}
