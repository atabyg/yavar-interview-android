import { useEffect, useRef, useState } from "react";
import { X, ScanFace } from "lucide-react";
import QRCode from "qrcode";
import { embed, modelAvailable } from "../face-embedder";
import { detector, detect, alignedCrop, sharpness } from "../face-detect";
import { findMatch, enroll, refine, qrPayload, loadFaces } from "../face-id";
import { toast } from "../ui";

const STABLE_FRAMES = 6, MIN_SHARP = 60, SHOTS = 5;

// Fully automatic: front camera opens, face is checked against the circle, scan runs by itself,
// result shows ~2.5 s, then the screen closes and onResult(caseNumber) is called. No buttons needed.
export default function FaceScan({ usedNumbers = [], onResult, onClose }) {
  const video = useRef(null), stream = useRef(null), alive = useRef(true);
  const [msg, setMsg] = useState("در حال آماده‌سازی دوربین…");
  const [ok, setOk] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    alive.current = true;
    (async () => {
      try {
        if (!(await modelAvailable())) { setMsg("مدل تشخیص چهره (face-embed.onnx) در برنامه نصب نشده است."); return; }
        await detector();
        stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 }, audio: false });
        video.current.srcObject = stream.current; await video.current.play();
        loop();
      } catch (e) { setMsg(e && e.name === "NotAllowedError" ? "دسترسی دوربین داده نشد؛ از تنظیمات گوشی اجازه دهید." : "شروع دوربین یا مدل ممکن نشد."); }
    })();
    return () => { alive.current = false; stream.current && stream.current.getTracks().forEach((t) => t.stop()); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // returns {crop} when the face is well placed, sharp enough, else {hint}
  function check() {
    const v = video.current;
    const f = detect(v, performance.now());
    if (!f) return { hint: "چهره پیدا نشد؛ فقط یک چهره مقابل دوربین باشد." };
    if (Math.abs(f.cx - 0.5) > 0.1 || Math.abs(f.cy - 0.5) > 0.12) return { hint: "چهره را وسط دایره ببرید." };
    if (f.w < 0.28) return { hint: "کمی نزدیک‌تر شوید." };
    if (f.w > 0.55) return { hint: "کمی دورتر شوید." };
    const crop = alignedCrop(v, f);
    if (sharpness(crop) < MIN_SHARP) return { hint: "تصویر تار یا تاریک است؛ نور را بیشتر کنید و ثابت بمانید." };
    return { crop };
  }

  async function loop() {
    let stable = 0;
    while (alive.current) {
      const r = check();
      setOk(!!r.crop);
      if (!r.crop) { stable = 0; setMsg(r.hint); await new Promise((x) => setTimeout(x, 120)); continue; }
      setMsg("ثابت بمانید…");
      if (++stable < STABLE_FRAMES) { await new Promise((x) => setTimeout(x, 100)); continue; }
      const shots = [];
      while (shots.length < SHOTS && alive.current) {
        const s = check();
        if (!s.crop) break;
        shots.push(await embed(s.crop));
        await new Promise((x) => setTimeout(x, 150));
      }
      if (shots.length < SHOTS) { stable = 0; continue; }
      await finish(shots);
      return;
    }
  }

  async function finish(shots) {
    const faces = await loadFaces();
    const m = findMatch(shots[0], faces);
    if (m.status === "ambiguous") { toast("چند پروندهٔ بسیار مشابه یافت شد؛ شمارهٔ پرونده را دستی وارد کنید."); onClose(); return; }
    let caseNo;
    if (m.status === "match") { caseNo = m.caseNumber; await refine(caseNo, shots); }
    else caseNo = await enroll(shots, usedNumbers);
    const qr = await QRCode.toDataURL(qrPayload(caseNo), { margin: 1, width: 220 });
    setDone({ caseNo, qr, isNew: m.status === "new" });
    stream.current && stream.current.getTracks().forEach((t) => t.stop());
    setTimeout(() => alive.current && onResult(caseNo), 2500);
  }

  return (
    <div className="card" style={{ position: "fixed", inset: 0, zIndex: 50, overflow: "auto" }}>
      <div className="row"><ScanFace size={18} /><b className="grow">ثبت چهره (آفلاین)</b><button className="btn alt sm" onClick={onClose}><X size={15} /></button></div>
      {!done && <>
        <div style={{ position: "relative", marginTop: 10 }}>
          <video ref={video} playsInline muted style={{ width: "100%", borderRadius: 12, transform: "scaleX(-1)" }} />
          <div style={{ position: "absolute", inset: "12% 25%", border: "4px solid " + (ok ? "#2ecc71" : "#fff"), borderRadius: "50%" }} />
        </div>
        <div className="mut" style={{ margin: "8px 0" }}>{msg}</div>
        <div className="mut" style={{ fontSize: 12 }}>تصویر ذخیره نمی‌شود؛ فقط بردار عددی رمزنگاری‌شده روی همین گوشی نگه‌داری می‌شود.</div>
      </>}
      {done && <div style={{ textAlign: "center", marginTop: 12 }}>
        <div className="mut">{done.isNew ? "پروندهٔ جدید ساخته شد" : "پروندهٔ قبلی شناسایی شد"}</div>
        <div className="timer en">{done.caseNo}</div>
        <img src={done.qr} alt="QR" />
      </div>}
    </div>
  );
}
