import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, Trash2, ShieldCheck, Loader2, HardDrive } from "lucide-react";
import { requestPersist } from "../db";
import { getSettings, saveSettings } from "../settings";
import { testKey, friendly } from "../openai";
import { ask, size, toast } from "../ui";

const Sw = ({ on, set, label }) => <button className={"sw " + (on ? "on" : "")} style={{ width: "100%" }} onClick={() => set(!on)}><span>{label}</span><i /></button>;

export default function Settings({ storage, onChange }) {
  const [s, setS] = useState(getSettings());
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => setS(getSettings()), []);
  const upd = async (p) => { const n = await saveSettings(p); setS(n); onChange && onChange(); };
  const masked = s.apiKey ? s.apiKey.slice(0, 7) + "••••••••" + s.apiKey.slice(-4) : "";

  async function saveKey() {
    const k = key.trim();
    if (!/^sk-/.test(k)) { toast("کلید باید با sk- شروع شود."); return; }
    setBusy(true);
    try { await testKey(k); await upd({ apiKey: k }); setKey(""); toast("کلید معتبر است و برای همیشه ذخیره شد."); }
    catch (e) { if (e && e.status === 401) toast(friendly(e)); else { await upd({ apiKey: k }); setKey(""); toast("کلید ذخیره شد (بررسی اینترنت ممکن نشد)."); } }
    setBusy(false);
  }
  async function delKey() { if (await ask("کلید API از این دستگاه حذف شود؟", "حذف", true)) { await upd({ apiKey: "" }); toast("کلید حذف شد"); } }

  return (
    <div>
      <div className="card">
        <h4><KeyRound size={14} style={{ verticalAlign: "-2px" }} /> کلید OpenAI</h4>
        {s.apiKey ? (
          <div className="row"><div className="grow"><div style={{ direction: "ltr", textAlign: "right", fontFamily: "monospace", fontSize: 13 }}>{masked}</div><div className="mut"><ShieldCheck size={12} /> ذخیره‌شده تا زمانی که خودتان حذف کنید</div></div>
            <button className="ib red" onClick={delKey}><Trash2 size={18} /></button></div>
        ) : null}
        <div className="row" style={{ marginTop: s.apiKey ? 12 : 0 }}>
          <input className="inp en grow" type={show ? "text" : "password"} placeholder={s.apiKey ? "جایگزینی کلید جدید" : "sk-..."} value={key} onChange={(e) => setKey(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck="false" />
          <button className="ib" onClick={() => setShow(!show)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
        </div>
        <button className="btn full" style={{ marginTop: 10 }} disabled={!key || busy} onClick={saveKey}>{busy ? <Loader2 size={16} className="spin" /> : "بررسی و ذخیره"}</button>
      </div>

      <div className="card">
        <Sw on={s.autoProcess} set={(v) => upd({ autoProcess: v })} label="پردازش خودکار پس از پایان ضبط" />
        <div className="mut" style={{ margin: "8px 0 4px" }}>مدل تبدیل صدا به متن</div>
        <select className="inp" value={s.transcribeModel} onChange={(e) => upd({ transcribeModel: e.target.value })}>
          <option value="gpt-4o-transcribe">gpt-4o-transcribe (دقیق‌تر)</option>
          <option value="gpt-4o-mini-transcribe">gpt-4o-mini-transcribe (ارزان‌تر)</option>
          <option value="whisper-1">whisper-1</option>
        </select>
        <div className="mut" style={{ margin: "10px 0 4px" }}>مدل تحلیل</div>
        <select className="inp" value={s.analyzeModel} onChange={(e) => upd({ analyzeModel: e.target.value })}>
          <option value="gpt-4o-mini">gpt-4o-mini (سریع و ارزان)</option>
          <option value="gpt-4o">gpt-4o (دقیق‌تر)</option>
          <option value="gpt-4.1">gpt-4.1</option>
        </select>
      </div>

      <div className="card">
        <div className="mut" style={{ marginBottom: 4 }}>نام مصاحبه‌گر (در گزارش‌ها)</div>
        <input className="inp" defaultValue={s.interviewer} onBlur={(e) => upd({ interviewer: e.target.value.trim() })} />
        <div className="mut" style={{ margin: "10px 0 4px" }}>عنوان سازمان در سربرگ گزارش</div>
        <input className="inp" defaultValue={s.org} onBlur={(e) => upd({ org: e.target.value.trim() })} />
      </div>

      <div className="card">
        <div className="row"><HardDrive size={16} /><span className="grow">فضای مصرفی: {size(storage.used)}</span>
          <button className="btn alt sm" onClick={async () => toast((await requestPersist()) ? "ذخیره‌سازی دائمی فعال شد" : "این دستگاه قبلاً دائمی کرده یا اجازه نداد")}>دائمی‌سازی</button></div>
        <div className="mut" style={{ marginTop: 10, lineHeight: 1.9 }}>برای ضبط طولانی روی گوشی‌های شیائومی/ردمی: تنظیمات ← برنامه‌ها ← یاور مصاحبه ← «صرفه‌جویی باتری» را روی «بدون محدودیت» بگذارید و برنامه را در لیست اخیر قفل کنید.</div>
      </div>
      <div className="mut" style={{ textAlign: "center" }}>یاور مصاحبه — نسخهٔ ۸٫۰٫۰</div>
    </div>
  );
}
