export type InterviewKind = "full" | "urgent";

export type CaseStatus = "draft" | "recording" | "review" | "signed";

export type Speaker = "client" | "interviewer" | "overlap";

export type AnswerStatus =
  | "answered"
  | "partial"
  | "unanswered"
  | "contradictory"
  | "unclear"
  | "needs_review";

export type EvidenceOrigin = "none" | "manual_hearing" | "segment";

export interface Segment {
  id: string;
  speaker: Speaker;
  textRaw: string;
  startSec: number | null;
  endSec: number | null;
  /** Engine value only. Null when the engine did not provide one. */
  confidence: number | null;
  origin: "manual" | "browser_speech" | "cloud_asr";
  /** V3 suggestions are hints only and never official speaker attribution. */
  questionId?: string;
  speakerConfidence?: number;
  speakerSuggested?: Speaker;
}

export interface AiSuggestion {
  evidenceText: string;
  segmentIds: string[];
  status: AnswerStatus;
  rationale: string;
  generatedAt: string;
  model: string;
}

export interface Answer {
  evidenceText: string;
  evidenceOrigin: EvidenceOrigin;
  segmentIds: string[];
  speakerConfirmedClient: boolean;
  status: AnswerStatus;
  expertScore: 0 | 1 | 2 | null;
  zeroResolved: boolean;
  note: string;
  aiSuggestion?: AiSuggestion;
}

export interface Deduction {
  requested: number;
  /** Urgent interview only: bounded, separately documented dimensions (0..2 each). */
  urgentEmotion?: 0 | 1 | 2;
  urgentCraving?: 0 | 1 | 2;
  evidence: string;
  contextTime: string;
  repetition: string;
  baseline: string;
  confoundersChecked: boolean;
}

export interface AuditEvent {
  at: string;
  action: string;
  detail: string;
}

export interface CaseFile {
  id: string;
  synthetic: boolean;
  code: string;
  alias: string;
  /** Optional, backward-compatible V3 identity fields; use only the minimum necessary. */
  clientName?: string;
  clientDetails?: string;
  expertDetails?: string;
  center: string;
  expertName: string;
  secondExpertName: string;
  consentRecorded: boolean;
  consentExplained: boolean;
  consentRefused: boolean;
  dischargeConfirmed: boolean;
  psychCrisis: boolean;
  medicalUnstable: boolean;
  noSafeNight: boolean;
  clinicalGateActive: boolean;
  clinicalCleared: boolean;
  kind: InterviewKind;
  urgentReason: string;
  status: CaseStatus;
  createdAt: string;
  updatedAt: string;
  /** ISO timestamp when moved to archive; null/undefined means active. */
  archivedAt?: string | null;
  /** ISO timestamp for an in-app reminder; system notification requires native scheduling. */
  reminderAt?: string | null;
  segments: Segment[];
  answers: Record<string, Answer>;
  deduction: Deduction;
  audioStored: boolean;
  recordingSeconds: number;
  expertApprovedAt: string | null;
  secondApprovedAt: string | null;
  cloudAsrConsent: boolean;
  cloudAiConsent: boolean;
  /** Last automatic transcription/AI outcome; never replaces official scoring. */
  autoProcessingNote?: string;
  audit: AuditEvent[];
}

export interface Settings {
  orgTitle: string;
  deptTitle: string;
  centerDefault: string;
  autoLockMin: number;
  /** Never copied into reports or exports. */
  endPhrase: string;
  allowBrowserSpeech: boolean;
  biometricEnabled: boolean;
  aiProvider?: "openai";
  requirePinOnLaunch?: boolean;
}

export interface PinRecord {
  saltB64: string;
  hashB64: string;
  iterations: number;
}

export type View =
  | "lock"
  | "home"
  | "case"
  | "ready"
  | "record"
  | "transcript"
  | "questions"
  | "summary"
  | "report"
  | "settings"
  | "method";
