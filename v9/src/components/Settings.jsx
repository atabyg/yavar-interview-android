import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, Trash2, ShieldCheck, Loader2, HardDrive, Wifi, Mic } from "lucide-react";
import { requestPersist } from "../db";
import { getSettings, saveSettings } from "../settings";
import { testProviderKey, friendly } from "../openai";
import { ask, size, toast } from "../ui";

const Sw = ({ on, set, label }) => <button className={"sw " + (on ? "on" : "")} style={{ width: "100%" }} onClick={() => set(!on)}><span>{label}</span><i /></button>;
const PROVIDERS = {
  openai: { label: "OpenAI", models: ["gpt-4o-mini", "gpt-4.1-mini"], defaultModel: "gpt-4o-mini" },
  groq: { label: "Groq", models: ["openai/gpt-oss-20b", "llama-3.3-70b-versatile"], defaultModel: "openai/gpt-oss-20b" },
  gemini: { label: "Google Gemini", models: ["gemini-3.8-flash", "gemini-3.6-flash"], defaultModel: "gemini-3.8-flash" },
  mistral: { label: "Mistral", models: ["mistral-small-latest"], defaultModel: "mistral-small-latest" }
};
const KEY_PROVIDERS = ["openai", "groq", "gemini", "mistral"];
const modelForTranscription = (provider) => provider === "groq" ? "whisper-large-v3" : "gpt-4o-mini-transcribe";

export default function Settings({ storage, onChange }) {
  const [s, setS] = useState(getSettings());
  const [keyProvider, setKeyProvider] = useState("groq");
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => setS(getSettings()), []);
  const upd = async (patch) => {
    const n = await saveSettings(patch);
    setS({ ...n, apiKeys: { ...(n.apiKeys || {}) } });
    if (onChange) onChange();
  };
  const keys = s.apiKeys || {};
  const selectedKey = keys[keyProvider] || (keyProvider === "openai" ? s.apiKey : "") || "";
  const masked = selectedKey ? selectedKey.slice(0, 5) + "••••••••" + selectedKey.slice(-3) : "";

  async function saveKey() {
    const k = key.trim();
    if (k.length < 12 || /\s/.test(k)) { toast("کلید API ناقص یا دارای فاصله است."); return; }
    setBusy(true);
    try {
      await testProviderKey(keyProvider, k);
      await upd({ apiKeys: { ...keys, [keyProvider]: k } });
      setKey("");
      toast("اتصال بررسی شد و کلید در حافظهٔ محلی ذخیره شد.");
    } catch (e) {
      toast("کلید ذخیره نشد: " + friendly(e));
    } finally { setBusy(false); }
  }
  async function delKey() {
    if (await ask("کلید " + PROVIDERS[keyProvider].label + " از این دستگاه حذف شود؟", "حذف", true)) {
      await upd({ apiKeys: { ...keys, [keyProvider]: "" }, ...(keyProvider === "openai" ? { apiKey: "" } : {}) });
      toast("کلید حذف شد.");
    }
  }
  async function changeAnalyzeProvider(provider) {
    const m = PROVIDERS[provider].defaultModel;
    await upd({ analyzeProvider: provider, analyzeModel: m });
  }
  async function changeTranscribeProvider(provider) {
    await upd({ transcribeProvider: provider, transcribeModel: provider === "offline" ? "offline-speech-recognizer" : modelForTranscription(provider) });
  }

  return (
    <div>
      <div className="card">
        <h4><Wifi size={14} style={{ verticalAlign: "-2px" }} /> سرویس تحلیل و امتیازدهی</h4>
        <select className="inp" value={s.analyzeProvider} onChange={(e) => changeAnalyzeProvider(e.target.value)}>
          <option value="groq">Groq — دارای سهمیهٔ رایگان محدود</option>
          <option value="gemini">Google Gemini — سهمیه بسته به مدل و منطقه</option>
          <option value="mistral">Mistral — طرح رایگان محدود در صورت دسترسی</option>
          <option value="openai">OpenAI — API معمولاً نیازمند اعتبار/پرداخت</option>
        </select>
        <div className="mut" style={{ margin: "8px 0 4px" }}>مدل تحلیل</div>
        <select className="inp" value={s.analyzeModel} onChange={(e) => upd({ analyzeModel: e.target.value })}>
          {(PROVIDERS[s.analyzeProvider] || PROVIDERS.groq).models.map((m) => <option value={m} key={m}>{m}</option>)}
        </select>
        <div className="mut" style={{ marginTop: 8, lineHeight: 1.8 }}>کلید سرویس تحلیل و کلید تبدیل صوت جدا هستند. سهمیهٔ رایگان ممکن است با کشور، حساب، مدل و زمان تغییر کند و تضمین‌شده نیست.</div>
      </div>

      <div className="card">
        <h4><Mic size={14} style={{ verticalAlign: "-2px" }} /> تبدیل گفتار به متن</h4>
        <select className="inp" value={s.transcribeProvider} onChange={(e) => changeTranscribeProvider(e.target.value)}>
          <option value="offline">روی گوشی — ترجیح آفلاین، بدون کلید</option>
          <option value="groq">Groq Whisper — آنلاین، کلید Groq</option>
          <option value="openai">OpenAI Transcription — آنلاین، کلید OpenAI</option>
        </select>
        {s.transcribeProvider !== "offline" && <div style={{ marginTop: 9 }}>
          <div className="mut" style={{ marginBottom: 4 }}>مدل صوت</div>
          <select className="inp" value={s.transcribeModel} onChange={(e) => upd({ transcribeModel: e.target.value })}>
            {(s.transcribeProvider === "groq" ? [
              ["whisper-large-v3", "Whisper Large v3 — اولویت دقت"],
              ["whisper-large-v3-turbo", "Whisper Large v3 Turbo — سریع‌تر"]
            ] : [
              ["gpt-4o-mini-transcribe", "GPT-4o mini Transcribe"],
              ["gpt-4o-transcribe", "GPT-4o Transcribe"],
              ["whisper-1", "Whisper"]
            ]).map(([id, label]) => <option value={id} key={id}>{label}</option>)}
          </select>
        </div>}
        <div className="mut" style={{ marginTop: 8, lineHeight: 1.8 }}>
          تشخیص روی گوشی به موتور گفتار و بستهٔ زبان نصب‌شده وابسته است؛ گزینهٔ آفلاین اندروید ممکن است روی بعضی دستگاه‌ها فارسی را پشتیبانی نکند. در آن حالت، تبدیل ابری فقط با انتخاب آگاهانه و کلید سرویس انجام می‌شود.
        </div>
      </div>

      <div className="card">
        <h4><KeyRound size={14} style={{ verticalAlign: "-2px" }} /> کلیدهای API</h4>
        <div className="mut" style={{ marginBottom: 7 }}>سرویسی را انتخاب کنید که می‌خواهید کلید آن را وارد یا حذف کنید.</div>
        <select className="inp" value={keyProvider} onChange={(e) => { setKeyProvider(e.target.value); setKey(""); setShow(false); }}>
          {KEY_PROVIDERS.map((p) => <option value={p} key={p}>{PROVIDERS[p].label}</option>)}
        </select>
        {selectedKey && <div className="row" style={{ marginTop: 12 }}>
          <div className="grow"><div style={{ direction: "ltr", textAlign: "right", fontFamily: "monospace", fontSize: 13 }}>{masked}</div><div className="mut"><ShieldCheck size={12} /> کلید در حافظهٔ محلی دستگاه ذخیره شده است.</div></div>
          <button className="ib red" onClick={delKey}><Trash2 size={18} /></button>
        </div>}
        <div className="row" style={{ marginTop: 10 }}>
          <input className="inp en grow" type={show ? "text" : "password"} placeholder={"کلید " + PROVIDERS[keyProvider].label} value={key} onChange={(e) => setKey(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck="false" />
          <button className="ib" onClick={() => setShow(!show)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
        </div>
        <button className="btn full" style={{ marginTop: 10 }} disabled={!key || busy} onClick={saveKey}>{busy ? <Loader2 size={16} className="spin" /> : "آزمون اتصال و ذخیره"}</button>
        <div className="mut" style={{ marginTop: 9, lineHeight: 1.8 }}>کلیدها در این نسخه رمزگذاری اختصاصی ندارند؛ گوشی را امن نگه دارید و کلیدها را با دیگران به اشتراک نگذارید. کلید را در کد یا مخزن عمومی قرار ندهید.</div>
      </div>

      <div className="card">
        <Sw on={s.autoProcess} set={(v) => upd({ autoProcess: v })} label="تحلیل خودکار پس از پایان ضبط" />
        <div className="mut" style={{ marginTop: 7, lineHeight: 1.8 }}>با روشن‌کردن این گزینه، متن برای تحلیل به سرویس ابری انتخاب‌شده ارسال می‌شود. صوت فقط در صورت انتخاب تبدیل ابری ارسال می‌شود؛ حالت آفلاین صوت را برای تشخیص گفتار بارگذاری نمی‌کند.</div>
      </div>

      <div className="card">
        <div className="mut" style={{ marginBottom: 4 }}>نام مصاحبه‌گر (در گزارش‌ها)</div>
        <input className="inp" value={s.interviewer || ""} onChange={(e) => upd({ interviewer: e.target.value })} />
        <div className="mut" style={{ margin: "10px 0 4px" }}>عنوان سازمان در سربرگ گزارش</div>
        <input className="inp" value={s.org || ""} onChange={(e) => upd({ org: e.target.value })} />
      </div>

      <div className="card">
        <div className="row"><HardDrive size={16} /><span className="grow">فضای مصرفی: {size(storage.used)}</span>
          <button className="btn alt sm" onClick={async () => toast((await requestPersist()) ? "ذخیره‌سازی دائمی فعال شد" : "این دستگاه قبلاً دائمی کرده یا اجازه نداد")}>دائمی‌سازی</button></div>
        <div className="mut" style={{ marginTop: 10, lineHeight: 1.9 }}>برای ضبط طولانی روی گوشی‌های شیائومی/ردمی: تنظیمات ← برنامه‌ها ← یاور مصاحبه ← «صرفه‌جویی باتری» را روی «بدون محدودیت» بگذارید و برنامه را در لیست اخیر قفل کنید.</div>
      </div>
      <div className="mut" style={{ textAlign: "center" }}>یاور مصاحبه — نسخهٔ ۹٫۰٫۰</div>
    </div>
  );
}
