import { useEffect, useRef, useState } from "react";
import { Mic, Square, Pause, Play, AlertTriangle, ListChecks, AudioLines, RefreshCw } from "lucide-react";
import { Recorder, pickMime } from "../recorder";
import { finalizeAudio, patchInterview, saveInterview, deleteInterview, uid } from "../db";
import { getSettings, saveSettings, analysisKey } from "../settings";
import { processInterview } from "../pipeline";
import { fmtDur } from "../export";
import { toast } from "../ui";
import { OfflineSpeech } from "../native-bridge";
import { QUESTION_SETS, questionSetFor } from "../questions";
import { newCaseNumber, dayKey, timeLabel } from "../daily";

export default function Record({ folders, items = [], onOpen }) {
  const rec = useRef(null);
  const idRef = useRef("");
  const transcriptRef = useRef("");
  const partialRef = useRef("");
  const listenersRef = useRef([]);
  const speechStartedRef = useRef(false);
  const [st, setSt] = useState("idle");
  const [sec, setSec] = useState(0);
  const [bars, setBars] = useState(Array(24).fill(4));
  const [candidate, setCandidate] = useState("");
  const [position, setPosition] = useState("");
  const [caseNumber, setCaseNumber] = useState("");
  const [folderId, setFolderId] = useState(getSettings().lastFolder);
  const [questionSet, setQuestionSet] = useState(getSettings().questionSet || "critical12");
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [partial, setPartial] = useState("");
  const [speechStatus, setSpeechStatus] = useState("");
  const [speechError, setSpeechError] = useState("");

  // Every number ever issued (stored forever) + numbers on existing records -> never repeated.
  const usedNumbers = () => [...(getSettings().usedCaseNumbers || []), ...items.map((i) => i.caseNumber).filter(Boolean)];
  const freshCase = () => { try { setCaseNumber(newCaseNumber(usedNumbers())); } catch (e) { toast(e.message); } };
  useEffect(() => { if (!caseNumber) freshCase(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setInterval(() => {
      const r = rec.current;
      if (!r) return;
      setSec(r.elapsed());
      const l = r.state === "recording" ? r.level() : 0;
      setBars((b) => [...b.slice(1), 4 + Math.round(l * 40)]);
    }, 180);
    return () => clearInterval(t);
  }, []);

  async function removeSpeechListeners() {
    const hs = listenersRef.current;
    listenersRef.current = [];
    await Promise.all(hs.map(async (h) => { try { await h.remove(); } catch (e) {} }));
  }
  async function startSpeech(id) {
    if (speechStartedRef.current) await stopSpeech();
    const provider = getSettings().transcribeProvider;
    if (provider === "offline") {
      setSpeechError("");
      setSpeechStatus("حالت کاملاً آفلاین فعال است: صوت فقط روی همین گوشی ذخیره می‌شود و بعد از پایان ضبط با مدل Whisper به متن تبدیل خواهد شد.");
      return;
    }
    setSpeechStatus("تبدیل صوت ابری پس از پایان ضبط و شروع پردازش انجام می‌شود.");
  }

  async function stopSpeech() {
    if (!speechStartedRef.current) return;
    try { await OfflineSpeech.stop(); } catch (e) {}
    await new Promise((resolve) => setTimeout(resolve, 1900));
    await removeSpeechListeners();
    speechStartedRef.current = false;
    partialRef.current = "";
    setPartial("");
  }

  async function start() {
    if (busy) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === "undefined") {
      toast("این دستگاه از ضبط صدا پشتیبانی نمی‌کند."); return;
    }
    const caseNo = caseNumber.trim();
    if (!/^\d{6}$/.test(caseNo)) { toast("شمارهٔ پرونده باید ۶ رقم باشد یا از دکمهٔ شمارهٔ جدید استفاده کنید."); return; }
    setBusy(true);
    const id = uid();
    const mime = pickMime();
    const s = getSettings();
    const qs = questionSetFor(questionSet);
    transcriptRef.current = ""; partialRef.current = "";
    setTranscript(""); setPartial(""); setSpeechError(""); setSpeechStatus("");
    setQuestionsOpen(true);
    try {
      const now = Date.now();
      await saveInterview({
        id,
        title: "مصاحبه " + dayKey(now) + " " + timeLabel(now),
        candidate: candidate.trim(), position: position.trim(), caseNumber: caseNo, interviewer: s.interviewer, folderId,
        createdAt: now, durationSec: 0, status: "recording", starred: false, segs: 0,
        mime: mime || "audio/webm", sizeBytes: 0, transcript: "",
        questionSet: qs.id, questionSetLabel: qs.label,
        speechEnhancement: s.speechEnhancement !== false,
        smartTranscriptCleanup: s.smartTranscriptCleanup !== false
      });
      rec.current = new Recorder();
      idRef.current = id;
      await rec.current.start(id, mime, setSt);
      const used = Array.from(new Set([...(s.usedCaseNumbers || []), caseNo]));
      await saveSettings({ lastFolder: folderId, questionSet, usedCaseNumbers: used });
      await startSpeech(id);
    } catch (e) {
      await deleteInterview(id);
      rec.current = null;
      idRef.current = "";
      toast(e && e.name === "NotAllowedError" ? "دسترسی میکروفن داده نشد. از تنظیمات گوشی اجازه دهید." : "شروع ضبط ممکن نشد؛ مجوز میکروفن و فضای ذخیره را بررسی کنید.");
    }
    setBusy(false);
  }

  async function togglePause() {
    const r = rec.current;
    if (!r || busy) return;
    if (st === "paused") {
      r.resume();
      if (getSettings().transcribeProvider === "offline") await startSpeech(idRef.current);
    } else if (st === "recording") {
      r.pause();
      await stopSpeech();
      setSpeechStatus("ضبط موقتاً متوقف شده است.");
    }
  }

  async function stop() {
    const r = rec.current, id = idRef.current;
    if (!r || busy) return;
    setBusy(true);
    await stopSpeech();
    const dur = await r.stop();
    const audioSaveError = r.storageError;
    rec.current = null;
    const finalTranscript = transcriptRef.current.trim();
    if (dur < 2) {
      await deleteInterview(id);
      toast("ضبط خیلی کوتاه بود و حذف شد.");
    } else {
      const s = getSettings();
      await patchInterview(id, {
        durationSec: dur, transcript: finalTranscript, status: audioSaveError ? "error" : "recorded",
        failedAt: audioSaveError ? "transcribe" : null,
        error: audioSaveError ? "ذخیرهٔ بخشی از صدای ضبط‌شده ناموفق بود؛ برای جلوگیری از گزارش ناقص، تبدیل خودکار اجرا نشد. فضای خالی و ذخیره‌سازی گوشی را بررسی کنید." : "",
        questionSet, questionSetLabel: questionSetFor(questionSet).label
      });
      await finalizeAudio(id);
      setCandidate(""); setPosition(""); setCaseNumber("");
      if (audioSaveError) {
        toast("یک یا چند بخش صوتی ذخیره نشد؛ قطعات موجود حفظ شدند، اما تبدیل خودکار اجرا نشد.");
      } else {
        // autoProcess controls analysis only; transcription must always start.
        processInterview(id, { transcribeOnly: !s.autoProcess });
      }
      onOpen(id);
    }
    idRef.current = "";
    setSec(0); setBars(Array(24).fill(4)); setBusy(false);
    setTimeout(freshCase, 400);
  }

  const active = st === "recording" || st === "paused" || st === "interrupted";
  const qs = questionSetFor(questionSet);
  const visibleTranscript = [transcript, partial].filter(Boolean).join("\n");
  return (
    <div>
      <div className="card">
        <div className="row" style={{ marginBottom: 8 }}><ListChecks size={17} /><b className="grow">{active ? "سؤالات ارجاع (هنگام ضبط)" : "انتخاب سؤالات ارجاع"}</b></div>
        {!active && <>
          <select className="inp" value={questionSet} onChange={(e) => { setQuestionSet(e.target.value); saveSettings({ questionSet: e.target.value }); }}>
            {Object.values(QUESTION_SETS).map((q) => <option value={q.id} key={q.id}>{q.label}</option>)}
          </select>
          <div className="mut" style={{ marginTop: 7 }}>{qs.description}؛ متن گفت‌وگو پس از ضبط برای استخراج پیش‌نویس فرم‌های ارجاع استفاده می‌شود.</div>
        </>}
        {active && <div className="mut" style={{ marginTop: 2 }}>{qs.label} — برای جمع‌وجور شدن صفحه، فهرست را ببندید.</div>}
        <details open={questionsOpen} onToggle={(e) => setQuestionsOpen(e.currentTarget.open)} style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer", color: "var(--teal)", fontSize: 13 }}>{questionsOpen ? "بستن فهرست سؤالات ارجاع" : "نمایش سؤالات ارجاع"}</summary>
          <ol style={{ paddingRight: 22, fontSize: 13, lineHeight: 1.9 }}>{qs.questions.map((q, i) => <li key={i}>{q}</li>)}</ol>
        </details>
      </div>
      <div className="card hero">
        <div className="timer">{fmtDur(sec)}</div>
        <div className="mut">{st === "recording" ? "در حال ضبط…" : st === "paused" ? "متوقف شده" : st === "interrupted" ? "ضبط قطع شد" : "آمادهٔ ضبط"}</div>
        <button className={"mic " + (st === "recording" ? "rec" : "")} onClick={active ? stop : start} disabled={busy} aria-label="ضبط">
          {active ? <Square size={48} fill="#fff" /> : <Mic size={58} />}
        </button>
        <div className="wave">{bars.map((h, i) => <i key={i} style={{ height: h }} />)}</div>
        {active && st !== "interrupted" && <button className="btn alt" style={{ marginTop: 10 }} onClick={togglePause} disabled={busy}>
          {st === "paused" ? <><Play size={18} /> ادامه</> : <><Pause size={18} /> توقف موقت</>}
        </button>}
        {st === "interrupted" && <div style={{ marginTop: 10 }}>
          <div className="row" style={{ justifyContent: "center", color: "var(--terra)", fontSize: 13 }}><AlertTriangle size={16} /> تا اینجا ذخیره شده است</div>
          <button className="btn gold" style={{ marginTop: 8 }} onClick={() => rec.current && rec.current.resumeAfterInterrupt()}>ادامهٔ ضبط</button>
        </div>}
        {speechStatus && <div className="mut" style={{ marginTop: 10, lineHeight: 1.8 }}><AudioLines size={14} style={{ verticalAlign: "-3px" }} /> {speechStatus}</div>}
        {speechError && <div style={{ marginTop: 7, fontSize: 12, lineHeight: 1.8, color: "var(--terra)" }}>{speechError}</div>}
      </div>

      {!active && <div className="card">
        <div className="mut" style={{ marginBottom: 8 }}>مشخصات مددجو (بعداً هم قابل ویرایش است)</div>
        <input className="inp" placeholder="نام مددجو / متقاضی" value={candidate} onChange={(e) => setCandidate(e.target.value)} />
        <div className="row" style={{ marginTop: 8 }}>
          <input className="inp en grow" inputMode="numeric" maxLength={6} placeholder="شمارهٔ پرونده (۶ رقم)" value={caseNumber} onChange={(e) => setCaseNumber(e.target.value.replace(/\D/g, "").slice(0, 6))} />
          <button className="btn alt sm" onClick={freshCase} title="شمارهٔ جدید"><RefreshCw size={15} /> شمارهٔ جدید</button>
        </div>
        <div className="mut" style={{ marginTop: 5, fontSize: 12 }}>شمارهٔ پرونده به‌صورت تصادفی و غیرتکراری ساخته می‌شود. برای جلسهٔ دوم یک مددجوی قبلی، همان شماره را دستی بنویسید.</div>
        <input className="inp" style={{ marginTop: 8 }} placeholder="عنوان شغلی یا مسئولیت فعلی مددجو (اختیاری)" value={position} onChange={(e) => setPosition(e.target.value)} />
        {folders.length > 0 && <div className="chips" style={{ marginTop: 10, marginBottom: 0 }}>
          <button className={"chip " + (!folderId ? "on" : "")} onClick={() => setFolderId(null)}>بدون پوشه</button>
          {folders.map((f) => <button key={f.id} className={"chip " + (folderId === f.id ? "on" : "")} onClick={() => setFolderId(f.id)}>{f.name}</button>)}
        </div>}
      </div>}

      {(active || transcript || speechError) && <div className="card">
        <div className="row" style={{ marginBottom: 8 }}><AudioLines size={17} /><b className="grow">{getSettings().transcribeProvider === "offline" ? "متن گفت‌وگو (پس از ضبط)" : "متن گفت‌وگو"}</b><span className="mut">{transcript.trim() ? transcript.trim().split(/\s+/).length + " واژه" : "در انتظار گفتار"}</span></div>
        <textarea className="inp tx" rows={7} readOnly value={visibleTranscript} placeholder={getSettings().transcribeProvider === "offline" ? "پس از پایان ضبط، مدل Whisper متن را به‌صورت آفلاین می‌سازد…" : "تبدیل ابری پس از پایان ضبط و شروع پردازش انجام می‌شود."} style={{ minHeight: 140, maxHeight: 260, resize: "vertical" }} />
        {active && <div className="mut" style={{ marginTop: 6, lineHeight: 1.8 }}>در حالت آفلاین، صوت تا پایان ضبط روی گوشی ذخیره می‌شود و سپس مدل Whisper آن را پردازش می‌کند. در سکوت، لهجه یا نویز شدید ممکن است خطا رخ دهد؛ متن نهایی را پیش از تحلیل بازبینی کنید.</div>}
      </div>}

      {!analysisKey() && !active && <div className="card mut" style={{ lineHeight: 1.9 }}>
        برای استخراج خودکار پیش‌نویس فرم‌های ارجاع از متن، در «تنظیمات» سرویس تحلیل و کلید آن را تنظیم کنید. ضبط و تبدیل گفتار آفلاین بدون کلید هم کار می‌کند.
      </div>}
    </div>
  );
}
