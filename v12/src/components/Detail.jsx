import { useEffect, useState } from "react";
import { ArrowRight, Star, Trash2, FileText, FileSpreadsheet, RefreshCw, Share2, Check, Loader2, Copy, Mic, Sparkles } from "lucide-react";
import { deleteInterview, getAudioSegments, patchInterview } from "../db";
import { fileBase, fmtDate, fmtDur, interviewExcel, interviewPdf } from "../export";
import { saveFile } from "../native";
import { getSettings } from "../settings";
import { processInterview, reanalyze } from "../pipeline";
import { ask, fa, scoreColor, size, toast } from "../ui";

const STEPS = [["ضبط", Mic], ["متن", FileText], ["تحلیل", Sparkles], ["گزارش", Check]];
const stepIndex = (i) => (i.status === "done" ? 4 : i.status === "analyzing" || i.status === "transcribed" ? 2 : i.status === "transcribing" || i.status === "recorded" ? 1 : i.status === "error" ? (i.failedAt === "analyze" ? 2 : 1) : 0);

export default function Detail({ iv, onBack }) {
  const [url, setUrl] = useState(null);
  const [segs, setSegs] = useState([]);
  const [pdf, setPdf] = useState(-1);
  const [full, setFull] = useState(false);
  const [f, setF] = useState({ candidate: iv.candidate, position: iv.position, title: iv.title });

  useEffect(() => {
    let u = null, off = false;
    getAudioSegments(iv.id).then((b) => { if (off) return; setSegs(b); if (b.length) { u = URL.createObjectURL(b[0]); setUrl(u); } });
    return () => { off = true; if (u) URL.revokeObjectURL(u); };
  }, [iv.id, iv.segs]);

  const a = iv.analysis;
  const working = iv.status === "transcribing" || iv.status === "analyzing";
  const cur = stepIndex(iv);
  const save = (k) => () => f[k] !== iv[k] && patchInterview(iv.id, { [k]: f[k] });

  async function doPdf() {
    try { setPdf(0); const b = await interviewPdf(iv, getSettings().org, setPdf); await saveFile(b, fileBase(iv) + ".pdf"); }
    catch (e) { toast("ساخت PDF ناموفق بود."); } finally { setPdf(-1); }
  }
  async function doXlsx() { try { await saveFile(interviewExcel(iv), fileBase(iv) + ".xlsx"); } catch (e) { toast("ساخت Excel ناموفق بود."); } }
  const ext = /mp4/.test(iv.mime) ? "m4a" : /ogg/.test(iv.mime) ? "ogg" : "webm";

  return (
    <div className="page">
      <div className="top">
        <button className="ib" onClick={onBack}><ArrowRight size={20} /></button>
        <div className="grow"><b className="ell">{iv.candidate || iv.title}</b><small>{fmtDate(iv.createdAt)} • {fmtDur(iv.durationSec)} • {size(iv.sizeBytes)}</small></div>
        <button className="ib" onClick={() => patchInterview(iv.id, { starred: !iv.starred })}><Star size={20} fill={iv.starred ? "#D4A237" : "none"} color={iv.starred ? "#D4A237" : "#14284B"} /></button>
      </div>
      <div className="main">
        <div className="card">
          <div className="steps">{STEPS.map(([n, Ic], k) => (
            <div key={n} className={"step " + (k < cur ? "done" : k === cur ? "cur" : "")}><span>{k < cur ? <Check size={14} /> : k === cur && working ? <Loader2 size={14} className="spin" /> : <Ic size={14} />}</span>{n}</div>
          ))}</div>
          {working && <div className="mut" style={{ textAlign: "center" }}>{iv.step}</div>}
          {iv.status === "recorded" && !(getSettings().apiKeys && getSettings().apiKeys[getSettings().analyzeProvider]) && <div className="mut" style={{ textAlign: "center", lineHeight: 1.9 }}>برای تحلیل، کلید سرویس انتخاب‌شده را در «تنظیمات» وارد کنید.</div>}
          {(iv.status === "error" || iv.status === "recorded" || iv.status === "transcribed") && (
            <>
              {iv.error && <div style={{ color: "var(--terra)", fontSize: 13, margin: "6px 0", lineHeight: 1.8 }}>{iv.error}</div>}
              <button className="btn full" onClick={() => processInterview(iv.id)}><RefreshCw size={16} /> {iv.status === "error" ? "تلاش مجدد" : "شروع پردازش"}</button>
            </>
          )}
        </div>

        <div className="card">
          <input className="inp" placeholder="نام متقاضی" value={f.candidate} onChange={(e) => setF({ ...f, candidate: e.target.value })} onBlur={save("candidate")} />
          <input className="inp" style={{ marginTop: 8 }} placeholder="سمت" value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} onBlur={save("position")} />
        </div>

        {a && (
          <>
            <div className="card row">
              <div className="ring" style={{ width: 72, height: 72, fontSize: 26, background: scoreColor(a.overall) }}>{fa(a.overall)}</div>
              <div className="grow"><div style={{ fontWeight: 700, fontSize: 16 }}>{a.verdict}</div><div className="mut">امتیاز کل از ۱۰۰</div></div>
            </div>
            <div className="card"><h4>خلاصه</h4><div style={{ fontSize: 13.5, lineHeight: 2 }}>{a.summary}</div></div>
            {a.cleanTranscript && (
              <div className="card">
                <div className="row"><h4 className="grow">متن بازبینی‌شده برای فرم‌ها</h4>
                  <button className="ib" onClick={() => { navigator.clipboard && navigator.clipboard.writeText(a.cleanTranscript); toast("متن بازبینی‌شده کپی شد"); }}><Copy size={16} /></button></div>
                <div className="tx" style={full ? { maxHeight: "none" } : {}}>{a.cleanTranscript}</div>
                <div className="mut" style={{ marginTop: 8, lineHeight: 1.8 }}>این متن پیشنهادی مدل است؛ متن خام پایین صفحه حفظ شده و موارد نامطمئن را پیش از ثبت نهایی بازبینی کنید.</div>
              </div>
            )}
            {Array.isArray(a.qaPairs) && a.qaPairs.length > 0 && (
              <div className="card"><h4>پرسش و پاسخ‌های استخراج‌شده</h4>
                {a.qaPairs.map((q, k) => (
                  <div key={k} style={{ padding: "9px 0", borderBottom: "1px solid var(--line)" }}>
                    <div className="mut">پرسش ({q.questionSpeaker || "نامشخص"}): {q.question}</div>
                    <div style={{ marginTop: 4 }}>پاسخ ({q.answerSpeaker || "نامشخص"}): {q.answer || "پاسخ روشن در متن پیدا نشد."}</div>
                    {q.matchedQuestion && <div className="mut" style={{ marginTop: 3 }}>تطبیق با فرم: {q.matchedQuestion}</div>}
                    <div className="mut" style={{ marginTop: 3 }}>اطمینان تطبیق: {q.confidence || "پایین"}{q.evidence ? " — شاهد: " + q.evidence : ""}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="card"><h4>شایستگی‌ها</h4>
              {a.competencies.map((c) => (
                <div key={c.name} style={{ marginBottom: 10 }}>
                  <div className="row"><span className="grow" style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</span><b>{fa(c.score)}</b></div>
                  <div className="bar"><i style={{ width: c.score * 10 + "%", background: scoreColor(c.score * 10) }} /></div>
                  {c.note && <div className="mut" style={{ marginTop: 2 }}>{c.note}</div>}
                </div>
              ))}
            </div>
            {[["نقاط قوت", a.strengths, ""], ["نقاط قابل بهبود", a.weaknesses, ""], ["هشدارها", a.redFlags, "red"], ["سؤال‌های پیشنهادی مرحلهٔ بعد", a.followUp, ""]].map(([t, l, c]) => l.length > 0 && (
              <div className="card" key={t}><h4>{t}</h4><ul className={"l " + c}>{l.map((x, k) => <li key={k}>{x}</li>)}</ul></div>
            ))}
            <div className="card row">
              <button className="btn grow" onClick={doPdf} disabled={pdf >= 0}>{pdf >= 0 ? <><Loader2 size={16} className="spin" /> {fa(pdf)}٪</> : <><FileText size={16} /> PDF</>}</button>
              <button className="btn alt grow" onClick={doXlsx}><FileSpreadsheet size={16} /> Excel</button>
              <button className="btn line" onClick={() => reanalyze(iv.id)} title="تحلیل مجدد"><RefreshCw size={16} /></button>
            </div>
          </>
        )}

        {iv.transcript && (
          <div className="card"><div className="row"><h4 className="grow">متن مصاحبه</h4>
            <button className="ib" onClick={() => { navigator.clipboard && navigator.clipboard.writeText(iv.transcript); toast("کپی شد"); }}><Copy size={16} /></button></div>
            <div className="tx" style={full ? { maxHeight: "none" } : {}}>{iv.transcript}</div>
            <button className="btn alt sm" style={{ marginTop: 8 }} onClick={() => setFull(!full)}>{full ? "کمتر" : "نمایش کامل"}</button>
          </div>
        )}

        {url && (
          <div className="card"><h4>فایل صوتی</h4><audio controls src={url} />
            <div className="row" style={{ flexWrap: "wrap", marginTop: 8 }}>
              {segs.map((b, k) => <button key={k} className="btn line sm" onClick={() => saveFile(b, `${fileBase(iv)}-${k + 1}.${ext}`)}><Share2 size={14} /> {segs.length > 1 ? "بخش " + fa(k + 1) : "ارسال صوت"}</button>)}
            </div>
          </div>
        )}
        <button className="btn red full" onClick={async () => { if (await ask("این مصاحبه همراه با صوت و گزارش برای همیشه حذف شود؟", "حذف", true)) { await deleteInterview(iv.id); onBack(); } }}><Trash2 size={16} /> حذف مصاحبه</button>
      </div>
    </div>
  );
}
