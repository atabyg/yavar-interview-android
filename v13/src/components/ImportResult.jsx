import { useEffect, useRef, useState } from "react";
import { FileUp, CheckCircle2, AlertTriangle } from "lucide-react";
import { parseResults, matchRecord, buildPatch } from "../exchange.js";
import { patchInterview } from "../db";
import { readFileText } from "../docx";
import { Sheet, toast, fa } from "../ui";
import { getSettings, saveSettings } from "../settings";
import { fileBase, interviewExcel, interviewPdf } from "../export";
import { saveFiles } from "../native";

// Register the coded text produced by an external AI: pick a txt/Word file, paste text, or arrive here via Android Share.
export default function ImportResult({ items, initialText = "", initialName = "", initialError = "", initialBase64 = "", initialMime = "", onClose }) {
  const [text, setText] = useState(initialText);
  const [fileName, setFileName] = useState(initialName);
  const [rows, setRows] = useState([]);
  const [picks, setPicks] = useState({});
  const [busy, setBusy] = useState("");
  const [autoExport, setAutoExport] = useState(!!getSettings().autoExportAfterImport);
  const [message, setMessage] = useState(initialError);
  const fileRef = useRef(null);

  function analyse(value) {
    setMessage("");
    const parsed = parseResults(value).filter((r) => r.hasContent);
    if (!parsed.length) {
      setRows([]);
      setMessage("نتیجهٔ کدگذاری‌شدهٔ معتبر پیدا نشد. متن باید با #YAVAR_RESULT v1 شروع شود و پاسخ‌ها با کدهایی مثل Q12-01 آمده باشند (قالب خالی پرامپت هم پذیرفته نمی‌شود).");
      return;
    }
    setPicks({});
    setRows(parsed.map((r) => ({ ...r, match: matchRecord(r, items) })));
  }
  useEffect(() => {
    let cancelled = false;
    if (initialBase64 && initialName) {
      setBusy("در حال خواندن فایل دریافتی از برنامهٔ دیگر…");
      try {
        const binary = atob(initialBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const mime = initialMime || (initialName.toLowerCase().endsWith(".docx") ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "text/plain");
        const file = new File([bytes], initialName, { type: mime });
        readFileText(file).then((value) => {
          if (cancelled) return;
          setText(value); setFileName(initialName); analyse(value);
        }).catch((error) => {
          if (!cancelled) setMessage("خواندن فایل اشتراک‌گذاری‌شده ممکن نشد: " + String((error && error.message) || error));
        }).finally(() => { if (!cancelled) setBusy(""); });
      } catch (error) {
        setMessage("فایل دریافت شد اما قابل خواندن نیست: " + String((error && error.message) || error)); setBusy("");
      }
    } else if (initialText) {
      setText(initialText); setFileName(initialName); analyse(initialText);
    }
    return () => { cancelled = true; };
  }, [initialText, initialName, initialBase64, initialMime]);

  async function onFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setBusy("در حال خواندن فایل…");
    try {
      const t = await readFileText(file);
      setText(t); setFileName(file.name); analyse(t);
    } catch (err) { setMessage(String((err && err.message) || "خواندن فایل ممکن نشد.")); }
    setBusy("");
  }

  const targetOf = (r, i) => r.match.record || items.find((x) => x.id === picks[i]) || null;

  async function apply() {
    const jobs = rows.map((r, i) => ({ r, rec: targetOf(r, i) })).filter((j) => j.rec);
    if (!jobs.length) { toast("برای هیچ نتیجه‌ای پروندهٔ مقصد مشخص نشده است."); return; }
    setBusy("در حال ثبت نتیجه‌ها…");
    const files = [];
    try {
      await saveSettings({ autoExportAfterImport: autoExport });
      const done = [];
      for (const { r, rec } of jobs) {
        const patch = buildPatch(rec, r);
        const next = await patchInterview(rec.id, patch);
        done.push(next || { ...rec, ...patch });
      }
      if (autoExport) {
        for (const iv of done) {
          setBusy("در حال ساخت PDF و Excel پروندهٔ " + (iv.caseNumber || "") + "…");
          try { files.push({ blob: await interviewPdf(iv, getSettings().org, () => {}), name: fileBase(iv) + ".pdf" }); } catch (e) { /* keep going */ }
          try { files.push({ blob: interviewExcel(iv), name: fileBase(iv) + ".xlsx" }); } catch (e) { /* keep going */ }
        }
      }
      toast(fa(done.length) + " نتیجه در پرونده‌ها ثبت شد.");
      onClose();
      if (files.length) {
        try { await saveFiles(files); } catch (e) { toast("ثبت انجام شد اما ذخیره یا ارسال فایل‌ها ممکن نشد."); }
      }
    } catch (e) {
      setBusy("");
      toast("ثبت نتیجه ناموفق بود: " + String((e && e.message) || e));
    }
  }

  const ready = rows.some((r, i) => targetOf(r, i));
  return (
    <Sheet title="ثبت نتیجهٔ هوش مصنوعی بیرونی" onClose={busy ? () => {} : onClose}>
      <div style={{ maxHeight: "72vh", overflowY: "auto" }}>
        <div className="mut" style={{ lineHeight: 1.9 }}>فایل txt یا Word (docx) خروجی هوش مصنوعی را انتخاب کنید یا متن را بچسبانید. برنامه از روی RECORD_ID، شمارهٔ پرونده و تاریخ شمسی متن، پروندهٔ درست را پیدا می‌کند و پاسخ‌ها را جای‌گذاری می‌کند. این کار کاملاً آفلاین است.</div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", margin: "10px 0" }}>
          <button className="btn sm" disabled={!!busy} onClick={() => fileRef.current && fileRef.current.click()}><FileUp size={14} /> انتخاب فایل از حافظه</button>
          <input ref={fileRef} type="file" hidden accept=".txt,.md,.text,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={onFile} />
          <button className="btn alt sm" disabled={!!busy || !text.trim()} onClick={() => analyse(text)}>بررسی متن</button>
        </div>
        {fileName && <div className="mut">فایل: {fileName}</div>}
        <textarea className="inp tx" rows={5} placeholder="یا متن خروجی هوش مصنوعی را اینجا بچسبانید…" value={text} onChange={(e) => setText(e.target.value)} style={{ direction: "rtl", fontSize: 12 }} />
        {message && <div style={{ color: "var(--terra)", fontSize: 13, lineHeight: 1.9, margin: "8px 0" }}>{message}</div>}
        {rows.map((r, i) => {
          const rec = targetOf(r, i);
          const pool = (r.match.candidates.length ? r.match.candidates : items).slice(0, 60);
          return (
            <div className="card" key={i} style={{ margin: "8px 0" }}>
              <b>{r.clientName || "بدون نام"} · پرونده {r.caseNumber || "؟"} · {r.date || "بدون تاریخ"}</b>
              <div className="mut" style={{ marginTop: 3 }}>{r.label} — {fa(r.stats.answered)} از {fa(r.stats.total)} پاسخ ({fa(r.stats.coverage)}٪){r.stats.overall !== null ? " — امتیاز کل " + fa(r.stats.overall) : " — نمرهٔ شایستگی ناقص یا خالی"}</div>
              {rec
                ? <div style={{ color: "var(--teal)", fontSize: 13, marginTop: 5 }}><CheckCircle2 size={14} style={{ verticalAlign: "-2px" }} /> {rec.candidate || rec.title}{r.match.record ? " (" + r.match.how + ")" : ""}</div>
                : <div style={{ marginTop: 5 }}>
                    <div style={{ color: "var(--terra)", fontSize: 13 }}><AlertTriangle size={14} style={{ verticalAlign: "-2px" }} /> {r.match.how}</div>
                    <select className="inp" style={{ marginTop: 6 }} value={picks[i] || ""} onChange={(e) => setPicks({ ...picks, [i]: e.target.value })}>
                      <option value="">انتخاب پرونده…</option>
                      {pool.map((x) => <option key={x.id} value={x.id}>{(x.candidate || x.title) + " — " + (x.caseNumber || "بدون شماره")}</option>)}
                    </select>
                  </div>}
              {rec && rec.analysis && <div className="mut" style={{ color: "var(--terra)", marginTop: 4 }}>{Array.isArray(rec.analysis.formAnswers) && rec.analysis.formAnswers.some((x) => x && x.reviewStatus === "human_reviewed") ? "تحلیل قبلی و بازبینی‌های انسانی این پرونده با نتیجهٔ واردشده جایگزین می‌شود." : "تحلیل قبلی این پرونده با این نتیجه جایگزین می‌شود."}</div>}
              {r.warnings.length > 0 && <ul className="l" style={{ marginTop: 6 }}>{r.warnings.slice(0, 5).map((w, k) => <li key={k}>{w}</li>)}</ul>}
            </div>
          );
        })}
        {rows.length > 0 && <label className="row" style={{ gap: 8, margin: "10px 0", fontSize: 13 }}>
          <input type="checkbox" checked={autoExport} onChange={(e) => setAutoExport(e.target.checked)} />
          <span>پس از ثبت، فایل PDF و Excel هر پرونده خودکار ساخته و برای ذخیره/ارسال باز شود</span>
        </label>}
        {busy && <div className="mut" style={{ margin: "8px 0" }}>{busy}</div>}
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn line grow" disabled={!!busy} onClick={onClose}>بستن</button>
        <button className="btn grow" disabled={!!busy || !ready} onClick={apply}>ثبت در پرونده‌ها</button>
      </div>
    </Sheet>
  );
}
