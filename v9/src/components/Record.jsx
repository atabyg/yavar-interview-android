import { useEffect, useRef, useState } from "react";
import { Mic, Square, Pause, Play, AlertTriangle, ListChecks, AudioLines } from "lucide-react";
import { Recorder, pickMime } from "../recorder";
import { finalizeAudio, patchInterview, saveInterview, deleteInterview, uid } from "../db";
import { getSettings, saveSettings, analysisKey } from "../settings";
import { processInterview } from "../pipeline";
import { fmtDur } from "../export";
import { toast } from "../ui";
import { OfflineSpeech } from "../native-bridge";
import { QUESTION_SETS, questionSetFor } from "../questions";

export default function Record({ folders, onOpen }) {
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
  const [folderId, setFolderId] = useState(getSettings().lastFolder);
  const [questionSet, setQuestionSet] = useState(getSettings().questionSet || "critical12");
  const [busy, setBusy] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [partial, setPartial] = useState("");
  const [speechStatus, setSpeechStatus] = useState("");
  const [speechError, setSpeechError] = useState("");

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
  function appendFinal(value) {
    const text = String(value || "").trim();
    if (!text) return;
    const next = (transcriptRef.current ? transcriptRef.current + "\n" : "") + text;
    transcriptRef.current = next;
    partialRef.current = "";
    setTranscript(next);
    setPartial("");
    const id = idRef.current;
    if (id) patchInterview(id, { transcript: next }, true).catch(() => {});
  }
  async function startSpeech(id) {
    if (getSettings().transcribeProvider !== "offline") {
      if (speechStartedRef.current) await stopSpeech();
      setSpeechStatus("پس از پایان ضبط، تبدیل صوت با سرویس ابری انتخاب‌شده انجام می‌شود.");
      return;
    }
    try {
      const info = await OfflineSpeech.isAvailable();
      if (!info || !info.available) throw new Error("offline_unavailable");
      await removeSpeechListeners();
      listenersRef.current = [
        await OfflineSpeech.addListener("partialResult", (ev) => {
          const t = String(ev && ev.text || "").trim();
          partialRef.current = t; setPartial(t);
          setSpeechStatus("در حال شنیدن گفت‌وگو؛ متن موقت پایین نمایش داده می‌شود.");
        }),
        await OfflineSpeech.addListener("finalResult", (ev) => appendFinal(ev && ev.text)),
        await OfflineSpeech.addListener("speechError", (ev) => {
          const message = String(ev && ev.message || "");
          setSpeechError(message || "تشخیص گفتار متوقف شد؛ ضبط صوت ادامه دارد.");
          setSpeechStatus("تشخیص گفتار نیازمند بررسی است.");
        })
      ];
      await OfflineSpeech.start({ language: "fa-IR" });
      speechStartedRef.current = true;
      setSpeechError("");
      setSpeechStatus(info.onDevice ? "تشخیص گفتار روی دستگاه (آفلاین)" : "ترجیح آفلاین؛ وابسته به موتور گفتار نصب‌شده روی گوشی");
    } catch (e) {
      await removeSpeechListeners();
      setSpeechError("تشخیص آفلاین فارسی روی این گوشی فعال نشد. صدای ضبط‌شده همچنان ذخیره می‌شود؛ در صورت نیاز، ارائه‌دهندهٔ صوت ابری را در تنظیمات انتخاب کنید.");
      setSpeechStatus("تشخیص گفتار فعال نیست");
    }
  }
  async function stopSpeech() {
    if (!speechStartedRef.current) return;
    try { await OfflineSpeech.stop(); } catch (e) {}
    // Let a final-result event arrive before releasing listeners and persisting the transcript.
    await new Promise((resolve) => setTimeout(resolve, 450));
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
    setBusy(true);
    const id = uid();
    const mime = pickMime();
    const s = getSettings();
    const qs = questionSetFor(questionSet);
    transcriptRef.current = ""; partialRef.current = "";
    setTranscript(""); setPartial(""); setSpeechError(""); setSpeechStatus("");
    try {
      await saveInterview({
        id,
        title: "مصاحبه " + new Date().toLocaleDateString("fa-IR-u-ca-persian") + " " + new Date().toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" }),
        candidate: candidate.trim(), position: position.trim(), interviewer: s.interviewer, folderId,
        createdAt: Date.now(), durationSec: 0, status: "recording", starred: false, segs: 0,
        mime: mime || "audio/webm", sizeBytes: 0, transcript: "",
        questionSet: qs.id, questionSetLabel: qs.label
      });
      rec.current = new Recorder();
      idRef.current = id;
      await rec.current.start(id, mime, setSt);
      await saveSettings({ lastFolder: folderId, questionSet });
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
    rec.current = null;
    const finalTranscript = transcriptRef.current.trim();
    if (dur < 2) {
      await deleteInterview(id);
      toast("ضبط خیلی کوتاه بود و حذف شد.");
    } else {
      await patchInterview(id, {
        durationSec: dur, transcript: finalTranscript, status: "recorded",
        questionSet, questionSetLabel: questionSetFor(questionSet).label
      });
      await finalizeAudio(id);
      await patchInterview(id, { status: "recorded" });
      setCandidate(""); setPosition("");
      const s = getSettings();
      if (s.autoProcess && analysisKey(s) && (finalTranscript.length > 20 || s.transcribeProvider !== "offline")) processInterview(id);
      onOpen(id);
    }
    idRef.current = "";
    setSec(0); setBars(Array(24).fill(4)); setBusy(false);
  }

  const active = st === "recording" || st === "paused" || st === "interrupted";
  const qs = questionSetFor(questionSet);
  const visibleTranscript = [transcript, partial].filter(Boolean).join("\n");
  return (
    <div>
      {!active && <div className="card">
        <div className="row" style={{ marginBottom: 8 }}><ListChecks size={17} /><b>نوع پرسش‌نامهٔ مصاحبه</b></div>
        <select className="inp" value={questionSet} onChange={(e) => { setQuestionSet(e.target.value); saveSettings({ questionSet: e.target.value }); }}>
          {Object.values(QUESTION_SETS).map((q) => <option value={q.id} key={q.id}>{q.label}</option>)}
        </select>
        <div className="mut" style={{ marginTop: 7 }}>{qs.description}؛ پرسش‌ها برای راهنمای مصاحبه و تحلیل مستند استفاده می‌شوند.</div>
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer", color: "var(--teal)", fontSize: 13 }}>نمایش پرسش‌های این مجموعه ({qs.questions.length})</summary>
          <ol style={{ paddingRight: 22, fontSize: 13, lineHeight: 1.9 }}>{qs.questions.map((q, i) => <li key={i}>{q}</li>)}</ol>
        </details>
      </div>}
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
        <div className="mut" style={{ marginBottom: 8 }}>اطلاعات اختیاری (بعداً هم قابل ویرایش است)</div>
        <input className="inp" placeholder="نام متقاضی" value={candidate} onChange={(e) => setCandidate(e.target.value)} />
        <input className="inp" style={{ marginTop: 8 }} placeholder="سمت" value={position} onChange={(e) => setPosition(e.target.value)} />
        {folders.length > 0 && <div className="chips" style={{ marginTop: 10, marginBottom: 0 }}>
          <button className={"chip " + (!folderId ? "on" : "")} onClick={() => setFolderId(null)}>بدون پوشه</button>
          {folders.map((f) => <button key={f.id} className={"chip " + (folderId === f.id ? "on" : "")} onClick={() => setFolderId(f.id)}>{f.name}</button>)}
        </div>}
      </div>}

      {(active || transcript || speechError) && <div className="card">
        <div className="row" style={{ marginBottom: 8 }}><AudioLines size={17} /><b className="grow">متن زندهٔ گفت‌وگو</b><span className="mut">{transcript.trim() ? transcript.trim().split(/\s+/).length + " واژه" : "در انتظار گفتار"}</span></div>
        <textarea className="inp tx" rows={7} readOnly value={visibleTranscript} placeholder={getSettings().transcribeProvider === "offline" ? "پس از شروع ضبط، موتور گفتار گوشی متن را اینجا می‌نویسد…" : "تبدیل ابری پس از پایان ضبط و شروع پردازش انجام می‌شود."} style={{ minHeight: 140, maxHeight: 260, resize: "vertical" }} />
        {partial && <div className="mut" style={{ marginTop: 5 }}>جملهٔ در حال تشخیص، هنوز قطعی نیست.</div>}
        {active && <div className="mut" style={{ marginTop: 6, lineHeight: 1.8 }}>متن تشخیص‌داده‌شده روی دستگاه ذخیره می‌شود. در سکوت، لهجه یا نویز شدید ممکن است خطا رخ دهد؛ متن نهایی را پیش از تحلیل بازبینی کنید.</div>}
      </div>}

      {!analysisKey() && !active && <div className="card mut" style={{ lineHeight: 1.9 }}>
        برای امتیازدهی خودکار، در «تنظیمات» یک سرویس تحلیل و کلید آن را انتخاب کنید. ضبط و در صورت پشتیبانی گوشی، تبدیل گفتار آفلاین بدون کلید هم کار می‌کند.
      </div>}
    </div>
  );
}
