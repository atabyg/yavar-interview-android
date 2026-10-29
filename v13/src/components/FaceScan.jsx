import { useEffect, useRef, useState } from "react";
import { X, ScanFace, UserX } from "lucide-react";
import QRCode from "qrcode";
import { prepare, detectFaces, alignedCanvas, cropQuality, embedAligned, releaseEngine, FaceEngineError } from "../face-engine";
import { viewGeometry, faceFit, isStable } from "../face-math";
import { loadFaces, findMatch, chooseCaseNumber, commitFace, averageEmbeddings, qrPayload, faceCount, forgetAllFaces } from "../face-id";
import { getSettings, saveSettings } from "../settings";
import { ask, toast } from "../ui";

const STABLE_FRAMES = 3, SHOTS = 4; // fewer frames = faster on low-end phones; the shots are averaged
// Calibrated in CI on a real face photo: brightness 41..140 keeps cosine >= 0.9, 203 (clipped highlights) drops it to 0.49;
// blur above ~1.5 px (sharpness < ~20 on the 112x112 crop) drops cosine below 0.8. Re-tune on the real phone.
const MIN_BRIGHT = 55, MAX_BRIGHT = 185, MIN_SHARP = 20;
const CONFIRM_MS = { match: 4500, new: 3000 };
const SLOW_MS = 30000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Biometric consent: the client must agree before the camera opens. Asked once per app session.
let consentGiven = false;
const CONSENT_TEXT = "ثبت چهره یک داده زیست‌سنجی حساس است. پیش از ادامه، مددجو باید آگاهانه و داوطلبانه موافقت کند. تصویر ذخیره نمی‌شود؛ فقط یک بردار عددی رمزنگاری‌شده روی همین گوشی نگه داشته می‌شود و با حذف آخرین مصاحبهٔ همان پرونده یا با «حذف همهٔ داده‌های چهره» پاک می‌شود. رضایت مددجو گرفته شده است؟";

// Fully automatic: the front camera opens inside the app, the face is checked against the guide circle,
// the scan runs by itself, the result shows for a few seconds and the screen closes (onResult).
// The only buttons: close, "this is not that person", and choosing between look-alikes.
export default function FaceScan({ items = [], currentNumber = "", usedNumbers = [], onResult, onClose }) {
  const videoRef = useRef(null), streamRef = useRef(null), run = useRef(0), timer = useRef(null), qhint = useRef("");
  const live = useRef({ items, currentNumber, usedNumbers });
  live.current = { items, currentNumber, usedNumbers };
  const [phase, setPhase] = useState("loading"); // loading | scan | confirm | choose | error
  const [hint, setHint] = useState("");
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState("");
  const [pending, setPending] = useState(null);
  const [cands, setCands] = useState([]);
  const [count, setCount] = useState(0);

  const alive = (t) => run.current === t;
  const nameFor = (no) => {
    const r = live.current.items.find((i) => i.caseNumber === no && (i.candidate || "").trim());
    return r ? r.candidate.trim() : "";
  };
  function stopCamera() {
    const s = streamRef.current; streamRef.current = null;
    if (s) s.getTracks().forEach((t) => t.stop());
    const v = videoRef.current; if (v) v.srcObject = null;
  }
  function fail(e) {
    stopCamera();
    const msg = e instanceof FaceEngineError ? e.message
      : e && e.name === "CameraEnded" ? "ارتباط با دوربین قطع شد؛ بسته و دوباره امتحان کنید."
      : e && e.name === "NotAllowedError" ? "دسترسی دوربین داده نشد؛ از تنظیمات گوشی اجازهٔ دوربین را بدهید."
      : e && e.name === "NotFoundError" ? "دوربین جلوی گوشی پیدا نشد."
      : "خطا در تشخیص چهره: " + (e && e.message ? e.message : e);
    setErr(msg); setPhase("error");
  }

  useEffect(() => {
    const token = ++run.current;
    (async () => {
      if (!consentGiven) {
        const agreed = await ask(CONSENT_TEXT, "رضایت برای ثبت چهره");
        if (!alive(token)) return;
        if (!agreed) { onClose(); return; }
        consentGiven = true;
      }
      start(token);
    })();
    faceCount().then(setCount).catch(() => {});
    return () => { run.current++; clearTimeout(timer.current); stopCamera(); releaseEngine(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Android back button closes the scan instead of leaving the app (same pattern as the detail page in App.jsx)
  useEffect(() => {
    let byBack = false;
    window.history.pushState({ faceScan: 1 }, "");
    const pop = () => { byBack = true; onClose(); };
    window.addEventListener("popstate", pop);
    return () => {
      window.removeEventListener("popstate", pop);
      if (!byBack && window.history.state && window.history.state.faceScan) window.history.back();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function start(token) {
    try {
      await prepare();
      if (!alive(token)) return;
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      if (!alive(token)) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      // track.stop() does not fire "ended", so this only reacts to the camera being taken away by the system
      stream.getVideoTracks().forEach((t) => t.addEventListener("ended", () => {
        if (alive(token) && streamRef.current === stream) fail(Object.assign(new Error("camera ended"), { name: "CameraEnded" }));
      }));
      const v = videoRef.current; v.srcObject = stream; await v.play();
      setPhase("scan"); setHint("چهره را داخل دایره قرار دهید.");
      await scanLoop(token);
    } catch (e) { if (alive(token)) fail(e); }
  }

  // One detection result -> { ok, det, geo } or { ok:false, hint }
  function judge(dets, v) {
    if (!dets.length) return { ok: false, hint: "چهره‌ای دیده نمی‌شود؛ مقابل دوربین بایستید." };
    const [a, b] = dets;
    if (b && b.score >= 0.6 && b.h > 0.5 * a.h) return { ok: false, hint: "فقط یک نفر مقابل دوربین باشد." };
    const geo = viewGeometry(v.videoWidth, v.videoHeight);
    const fit = faceFit(a, geo);
    return fit.ok ? { ok: true, det: a, geo } : { ok: false, hint: fit.hint };
  }

  async function scanLoop(token) {
    let prev = null, stable = 0;
    const t0 = Date.now();
    while (alive(token)) {
      const v = videoRef.current;
      if (!v || v.readyState < 2 || !v.videoWidth) { await sleep(100); continue; }
      const j = judge(await detectFaces(v), v);
      if (!alive(token)) return;
      const slow = Date.now() - t0 > SLOW_MS ? " — اگر ادامه نیافت، پنجره را ببندید و شماره را دستی وارد کنید." : "";
      setOk(j.ok);
      if (!j.ok) { qhint.current = ""; setHint(j.hint + slow); prev = null; stable = 0; await sleep(80); continue; }
      setHint((qhint.current || "ثابت بمانید…") + slow);
      stable = isStable(prev, j.det, j.geo.D) ? stable + 1 : 1; prev = j.det;
      if (stable < STABLE_FRAMES) { await sleep(30); continue; }
      const shots = await capture(token, v);
      if (!alive(token)) return;
      if (!shots) { prev = null; stable = 0; continue; }
      qhint.current = "";
      await analyse(token, shots);
      return;
    }
  }

  async function capture(token, v) {
    const shots = []; let misses = 0;
    setHint("ثابت بمانید… در حال ثبت");
    while (shots.length < SHOTS && alive(token)) {
      const j = judge(await detectFaces(v), v);
      if (!j.ok) { if (++misses > 3) return null; continue; }
      const crop = alignedCanvas(v, j.det.lm), q = cropQuality(crop);
      if (q.bright < MIN_BRIGHT || q.bright > MAX_BRIGHT) { qhint.current = "نور مناسب نیست؛ جای روشن‌تر یا بدون نور مستقیم بایستید."; setHint(qhint.current); if (++misses > 3) return null; continue; }
      if (q.sharp < MIN_SHARP) { qhint.current = "تصویر تار است؛ گوشی را ثابت نگه دارید."; setHint(qhint.current); if (++misses > 3) return null; continue; }
      shots.push(await embedAligned(crop));
    }
    return shots.length === SHOTS ? shots : null;
  }

  async function analyse(token, shots) {
    const faces = await loadFaces();
    if (!alive(token)) return;
    const q = averageEmbeddings(shots);
    stopCamera();
    const m = findMatch(q, faces);
    if (m.status === "ambiguous") {
      setCands(m.candidates.map((c) => ({ ...c, name: nameFor(c.caseNumber) })));
      setPending({ q, faces }); setPhase("choose"); return;
    }
    if (m.status === "match") { await decide({ kind: "match", caseNo: m.caseNumber, q }); return; }
    await decide({ kind: "new", ...planNew(faces, q, true) });
  }

  // A new face gets the number already typed in the form when it is free (links an existing case), else a fresh one.
  function planNew(faces, q, usePreferred) {
    const { currentNumber: cur, usedNumbers: used, items: list } = live.current;
    const caseNo = chooseCaseNumber(usePreferred ? cur : "", faces, used);
    return { caseNo, q, linked: usePreferred && caseNo === cur && list.some((i) => i.caseNumber === caseNo) };
  }

  async function decide(p) {
    let qr = "";
    try { qr = await QRCode.toDataURL(qrPayload(p.caseNo), { margin: 1, width: 200 }); } catch (e) { /* QR is optional */ }
    const full = { ...p, qr, name: nameFor(p.caseNo) }, token = run.current;
    setPending(full); setPhase("confirm");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { if (alive(token)) commit(full); }, CONFIRM_MS[p.kind]);
  }

  async function commit(p) {
    try {
      await commitFace(p.caseNo, p.q);
      const used = Array.from(new Set([...(getSettings().usedCaseNumbers || []), p.caseNo]));
      await saveSettings({ usedCaseNumbers: used });
    } catch (e) {
      toast("ذخیرهٔ داده چهره ناموفق بود: " + (e && e.message ? e.message : e));
      onClose(); return;
    }
    onResult(p.caseNo, p.name || nameFor(p.caseNo));
  }

  async function reject() { // "this is not that person" -> brand-new case with a fresh number
    clearTimeout(timer.current);
    const faces = await loadFaces();
    await decide({ kind: "new", ...planNew(faces, pending.q, false) });
  }
  async function pick(caseNo) { await decide({ kind: "match", caseNo, q: pending.q }); }
  async function pickNone() { await decide({ kind: "new", ...planNew(pending.faces, pending.q, false) }); }
  async function wipe() {
    if (!window.confirm("همهٔ داده‌های چهرهٔ ذخیره‌شده روی این گوشی حذف شود؟ پرونده‌ها و شماره‌ها حذف نمی‌شوند.")) return;
    await forgetAllFaces(); setCount(0); toast("داده‌های چهره حذف شد.");
  }

  const camera = phase === "loading" || phase === "scan";
  return (
    <div className="card" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 50, overflow: "auto", borderRadius: 0, margin: 0, paddingTop: "calc(var(--st) + 14px)", paddingBottom: "calc(var(--sb) + 14px)" }}>
      <style>{"@keyframes yvbar{from{width:100%}to{width:0}}"}</style>
      <div className="row"><ScanFace size={18} /><b className="grow">ثبت چهره (آفلاین)</b><button className="btn alt sm" onClick={onClose} aria-label="بستن"><X size={15} /></button></div>

      {camera && <>
        <div style={{ position: "relative", width: "100%", paddingTop: "133.33%", marginTop: 10, borderRadius: 16, overflow: "hidden", background: "#000" }}>
          <video ref={videoRef} playsInline muted style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
          <div style={{ position: "absolute", left: "15%", width: "70%", top: "23.75%", height: "52.5%", borderRadius: "50%", border: "4px solid " + (ok ? "#2ecc71" : "#fff"), boxShadow: "0 0 0 999px rgba(0,0,0,.5)", transition: "border-color .2s" }} />
          {phase === "loading" && <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", textAlign: "center", padding: 20 }}>در حال آماده‌سازی دوربین و مدل چهره…</div>}
        </div>
        <div className="mut" style={{ margin: "10px 0", minHeight: 24, textAlign: "center" }}>{hint}</div>
        <div className="mut" style={{ fontSize: 12, lineHeight: 1.8 }}>همه‌چیز روی همین گوشی انجام می‌شود. تصویر ذخیره نمی‌شود و فقط بردار عددی رمزنگاری‌شده نگه داشته می‌شود.</div>
      </>}

      {phase === "error" && <div style={{ marginTop: 16, lineHeight: 1.9 }}>
        <div style={{ color: "var(--terra)" }}>{err}</div>
        <div className="mut" style={{ marginTop: 8 }}>می‌توانید شمارهٔ پرونده را دستی وارد کنید یا دکمهٔ «شمارهٔ جدید» را بزنید.</div>
        <button className="btn alt" style={{ marginTop: 12 }} onClick={onClose}>بستن</button>
      </div>}

      {phase === "choose" && <div style={{ marginTop: 16 }}>
        <div className="mut" style={{ marginBottom: 8 }}>چند پروندهٔ بسیار شبیه پیدا شد؛ کدام یک است؟</div>
        {cands.map((c) => <button key={c.caseNumber} className="btn alt" style={{ width: "100%", marginBottom: 8 }} onClick={() => pick(c.caseNumber)}>{c.name ? c.name + " — " : ""}{c.caseNumber}</button>)}
        <button className="btn" style={{ width: "100%" }} onClick={pickNone}>هیچ‌کدام؛ پروندهٔ جدید</button>
      </div>}

      {phase === "confirm" && pending && <div style={{ textAlign: "center", marginTop: 14 }}>
        <div className="mut">{pending.kind === "match" ? "پروندهٔ قبلی شناسایی شد" : pending.linked ? "چهره به پروندهٔ موجود گره خورد" : "پروندهٔ جدید ساخته شد"}</div>
        {pending.name && <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>{pending.name}</div>}
        <div className="timer en" style={{ marginTop: 6 }}>{pending.caseNo}</div>
        {pending.qr && <img src={pending.qr} alt="QR" width="200" height="200" style={{ background: "#fff", borderRadius: 8 }} />}
        <div style={{ height: 4, background: "rgba(127,127,127,.25)", borderRadius: 2, margin: "12px 0", overflow: "hidden" }}>
          <div key={pending.caseNo + pending.kind} style={{ height: "100%", background: "var(--teal)", animation: "yvbar " + CONFIRM_MS[pending.kind] + "ms linear forwards" }} />
        </div>
        <button className="btn alt" onClick={reject}><UserX size={17} /> این شخص نیست</button>
      </div>}

      {count > 0 && (phase === "scan" || phase === "error") && <details style={{ marginTop: 14 }}>
        <summary className="mut" style={{ cursor: "pointer", fontSize: 12 }}>داده‌های چهره ({count} نفر)</summary>
        <button className="btn alt sm" style={{ marginTop: 8 }} onClick={wipe}>حذف همهٔ داده‌های چهره</button>
      </details>}
    </div>
  );
}
