const BASE = "https://api.openai.com/v1";

export class ApiError extends Error { constructor(msg, status) { super(msg); this.status = status; } }

export function friendly(e) {
  const s = e && e.status;
  if (s === 401) return "کلید API نامعتبر است. آن را در تنظیمات بررسی کنید.";
  if (s === 402 || s === 403) return "دسترسی یا اعتبار حساب OpenAI کافی نیست.";
  if (s === 429) return "سقف مصرف یا اعتبار OpenAI تمام شده یا درخواست‌ها زیاد است.";
  if (s >= 500) return "سرور OpenAI موقتاً در دسترس نیست.";
  if (s === 413) return "حجم فایل صوتی زیاد است.";
  if (e && /abort|timeout/i.test(String(e.name + e.message))) return "پاسخ سرور زمان زیادی طول کشید.";
  if (e instanceof TypeError || (e && /network|fetch|failed/i.test(String(e.message)))) return "اتصال اینترنت برقرار نیست.";
  return (e && e.message) || "خطای ناشناخته";
}

async function call(path, init, { retries = 4, timeoutMs = 15 * 60 * 1000 } = {}) {
  let last;
  for (let a = 0; a <= retries; a++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const r = await fetch(BASE + path, { ...init, signal: ac.signal });
      clearTimeout(t);
      if (r.ok) return r;
      let msg = "";
      try { msg = (await r.json()).error.message; } catch (e) { /* ignore */ }
      const err = new ApiError(msg || "HTTP " + r.status, r.status);
      if (![408, 429, 500, 502, 503, 504].includes(r.status)) throw err;
      last = err;
    } catch (e) {
      clearTimeout(t);
      if (e instanceof ApiError && ![408, 429, 500, 502, 503, 504].includes(e.status)) throw e;
      last = e;
    }
    if (a < retries) await new Promise((res) => setTimeout(res, Math.min(30000, 1500 * 2 ** a)));
  }
  throw last;
}

export async function testKey(key) {
  await call("/models", { headers: { Authorization: "Bearer " + key } }, { retries: 0, timeoutMs: 20000 });
  return true;
}

export async function transcribe(blob, filename, { key, model }) {
  const run = async (m) => {
    const fd = new FormData();
    fd.append("file", blob, filename);
    fd.append("model", m);
    fd.append("language", "fa");
    fd.append("response_format", "json");
    const r = await call("/audio/transcriptions", { method: "POST", headers: { Authorization: "Bearer " + key }, body: fd });
    return (await r.json()).text || "";
  };
  try { return await run(model); }
  catch (e) { if (e && (e.status === 400 || e.status === 404) && model !== "whisper-1") return run("whisper-1"); throw e; }
}

export const COMPETENCIES = ["ارتباط و بیان", "دانش و مهارت تخصصی", "حل مسئله و تحلیل", "کار تیمی و تعامل", "انگیزه و تعهد", "اخلاق و رفتار حرفه‌ای"];

const SYSTEM = `تو یک کارشناس ارشد منابع انسانی هستی. متن پیاده‌شدهٔ یک مصاحبهٔ شغلی به فارسی به تو داده می‌شود (گوینده‌ها برچسب ندارند؛ از زمینه تشخیص بده کدام مصاحبه‌کننده و کدام متقاضی است).
فقط بر پایهٔ محتوای گفتگو ارزیابی کن، چیزی را از خودت اضافه نکن و اگر شواهد کافی نیست امتیاز را محتاطانه بده و در توضیح بنویس «شواهد کافی نبود».
هرگز بر اساس جنسیت، سن، قومیت، مذهب، ظاهر یا لهجه قضاوت نکن.
خروجی فقط یک JSON معتبر و بدون هیچ متن اضافه با این ساختار باشد:
{"summary":"خلاصه ۴ تا ۶ جمله‌ای","overall":عدد ۰ تا ۱۰۰,"verdict":"یکی از: پیشنهاد استخدام | مشروط / نیازمند بررسی بیشتر | عدم پیشنهاد","competencies":[{"name":"...","score":عدد ۰ تا ۱۰,"note":"یک جملهٔ مستند"}],"strengths":["..."],"weaknesses":["..."],"redFlags":["..."],"followUp":["سؤال پیشنهادی برای مرحلهٔ بعد"]}
شش شایستگی را دقیقاً با همین نام‌ها و ترتیب بیاور: ${COMPETENCIES.join(" / ")}.
هر لیست حداکثر ۵ مورد کوتاه؛ redFlags اگر موردی نبود آرایهٔ خالی.`;

const clamp = (v, a, b) => Math.max(a, Math.min(b, Math.round(Number(v) || 0)));
const arr = (x) => (Array.isArray(x) ? x.map(String).filter(Boolean).slice(0, 8) : []);

export async function analyze(transcript, ctx, { key, model }) {
  const user = `سمت: ${ctx.position || "نامشخص"}\nمتقاضی: ${ctx.candidate || "نامشخص"}\n\nمتن مصاحبه:\n${transcript.slice(0, 90000)}`;
  const r = await call("/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ model, temperature: 0.2, response_format: { type: "json_object" },
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }] }),
  });
  const txt = (await r.json()).choices[0].message.content;
  const j = JSON.parse(txt);
  const comps = COMPETENCIES.map((name, i) => {
    const c = (j.competencies || []).find((x) => x && x.name === name) || (j.competencies || [])[i] || {};
    return { name, score: clamp(c.score, 0, 10), note: String(c.note || "") };
  });
  return {
    summary: String(j.summary || ""), overall: clamp(j.overall, 0, 100), verdict: String(j.verdict || ""),
    competencies: comps, strengths: arr(j.strengths), weaknesses: arr(j.weaknesses), redFlags: arr(j.redFlags),
    followUp: arr(j.followUp), model, at: Date.now(),
  };
}
