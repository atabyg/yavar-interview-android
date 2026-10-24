import { useEffect, useRef, useState } from "react";
import { FileUp, CheckCircle2, AlertTriangle } from "lucide-react";
import { parseResults, matchRecord, buildPatch } from "../exchange.js";
import { looksLikeContractJson, parseContractResults, summarizeChanges, verifyEvidenceAgainstTranscript } from "../contract.js";
import { checkSegmentCitations } from "../transcript-segments.js";
import { patchInterview } from "../db";
import { readFileText } from "../docx";
import { Sheet, toast, fa } from "../ui";
import { getSettings, saveSettings } from "../settings";
import { fileBase, interviewExcel, interviewPdf } from "../export";
import { saveFiles } from "../native";

// Register the result produced by an external AI (JSON contract YAVAR_CASE_RESULT v1, or the legacy coded text): pick a txt/json/Word file,
// paste text, or arrive here via Android Share. Contract results are validated, their evidence is checked against the stored transcript
// and the change is summarised before anything is written; the previous analysis is kept in analysisHistory.
const prepareRow = (r, rec) => (r.isContractJson
  ? checkSegmentCitations(verifyEvidenceAgainstTranscript(r, (rec && rec.transcript) || ""), (rec && rec.transcript) || "")
  : r);

export default function ImportResult({ items, initialText = "", initialName = "", initialError = "", initialBase64 = "", initialMime = "", onClose }) {
  const [text, setText] = useState(initialText);
  const [fileName, setFileName] = useState(initialName);
  const [rows, setRows] = useState([]);
  const [picks, setPicks] = useState({});
  const [busy, setBusy] = useState("");
  const [autoExport, setAutoExport] = useState(!!getSettings().autoExportAfterImport);
  const [message, setMessage] = useState(initialError);
  const [problems, setProblems] = useState([]);
  const fileRef = useRef(null);

  function analyse(value) {
    setMessage("");
    const contract = looksLikeContractJson(value) ? parseContractResults(value) : { rows: [], errors: [] };
    const parsed = [...contract.rows, ...parseResults(value)].filter((r) => r.hasContent);
    setProblems(contract.errors);
    if (!parsed.length) {
      setRows([]);
      setMessage("نتیجهٔ معتبر پیدا نشد. قالب استاندارد JSON با contract=YAVAR_CASE_RESULT است (قالب قدیمی #YAVAR_RESULT v1 هم پذیرفته می‌شود)؛ قالب خالی پرامپت پذیرفته نمی‌شود." + (contract.errors.length ? " — " + contract.errors.slice(0, 3).join(" | ") : ""));
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
        const checked = prepareRow(r, rec);
        const patch = buildPatch(rec, checked);
        // The previous analysis is kept (last 5 versions) and the source of the import is recorded.
        if (rec.analysis) patch.analysisHistory = [{ at: Date.now(), reason: "replaced-by-import", analysis: rec.analysis }, ...(Array.isArray(rec.analysisHistory) ? rec.analysisHistory : [])].slice(0, 5);
        patch.externalImport = { at: Date.now(), format: r.isContractJson ? "json" : "text", fileName, contract: r.contract || null };
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
        <div className="mut" style={{ lineHeight: 1.9 }}>فایل JSON، txt یا Word (docx) خروجی هوش مصنوعی را انتخاب کنید یا متن را بچسبانید. برنامه نتیجه را اعتبارسنجی می‌کند، شاهد هر پاسخ را با متن ذخیره‌شدهٔ پرونده تطبیق می‌دهد، از روی RECORD_ID (یا شمارهٔ پرونده و تاریخ) پروندهٔ درست را پیدا می‌کند و پیش از ثبت خلاصهٔ تغییرات را نشان می‌دهد. این کار کاملاً آفلاین است و نیازی به تحلیل دوباره ندارد.</div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", margin: "10px 0" }}>
          <button className="btn sm" disabled={!!busy} onClick={() => fileRef.current && fileRef.current.click()}><FileUp size={14} /> انتخاب فایل از حافظه</button>
          <input ref={fileRef} type="file" hidden accept=".txt,.md,.text,.json,.docx,text/plain,application/json,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={onFile} />
          <button className="btn alt sm" disabled={!!busy || !text.trim()} onClick={() => analyse(text)}>بررسی متن</button>
        </div>
        {fileName && <div className="mut">فایل: {fileName}</div>}
        <textarea className="inp tx" rows={5} placeholder="یا متن خروجی هوش مصنوعی را اینجا بچسبانید…" value={text} onChange={(e) => setText(e.target.value)} style={{ direction: "rtl", fontSize: 12 }} />
        {message && <div style={{ color: "var(--terra)", fontSize: 13, lineHeight: 1.9, margin: "8px 0" }}>{message}</div>}
        {problems.length > 0 && rows.length > 0 && <ul className="l" style={{ color: "var(--terra)", fontSize: 12 }}>{problems.slice(0, 4).map((w, k) => <li key={k}>{w}</li>)}</ul>}
        {rows.map((r, i) => {
          const rec = targetOf(r, i);
          const view = prepareRow(r, rec);
          const sum = rec && r.isContractJson ? summarizeChanges(rec.analysis && rec.analysis.formAnswers, view.referralAnswers) : null;
          const pool = (r.match.candidates.length ? r.match.candidates : items).slice(0, 60);
          return (
            <div className="card" key={i} style={{ margin: "8px 0" }}>
              <b>{r.clientName || "بدون نام"} · پرونده {r.caseNumber || "؟"} · {r.date || "بدون تاریخ"}</b>
              <div className="mut" style={{ marginTop: 3 }}>{r.label} — {fa(view.stats.answered)} از {fa(view.stats.total)} پاسخ ({fa(view.stats.coverage)}٪){view.stats.overall !== null ? " — امتیاز کل " + fa(view.stats.overall) : (r.isContractJson ? "" : " — نمرهٔ شایستگی ناقص یا خالی")}</div>
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
              {sum && <div className="mut" style={{ marginTop: 4 }}>پیش از ثبت: {fa(sum.added)} پاسخ جدید · {fa(sum.changed)} تغییر · {fa(sum.cleared)} پاک‌شده · {fa(sum.needsReview)} نیازمند بازبینی{sum.humanReviewedOverwritten ? " · " + fa(sum.humanReviewedOverwritten) + " بازبینی انسانی جایگزین می‌شود" : ""}</div>}
              {view.warnings.length > 0 && <ul className="l" style={{ marginTop: 6 }}>{view.warnings.slice(0, 8).map((w, k) => <li key={k}>{w}</li>)}</ul>}
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
