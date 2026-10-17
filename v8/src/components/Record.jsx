import { useEffect, useRef, useState } from "react";
import { Mic, Square, Pause, Play, AlertTriangle } from "lucide-react";
import { Recorder, pickMime } from "../recorder";
import { finalizeAudio, patchInterview, saveInterview, deleteInterview, uid } from "../db";
import { getSettings, saveSettings } from "../settings";
import { processInterview } from "../pipeline";
import { fmtDur } from "../export";
import { toast } from "../ui";

export default function Record({ folders, onOpen }) {
  const rec = useRef(null);
  const idRef = useRef("");
  const [st, setSt] = useState("idle");
  const [sec, setSec] = useState(0);
  const [bars, setBars] = useState(Array(24).fill(4));
  const [candidate, setCandidate] = useState("");
  const [position, setPosition] = useState("");
  const [folderId, setFolderId] = useState(getSettings().lastFolder);
  const [busy, setBusy] = useState(false);

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

  async function start() {
    if (busy) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === "undefined") { toast("این دستگاه از ضبط صدا پشتیبانی نمی‌کند."); return; }
    setBusy(true);
    const id = uid();
    const mime = pickMime();
    const s = getSettings();
    try {
      await saveInterview({
        id, title: "مصاحبه " + new Date().toLocaleDateString("fa-IR") + " " + new Date().toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" }),
        candidate: candidate.trim(), position: position.trim(), interviewer: s.interviewer, folderId, createdAt: Date.now(), durationSec: 0,
        status: "recording", starred: false, segs: 0, mime: mime || "audio/webm", sizeBytes: 0,
      });
      rec.current = new Recorder();
      idRef.current = id;
      await rec.current.start(id, mime, setSt);
      saveSettings({ lastFolder: folderId });
    } catch (e) {
      await deleteInterview(id);
      rec.current = null;
      toast(e && e.name === "NotAllowedError" ? "دسترسی میکروفن داده نشد. از تنظیمات گوشی اجازه دهید." : "شروع ضبط ممکن نشد.");
    }
    setBusy(false);
  }

  async function stop() {
    const r = rec.current, id = idRef.current;
    if (!r || busy) return;
    setBusy(true);
    const dur = await r.stop();
    rec.current = null;
    if (dur < 2) { await deleteInterview(id); toast("ضبط خیلی کوتاه بود و حذف شد."); }
    else {
      await patchInterview(id, { durationSec: dur });
      await finalizeAudio(id);
      await patchInterview(id, { status: "recorded" });
      setCandidate(""); setPosition("");
      if (getSettings().autoProcess && getSettings().apiKey) processInterview(id);
      onOpen(id);
    }
    setSec(0); setBars(Array(24).fill(4)); setBusy(false);
  }

  const active = st === "recording" || st === "paused" || st === "interrupted";
  return (
    <div>
      <div className="card hero">
        <div className="timer">{fmtDur(sec)}</div>
        <div className="mut">{st === "recording" ? "در حال ضبط…" : st === "paused" ? "متوقف شده" : st === "interrupted" ? "ضبط قطع شد" : "آمادهٔ ضبط"}</div>
        <button className={"mic " + (st === "recording" ? "rec" : "")} onClick={active ? stop : start} disabled={busy} aria-label="ضبط">
          {active ? <Square size={48} fill="#fff" /> : <Mic size={58} />}
        </button>
        <div className="wave">{bars.map((h, i) => <i key={i} style={{ height: h }} />)}</div>
        {active && st !== "interrupted" && (
          <button className="btn alt" style={{ marginTop: 10 }} onClick={() => (st === "paused" ? rec.current.resume() : rec.current.pause())}>
            {st === "paused" ? <><Play size={18} /> ادامه</> : <><Pause size={18} /> توقف موقت</>}
          </button>
        )}
        {st === "interrupted" && (
          <div style={{ marginTop: 10 }}>
            <div className="row" style={{ justifyContent: "center", color: "var(--terra)", fontSize: 13 }}><AlertTriangle size={16} /> تا اینجا ذخیره شده است</div>
            <button className="btn gold" style={{ marginTop: 8 }} onClick={() => rec.current.resumeAfterInterrupt()}>ادامهٔ ضبط</button>
          </div>
        )}
      </div>

      {!active && (
        <div className="card">
          <div className="mut" style={{ marginBottom: 8 }}>اطلاعات اختیاری (بعداً هم قابل ویرایش است)</div>
          <input className="inp" placeholder="نام متقاضی" value={candidate} onChange={(e) => setCandidate(e.target.value)} />
          <input className="inp" style={{ marginTop: 8 }} placeholder="سمت" value={position} onChange={(e) => setPosition(e.target.value)} />
          {folders.length > 0 && (
            <div className="chips" style={{ marginTop: 10, marginBottom: 0 }}>
              <button className={"chip " + (!folderId ? "on" : "")} onClick={() => setFolderId(null)}>بدون پوشه</button>
              {folders.map((f) => <button key={f.id} className={"chip " + (folderId === f.id ? "on" : "")} onClick={() => setFolderId(f.id)}>{f.name}</button>)}
            </div>
          )}
        </div>
      )}
      {!getSettings().apiKey && !active && <div className="card mut" style={{ lineHeight: 1.9 }}>برای تبدیل خودکار به متن و تحلیل، کلید OpenAI را یک‌بار در «تنظیمات» وارد کنید. ضبط بدون کلید هم ذخیره می‌شود.</div>}
    </div>
  );
}
