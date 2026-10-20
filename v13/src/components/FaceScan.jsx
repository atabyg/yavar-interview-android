import { useEffect, useRef, useState } from "react";
import { Camera, X, ScanFace } from "lucide-react";
import QRCode from "qrcode";
import { embed, modelAvailable } from "../face-embedder";
import { findMatch, enroll, refine, qrPayload } from "../face-id";
import { toast } from "../ui";

// Props: usedNumbers[], onResult(caseNumber), onClose()
export default function FaceScan({ usedNumbers = [], onResult, onClose }) {
  const video = useRef(null), stream = useRef(null);
  const [msg, setMsg] = useState("چهره را داخل بیضی قرار دهید و ثابت نگه دارید.");
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState(null);
  const [done, setDone] = useState(null);

  useEffect(() => {
    (async () => {
      if (!(await modelAvailable())) { setMsg("مدل تشخیص چهره (face-embed.onnx) در برنامه نصب نشده است."); return; }
      try {
        stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 }, audio: false });
        video.current.srcObject = stream.current; await video.current.play();
      } catch (e) { setMsg("دسترسی دوربین داده نشد."); }
    })();
    return () => stream.current && stream.current.getTracks().forEach((t) => t.stop());
  }, []);

  function grab() { // centered square crop -> 112x112
    const v = video.current, c = document.createElement("canvas"); c.width = c.height = 112;
    const side = Math.min(v.videoWidth, v.videoHeight) * 0.7;
    c.getContext("2d").drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, 112, 112);
    return c;
  }
  async function scan() {
    setBusy(true);
    try {
      const frames = [];
      for (let i = 0; i < 5; i++) { frames.push(await embed(grab())); await new Promise((r) => setTimeout(r, 250)); }
      const m = findMatch(frames[0]);
      let caseNo;
      if (m.status === "match") { caseNo = m.caseNumber; frames.forEach((f) => refine(caseNo, f)); }
      else if (m.status === "ambiguous") { toast("چند پروندهٔ مشابه یافت شد؛ دوباره اسکن کنید یا شماره را دستی وارد کنید."); setBusy(false); return; }
      else caseNo = enroll(frames, usedNumbers);
      setQr(await QRCode.toDataURL(qrPayload(caseNo), { margin: 1, width: 220 }));
      setDone({ caseNo, isNew: m.status === "new" });
    } catch (e) { toast("اسکن چهره ناموفق بود: " + (e && e.message)); }
    setBusy(false);
  }

  return (
    <div className="card" style={{ position: "fixed", inset: 0, zIndex: 50, overflow: "auto" }}>
      <div className="row"><ScanFace size={18} /><b className="grow">شناسهٔ چهره (آفلاین)</b><button className="btn alt sm" onClick={onClose}><X size={15} /></button></div>
      {!done && <>
        <div style={{ position: "relative", marginTop: 10 }}>
          <video ref={video} playsInline muted style={{ width: "100%", borderRadius: 12, transform: "scaleX(-1)" }} />
          <div style={{ position: "absolute", inset: "12% 25%", border: "3px dashed #fff", borderRadius: "50%" }} />
        </div>
        <div className="mut" style={{ margin: "8px 0" }}>{msg}</div>
        <button className="btn" disabled={busy} onClick={scan}><Camera size={18} /> {busy ? "در حال پردازش…" : "اسکن چهره"}</button>
        <div className="mut" style={{ marginTop: 8, fontSize: 12 }}>تصویر ذخیره نمی‌شود؛ فقط یک بردار عددی محلی روی همین گوشی نگه‌داری می‌شود.</div>
      </>}
      {done && <div style={{ textAlign: "center", marginTop: 12 }}>
        <div className="mut">{done.isNew ? "پروندهٔ جدید ساخته شد" : "پروندهٔ قبلی شناسایی شد"}</div>
        <div className="timer en">{done.caseNo}</div>
        <img src={qr} alt="QR" />
        <button className="btn" style={{ marginTop: 10 }} onClick={() => onResult(done.caseNo)}>استفاده از این شماره</button>
      </div>}
    </div>
  );
}
