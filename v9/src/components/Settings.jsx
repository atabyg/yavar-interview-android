import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, Trash2, ShieldCheck, Loader2, HardDrive, Wifi, Mic } from "lucide-react";
import { requestPersist } from "../db";
import { getSettings, saveSettings, ANALYSIS_PROVIDERS } from "../settings";
import { testProviderKey, friendly } from "../openai";
import { ask, size, toast } from "../ui";
import { OfflineWhisper } from "../native-bridge";

const Sw = ({ on, set, label }) => <button className={"sw " + (on ? "on" : "")} style={{ width: "100%" }} onClick={() => set(!on)}><span>{label}</span><i /></button>;
const PROVIDERS = ANALYSIS_PROVIDERS;
const KEY_PROVIDERS = Object.keys(ANALYSIS_PROVIDERS);
const FREE_MODELS = Object.fromEntries(Object.entries(ANALYSIS_PROVIDERS).map(([id, item]) => [id, item.models]));
const freeModels = (provider, discovered = []) => {
  const allowed = FREE_MODELS[provider] || [];
  const found = allowed.filter((id) => discovered.includes(id));
  return found.length ? found : allowed;
};
const modelForTranscription = () => "whisper-large-v3";

export default function Settings({ storage, onChange }) {
  const [s, setS] = useState(getSettings());
  const [keyProvider, setKeyProvider] = useState("groq");
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [modelLists, setModelLists] = useState({});
  const [offlineModel, setOfflineModel] = useState({ downloaded: false, bundled: true, sizeBytes: 0, loading: true });
  useEffect(() => {
    setS(getSettings());
    let alive = true;
    OfflineWhisper.modelStatus().then((status) => {
      if (alive) setOfflineModel({ ...(status || {}), loading: false });
    }).catch((error) => {
      if (alive) setOfflineModel({ downloaded: false, bundled: true, sizeBytes: 0, loading: false, unavailable: true, error: String((error && error.message) || error || "") });
    });
    return () => { alive = false; };
  }, []);
  const upd = async (patch) => {
    const n = await saveSettings(patch);
    setS({ ...n, apiKeys: { ...(n.apiKeys || {}) } });
    if (onChange) onChange();
  };
  const keys = s.apiKeys || {};
  const selectedKey = keys[keyProvider] || (keyProvider === "openai" ? s.apiKey : "") || "";
  const masked = selectedKey ? selectedKey.slice(0, 5) + "••••••••" + selectedKey.slice(-3) : "";

  function preferredModel(provider, models = []) {
    const allowed = FREE_MODELS[provider] || [];
    return allowed.find((id) => models.includes(id)) || allowed[0] || (PROVIDERS[provider] || PROVIDERS.groq).defaultModel;
  }

  async function saveKey() {
    const k = key.trim();
    if (k.length < 12 || /\s/.test(k)) { toast("کلید API ناقص یا دارای فاصله است."); return; }
    setBusy(true);
    try {
      const discovered = await testProviderKey(keyProvider, k);
      const models = freeModels(keyProvider, discovered);
      await upd({ apiKeys: { ...keys, [keyProvider]: k } });
      if (models.length) {
        setModelLists((prev) => ({ ...prev, [keyProvider]: models }));
        if (keyProvider === s.analyzeProvider && !models.includes(s.analyzeModel)) {
          await upd({ analyzeModel: preferredModel(keyProvider, models) });
        }
      }
      setKey("");
      toast(discovered.length ? "اتصال برقرار شد؛ فقط مدل‌های منتخب با سهمیهٔ رایگان محدود نمایش داده می‌شوند." : "کلید ذخیره شد؛ فهرست مدل‌ها دریافت نشد و مدل رایگان محدود پیش‌فرض استفاده می‌شود.");
    } catch (e) {
      toast("اتصال تأیید نشد و کلید ذخیره نشد: " + friendly(e));
    } finally { setBusy(false); }
  }
  async function delKey() {
    if (await ask("کلید " + PROVIDERS[keyProvider].label + " از این دستگاه حذف شود؟", "حذف", true)) {
      await upd({ apiKeys: { ...keys, [keyProvider]: "" }, ...(keyProvider === "openai" ? { apiKey: "" } : {}) });
      toast("کلید حذف شد.");
    }
  }
  async function changeAnalyzeProvider(provider) {
    let models = modelLists[provider] || [];
    const providerKey = keys[provider] || "";
    if (!models.length && providerKey) {
      try {
        models = freeModels(provider, await testProviderKey(provider, providerKey));
        if (models.length) setModelLists((prev) => ({ ...prev, [provider]: models }));
      } catch (e) { /* Keep the chosen free-tier default; the connection test shows provider errors. */ }
    }
    models = freeModels(provider, models);
    await upd({ analyzeProvider: provider, analyzeModel: preferredModel(provider, models) });
  }
  async function changeTranscribeProvider(provider) {
    await upd({ transcribeProvider: provider, transcribeModel: provider === "offline" ? "whisper-tiny-q5_1-fa" : modelForTranscription(provider) });
  }
  return (
    <div>
      <div className="card">
        <h4><Wifi size={14} style={{ verticalAlign: "-2px" }} /> سرویس تحلیل و امتیازدهی</h4>
        <select className="inp" value={s.analyzeProvider} onChange={(e) => changeAnalyzeProvider(e.target.value)}>
          {KEY_PROVIDERS.map((p) => <option value={p} key={p}>{PROVIDERS[p].label} / سهمیهٔ رایگان محدود</option>)}
        </select>
        <div className="mut" style={{ marginTop: 7, lineHeight: 1.8 }}>
          {s.analyzeProvider === "openrouter"
            ? "OpenRouter Free خودش از میان مدل‌های رایگانِ در دسترس انتخاب می‌کند؛ نیازی به انتخاب مدل جداگانه نیست."
            : s.analyzeProvider === "cerebras"
              ? "Cerebras از API سازگار با OpenAI استفاده می‌کند؛ مدل‌های رایگانِ قابل‌انتخاب بر اساس دسترسی حساب نمایش داده می‌شوند."
              : s.analyzeProvider === "gemini"
                ? "Google AI Studio یک سطح رایگان محدود دارد؛ مدل‌های رایگان و سهمیه ممکن است با منطقه و حساب تفاوت داشته باشند."
                : "Groq با مدل‌های GPT-OSS انتخاب شده و برای استفادهٔ رایگان محدود، ساخت کلید شخصی لازم دارد."}
        </div>
        <div className="mut" style={{ margin: "8px 0 4px" }}>مدل تحلیل</div>
        <select className="inp" value={s.analyzeModel} onChange={(e) => upd({ analyzeModel: e.target.value })}>
          {(modelLists[s.analyzeProvider]?.length ? modelLists[s.analyzeProvider] : (PROVIDERS[s.analyzeProvider] || PROVIDERS.groq).models).map((m) => <option value={m} key={m}>{m}</option>)}
        </select>
        <div className="mut" style={{ marginTop: 8, lineHeight: 1.8 }}>فقط سرویس‌ها و مدل‌هایی انتخاب شده‌اند که مسیر استفادهٔ رایگان محدود دارند. سهمیه به حساب، منطقه و سیاست روز سرویس بستگی دارد و تضمین‌شده نیست. اگر صورتحساب فعال است، محدودیت رایگان لزوماً سقف هزینه نیست؛ برای جلوگیری از هزینهٔ ناخواسته، صورتحساب و محدودیت حساب را در پنل بررسی کنید. متن مصاحبه برای تحلیل به سرور ارائه‌دهنده ارسال می‌شود؛ اطلاعات شناسایی یا محرمانه را فقط با مجوز مناسب ارسال کنید.</div>
      </div>

      <div className="card">
        <h4><Mic size={14} style={{ verticalAlign: "-2px" }} /> تبدیل گفتار به متن</h4>
        <select className="inp" value={s.transcribeProvider} onChange={(e) => changeTranscribeProvider(e.target.value)}>
          <option value="offline">کاملاً آفلاین — Whisper روی گوشی، بدون کلید API</option>
          <option value="groq">Groq Whisper — آنلاین، سهمیهٔ رایگان محدود</option>
        </select>
        {s.transcribeProvider === "offline" && <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "var(--bg)" }}>
          <div className="row" style={{ alignItems: "center", gap: 10 }}>
            <div className="grow">
              <b style={{ fontSize: 13 }}>مدل تبدیل گفتار فارسی آفلاین</b>
              <div className="mut" style={{ marginTop: 4, lineHeight: 1.8 }}>
                {offlineModel.loading ? "در حال آماده‌سازی مدل همراه برنامه…" : offlineModel.downloaded ? "مدل داخل برنامه نصب شده و آماده است؛ برای شروع نیازی به اینترنت یا دانلود جداگانه نیست." : "مدل همراه برنامه آماده نشد؛ برنامه را حذف و نسخهٔ کامل جدید را دوباره نصب کنید."}
              </div>
            </div>
            <span className={"pill " + (offlineModel.downloaded ? "ok" : offlineModel.loading ? "" : "bad")}>{offlineModel.downloaded ? "آماده" : offlineModel.loading ? "آماده‌سازی" : "خطا"}</span>
          </div>
          {offlineModel.unavailable && <div style={{ color: "var(--terra)", fontSize: 12, marginTop: 8, lineHeight: 1.7 }}>{offlineModel.error || "مدل داخلی پیدا نشد."}</div>}
          <div className="mut" style={{ fontSize: 12, lineHeight: 1.8, marginTop: 8 }}>
            مدل چندزبانهٔ Whisper داخل فایل نصب قرار دارد. پس از نصب، تبدیل گفتار روی خود گوشی انجام می‌شود؛ فایل صوتی ارسال نمی‌شود و برای تبدیل گفتار هیچ کلید API لازم نیست.
          </div>
        </div>}
        {s.transcribeProvider !== "offline" && <div style={{ marginTop: 9 }}>
          <div className="mut" style={{ marginBottom: 4 }}>مدل صوت</div>
          <select className="inp" value={s.transcribeModel} onChange={(e) => upd({ transcribeModel: e.target.value })}>
            {[
              ["whisper-large-v3", "Whisper Large v3 — اولویت دقت"],
              ["whisper-large-v3-turbo", "Whisper Large v3 Turbo — سریع‌تر"]
            ].map(([id, label]) => <option value={id} key={id}>{label}</option>)}
          </select>
        </div>}
        <div className="mut" style={{ marginTop: 8, lineHeight: 1.8 }}>
          در حالت آفلاین، گفتار پس از پایان ضبط با مدل Whisper همراه APK روی گوشی تبدیل می‌شود؛ دانلود جداگانه یا کلید API لازم نیست. گزینهٔ Groq آنلاین است و پس از پایان سهمیهٔ رایگان ممکن است خطای محدودیت سرویس بدهد.
        </div>
      </div>

      <div className="card">
        <h4><KeyRound size={14} style={{ verticalAlign: "-2px" }} /> کلیدهای API</h4>
        <div className="mut" style={{ marginBottom: 7 }}>سرویسی را انتخاب کنید که می‌خواهید کلید آن را وارد یا حذف کنید.</div>
        <select className="inp" value={keyProvider} onChange={(e) => { setKeyProvider(e.target.value); setKey(""); setShow(false); }}>
          {KEY_PROVIDERS.map((p) => <option value={p} key={p}>{PROVIDERS[p].label}</option>)}
        </select>
        <div className="mut" style={{ marginTop: 8, lineHeight: 1.8 }}>
          ساخت کلید از صفحهٔ رسمی سرویس:
          {" "}<a href={PROVIDERS[keyProvider].keyUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", textDecoration: "underline" }}>باز کردن صفحهٔ {PROVIDERS[keyProvider].label}</a>
        </div>
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
        <input className="inp" defaultValue={s.interviewer || ""} onBlur={(e) => upd({ interviewer: e.target.value.trim() })} />
        <div className="mut" style={{ margin: "10px 0 4px" }}>عنوان سازمان در سربرگ گزارش</div>
        <input className="inp" defaultValue={s.org || ""} onBlur={(e) => upd({ org: e.target.value.trim() })} />
      </div>

      <div className="card">
        <div className="row"><HardDrive size={16} /><span className="grow">فضای مصرفی: {size(storage.used)}</span>
          <button className="btn alt sm" onClick={async () => toast((await requestPersist()) ? "ذخیره‌سازی دائمی فعال شد" : "این دستگاه قبلاً دائمی کرده یا اجازه نداد")}>دائمی‌سازی</button></div>
        <div className="mut" style={{ marginTop: 10, lineHeight: 1.9 }}>برای ضبط طولانی روی گوشی‌های شیائومی/ردمی: تنظیمات ← برنامه‌ها ← یاور مصاحبه ← «صرفه‌جویی باتری» را روی «بدون محدودیت» بگذارید و برنامه را در لیست اخیر قفل کنید.</div>
      </div>
      <div className="mut" style={{ textAlign: "center" }}>یاور مصاحبه — نسخهٔ ۱۱٫۰٫۰</div>
    </div>
  );
}
