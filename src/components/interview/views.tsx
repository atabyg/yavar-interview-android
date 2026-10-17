import { useEffect, useRef, useState } from "react";
import { FileSpreadsheet, Lock, Mic, Pause, Play, Plus, Printer, Sparkles, Square, Trash2 } from "lucide-react";
import { useInterview } from "@/components/interview/context";
import { Area, Banner, Btn, Check as CheckRow, Field, Panel } from "@/components/interview/ui";
import { createEducationalCase, createEmptyCase, withAudit } from "@/lib/interview/factory";
import {
  caseStatusLabel,
  clock,
  faDate,
  faNum,
  fileStamp,
  questionLabel,
  sha256Hex,
  speakerLabel,
  statusLabel,
} from "@/lib/interview/format";
import { loadAudio, saveAudio, verifyPin } from "@/lib/interview/persist";
import { clearSessionAiApiKey, getSessionAiApiKey, hasSessionAiApiKey, setSessionAiApiKey } from "@/lib/interview/ai-runtime";
import { QUESTIONS, RULES_META, questionById, scopeIds } from "@/lib/interview/rules";
import { SUGGESTION_LABEL, canonicalBody, closeBlockers, evaluate, scoreAllowed } from "@/lib/interview/scoring";
import type { Answer, AnswerStatus, CaseFile, Segment, Speaker } from "@/lib/interview/types";
import { applyAiSuggestionToCase, requestAiSuggestions, suggestTranscriptSpeakersWithGroq, transcribeAudioWithGroq } from "@/lib/interview/ai-assist";
import type { AiAssistResult, AiProvider, AiQuestionSuggestion } from "@/lib/interview/ai-assist";
import { isNativeAndroid, savePdfToPublicStorage, sharePdf } from "@/lib/interview/native-exports";
import { getMissingCaseFields, questionCompletionFromSegments, reviewSegment, runFinalTranscriptReview, suggestMetadata } from "@/lib/interview/v3-review";
import { downloadCaseWorkbook } from "@/lib/interview/v3-export";

export function LockScreen() {
  const { state, setupPin, unlockWith } = useInterview();
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [phase, setPhase] = useState<"one" | "two">("one");
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (!state.ready) {
    return (
      <LockFrame>
        <p className="text-base text-muted">در حال خواندن قفل محلی…</p>
      </LockFrame>
    );
  }

  const waiting = Math.max(0, state.lockUntil - now);
  const setup = state.pin === null;

  async function submit() {
    setError("");
    if (!/^\d{4,8}$/.test(pin)) {
      setError("رمز باید ۴ تا ۸ رقم باشد.");
      return;
    }
    if (setup) {
      if (phase === "one") {
        setPhase("two");
        return;
      }
      if (pin !== again) {
        setError("تکرار رمز یکسان نیست.");
        setAgain("");
        return;
      }
      await setupPin(pin);
      setPin("");
      setAgain("");
      return;
    }
    const result = await unlockWith(pin);
    if (result === "wait") setError("به‌خاطر تلاش‌های ناموفق، ورود موقتاً بسته است.");
    else if (result === "bad") setError("رمز درست نیست.");
    setPin("");
  }

  return (
    <LockFrame
      action={
        <div className="flex flex-col gap-2">
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Btn tone="primary" onClick={() => void submit()} disabled={waiting > 0}>
            {setup ? (phase === "one" ? "ادامه" : "ساخت رمز و ورود") : "ورود"}
          </Btn>
          {setup && phase === "two" ? (
            <Btn
              onClick={() => {
                setPhase("one");
                setAgain("");
              }}
            >
              اصلاح رمز
            </Btn>
          ) : null}
        </div>
      }
    >
      <p className="text-sm leading-normal text-muted">
        {setup
          ? "رمز محلی این دستگاه در گزارش ذخیره نمی‌شود."
          : "پرونده‌ها در همین دستگاه ذخیره می‌شوند؛ این پیش‌نویس هنوز رمزنگاری داده‌ها در حالت سکون را کامل نکرده است."}
      </p>
      {!setup ? <Banner tone="danger">نسخه آزمایشی: پرونده‌های ذخیره‌شده در مرورگر هنوز در حالت سکون رمزنگاری نشده‌اند. اطلاعات واقعی و حساس مددجویان را وارد نکنید.</Banner> : null}
      {waiting > 0 ? <Banner tone="warn">ورود تا {faNum(Math.ceil(waiting / 1000))} ثانیه بسته است.</Banner> : null}
      <PinPad value={phase === "two" ? again : pin} onChange={phase === "two" ? setAgain : setPin} />
    </LockFrame>
  );
}

function LockFrame({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-5">
      <p className="text-sm font-medium text-muted">یاورشهرها</p>
      <h1 className="mt-1 text-2xl font-medium leading-tight">میز مصاحبه شغلی</h1>
      <p className="mt-2 text-base leading-normal">ابزار کمکی کارشناس. تصمیم با انسان است، نه با برنامه.</p>
      <div className="mt-4 flex flex-col gap-3">{children}</div>
      <div className="sticky bottom-0 mt-auto bg-bg py-3">{action}</div>
    </main>
  );
}

function PinPad({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
  return (
    <div>
      <p className="mb-2 min-h-6 text-center text-lg tracking-widest text-ink" aria-live="polite">
        {"•".repeat(value.length)}
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        {keys.map((key) => (
          <Btn key={key} className="min-h-11 text-lg" onClick={() => onChange((value + key).slice(0, 8))}>
            {faNum(key)}
          </Btn>
        ))}
        <Btn className="col-span-3 min-h-11" onClick={() => onChange(value.slice(0, -1))}>
          پاک کردن رقم
        </Btn>
      </div>
    </div>
  );
}

export function TopBar() {
  const { state, active, go, lock } = useInterview();
  const previousView: Record<string, "home" | "case" | "ready" | "record" | "transcript" | "questions" | "summary"> = { case: "home", ready: "case", record: "ready", transcript: "record", questions: "transcript", summary: "questions", report: "summary", settings: "home", method: "home" };
  const steps: { view: "case" | "ready" | "record" | "transcript" | "questions" | "summary" | "report"; label: string }[] = [
    { view: "case", label: "پرونده" },
    { view: "ready", label: "آمادگی" },
    { view: "record", label: "ضبط" },
    { view: "transcript", label: "متن" },
    { view: "questions", label: "سؤال‌ها" },
    { view: "summary", label: "جمع‌بندی" },
    { view: "report", label: "گزارش" },
  ];
  return (
    <header className="no-print sticky top-0 z-10 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <button className="text-base font-medium" onClick={() => go("home")}>
            میز مصاحبه شغلی
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn className="min-h-11 px-3" disabled={state.view === "home" || state.view === "lock"} onClick={() => go(previousView[state.view] ?? "home")}>بازگشت</Btn>
          <Btn className="min-h-11 px-3" onClick={() => go("method")}>
            حدود نسخه
          </Btn>
          <Btn className="min-h-11 px-3" onClick={() => go("settings")}>
            تنظیمات
          </Btn>
          <Btn className="min-h-11 px-3" onClick={lock} aria-label="قفل">
            <Lock className="size-4" aria-hidden />
          </Btn>
        </div>
      </div>
      <div className="mx-auto mt-3 flex w-full max-w-3xl gap-2 overflow-x-auto">
        {steps.map((step) => (
          <button
            key={step.view}
            disabled={!active}
            onClick={() => go(step.view)}
            className={`min-h-11 shrink-0 rounded-sm border px-3 text-sm disabled:opacity-40 ${
              state.view === step.view ? "border-transparent bg-accent text-accent-fg" : "border-line bg-surface text-ink"
            }`}
          >
            {step.label}
          </button>
        ))}
      </div>
    </header>
  );
}

export function WorkspaceScreen() {
  const { state } = useInterview();
  switch (state.view) {
    case "home":
      return <HomeScreen />;
    case "case":
      return <CaseScreen />;
    case "ready":
      return <ReadyScreen />;
    case "record":
      return <RecordScreen />;
    case "transcript":
      return <TranscriptScreen />;
    case "questions":
      return <QuestionsScreen />;
    case "summary":
      return <SummaryScreen />;
    case "report":
      return <ReportScreen />;
    case "settings":
      return <SettingsScreen />;
    case "method":
      return <MethodScreen />;
    default:
      return <HomeScreen />;
  }
}

function HomeScreen() {
  const { state, addCase, openCase } = useInterview();
  const open = state.cases.filter((file) => file.status !== "signed");
  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="flex flex-wrap gap-2">
        <Btn
          tone="primary"
          onClick={() => addCase(createEmptyCase({ center: state.settings.centerDefault, code: randomSixDigitCode() }))}
        >
          <Plus className="size-4" aria-hidden /> پرونده جدید
        </Btn>
        <Btn onClick={() => addCase(createEducationalCase(), "summary")}>پرونده آموزشی</Btn>
      </div>
      <Section title="ادامه جلسه‌های باز" files={open} onOpen={openCase} empty="جلسهٔ بازی نیست." />
      <Section title="همه پرونده‌ها" files={state.cases} onOpen={openCase} empty="هنوز پرونده‌ای ثبت نشده." />
    </div>
  );
}

function Section({
  title,
  files,
  onOpen,
  empty,
}: {
  title: string;
  files: CaseFile[];
  onOpen: (id: string, view?: "case") => void;
  empty: string;
}) {
  return (
    <Panel>
      <h2 className="mb-2 text-lg font-medium">{title}</h2>
      {files.length === 0 ? <p className="text-sm text-muted">{empty}</p> : null}
      <ul className="flex flex-col gap-2">
        {files.map((file) => (
          <li key={file.id}>
            <button
              className="flex min-h-12 w-full items-center justify-between gap-3 rounded-sm border border-line bg-bg px-3 text-start"
              onClick={() => onOpen(file.id)}
            >
              <span>
                <span className="block font-medium">{file.code || "بدون شناسه"}</span>
                <span className="block text-sm text-muted">
                  {file.synthetic ? "آموزشی · " : ""}
                  {file.kind === "urgent" ? "فوری · " : "کامل · "}
                  {caseStatusLabel(file.status)}
                </span>
              </span>
              <span className="text-sm text-muted">{faDate(file.updatedAt)}</span>
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function CaseScreen() {
  const { active, patchActive, go } = useInterview();
  const [draft, setDraft] = useState(active);
  const [error, setError] = useState("");
  useEffect(() => setDraft(active), [active?.id, active?.updatedAt]);
  useEffect(() => {
    if (!active?.segments.length) return;
    const suggested = suggestMetadata(active.segments);
    setDraft((current) => {
      if (!current || current.id !== active.id) return current;
      const next = {
        ...current,
        code: current.code.trim() ? current.code : suggested.caseCode ?? current.code,
        clientName: (current.clientName ?? "").trim() ? current.clientName : suggested.clientName ?? current.clientName,
        clientDetails: (current.clientDetails ?? "").trim() ? current.clientDetails : suggested.clientDetails ?? current.clientDetails,
        expertName: current.expertName.trim() ? current.expertName : suggested.expertName ?? current.expertName,
        expertDetails: (current.expertDetails ?? "").trim() ? current.expertDetails : suggested.expertDetails ?? current.expertDetails,
        center: current.center.trim() ? current.center : suggested.center ?? current.center,
      };
      return next.code === current.code && next.clientName === current.clientName &&
        next.clientDetails === current.clientDetails && next.expertName === current.expertName &&
        next.expertDetails === current.expertDetails && next.center === current.center ? current : next;
    });
  }, [active?.id, active?.updatedAt, active?.segments.length]);
  if (!active || !draft) return <NeedCase />;

  function save() {
    if (!draft) return;
    if (!draft.code.trim()) {
      setError("شناسه پرونده لازم است. نام کامل را در شناسه نگذارید.");
      return;
    }
    if (draft.kind === "urgent" && !draft.urgentReason.trim()) {
      setError("برای نسخه فوری، علت استفاده باید ثبت شود.");
      return;
    }
    setError("");
    patchActive(
      (current) => ({
        ...current,
        code: draft.code.trim(),
        alias: draft.alias.trim(),
        clientName: (draft.clientName ?? "").trim(),
        clientDetails: (draft.clientDetails ?? "").trim(),
        expertDetails: (draft.expertDetails ?? "").trim(),
        center: draft.center.trim(),
        expertName: draft.expertName.trim(),
        secondExpertName: draft.secondExpertName.trim(),
        consentRecorded: draft.consentRecorded,
        consentExplained: draft.consentExplained,
        consentRefused: draft.consentRefused,
        dischargeConfirmed: draft.dischargeConfirmed,
        kind: draft.kind,
        urgentReason: draft.urgentReason.trim(),
      }),
      true,
    );
    go("ready");
  }

  return (
    <div className="flex flex-col gap-3 py-4">
      <h1 className="text-xl font-medium">پرونده و رضایت</h1>
      <Banner>
        فقط داده‌ای را بنویسید که برای مصاحبه لازم است. شناسه پرونده را کوتاه نگه دارید و نام را در نام فایل گزارش نگذارید.
      </Banner>
      <Field label="شناسه پرونده" value={draft.code} readOnly onChange={() => undefined} />
      <Field label="نام مستعار، اختیاری" value={draft.alias} onChange={(alias) => setDraft({ ...draft, alias })} />
      <Field label="نام مددجو (در صورت مجاز بودن ثبت)" value={draft.clientName ?? ""} onChange={(clientName) => setDraft({ ...draft, clientName })} />
      <Area label="مشخصات ضروری مددجو (حداقلی؛ اطلاعات غیرضروری/تشخیصی وارد نشود)" value={draft.clientDetails ?? ""} onChange={(event) => setDraft({ ...draft, clientDetails: event.target.value })} />
      <Field label="مرکز" value={draft.center} onChange={(center) => setDraft({ ...draft, center })} />
      <Area label="مشخصات حرفه‌ای/سازمانی کارشناس (اختیاری)" value={draft.expertDetails ?? ""} onChange={(event) => setDraft({ ...draft, expertDetails: event.target.value })} />
      <Btn onClick={() => {
        const suggested = suggestMetadata(active.segments);
        setDraft((current) => current ? ({ ...current,
          code: current.code.trim() ? current.code : suggested.caseCode ?? current.code,
          clientName: (current.clientName ?? "").trim() ? current.clientName : suggested.clientName ?? current.clientName,
          clientDetails: (current.clientDetails ?? "").trim() ? current.clientDetails : suggested.clientDetails ?? current.clientDetails,
          expertName: current.expertName.trim() ? current.expertName : suggested.expertName ?? current.expertName,
          expertDetails: (current.expertDetails ?? "").trim() ? current.expertDetails : suggested.expertDetails ?? current.expertDetails,
          center: current.center.trim() ? current.center : suggested.center ?? current.center,
        }) : current);
      }}>پیشنهاد تکمیل از متن گفتگو (نیازمند تأیید)</Btn>
      {getMissingCaseFields(draft).some((field) => field.missing) ? <Banner tone="danger">فیلدهای زیر ناقص‌اند: {getMissingCaseFields(draft).filter((field) => field.missing).map((field) => field.label).join("، ")}. موارد قرمز پیش از نهایی‌سازی باید بررسی شوند.</Banner> : <Banner>فیلدهای اصلی پرونده تکمیل شده‌اند؛ صحت آن‌ها را کنترل کنید.</Banner>}
      <Field label="کارشناس اول" value={draft.expertName} onChange={(expertName) => setDraft({ ...draft, expertName })} />
      <Field label="کارشناس دوم" value={draft.secondExpertName} onChange={(secondExpertName) => setDraft({ ...draft, secondExpertName })} />
      <Panel>
        <h2 className="font-medium">نوع مصاحبه</h2>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Btn tone={draft.kind === "full" ? "primary" : "ghost"} onClick={() => setDraft({ ...draft, kind: "full" })}>
            مصاحبه کامل، ۲۴ سؤال
          </Btn>
          <Btn tone={draft.kind === "urgent" ? "primary" : "ghost"} onClick={() => setDraft({ ...draft, kind: "urgent" })}>
            نسخه فوری، ۶ سؤال مطابق شیوه‌نامه
          </Btn>
        </div>
        {draft.kind === "urgent" ? (
          <div className="mt-3">
            <Area
              label="علت استفاده از نسخه فوری"
              value={draft.urgentReason}
              onChange={(event) => setDraft({ ...draft, urgentReason: event.target.value })}
            />
            <p className="mt-1 text-sm text-muted">ارجاع مستقیم در این نسخه ممنوع است. نسخه فوری فقط شامل ح۱، ح۳، ح۵، ح۶، ح۷ و ح۸ است؛ ارجاع مستقیم، انتقال یا شروع کار بر مبنای آن مجاز نیست. صفر حل‌نشده یا دروازه بالینی فعال نیازمند مصاحبه کامل یا ارزیابی تخصصی است.</p>
          </div>
        ) : null}
      </Panel>
      <Panel>
        <h2 className="font-medium">رضایت</h2>
        <CheckRow
          checked={draft.consentExplained}
          onChange={(consentExplained) => setDraft({ ...draft, consentExplained })}
          label="درباره ضبط، نگهداری محلی و اینکه این ابزار تصمیم‌گیر نیست توضیح داده شد."
        />
        <CheckRow
          checked={draft.consentRecorded}
          onChange={(consentRecorded) => setDraft({ ...draft, consentRecorded })}
          label="رضایت آگاهانه برای انجام مصاحبه و پردازش ثبت شد."
        />
        <CheckRow
          checked={draft.consentRefused}
          onChange={(consentRefused) => setDraft({ ...draft, consentRefused })}
          label="مددجو با ضبط صوت مخالف است. ادامه فقط با ثبت دستی ممکن است."
        />
        <CheckRow
          checked={draft.dischargeConfirmed}
          onChange={(dischargeConfirmed) => setDraft({ ...draft, dischargeConfirmed })}
          label="تأیید مرجع ترخیص موجود است."
        />
      </Panel>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Btn tone="primary" onClick={save}>
        ذخیره و رفتن به آمادگی
      </Btn>
    </div>
  );
}

function ReadyScreen() {
  const { active, go, patchActive } = useInterview();
  const [storage, setStorage] = useState("در حال بررسی فضای ذخیره…");
  useEffect(() => {
    const estimate = navigator.storage?.estimate?.();
    if (!estimate) {
      setStorage("برآورد فضای ذخیره در این مرورگر موجود نیست.");
      return;
    }
    void estimate.then((value) => {
      const free = value.quota && value.usage ? value.quota - value.usage : null;
      setStorage(free === null ? "سهمیه ذخیره اعلام نشد." : `فضای تقریبی باقی‌مانده: ${faNum(Math.round(free / 1_000_000))} مگابایت`);
    });
  }, []);
  if (!active) return <NeedCase />;
  const canRecord = active.consentRecorded && active.consentExplained && !active.consentRefused;
  return (
    <div className="flex flex-col gap-3 py-4">
      <h1 className="text-xl font-medium">آمادگی ضبط</h1>
      <Panel>
        <ul className="flex flex-col gap-2 text-base leading-normal">
          <li>{canRecord ? "رضایت ضبط برقرار است." : "ضبط تا تکمیل رضایت، یا به‌دلیل مخالفت مددجو، بسته است."}</li>
          <li>{storage}</li>
          <li>گوشی را نزدیک، ثابت و دور از تلویزیون بگذارید. میکروفون یقه‌ای یا هدست اگر هست بهتر از میکروفون خود گوشی در اتاق شلوغ است.</li>
          <li>حذف نویز مرورگر تضمین کیفیت نیست. اگر صدا نامفهوم بود، امتیاز خودکار ندهید و مصاحبه را دستی یا دوباره انجام دهید.</li>
        </ul>
      </Panel>
      <Panel>
        <h2 className="font-medium">پردازش خودکار پس از ضبط</h2>
        <CheckRow
          checked={active.cloudAsrConsent && active.cloudAiConsent}
          onChange={(enabled) => patchActive((file) => withAudit({
            ...file, cloudAsrConsent: enabled, cloudAiConsent: enabled,
            autoProcessingNote: enabled ? file.autoProcessingNote : "پردازش ابری برای این پرونده غیرفعال شد؛ فایل صوتی در دستگاه می‌ماند."
          }, "auto_ai_consent", enabled ? "granted" : "revoked"), false)}
          label="رضایت می‌دهم صدای مصاحبه برای تبدیل گفتار به متن و متن حاصل برای ساخت پیشنهادهای هوش مصنوعی به Groq ارسال شود. هیچ امتیاز رسمی یا تصمیم نهایی خودکار ثبت نمی‌شود."
        />
        <p className="text-sm leading-normal text-muted">
          {hasSessionAiApiKey()
            ? "کلید API در حافظه همین اجرای برنامه موجود است؛ با رضایت بالا، تبدیل گفتار و پیشنهاد تحلیل پس از پایان ضبط خودکار اجرا می‌شود."
            : "برای پردازش خودکار، یک‌بار کلید API در تنظیمات وارد کنید. بدون کلید، ضبط فقط روی دستگاه ذخیره می‌شود. اتصال از ایران و سهمیه حساب تضمین‌شده نیست."}
        </p>
      </Panel>
      <Btn tone="primary" disabled={!canRecord} onClick={() => go("record")}>
        شروع ضبط
      </Btn>
      <Btn onClick={() => go("transcript")}>ادامه بدون ضبط، ثبت دستی</Btn>
    </div>
  );
}

function RecordScreen() {
  const { active, patchActive, patchCase, state, go } = useInterview();
  const [phase, setPhase] = useState<"idle" | "rec" | "paused">("idle");
  const [seconds, setSeconds] = useState(active?.recordingSeconds ?? 0);
  const [level, setLevel] = useState(0);
  const [silence, setSilence] = useState(0);
  const [clipping, setClipping] = useState(false);
  const [error, setError] = useState("");
  const [endMode, setEndMode] = useState<null | "touch" | "phrase">(null);
  const [phrase, setPhrase] = useState("");
  const [battery, setBattery] = useState("");
  const [processing, setProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState("");
  const secondsRef = useRef(seconds);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const liveChunkRef = useRef<MediaRecorder | null>(null);
  const liveChunkTimerRef = useRef<number | null>(null);
  const liveStopPromiseRef = useRef<Promise<void> | null>(null);
  const liveStopResolveRef = useRef<(() => void) | null>(null);
  const liveSegmentsRef = useRef<Segment[]>([]);
  const transcriptionQueueRef = useRef<Promise<void>>(Promise.resolve());
  const isLiveCaptureActiveRef = useRef(false);
  const [liveTranscribedCount, setLiveTranscribedCount] = useState(0);
  secondsRef.current = seconds;

  useEffect(() => {
    const batteryApi = navigator as Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean }> };
    void batteryApi.getBattery?.().then((info) => {
      setBattery(`باتری ${faNum(Math.round(info.level * 100))} درصد${info.charging ? "، در حال شارژ" : ""}`);
    });
    return () => streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    if (phase !== "rec") return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  if (!active) return <NeedCase />;
  const canRecord = active.consentRecorded && active.consentExplained && !active.consentRefused;
  const liveProgress = questionCompletionFromSegments(active.segments);

  function startLiveChunk(stream: MediaStream, caseId: string, apiKey: string) {
    if (!isLiveCaptureActiveRef.current) return;
    let recorder: MediaRecorder;
    const parts: Blob[] = [];
    const offsetSec = secondsRef.current;
    try {
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "";
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      liveChunkRef.current = recorder;
      const stopped = new Promise<void>((resolve) => { liveStopResolveRef.current = resolve; });
      liveStopPromiseRef.current = stopped;
      recorder.ondataavailable = (event) => { if (event.data.size) parts.push(event.data); };
      recorder.onstop = () => {
        if (liveChunkTimerRef.current !== null) window.clearTimeout(liveChunkTimerRef.current);
        liveChunkTimerRef.current = null;
        if (liveChunkRef.current === recorder) liveChunkRef.current = null;
        const blob = new Blob(parts, { type: recorder.mimeType || "audio/webm" });
        if (blob.size) {
          const transcribeOne = async () => {
            try {
              const pieces = await transcribeAudioWithGroq({ apiKey, audio: blob });
              const segments: Segment[] = pieces.map((piece) => {
                const raw: Segment = {
                  id: crypto.randomUUID(),
                  speaker: "overlap",
                  textRaw: piece.text,
                  startSec: piece.startSec === null ? null : offsetSec + piece.startSec,
                  endSec: piece.endSec === null ? null : offsetSec + piece.endSec,
                  confidence: null,
                  origin: "cloud_asr",
                };
                const review = reviewSegment(raw);
                return {
                  ...raw,
                  speaker: review.speakerConfidence >= 0.52 ? review.suggestedSpeaker : "overlap",
                  questionId: review.questionId ?? undefined,
                  speakerConfidence: review.speakerConfidence,
                  speakerSuggested: review.suggestedSpeaker,
                };
              });
              liveSegmentsRef.current = [...liveSegmentsRef.current, ...segments];
              setLiveTranscribedCount(liveSegmentsRef.current.length);
              patchCase(caseId, (file) => withAudit({
                ...file,
                segments: [...file.segments, ...segments],
                autoProcessingNote: "رونویسی زنده در حال انجام است؛ نقش گوینده هنوز قطعی نیست.",
              }, "asr_live_chunk", `${segments.length} segments`), false);
            } catch (reason) {
              const message = reason instanceof Error ? reason.message : "رونویسی یک قطعه ناموفق بود.";
              patchCase(caseId, (file) => ({
                ...file,
                autoProcessingNote: `یک قطعه صوتی در پردازش زنده ناموفق بود؛ پایان ضبط نتیجه‌های موجود را جمع‌بندی می‌کند. ${message}`,
              }), false);
            }
          };
          transcriptionQueueRef.current = transcriptionQueueRef.current.then(transcribeOne, transcribeOne);
        }
        liveStopResolveRef.current?.();
        liveStopResolveRef.current = null;
        if (isLiveCaptureActiveRef.current) startLiveChunk(stream, caseId, apiKey);
      };
      recorder.start();
      liveChunkTimerRef.current = window.setTimeout(() => {
        if (recorder.state !== "inactive") recorder.stop();
      }, 20_000);
    } catch {
      isLiveCaptureActiveRef.current = false;
      setError("رونویسی زنده روی این دستگاه شروع نشد؛ ضبط محلی ادامه دارد و پس از پایان یک‌بار تلاش برای تبدیل کامل صوت انجام می‌شود.");
    }
  }
  const liveMappedQuestions = Object.entries(liveProgress).filter(([, item]) => item.seen);

  async function start() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("این نسخه اندروید ضبط صوت را پشتیبانی نمی‌کند.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "";
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      recorder.start(1000);
      recRef.current = recorder;
      setSeconds(0);
      setPhase("rec");
      liveSegmentsRef.current = [];
      transcriptionQueueRef.current = Promise.resolve();
      setLiveTranscribedCount(0);
      const sessionKey = getSessionAiApiKey();
      isLiveCaptureActiveRef.current = Boolean(active.cloudAsrConsent && active.cloudAiConsent && sessionKey);
      if (isLiveCaptureActiveRef.current) startLiveChunk(stream, active.id, sessionKey);
      patchActive(
        (file) => withAudit({ ...file, status: file.status === "draft" ? "recording" : file.status, autoProcessingNote: undefined }, "recording_start", "touch"),
        false,
      );
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const meter = window.setInterval(() => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        let sum = 0;
        for (const sample of data) {
          const delta = Math.abs(sample - 128);
          peak = Math.max(peak, delta);
          sum += delta;
        }
        const percent = Math.min(100, Math.round((sum / data.length / 64) * 100));
        setLevel(percent);
        setClipping(peak > 120);
        setSilence((prev) => (percent < 6 ? prev + 0.2 : 0));
      }, 200);
      recorder.addEventListener("stop", () => {
        window.clearInterval(meter);
        void context.close().catch(() => undefined);
      }, { once: true });
    } catch {
      setError("اجازه میکروفون داده نشد یا دستگاه در دسترس نیست.");
    }
  }

  function finish() {
    const recorder = recRef.current;
    if (processing) return;
    if (!recorder || recorder.state === "inactive") {
      setPhase("idle");
      setEndMode(null);
      setPhrase("");
      return;
    }
    const caseId = active.id;
    const elapsed = secondsRef.current;
    setProcessing(true);
    setProcessingMessage("در حال ذخیره صوت و تکمیل رونویسی زنده…");
    setError("");
    isLiveCaptureActiveRef.current = false;
    if (liveChunkTimerRef.current !== null) window.clearTimeout(liveChunkTimerRef.current);
    liveChunkTimerRef.current = null;
    const lastLiveStop = liveStopPromiseRef.current;
    if (liveChunkRef.current && liveChunkRef.current.state !== "inactive") {
      try { liveChunkRef.current.stop(); } catch { /* recorder already stopped */ }
    }
    recorder.onstop = () => {
      const blob = new Blob(chunks.current, { type: recorder.mimeType || "audio/webm" });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      void (async () => {
        try {
          await saveAudio(caseId, blob);
          if (lastLiveStop) await lastLiveStop;
          await transcriptionQueueRef.current;
          const cloudApproved = active.cloudAsrConsent && active.cloudAiConsent;
          const sessionKey = getSessionAiApiKey();
          patchCase(caseId, (file) => withAudit({
            ...file,
            audioStored: blob.size > 0,
            recordingSeconds: elapsed,
            status: "review",
            autoProcessingNote: cloudApproved && sessionKey
              ? "صوت در دستگاه ذخیره شد؛ پردازش خودکار ابری آغاز می‌شود."
              : "صوت در دستگاه ذخیره شد. برای تبدیل گفتار و پیشنهاد هوش مصنوعی، کلید Groq را در تنظیمات وارد و رضایت این پرونده را فعال کنید.",
          }, "recording_end", `${elapsed}s`), false);

          if (cloudApproved && sessionKey) {
            let sessionSegments: Segment[] = [...liveSegmentsRef.current];
            if (!sessionSegments.length) {
              setProcessingMessage("در حال تبدیل صوت فارسی به متن…");
              const chunksFromModel = await transcribeAudioWithGroq({ apiKey: sessionKey, audio: blob });
              sessionSegments = chunksFromModel.map((piece) => {
                const raw: Segment = {
                  id: crypto.randomUUID(),
                  speaker: "overlap",
                  textRaw: piece.text,
                  startSec: piece.startSec,
                  endSec: piece.endSec,
                  confidence: null,
                  origin: "cloud_asr",
                };
                const review = reviewSegment(raw);
                return {
                  ...raw,
                  speaker: review.speakerConfidence >= 0.52 ? review.suggestedSpeaker : "overlap",
                  questionId: review.questionId ?? undefined,
                  speakerConfidence: review.speakerConfidence,
                  speakerSuggested: review.suggestedSpeaker,
                };
              });
              patchCase(caseId, (file) => withAudit({
                ...file,
                segments: [...file.segments, ...sessionSegments],
                autoProcessingNote: "تبدیل گفتار به متن پایان ضبط انجام شد؛ در حال بررسی نقش گوینده…",
              }, "asr_auto_complete", `${sessionSegments.length} segments`), false);
            }

            setProcessingMessage("در حال تحلیل نقش گویندگان و سؤال‌ها…");
            const speakerSuggestions = await suggestTranscriptSpeakersWithGroq({ apiKey: sessionKey, segments: sessionSegments });
            const speakerById = new Map(speakerSuggestions.map((item) => [item.segmentId, item]));
            const classifiedSegments = sessionSegments.map((segment) => {
              const suggestion = speakerById.get(segment.id);
              const confident = Boolean(suggestion && suggestion.confidence >= 0.65);
              return {
                ...segment,
                speaker: confident ? suggestion!.speaker : "overlap",
                speakerSuggested: suggestion?.speaker ?? segment.speakerSuggested,
                speakerConfidence: suggestion?.confidence ?? segment.speakerConfidence,
              };
            });
            const sessionIds = new Set(classifiedSegments.map((segment) => segment.id));
            patchCase(caseId, (file) => withAudit({
              ...file,
              segments: file.segments.map((segment) => sessionIds.has(segment.id)
                ? classifiedSegments.find((candidate) => candidate.id === segment.id) ?? segment
                : segment),
              autoProcessingNote: "متن و نقش احتمالی گویندگان ساخته شد؛ همه موارد نیازمند بازبینی انسانی‌اند.",
            }, "speaker_ai_suggestions", `${classifiedSegments.length} segments`), false);
            const allById = new Map<string, Segment>();
            for (const segment of active.segments) allById.set(segment.id, segment);
            for (const segment of classifiedSegments) allById.set(segment.id, segment);
            const allSegments = Array.from(allById.values());

            const metadataProvider = state.settings.aiProvider ?? "groq";
            const metadataKey = getSessionAiApiKey(metadataProvider);
            if (active.cloudAiConsent && metadataKey) {
              try {
                setProcessingMessage("در حال تکمیل مشخصات خالی پرونده از متن گفتگو…");
                const metadata = await suggestCaseMetadataWithAi({
                  provider: metadataProvider,
                  apiKey: metadataKey,
                  consentGranted: active.cloudAiConsent,
                  segments: allSegments,
                });
                const hasMetadata = Boolean(metadata.clientName || metadata.clientDetails || metadata.expertName || metadata.expertDetails || metadata.center || metadata.alias);
                if (hasMetadata) {
                  patchCase(caseId, (file) => withAudit({
                    ...file,
                    clientName: file.clientName?.trim() ? file.clientName : metadata.clientName,
                    clientDetails: file.clientDetails?.trim() ? file.clientDetails : metadata.clientDetails,
                    expertName: file.expertName.trim() ? file.expertName : metadata.expertName,
                    expertDetails: file.expertDetails?.trim() ? file.expertDetails : metadata.expertDetails,
                    center: file.center.trim() ? file.center : metadata.center,
                    alias: file.alias.trim() ? file.alias : metadata.alias,
                    code: randomSixDigitCode(),
                    autoProcessingNote: "مشخصات صریح موجود در گفتگو به فیلدهای خالی پیشنهاد/منتقل شد؛ صحت همه فیلدها را کارشناس بررسی کند.",
                  }, "ai_metadata_autofill", "filled_empty_fields_only"), false);
                }
              } catch (metadataError) {
                const message = metadataError instanceof Error ? metadataError.message : "تکمیل مشخصات انجام نشد.";
                patchCase(caseId, (file) => ({ ...file, autoProcessingNote: `رونویسی انجام شد؛ تکمیل خودکار مشخصات ناموفق بود: ${message}` }), false);
              }
            }

            if (classifiedSegments.some((segment) => segment.speaker === "client")) {
              setProcessingMessage("در حال ساخت پیشنهادهای هوش مصنوعی از متن…");
              const textProvider = state.settings.aiProvider ?? "groq";
              const textKey = getSessionAiApiKey(textProvider);
              if (!textKey) throw new Error("برای ارائه‌دهنده انتخاب‌شده، کلید API را در تنظیمات وارد کنید؛ رونویسی صوت ممکن است انجام شده باشد.");
              const result = await requestAiSuggestions({
                provider: textProvider,
                apiKey: textKey,
                consentGranted: active.cloudAiConsent,
                segments: allSegments,
              });
              patchCase(caseId, (file) => {
                const answers = { ...file.answers };
                for (const suggestion of result.suggestions) {
                  const current = answers[suggestion.questionId];
                  if (!current) continue;
                  answers[suggestion.questionId] = {
                    ...current,
                    aiSuggestion: {
                      evidenceText: suggestion.evidenceText,
                      segmentIds: suggestion.segmentIds,
                      status: suggestion.status,
                      rationale: suggestion.rationale,
                      generatedAt: new Date().toISOString(),
                      model: result.model,
                    },
                  };
                }
                return withAudit({
                  ...file,
                  answers,
                  autoProcessingNote: `پردازش خودکار پایان یافت؛ ${result.suggestions.length} پیشنهاد ثبت شد. متن و نقش گوینده نیازمند بازبینی است؛ هیچ امتیاز رسمی تغییر نکرد.`,
                }, "ai_auto_complete", `${result.suggestions.length} suggestions`);
              }, false);
            } else {
              patchCase(caseId, (file) => ({
                ...file,
                autoProcessingNote: "متن صوت ساخته شد، اما نقش گوینده در قطعه‌ها مبهم بود؛ برای جلوگیری از انتساب اشتباه، پیشنهاد پاسخ خودکار ساخته نشد. نقش‌ها را دستی بازبینی کنید.",
              }), false);
            }
          }
        } catch (reason) {
          const message = reason instanceof Error ? reason.message : "پردازش خودکار انجام نشد.";
          patchCase(caseId, (file) => withAudit({
            ...file,
            status: "review",
            autoProcessingNote: `صوت اصلی در دستگاه ذخیره شده، اما پردازش خودکار ناموفق بود: ${message}`,
          }, "auto_ai_failed", message), false);
        } finally {
          setProcessing(false);
          setProcessingMessage("");
          setPhase("idle");
          setEndMode(null);
          setPhrase("");
          go("transcript");
        }
      })();
    };
    recorder.stop();
  }

  return (
    <div className="flex flex-col gap-3 py-4">
      <h1 className="text-xl font-medium">ضبط مصاحبه</h1>
      {!canRecord ? <Banner tone="warn">ضبط تا ثبت رضایت و توضیح آن، یا به‌دلیل مخالفت مددجو، ممکن نیست.</Banner> : null}
      {processing ? <Banner>{processingMessage || "در حال پردازش…"}</Banner> : null}
      <Panel>
        <div className="flex items-center justify-between gap-3">
          <p className="text-3xl font-medium tabular-nums">{clock(seconds)}</p>
          <p className="text-sm">
            {phase === "rec" ? <span className="rec-dot me-2 inline-block size-2 rounded-full bg-danger" /> : null}
            {processing ? "در حال تحلیل" : phase === "rec" ? "در حال ضبط" : phase === "paused" ? "مکث" : "متوقف"}
          </p>
        </div>
        <p className="mt-2 text-sm text-muted">سطح صدا: {faNum(level)} درصد. {clipping ? "احتمال برش صدا." : "برش صدا دیده نشد."}</p>
        <p className="text-sm text-muted">{silence > 8 ? `سکوت حدود ${faNum(Math.round(silence))} ثانیه.` : "سکوت طولانی دیده نشد."}</p>
        {battery ? <p className="text-sm text-muted">{battery}</p> : null}
        {active.audioStored ? <p className="text-sm">فایل صوتی قبلی با پایان ضبط تازه جایگزین می‌شود.</p> : null}
      </Panel>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <div className="grid grid-cols-2 gap-2">
        {phase === "idle" ? (
          <Btn tone="primary" disabled={!canRecord || processing} onClick={() => void start()}>
            <Mic className="size-4" aria-hidden /> شروع ضبط
          </Btn>
        ) : (
          <Btn disabled={processing} onClick={() => {
            const recorder = recRef.current;
            if (!recorder || typeof recorder.pause !== "function") return;
            if (phase === "rec") {
              recorder.pause();
              setPhase("paused");
            } else {
              recorder.resume();
              setPhase("rec");
            }
          }}>
            {phase === "paused" ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}
            {phase === "paused" ? "ادامه ضبط" : "مکث"}
          </Btn>
        )}
        <Btn tone="danger" disabled={processing || (phase === "idle" && !active.audioStored)} onClick={() => setEndMode("touch")}>
          <Square className="size-4" aria-hidden /> پایان ضبط
        </Btn>
      </div>
      {phase === "rec" && active.cloudAsrConsent && active.cloudAiConsent && hasSessionAiApiKey() ? (
        <Panel>
          <h2 className="font-medium">پردازش زنده فعال است</h2>
          <p className="text-sm text-muted">قطعه‌های گفتار هر ۲۰ ثانیه برای رونویسی ارسال می‌شوند. قطعه‌های پردازش‌شده: {faNum(liveTranscribedCount)}. پس از پایان، نقش گوینده و ارتباط با سؤال‌ها تحلیل می‌شود.</p>
        </Panel>
      ) : null}
      {phase !== "idle" ? (
        <p className="text-sm text-muted">با پایان ضبط، صوت کامل در گوشی ذخیره می‌شود؛ در صورت رضایت ابری و کلید Groq، نتیجه رونویسی قطعه‌ها و پیشنهادهای هوش مصنوعی جمع‌بندی می‌شوند.</p>
      ) : null}
      {phase === "rec" && liveMappedQuestions.length ? <Panel>
        <h2 className="font-medium">موضوع‌های تشخیص‌داده‌شده (فقط پیشنهاد)</h2>
        <ul className="mt-1 list-disc pe-4">{liveMappedQuestions.map(([id, item]) => <li key={id}>{questionLabel(id)} — {item.hasClientEvidence ? "شاهد احتمالی؛ بازبینی لازم" : "گوینده یا پاسخ نامشخص"}</li>)}</ul>
      </Panel> : null}
      <Btn disabled={processing} onClick={() => go("transcript")}>رفتن به متن</Btn>
      {endMode ? (
        <Dialog title="پایان ضبط؟">
          <p className="text-sm leading-normal">صوت روی دستگاه ذخیره و در صورت وجود رضایت و کلید API، تبدیل گفتار و پیشنهاد تحلیل اجرا می‌شود. امتیاز رسمی خودکار ثبت نمی‌شود.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Btn onClick={() => setEndMode(null)}>ادامه مصاحبه</Btn>
            <Btn tone="primary" onClick={finish}>پایان و پردازش</Btn>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}

function TranscriptScreen() {
  const { active, patchActive, go } = useInterview();
  const [speaker, setSpeaker] = useState<Speaker>("client");
  const [text, setText] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!active?.audioStored) return;
    let url = "";
    void loadAudio(active.id).then((blob) => {
      if (!blob) return;
      url = URL.createObjectURL(blob);
      setAudioUrl(url);
    });
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [active?.id, active?.audioStored]);
  if (!active) return <NeedCase />;
  const finalIssues = runFinalTranscriptReview(active);

  function addSegment() {
    if (!text.trim()) return;
    const segment: Segment = {
      id: crypto.randomUUID(),
      speaker,
      textRaw: text.trim(),
      startSec: null,
      endSec: null,
      confidence: null,
      origin: "manual",
    };
    patchActive((file) => withAudit({ ...file, segments: [...file.segments, segment] }, "segment_add", segment.speaker), true);
    setText("");
  }

  return (
    <div className="flex flex-col gap-3 py-4">
      <h1 className="text-xl font-medium">متن و گوینده</h1>
      {active.autoProcessingNote ? <Panel><p className="text-sm leading-normal">{active.autoProcessingNote}</p></Panel> : null}
      <Banner>متن تولیدشده و انتساب گوینده ممکن است خطا داشته باشد؛ پیشنهاد هوش مصنوعی جایگزین بازبینی کارشناس نیست.</Banner>
      <Panel>
        <h2 className="font-medium">تحلیل محلی خودکار</h2>
        <p className="mt-1 text-sm leading-normal">بدون کلید API و بدون ارسال متن به اینترنت، برای هر قطعهٔ ثبت‌شده پیشنهاد نقش گوینده و سؤال احتمالی محاسبه می‌شود. این روش قاعده‌محور است، نه مدل زبانی یا تشخیص قطعی گوینده؛ پیشنهادها را در فهرست پایین بررسی و در صورت نیاز با دکمه‌های نقش اصلاح کنید.</p>
        <p className="mt-1 text-sm text-muted">قطعه‌های گفتگو: {faNum(active.segments.length)} · موارد نیازمند بازبینی: {faNum(active.segments.filter((segment) => reviewSegment(segment).needsHumanReview).length)}</p>
      </Panel>
      <Panel><h2 className="font-medium">بازبینی اولیه گفتگو</h2><p className="mt-1 text-sm">موارد نیازمند بررسی: {faNum(finalIssues.filter((issue) => issue.severity !== "info").length)} · نقص‌ها به‌صورت خودکار تکمیل نمی‌شوند.</p><ul className="mt-2 flex flex-col gap-1">{finalIssues.slice(0, 8).map((issue, index) => <li key={issue.code + index} className={issue.severity === "error" ? "text-danger" : issue.severity === "warning" ? "text-danger" : "text-muted"}>{issue.message}</li>)}</ul><Btn className="mt-2" tone="primary" onClick={() => go("report")}>بازبینی نهایی و تولید گزارش</Btn></Panel>
      {audioUrl ? <audio controls src={audioUrl} className="w-full" /> : <p className="text-sm text-muted">فایل صوتی ذخیره نشده. می‌توانید متن را دستی وارد کنید.</p>}
      <Panel>
        <label className="mb-2 block text-sm text-muted">گوینده قطعه تازه</label>
        <div className="grid gap-2 sm:grid-cols-3">
          {(["client", "interviewer", "overlap"] as Speaker[]).map((item) => (
            <Btn key={item} tone={speaker === item ? "primary" : "ghost"} onClick={() => setSpeaker(item)}>
              {speakerLabel(item)}
            </Btn>
          ))}
        </div>
        <div className="mt-3">
          <Area label="متن خام، بدون اصلاح واقعیت" value={text} onChange={(event) => setText(event.target.value)} />
        </div>
        <Btn tone="primary" className="mt-2" onClick={addSegment}>
          افزودن قطعه
        </Btn>
      </Panel>
      <ul className="flex flex-col gap-2">
        {active.segments.map((segment) => (
          <li key={segment.id} className="rounded-lg border border-line bg-surface p-3">
            <div className="mb-2 flex flex-wrap gap-2">
              {(["client", "interviewer", "overlap"] as Speaker[]).map((item) => (
                <button
                  key={item}
                  className={`min-h-11 rounded-sm border px-3 text-sm ${segment.speaker === item ? "border-transparent bg-accent text-accent-fg" : "border-line"}`}
                  onClick={() =>
                    patchActive(
                      (file) => ({
                        ...file,
                        segments: file.segments.map((itemSegment) =>
                          itemSegment.id === segment.id ? { ...itemSegment, speaker: item } : itemSegment,
                        ),
                      }),
                      true,
                    )
                  }
                >
                  {speakerLabel(item)}
                </button>
              ))}
            </div>
            <p className="whitespace-pre-wrap text-base leading-normal">{segment.textRaw}</p>
            <p className="mt-2 text-sm leading-normal text-muted">
              تحلیل محلی: نقش احتمالی «{speakerLabel(reviewSegment(segment).suggestedSpeaker)}» · اطمینان تقریبی {faNum(Math.round(reviewSegment(segment).speakerConfidence * 100))}٪
              {reviewSegment(segment).questionId ? ` · سؤال احتمالی: ${questionLabel(reviewSegment(segment).questionId as string)}` : " · سؤال مشخصی با اطمینان کافی تطبیق نشد"}
              {reviewSegment(segment).needsHumanReview ? " · بازبینی انسانی لازم است" : ""}
            </p>
            <p className="mt-1 text-sm text-muted">
              {segment.speakerSuggested ? `پیشنهاد نقش: ${speakerLabel(segment.speakerSuggested)} (${faNum(Math.round((segment.speakerConfidence ?? 0) * 100))}٪) · نیازمند تأیید` : "نقش گوینده بر اساس انتخاب کاربر"}
              {" · "}{segment.origin === "manual" ? "ثبت دستی" : segment.origin === "cloud_asr" ? "تبدیل گفتار ابری" : "گفتار مرورگر"}
              {" · "}
              {segment.confidence === null ? "اطمینان موتور: اعلام نشده" : `اطمینان موتور: ${faNum(segment.confidence.toFixed(2))}`}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function QuestionsScreen() {
  const { state, active, patchActive } = useInterview();
  const [openId, setOpenId] = useState("H01");
  const [aiProvider, setAiProvider] = useState<AiProvider>(state.settings.aiProvider ?? "groq");
  const [aiKey, setAiKey] = useState(getSessionAiApiKey(state.settings.aiProvider ?? "groq"));
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiResult, setAiResult] = useState<AiAssistResult | null>(null);
  if (!active) return <NeedCase />;
  const inScope = new Set(scopeIds(active.kind));
  const questionProgress = questionCompletionFromSegments(active.segments);
  const question = questionById(openId) ?? QUESTIONS[0]!;
  const answer = active.answers[question.id] ?? {
    evidenceText: "",
    evidenceOrigin: "none" as const,
    segmentIds: [],
    speakerConfirmedClient: false,
    status: "unanswered" as const,
    expertScore: null,
    zeroResolved: false,
    note: "",
  };

  function write(next: Answer) {
    const normalized = next.expertScore === 2 && !scoreAllowed(2, next) ? { ...next, expertScore: null } : next;
    patchActive(
      (file) =>
        withAudit(
          { ...file, answers: { ...file.answers, [question.id]: normalized } },
          "answer_edit",
          `${question.id}:${normalized.expertScore ?? "-"}`,
        ),
      true,
    );
  }

  const aiSuggestion = aiResult?.suggestions.find((item) => item.questionId === question.id) ?? answer.aiSuggestion ?? null;
  const whyNoTwo = !scoreAllowed(2, answer)
    ? "امتیاز ۲ فقط با شاهد، تأیید گویندهٔ مددجو و وضعیت «پاسخ داده شد» ممکن است."
    : "امتیاز ۲ با شاهد فعلی مجاز است؛ امتیاز نهایی را کارشناس بر پایه معیار رسمی تأیید می‌کند.";

  return (
    <div className="grid gap-3 py-4 md:grid-cols-[240px_1fr]">
      <div className="flex gap-2 overflow-x-auto md:flex-col md:overflow-visible">
        {QUESTIONS.map((item) => {
          const score = active.answers[item.id]?.expertScore;
          const currentAnswer = active.answers[item.id];
          const complete = !!currentAnswer && currentAnswer.status === "answered" && !!currentAnswer.evidenceText.trim() && currentAnswer.speakerConfirmedClient;
          return (
            <button
              key={item.id}
              onClick={() => setOpenId(item.id)}
              className={`min-h-12 shrink-0 rounded-sm border px-3 text-start text-sm ${
                item.id === question.id ? "border-transparent bg-accent text-accent-fg" : "border-line bg-surface"
              } ${complete ? "border-success" : inScope.has(item.id) ? "border-danger text-danger" : "opacity-50"}`}
            >
              <span className="font-medium">{complete ? "✓ " : inScope.has(item.id) ? "● " : ""}{questionLabel(item.id)}</span>
              {item.critical ? " · حیاتی" : ""}
              {" · "}
              {score === null || score === undefined ? "بی‌امتیاز" : faNum(score)}
              {questionProgress[item.id]?.seen && !complete ? " · نیازمند بررسی متن" : ""}
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-3">
        <h1 className="text-lg font-medium leading-normal">
          {questionLabel(question.id)} {question.critical ? "· حیاتی" : ""}
          {!inScope.has(question.id) ? " · خارج از نسخه فوری" : ""}
        </h1>
        <p className="text-base leading-normal">{question.text}</p>
        <p className="text-sm text-muted">منبع: {RULES_META.source}</p>
        <Panel>
          <h2 className="font-medium">معیار رسمی امتیاز این سؤال (شیوه‌نامه ۱۴۰۵)</h2>
          <div className="mt-2 grid gap-2 text-sm leading-normal">
            <p><strong>۰ · هشدار:</strong> {question.criteria[0]}</p>
            <p><strong>۱ · ناقص:</strong> {question.criteria[1]}</p>
            <p><strong>۲ · کامل:</strong> {question.criteria[2]}</p>
          </div>
          <p className="mt-2 text-xs text-muted">مرجع: {RULES_META.source}</p>
        </Panel>
        <Panel>
          <div className="flex items-center gap-2"><Sparkles className="size-5" aria-hidden /><h2 className="font-medium">کمک هوش مصنوعی (اختیاری و ابری)</h2></div>
          <p className="mt-2 text-sm leading-normal text-muted">فقط متن قطعه‌هایی که گوینده‌شان «مددجو» علامت خورده به سرویس انتخابی ارسال می‌شوند؛ صوت، نام مستعار و شناسه پرونده ارسال نمی‌شوند، اما خود متن ممکن است نام، شماره تماس یا اطلاعات درمانی/قضایی داشته باشد. پیش از درخواست، متن گفتگو را بازبینی و اطلاعات شناسایی‌کننده را دستی حذف/پوشانده کنید. این انتقال داده حساس را از گوشی خارج می‌کند و رضایت مستقل همین پرونده لازم است.</p>
          <CheckRow checked={active.cloudAiConsent} onChange={(cloudAiConsent) => patchActive((file) => withAudit({ ...file, cloudAiConsent }, "ai_cloud_consent", cloudAiConsent ? "granted" : "revoked"), false)} label="پس از توضیح پیام بالا، برای ارسال متن قطعه‌های منتسب به مددجو به سرویس ابری رضایت می‌دهم." />
          <label className="block text-sm text-muted">ارائه‌دهنده</label>
          <select className="min-h-12 w-full rounded-sm border border-line bg-surface px-3" value={aiProvider} onChange={(event) => { const provider = event.target.value as AiProvider; setAiProvider(provider); setAiKey(getSessionAiApiKey(provider)); }}>
            <option value="groq">Groq API · Whisper + GPT OSS</option>
            <option value="deepseek">DeepSeek API · deepseek-chat</option>
            <option value="openai">OpenAI API</option>
          </select>
          <Field label="کلید API (نمایش آشکار؛ فقط در حافظه این اجرا)" type="text" value={aiKey} onChange={setAiKey} />
          <Btn tone="primary" disabled={!active.cloudAiConsent || !aiKey.trim() || aiBusy || active.segments.every((s) => s.speaker !== "client")} onClick={() => {
            setAiError("");
            if (!active.cloudAiConsent) { setAiError("ابتدا رضایت مستقل تحلیل ابری را ثبت کنید."); return; }
            setAiBusy(true);
            setSessionAiApiKey(aiKey, aiProvider);
            void requestAiSuggestions({ provider: aiProvider, apiKey: aiKey, consentGranted: active.cloudAiConsent, segments: active.segments })
              .then((result) => setAiResult(result))
              .catch((error: unknown) => setAiError(error instanceof Error ? error.message : "تحلیل انجام نشد."))
              .finally(() => { setAiKey(""); setAiBusy(false); });
          }}>{aiBusy ? "در حال دریافت پیشنهاد…" : "پیشنهاد ارتباط گفتگو با ۲۴ سؤال"}</Btn>
          {aiError ? <Banner tone="warn">{aiError}</Banner> : null}
          {aiResult ? <p className="text-sm">پیشنهادهای دریافتی: {faNum(aiResult.suggestions.length)} · مدل اعلام‌شده: {aiResult.model}. هیچ امتیاز یا تصمیمی خودکار تغییر نکرده است.</p> : null}
          <p className="text-xs leading-normal text-muted">کلید انتخاب‌شده فقط تا بسته‌شدن برنامه در حافظه می‌ماند و در پرونده ذخیره نمی‌شود. محدودیت رایگان، هزینه، سیاست نگهداری داده و دسترسی شبکه را در حساب سرویس بررسی کنید؛ دسترسی از ایران تضمین‌شده نیست.</p>
        </Panel>
        {aiSuggestion ? <Panel>
          <h2 className="font-medium">پیشنهاد AI برای {questionLabel(question.id)} · نیازمند تأیید کارشناس</h2>
          <p className="mt-2 text-sm leading-normal whitespace-pre-wrap"><strong>شاهد پیشنهادی:</strong> {aiSuggestion.evidenceText || "شاهد قابل انتساب پیشنهاد نشده است."}</p>
          <p className="mt-1 text-sm leading-normal"><strong>وضعیت پیشنهادی:</strong> {statusLabel(aiSuggestion.status)}</p>
          <p className="mt-1 text-sm leading-normal"><strong>توضیح:</strong> {aiSuggestion.rationale}</p>
          {"followUp" in aiSuggestion && aiSuggestion.followUp ? <p className="mt-1 text-sm leading-normal"><strong>پرسش روشن‌کننده برای کارشناس:</strong> {aiSuggestion.followUp}</p> : null}
          {"questionId" in aiSuggestion ? <Btn onClick={() => patchActive((file) => withAudit(applyAiSuggestionToCase(file, aiSuggestion as AiQuestionSuggestion), "ai_suggestion_saved", question.id), false)}>ثبت این پیشنهاد در پرونده (بدون امتیازدهی)</Btn> : null}
          <Btn onClick={() => write({ ...answer, evidenceText: aiSuggestion.evidenceText, evidenceOrigin: aiSuggestion.segmentIds.length ? "segment" : "none", segmentIds: aiSuggestion.segmentIds, speakerConfirmedClient: false, status: aiSuggestion.status, expertScore: null })}>انتقال متن به پیش‌نویس شاهد برای بازبینی دستی</Btn>
          <p className="text-xs text-muted">انتقال پیشنهاد، گوینده را تأیید نمی‌کند و امتیاز را خالی می‌کند؛ کارشناس باید متن خام را بررسی کند.</p>
        </Panel> : null}
        <Area label="شاهد گفتهٔ مددجو" value={answer.evidenceText} onChange={(event) => {
          const evidenceText = event.target.value;
          write({
            ...answer,
            evidenceText,
            evidenceOrigin: evidenceText.trim() ? (answer.evidenceOrigin === "segment" ? "segment" : "manual_hearing") : "none",
          });
        }} />
        <Btn
          onClick={() => {
            const clients = active.segments.filter((segment) => segment.speaker === "client");
            if (!clients.length) return;
            write({
              ...answer,
              evidenceText: clients.map((segment) => segment.textRaw).join("\n"),
              evidenceOrigin: "segment",
              segmentIds: clients.map((segment) => segment.id),
            });
          }}
        >
          درج متن قطعه‌های مددجو
        </Btn>
        <label className="block text-sm text-muted">وضعیت</label>
        <div className="grid grid-cols-2 gap-2">
          {(["answered", "partial", "unanswered", "contradictory", "unclear", "needs_review"] as AnswerStatus[]).map((status) => (
            <Btn key={status} tone={answer.status === status ? "primary" : "ghost"} onClick={() => write({ ...answer, status })}>
              {statusLabel(status)}
            </Btn>
          ))}
        </div>
        <CheckRow
          checked={answer.speakerConfirmedClient}
          onChange={(speakerConfirmedClient) => write({ ...answer, speakerConfirmedClient })}
          label="این شاهد را خودم از گفتهٔ مددجو شنیدم و گوینده را تأیید می‌کنم."
        />
        <p className="text-sm text-muted">{whyNoTwo}</p>
        <div className="grid grid-cols-3 gap-2">
          {([0, 1, 2] as const).map((score) => (
            <Btn
              key={score}
              tone={answer.expertScore === score ? "primary" : "ghost"}
              disabled={!scoreAllowed(score, answer)}
              onClick={() => write({ ...answer, expertScore: score })}
            >
              {faNum(score)} {score === 0 ? "هشدار" : score === 1 ? "ناقص" : "کامل"}
            </Btn>
          ))}
        </div>
        {question.critical && answer.expertScore === 0 ? (
          <CheckRow
            checked={answer.zeroResolved}
            onChange={(zeroResolved) => {
              if (zeroResolved && !answer.note.trim()) {
                window.alert("برای ثبت صفر به‌عنوان حل‌شده، اقدام مشخص و نتیجه بازبینی را ابتدا در یادداشت کارشناس ثبت کنید.");
                return;
              }
              write({ ...answer, zeroResolved });
            }}
            label="صفر فقط پس از ثبت اقدام بعدی/نتیجه بازبینی در یادداشت، حل‌شده محسوب می‌شود."
          />
        ) : null}
        <Area label="یادداشت کارشناس" value={answer.note} onChange={(event) => write({ ...answer, note: event.target.value })} />
      </div>
    </div>
  );
}

function SummaryScreen() {
  const { active, patchActive } = useInterview();
  if (!active) return <NeedCase />;
  const result = evaluate(active);
  const blockers = closeBlockers(active, result);
  return (
    <div className="flex flex-col gap-3 py-4">
      <h1 className="text-xl font-medium">جمع‌بندی</h1>
      {active.synthetic ? <Banner tone="warn">پرونده آموزشی است. عددها برای آزمون موتورند، نه برای ارجاع یک شخص.</Banner> : null}
      <Panel>
        <p className="text-sm text-muted">جمع خام {result.missingIds.length ? "ناقص" : "کامل"}</p>
        <p className="text-3xl font-medium tabular-nums">
          {faNum(result.net)} <span className="text-base text-muted">خالص از {faNum(result.maxRaw)}</span>
        </p>
        <p className="mt-1 text-sm">خام {faNum(result.raw)} · کسر اعمال‌شده {faNum(result.deductionApplied)}</p>
        <p className="mt-3 text-base leading-normal">{SUGGESTION_LABEL[result.suggestion]}</p>
        {active.kind === "full" ? (
          <p className="mt-2 text-sm leading-normal">
            دروازه حیاتی: {result.criticalGatePassed ? "برقرار" : "برقرار نیست"}
            {result.criticalSum === null ? " · جمع حیاتی ناقص" : ` · ${faNum(result.criticalSum)} از ${faNum(result.criticalMax)}`}
            {result.unresolvedZeroIds.length ? ` · صفر حل‌نشده: ${result.unresolvedZeroIds.map(questionLabel).join("، ")}` : " · صفر حل‌نشده ندارد"}
          </p>
        ) : (
          <p className="mt-2 text-sm">دروازه ۱۲ سؤال حیاتی برای نسخه فوری اجرا نمی‌شود و ارجاع مستقیم پیشنهاد نمی‌شود.</p>
        )}
      </Panel>
      <Panel>
        <h2 className="font-medium">خطوط قرمز و دروازه بالینی</h2>
        <p className="mt-1 text-sm text-muted">خطوط قرمز مطابق شیوه‌نامه ۱۴۰۵ ثبت می‌شوند؛ از صوت یا تحلیل احساسات مدل استنباط نمی‌شوند.</p>
        {result.redLines.length ? (
          <ul className="mt-2 list-disc pe-4 text-sm leading-normal text-danger">
            {result.redLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm">خط قرمز شناخته‌شده‌ای باز نیست.</p>
        )}
        <CheckRow checked={active.psychCrisis} onChange={(psychCrisis) => patchActive((file) => ({ ...file, psychCrisis }))} label="بحران روانی یا قصد آسیب، مشاهده یا گزارش شده و باید فوری به متخصص ارجاع شود." />
        <CheckRow checked={active.medicalUnstable} onChange={(medicalUnstable) => patchActive((file) => ({ ...file, medicalUnstable }))} label="ناپایداری پزشکی" />
        <CheckRow checked={active.noSafeNight} onChange={(noSafeNight) => patchActive((file) => ({ ...file, noSafeNight }))} label="محل امن شب اول وجود ندارد" />
        <CheckRow checked={active.clinicalGateActive} onChange={(clinicalGateActive) => patchActive((file) => ({ ...file, clinicalGateActive }))} label="دروازه بالینی فعال است" />
        <CheckRow checked={active.clinicalCleared} onChange={(clinicalCleared) => patchActive((file) => ({ ...file, clinicalCleared }))} label="حرفه‌ای مسئول، دروازه بالینی را تأیید کرده است" />
      </Panel>
      <DeductionEditor />
      <ul className="flex flex-col gap-1 text-sm text-muted">
        {result.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  );
}

function DeductionEditor() {
  const { active, patchActive } = useInterview();
  if (!active) return null;
  const deduction = active.deduction;
  function set<K extends keyof typeof deduction>(key: K, value: (typeof deduction)[K]) {
    patchActive((file) => ({ ...file, deduction: { ...file.deduction, [key]: value } }));
  }
  function setUrgentDimension(key: "urgentEmotion" | "urgentCraving", value: 0 | 1 | 2) {
    patchActive((file) => {
      const next = { ...file.deduction, [key]: value };
      const emotion = key === "urgentEmotion" ? value : (file.deduction.urgentEmotion ?? 0);
      const craving = key === "urgentCraving" ? value : (file.deduction.urgentCraving ?? 0);
      return { ...file, deduction: { ...next, requested: emotion + craving } };
    });
  }
  return (
    <Panel>
      <h2 className="font-medium">تعدیل رفتاری</h2>
      <p className="mt-1 text-sm leading-normal text-muted">
        مصاحبه کامل حداکثر ۸- امتیاز دارد. نسخه فوری فقط دو محور دارد: آرامش/تنظیم هیجان تا ۲- و فوریت رهایی/ولع تا ۲- (جمع حداکثر ۴-). مشاهده منفرد یا زبان بدن به‌تنهایی مجوز کسر نیست.
      </p>
      {active.kind === "urgent" ? <div className="mt-2 flex flex-col gap-3">
        <div><label className="block text-sm text-muted">آرامش و تنظیم هیجان (۰ تا ۲-)</label><div className="mt-1 grid grid-cols-3 gap-2">{([0, 1, 2] as const).map((value) => <Btn key={value} tone={(deduction.urgentEmotion ?? 0) === value ? "primary" : "ghost"} onClick={() => setUrgentDimension("urgentEmotion", value)}>{faNum(value)}</Btn>)}</div></div>
        <div><label className="block text-sm text-muted">فوریت رهایی یا نشانه ولع (۰ تا ۲-)</label><div className="mt-1 grid grid-cols-3 gap-2">{([0, 1, 2] as const).map((value) => <Btn key={value} tone={(deduction.urgentCraving ?? 0) === value ? "primary" : "ghost"} onClick={() => setUrgentDimension("urgentCraving", value)}>{faNum(value)}</Btn>)}</div></div>
        <p className="text-sm">جمع کسر نسخه فوری: {faNum((deduction.urgentEmotion ?? 0) + (deduction.urgentCraving ?? 0))} از ۴</p>
      </div> : <><label className="mt-2 block text-sm text-muted">کسر درخواستی، حداکثر ۸</label>
      <input type="number" min={0} max={8} value={deduction.requested} onChange={(event) => set("requested", Number(event.target.value))} className="mt-1 h-12 w-full rounded-sm border border-line bg-bg px-3" /></>}
      <div className="mt-2 flex flex-col gap-2">
        <Area label="شاهد توصیفی" value={deduction.evidence} onChange={(event) => set("evidence", event.target.value)} />
        <Area label="زمان و زمینه" value={deduction.contextTime} onChange={(event) => set("contextTime", event.target.value)} />
        <Area label="تکرار" value={deduction.repetition} onChange={(event) => set("repetition", event.target.value)} />
        <Area label="خط پایه" value={deduction.baseline} onChange={(event) => set("baseline", event.target.value)} />
      </div>
      <CheckRow checked={deduction.confoundersChecked} onChange={(confoundersChecked) => set("confoundersChecked", confoundersChecked)} label="عوامل مخدوش‌کننده، از جمله خستگی، لهجه، لکنت و کیفیت میکروفون، بررسی شد." />
    </Panel>
  );
}

function ReportScreen() {
  const { active, state, patchActive } = useInterview();
  const [hash, setHash] = useState("");
  const [pinOpen, setPinOpen] = useState<null | "save-pdf" | "share-pdf" | "export-xlsx">(null);
  const sheetRef = useRef<HTMLElement>(null);
  const result = active ? evaluate(active) : null;
  const finalIssues = active ? runFinalTranscriptReview(active) : [];
  useEffect(() => {
    if (!active || !result) return;
    void sha256Hex(canonicalBody(active, result)).then(setHash);
  }, [active, result]);
  if (!active || !result) return <NeedCase />;
  const name = fileStamp(active.id);
  const scoped = scopeIds(active.kind);

  function buildReportHtml(): string {
    const body = sheetRef.current?.innerHTML ?? "";
    return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name}</title><style>@page{size:A4;margin:12mm}body{font-family:Tahoma,sans-serif;line-height:1.65;color:#222;direction:rtl;text-align:right;font-size:10pt}h1{font-size:17pt}table{width:100%;border-collapse:collapse;table-layout:fixed;page-break-inside:auto}tr{page-break-inside:avoid;page-break-after:auto}td,th{border:1px solid #999;padding:5px;vertical-align:top;text-align:right;overflow-wrap:anywhere}article{border:0!important;padding:0!important}.text-muted{color:#555}.text-sm{font-size:9pt}.text-xl{font-size:17pt}.mt-3{margin-top:10px}.mt-2{margin-top:6px}.mt-1{margin-top:3px}.grid{display:block}.no-print{display:none!important}</style></head><body>${body}</body></html>`;
  }

async function exportPdfToPublicFolder() {
    const html = buildReportHtml();
    if (isNativeAndroid()) {
      await savePdfToPublicStorage(`${name}.pdf`, html);
      patchActive((file) => withAudit(file, "export_pdf_save_dialog", "user_selected_public_location"), false);
    } else {
      window.setTimeout(() => window.print(), 150);
    }
  }

  async function sharePdfWithOtherApps() {
    if (!isNativeAndroid()) {
      window.alert("اشتراک PDF از طریق منوی چاپ مرورگر انجام می‌شود؛ این قابلیت بومی فقط در APK فعال است.");
      return;
    }
    await sharePdf(`${name}.pdf`, buildReportHtml());
    patchActive((file) => withAudit(file, "export_pdf_share_dialog", "share_chooser_opened"), false);
  }

  return (
    <div className="flex flex-col gap-3 py-4">
      <div className="no-print flex flex-wrap gap-2">
        <Btn tone="primary" onClick={() => setPinOpen("save-pdf")}>
          <Printer className="size-4" aria-hidden /> ذخیره PDF در پوشه عمومی
        </Btn>
        <Btn onClick={() => setPinOpen("share-pdf")}>اشتراک PDF با برنامه‌های دیگر</Btn>
        <Btn onClick={() => setPinOpen("export-xlsx")}><FileSpreadsheet className="size-4" aria-hidden /> دریافت Excel (.xlsx)</Btn>
        {/* Raw/JSON/HTML exports remain disabled until encrypted export is implemented. */}
      </div>
      <p className="no-print text-xs leading-normal text-muted">خروجی HTML، JSON و transcript خام تا زمان پیاده‌سازی خروجی رمزنگاری‌شده غیرفعال‌اند. گزارش PDF به‌طور پیش‌فرض متن کامل مکالمه را شامل نمی‌شود.</p>
      <article ref={sheetRef} className="report rounded-lg border border-line bg-surface p-3">
        <p className="text-sm">{state.settings.orgTitle}</p>
        <p className="text-sm text-muted">{state.settings.deptTitle}</p>
        <h1 className="mt-2 text-xl font-medium leading-normal">گزارش مصاحبه و ارزیابی شغلی مددجو — خروجی کمکی سامانه</h1>
        <p className="mt-2 text-sm leading-normal">خروجی سامانه به‌تنهایی تصمیم نهایی ارجاع نیست.</p>
        <section className="mt-3 rounded-sm border border-line p-2"><h2 className="font-medium">بازبینی نهایی transcript</h2><ul className="mt-2 flex flex-col gap-1">{finalIssues.map((issue, index) => <li key={issue.code + index} className={issue.severity === "error" ? "text-danger" : issue.severity === "warning" ? "text-danger" : "text-muted"}>{issue.message}</li>)}</ul></section>
        {active.synthetic ? <p className="mt-2 text-sm">پرونده آموزشی مصنوعی است.</p> : null}
        <dl className="mt-3 grid gap-1 text-sm">
          <div>شناسه: {active.code || "—"}</div>
          <div>نام مددجو/مستعار: {active.clientName || active.alias || "—"}</div>
          <div>مشخصات ضروری مددجو: {active.clientDetails || "—"}</div>
          <div>مشخصات کارشناس: {active.expertDetails || "—"}</div>
          <div>مرکز: {active.center || "—"}</div>
          <div>تاریخ تهیه: {faDate(new Date().toISOString())}</div>
          <div>کارشناس: {active.expertName || "—"} {active.expertApprovedAt ? `(تأیید ${faDate(active.expertApprovedAt)})` : "(هنوز تأیید نشده)"}</div>
          <div>بازبینی کارشناس دوم: {active.secondExpertName || "—"} {active.secondApprovedAt ? `(${faDate(active.secondApprovedAt)})` : "(هنوز تأیید نشده)"}</div>
          <div>تأیید دوگانه مدیریتی F04: در این نسخه ثبت الکترونیکی نمی‌شود؛ امضای مکتوب رئیس و معاون لازم است.</div>
          <div>رضایت: {active.consentRecorded && active.consentExplained ? "ثبت شده" : "ناکامل"}{active.consentRefused ? " · ضبط رد شده" : ""}</div>
          <div>نوع: {active.kind === "full" ? "مصاحبه کامل" : "نسخه فوری"}</div>
          {active.kind === "urgent" ? <div>علت نسخه فوری: {active.urgentReason || "ثبت نشده"}</div> : null}
          <div>نسخه قواعد: {RULES_META.version} · معیارهای امتیاز از صفحات ۸ تا ۱۱ شیوه‌نامه ۱۴۰۵</div>
          <div>فرم‌های F00-F09: مسیر کلی معرفی شده است؛ تکمیل برخط همه فرم‌ها و ثبت امضای رسمی مدیریتی هنوز پیاده‌سازی نشده است.</div>
        </dl>
        <p className="mt-3 text-base">
          خام {faNum(result.raw)} از {faNum(result.maxRaw)} · کسر {faNum(result.deductionApplied)} · خالص {faNum(result.net)}
        </p>
        <p className="text-sm leading-normal">{SUGGESTION_LABEL[result.suggestion]}</p>
        <p className="text-sm leading-normal">
          دروازه حیاتی: {active.kind === "urgent" ? "شامل نسخه فوری نیست" : result.criticalGatePassed ? "برقرار" : "برقرار نیست"}
        </p>
        <p className="text-sm leading-normal">خطوط قرمز: {result.redLines.length ? result.redLines.join("؛ ") : "مورد شناخته‌شده‌ای باز نیست"}</p>
        {result.deductionApplied > 0 ? (
          <div className="mt-3 text-sm leading-normal">
            <p>تعدیل رفتاری مستند: {faNum(result.deductionApplied)} امتیاز</p>
            <p>شاهد: {active.deduction.evidence}</p>
            <p>زمان: {active.deduction.contextTime}</p>
          </div>
        ) : null}
        <table className="mt-3 w-full border-collapse text-sm">
          <thead>
            <tr>
              {["شناسه", "متن رسمی", "شاهد", "امتیاز کارشناس", "پیشنهاد سامانه", "وضعیت", "یادداشت"].map((heading) => (
                <th key={heading} className="border border-line p-2 text-start font-medium">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scoped.map((id) => {
              const question = questionById(id);
              const answer = active.answers[id];
              return (
                <tr key={id} className="align-top">
                  <td className="border border-line p-2">{questionLabel(id)}</td>
                  <td className="border border-line p-2">{question?.text}</td>
                  <td className="border border-line p-2 whitespace-pre-wrap">{answer?.evidenceText || "—"}</td>
                  <td className="border border-line p-2">{answer?.expertScore === null || answer?.expertScore === undefined ? "—" : faNum(answer.expertScore)}</td>
                  <td className="border border-line p-2">هوش مصنوعی امتیاز نمی‌دهد؛ معیار رسمی و تأیید کارشناس ملاک است</td>
                  <td className="border border-line p-2">{answer ? statusLabel(answer.status) : "—"}</td>
                  <td className="border border-line p-2">{answer?.note || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-3 text-sm leading-normal">هشدارها: {result.notes.join(" ")}</p>
        <p className="mt-3 text-sm break-all">چکیده SHA-256: {hash || "در حال محاسبه"}</p>
        <p className="text-sm text-muted">این چکیده امضای دیجیتال نیست و فقط تغییر ناخواستهٔ همین خلاصه را نشان می‌دهد.</p>
        <p className="text-sm text-muted">متن کامل مکالمه در این گزارش نیست.</p>
      </article>
      {pinOpen ? (
        <PinDialog
          title="تأیید خروجی"
          pinRecord={state.pin}
          onClose={() => setPinOpen(null)}
          onSuccess={() => {
            if (pinOpen === "save-pdf") void exportPdfToPublicFolder().catch((error: unknown) => window.alert(error instanceof Error ? error.message : "ذخیره PDF ناموفق بود."));
            if (pinOpen === "share-pdf") void sharePdfWithOtherApps().catch((error: unknown) => window.alert(error instanceof Error ? error.message : "اشتراک PDF ناموفق بود."));
            if (pinOpen === "export-xlsx") {
              try { downloadCaseWorkbook(active); patchActive((file) => withAudit(file, "export_xlsx", "user_triggered_xlsx")); }
              catch (error) { window.alert(error instanceof Error ? error.message : "ساخت فایل Excel ناموفق بود."); }
            }
            setPinOpen(null);
          }}
        />
      ) : null}
    </div>
  );
}

function SettingsScreen() {
  const { state, patchSettings, wipeAll, removeActive, active, lock } = useInterview();
  const [pinOpen, setPinOpen] = useState<null | "wipe" | "delete" | "phrase">(null);
  const [phrase, setPhrase] = useState(state.settings.endPhrase);
  const [settingsProvider, setSettingsProvider] = useState<AiProvider>(state.settings.aiProvider ?? "groq");
  const [aiKeyDraft, setAiKeyDraft] = useState(getSessionAiApiKey(state.settings.aiProvider ?? "groq"));
  const [aiKeyReady, setAiKeyReady] = useState(hasSessionAiApiKey(state.settings.aiProvider ?? "groq"));
  return (
    <div className="no-print flex flex-col gap-3 py-4">
      <h1 className="text-xl font-medium">تنظیمات</h1>
      <Field label="عنوان سازمان در سربرگ" value={state.settings.orgTitle} onChange={(orgTitle) => patchSettings({ orgTitle })} />
      <Field label="عنوان واحد" value={state.settings.deptTitle} onChange={(deptTitle) => patchSettings({ deptTitle })} />
      <Field label="مرکز پیش‌فرض" value={state.settings.centerDefault} onChange={(centerDefault) => patchSettings({ centerDefault })} />
      <CheckRow checked={state.settings.requirePinOnLaunch ?? true} onChange={(requirePinOnLaunch) => { patchSettings({ requirePinOnLaunch }); if (requirePinOnLaunch) lock(); }} label="رمز هنگام شروع برنامه" />
      <Panel>
        <h2 className="font-medium">هوش مصنوعی</h2>
        <label className="mb-1 block text-sm">ارائه‌دهنده تحلیل متن</label>
        <select className="min-h-12 w-full rounded-sm border border-line bg-surface px-3" value={settingsProvider} onChange={(event) => { const provider = event.target.value as AiProvider; setSettingsProvider(provider); patchSettings({ aiProvider: provider }); setAiKeyDraft(getSessionAiApiKey(provider)); setAiKeyReady(hasSessionAiApiKey(provider)); }}>
          <option value="groq">Groq</option><option value="deepseek">DeepSeek</option><option value="openai">OpenAI</option>
        </select>
        <Field label="کلید API (نمایش آشکار)" value={aiKeyDraft} onChange={setAiKeyDraft} type="text" />
        <div className="grid grid-cols-2 gap-2">
          <Btn tone="primary" onClick={() => { setSessionAiApiKey(aiKeyDraft, settingsProvider); patchSettings({ aiProvider: settingsProvider }); setAiKeyReady(hasSessionAiApiKey(settingsProvider)); }}>
            ذخیره تا پایان این اجرا
          </Btn>
          <Btn disabled={!aiKeyReady} onClick={() => { clearSessionAiApiKey(settingsProvider); setAiKeyDraft(""); setAiKeyReady(false); }}>
            حذف کلید
          </Btn>
        </div>
        <p className="text-xs text-muted">{aiKeyReady ? `کلید ${settingsProvider} در حافظه موقت حاضر است.` : `کلید ${settingsProvider} ثبت نشده است.`}</p>
        <p className="text-xs text-muted">کلیدها فقط تا بسته‌شدن برنامه در حافظه می‌مانند. تبدیل صوت همچنان به کلید Groq نیاز دارد: https://console.groq.com/keys</p>
      </Panel>
      <label className="block text-sm text-muted">قفل خودکار</label>
      <div className="grid grid-cols-4 gap-2">
        {[1, 5, 15, 0].map((minutes) => (
          <Btn key={minutes} tone={state.settings.autoLockMin === minutes ? "primary" : "ghost"} onClick={() => patchSettings({ autoLockMin: minutes })}>
            {minutes === 0 ? "خاموش" : faNum(minutes)}
          </Btn>
        ))}
      </div>
      <Field label="عبارت پایان ضبط" value={phrase} onChange={setPhrase} type="password" />
      <Btn onClick={() => setPinOpen("phrase")}>ذخیره عبارت پایان</Btn>
      <p className="text-sm leading-normal text-muted">
        مرورگر نمی‌تواند مثل FLAG_SECURE اندروید عکس صفحه را مطمئن ببندد. از پرونده عکس نگیرید. پشتیبان ابری مرورگر را برای این سایت خاموش کنید.
      </p>
      {active ? (
        <Btn tone="danger" onClick={() => setPinOpen("delete")}>
          <Trash2 className="size-4" aria-hidden /> حذف پرونده باز
        </Btn>
      ) : null}
      <Btn tone="danger" onClick={() => setPinOpen("wipe")}>
        پاک کردن همه پرونده‌های این دستگاه
      </Btn>
      {pinOpen ? (
        <PinDialog
          title="تأیید با رمز"
          pinRecord={state.pin}
          onClose={() => setPinOpen(null)}
          onSuccess={() => {
            if (pinOpen === "wipe") void wipeAll();
            if (pinOpen === "delete") void removeActive();
            if (pinOpen === "phrase") patchSettings({ endPhrase: phrase });
            setPinOpen(null);
          }}
        />
      ) : null}
    </div>
  );
}

function MethodScreen() {
  return (
    <div className="no-print flex flex-col gap-3 py-4 text-sm leading-normal">
      <h1 className="text-xl font-medium">راهنمای سریع نسخه ۴</h1>
      <Panel>
        <h2 className="font-medium">مصاحبه خودکار</h2>
        <ol className="mt-2 list-decimal pe-4">
          <li>پرونده را بسازید و رضایت ضبط را ثبت کنید.</li>
          <li>در تنظیمات، کلید API سرویس Groq را وارد و فقط تا بسته‌شدن برنامه ذخیره کنید.</li>
          <li>در صفحه آمادگی، رضایت ارسال صوت و متن برای پردازش ابری همین پرونده را فعال کنید.</li>
          <li>ضبط را شروع کنید؛ هنگام پایان، صوت ابتدا در گوشی ذخیره می‌شود. سپس گفتار به متن، پیشنهاد نقش گوینده و پیشنهاد اتصال متن به سؤال‌ها خودکار اجرا می‌شوند.</li>
        </ol>
      </Panel>
      <Panel>
        <h2 className="font-medium">محدودیت مهم</h2>
        <p className="mt-1">کلید API لازم است؛ داخل APK یا پرونده ذخیره نمی‌شود. بدون کلید یا رضایت ابری، صوت فقط محلی نگهداری می‌شود. فایل‌های بیشتر از ۲۵ مگابایت با مسیر فعلی تبدیل ابری پردازش نمی‌شوند.</p>
        <p className="mt-1">مدل گفتار و مدل زبانی گوینده را قطعی تشخیص نمی‌دهند. همه متن‌ها و نقش‌ها را بازبینی کنید؛ هیچ امتیاز رسمی یا تصمیم ارجاع خودکار تغییر نمی‌کند. دسترسی سرویس، هزینه و سهمیه از ایران تضمین‌شده نیست.</p>
      </Panel>
      <Panel>
        <h2 className="font-medium">حریم خصوصی</h2>
        <p className="mt-1">صوت فقط پس از رضایت صریح پرونده ارسال می‌شود. برای اطلاعات واقعی مددجو، مجوز سازمان و سیاست نگهداری سرویس را بررسی کنید. گزینه ورود با اثر انگشت و تأیید کارشناس دوم در این نسخه حذف شده‌اند.</p>
      </Panel>
    </div>
  );
}

function NeedCase() {
  const { go } = useInterview();
  return (
    <div className="py-6">
      <Banner>اول یک پرونده را از میز کار باز کنید.</Banner>
      <Btn className="mt-3" tone="primary" onClick={() => go("home")}>
        بازگشت به میز
      </Btn>
    </div>
  );
}

function Dialog({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-ink/40 p-4 sm:items-center" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-lg bg-surface p-3">
        <h2 className="mb-2 text-lg font-medium">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function PinDialog({
  title,
  onClose,
  onSuccess,
  pinRecord,
}: {
  title: string;
  onClose: () => void;
  onSuccess: () => void;
  pinRecord: AppPin;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [tries, setTries] = useState(0);
  const { lock } = useInterview();
  return (
    <Dialog title={title}>
      <PinPad value={pin} onChange={setPin} />
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Btn onClick={onClose}>انصراف</Btn>
        <Btn
          tone="primary"
          onClick={() => {
            void (async () => {
              if (!pinRecord) return;
              const ok = await verifyPin(pin, pinRecord);
              if (!ok) {
                const next = tries + 1;
                setTries(next);
                setPin("");
                setError("رمز درست نیست.");
                if (next >= 5) lock();
                return;
              }
              onSuccess();
            })();
          }}
        >
          تأیید
        </Btn>
      </div>
    </Dialog>
  );
}

type AppPin = ReturnType<typeof useInterview>["state"]["pin"];
