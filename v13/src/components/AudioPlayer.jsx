import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { blobToWav } from "../audio-utils";
import { fmtDur } from "../export";

const SEG_SEC = 600; // the recorder cuts a new segment every 10 minutes
const RATES = [1, 1.25, 1.5, 2, 0.75];

// MediaRecorder WebM has no duration/cue data, so the WebView reports Infinity and refuses to seek.
// Seeking far past the end forces the engine to scan the file and learn the real duration.
function settle(a) {
  return new Promise((resolve) => {
    if (Number.isFinite(a.duration) && a.duration > 0) { resolve(a.duration); return; }
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      a.removeEventListener("timeupdate", onTime);
      const d = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : 0;
      try { a.currentTime = 0; } catch (e) { /* ignore */ }
      resolve(d);
    };
    const onTime = () => { if (Number.isFinite(a.duration) && a.duration > 0) finish(); };
    a.addEventListener("timeupdate", onTime);
    try { a.currentTime = 1e9; } catch (e) { finish(); return; }
    setTimeout(finish, 2500);
  });
}

export default function AudioPlayer({ segs, totalSec }) {
  const audioRef = useRef(null);
  const urlsRef = useRef([]);
  const extraRef = useRef([]);
  const wavTried = useRef({});
  const pendingSeek = useRef(null);
  const wantPlay = useRef(false);
  const [idx, setIdx] = useState(0);
  const [src, setSrc] = useState("");
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [durs, setDurs] = useState([]);
  const [rate, setRate] = useState(1);
  const [note, setNote] = useState("");

  useEffect(() => {
    urlsRef.current = segs.map((b) => URL.createObjectURL(b));
    wavTried.current = {};
    pendingSeek.current = null;
    wantPlay.current = false;
    setDurs([]); setIdx(0); setPos(0); setPlaying(false);
    setSrc(urlsRef.current[0] || "");
    return () => {
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      extraRef.current.forEach((u) => URL.revokeObjectURL(u));
      urlsRef.current = []; extraRef.current = [];
    };
  }, [segs]);

  const n = segs.length;
  const segDur = (i) => (durs[i] > 0 ? durs[i] : i < n - 1 ? SEG_SEC : Math.max(1, (totalSec || 0) - SEG_SEC * (n - 1)));
  const offset = (i) => { let s = 0; for (let k = 0; k < i; k++) s += segDur(k); return s; };
  const total = offset(n);

  async function onMeta() {
    const a = audioRef.current;
    if (!a) return;
    let d = a.duration;
    if (!Number.isFinite(d) || d <= 0) d = await settle(a);
    if ((!Number.isFinite(d) || d <= 0) && !wavTried.current[idx]) {
      wavTried.current[idx] = true;
      try {
        setNote("در حال آماده‌سازی صدا برای پرش به نقطهٔ دلخواه…");
        const wav = await blobToWav(segs[idx], 22050);
        const u = URL.createObjectURL(wav);
        extraRef.current.push(u);
        urlsRef.current[idx] = u;
        setSrc(u);
        return;
      } catch (e) { setNote("پرش در این فایل ممکن نشد؛ پخش عادی ادامه دارد."); }
    }
    setNote("");
    if (Number.isFinite(d) && d > 0) setDurs((old) => { const c = [...old]; c[idx] = d; return c; });
    if (pendingSeek.current !== null) {
      const max = Number.isFinite(d) && d > 0 ? Math.max(0, d - 0.05) : pendingSeek.current;
      try { a.currentTime = Math.min(pendingSeek.current, max); } catch (e) { /* ignore */ }
      pendingSeek.current = null;
    }
    a.playbackRate = rate;
    if (wantPlay.current) a.play().catch(() => {});
  }

  function onTime() {
    const a = audioRef.current;
    if (a) setPos(offset(idx) + (a.currentTime || 0));
  }

  function goto(i, within) {
    wantPlay.current = playing || wantPlay.current;
    pendingSeek.current = within;
    setIdx(i);
    setSrc(urlsRef.current[i] || "");
  }

  function seekTo(g) {
    const a = audioRef.current;
    if (!a) return;
    g = Math.max(0, Math.min(total, g));
    let i = 0;
    while (i < n - 1 && g >= offset(i) + segDur(i)) i++;
    const within = g - offset(i);
    if (i === idx) { try { a.currentTime = within; } catch (e) { /* ignore */ } }
    else goto(i, within);
    setPos(g);
  }

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) { wantPlay.current = true; a.play().catch(() => {}); } else { wantPlay.current = false; a.pause(); }
  }

  function onEnded() {
    if (idx < n - 1) { wantPlay.current = true; pendingSeek.current = 0; setIdx(idx + 1); setSrc(urlsRef.current[idx + 1] || ""); }
    else { wantPlay.current = false; setPlaying(false); }
  }

  function cycleRate() {
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }

  return (
    <div>
      <audio ref={audioRef} src={src} preload="metadata" onLoadedMetadata={onMeta} onTimeUpdate={onTime} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={onEnded} />
      <input type="range" min={0} max={Math.max(1, Math.floor(total))} step={1} value={Math.min(Math.floor(pos), Math.max(1, Math.floor(total)))} onChange={(e) => seekTo(Number(e.target.value))} style={{ width: "100%", direction: "ltr" }} aria-label="موقعیت پخش" />
      <div className="row" style={{ justifyContent: "space-between", direction: "ltr" }}>
        <span className="mut">{fmtDur(pos)}</span>
        <span className="mut">{fmtDur(total)}</span>
      </div>
      <div className="row" style={{ justifyContent: "center", gap: 10, marginTop: 6 }}>
        <button className="btn alt sm" onClick={() => seekTo(pos - 10)} aria-label="۱۰ ثانیه عقب"><RotateCcw size={16} /> ۱۰</button>
        <button className="btn" onClick={toggle} aria-label={playing ? "توقف" : "پخش"}>{playing ? <Pause size={20} /> : <Play size={20} />}</button>
        <button className="btn alt sm" onClick={() => seekTo(pos + 10)} aria-label="۱۰ ثانیه جلو">۱۰ <RotateCw size={16} /></button>
        <button className="btn line sm" onClick={cycleRate} aria-label="سرعت پخش">{rate}×</button>
      </div>
      {n > 1 && <div className="mut" style={{ textAlign: "center", marginTop: 4 }}>بخش {idx + 1} از {n}؛ نوار بالا کل ضبط را پوشش می‌دهد.</div>}
      {note && <div className="mut" style={{ textAlign: "center", marginTop: 4 }}>{note}</div>}
    </div>
  );
}
