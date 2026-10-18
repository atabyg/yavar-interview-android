// Coded hand-off between Yavar and an external AI: voice + prompt go out, coded text comes back.
// Pure module (no DOM): shared by the UI, the prompt generator and the node tests.
import { QUESTION_SETS } from "./questions.js";
import { COMPETENCIES } from "./openai.js";
import { dayKey, dayLabel } from "./daily.js";

export const RESULT_VERSION = "YAVAR_RESULT v1";
export const FORM_CODES = { quick: "Q5", critical12: "Q12", full: "Q24" };
const SET_BY_PREFIX = { Q5: "quick", Q12: "critical12", Q24: "full" };
export const VERDICTS = { high: "پیشنهاد استخدام", mid: "مشروط / نیازمند بررسی بیشتر", low: "عدم پیشنهاد" };
const p2 = (n) => String(n).padStart(2, "0");
const oneLine = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();

// ------------------------------------------------------------------ form specs
export function formSpec(setId) {
  const set = QUESTION_SETS[setId] || QUESTION_SETS.critical12;
  const prefix = FORM_CODES[set.id];
  return {
    id: set.id, prefix, label: set.label,
    items: set.questions.map((question, index) => ({ code: prefix + "-" + p2(index + 1), index, question }))
  };
}

// ------------------------------------------------------------------ calculations (identical rules are printed in the prompt)
// COVERAGE = round(answered / total * 100)
// OVERALL  = round(mean(C1..C6) * 10), only when all six scores exist
// VERDICT  = OVERALL >= 70 high, 50..69 mid, < 50 low
export function computeStats(total, answers, comps) {
  const answered = answers.filter((a) => a.answered).length;
  const coverage = total ? Math.round((answered / total) * 100) : 0;
  const scores = comps.map((c) => c.score);
  const complete = scores.length > 0 && scores.every((s) => s !== null && s !== undefined);
  const overall = complete ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) : null;
  const verdict = overall === null ? null : overall >= 70 ? VERDICTS.high : overall >= 50 ? VERDICTS.mid : VERDICTS.low;
  return { total, answered, coverage, overall, verdict };
}

// ------------------------------------------------------------------ text normalisation
export function normalizeDigits(s) {
  return String(s == null ? "" : s)
    .replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c)))
    .replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)));
}
const fixLetters = (s) => s.replace(/ي/g, "ی").replace(/ك/g, "ک");
const EMPTY_RE = /^(?:empty|none|null|n\/a|na|nil|-+|—+|–+|_+|\.{2,}|…|خالی|ندارد|نامشخص|در متن نیامده(?: است)?|پاسخ داده نشد|مطرح نشد)$/i;
export function isEmptyValue(v) {
  const t = String(v == null ? "" : v).trim().replace(/[.。]+$/, "").trim();
  return !t || EMPTY_RE.test(t);
}

const KEY_RE = /^(?:RECORD_ID|CASE_NUMBER|DATE_JALALI|FORM|CLIENT_NAME|POSITION|SUMMARY|STRENGTHS|WEAKNESSES|REDFLAGS|FOLLOWUP|WARNINGS|OVERALL|COVERAGE|VERDICT|Q\d{1,2}-\d{2,3}(?:\.(?:EVIDENCE|CONF))?|C[1-6](?:\.NOTE)?)$/;
const LINE_RE = /^\s*(?:[-*•>]+\s*)?(?:\*\*|__)?\s*([A-Za-z][A-Za-z0-9_.\-]*)\s*(?:\*\*|__)?\s*[:：]\s*(?:\*\*|__)?\s*(.*)$/;
const canonKey = (k) => k.toUpperCase()
  .replace(/\.ANSWER$/, "")
  .replace(/^Q(\d{1,2})-(\d{1,3})/, (m, a, b) => "Q" + a + "-" + b.padStart(2, "0"));

function splitBlocks(text) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks = [];
  let cur = null;
  for (const line of lines) {
    if (/^\s*#\s*YAVAR_RESULT\b/i.test(line)) { cur = []; blocks.push(cur); continue; }
    if (/^\s*#\s*END_RESULT\b/i.test(line)) { cur = null; continue; }
    if (cur) cur.push(line);
  }
  if (!blocks.length) blocks.push(lines); // tolerant: output without markers
  return blocks;
}

function parseBlock(lines) {
  const f = {};
  let last = null;
  let tx = null;
  for (const line of lines) {
    if (tx !== null) {
      if (/^\s*TRANSCRIPT_END\b/i.test(line)) { f.TRANSCRIPT = tx.join("\n").trim(); tx = null; } else tx.push(line);
      continue;
    }
    if (/^\s*TRANSCRIPT_BEGIN\b/i.test(line)) { tx = []; last = null; continue; }
    if (/^\s*#/.test(line) || /^\s*```/.test(line)) continue; // template comments / code fences
    const norm = normalizeDigits(line);
    const m = norm.match(LINE_RE);
    if (m) {
      const key = canonKey(m[1]);
      if (KEY_RE.test(key)) {
        last = key;
        f[key] = line.slice(line.length - m[2].length).trim();
        continue;
      }
    }
    if (last && line.trim()) f[last] = (f[last] + " " + line.trim()).trim();
  }
  if (tx !== null) f.TRANSCRIPT = tx.join("\n").trim();
  return f;
}

function resolveSetId(f) {
  const raw = normalizeDigits(String(f.FORM || "")).toUpperCase();
  if (/Q?24\b|FULL|کامل/.test(raw)) return "full";
  if (/Q?12\b|CRITICAL|حیاتی/.test(raw)) return "critical12";
  if (/Q?5\b|QUICK|فوری/.test(raw)) return "quick";
  const counts = {};
  for (const k of Object.keys(f)) { const m = k.match(/^(Q\d{1,2})-/); if (m) counts[m[1]] = (counts[m[1]] || 0) + 1; }
  let best = null, bestN = 0;
  for (const [p, n] of Object.entries(counts)) if (SET_BY_PREFIX[p] && n > bestN) { best = SET_BY_PREFIX[p]; bestN = n; }
  return best || "critical12";
}

function normConf(v) {
  const t = String(v || "").trim().toUpperCase();
  if (/^(HIGH|H|بالا|زیاد)/.test(t)) return "بالا";
  if (/^(MEDIUM|MID|M|متوسط)/.test(t)) return "متوسط";
  return "پایین";
}
const splitList = (v) => (isEmptyValue(v) ? [] : String(v).split(/\s*[|؛;]\s*|\n/).map(oneLine).filter((x) => x && !isEmptyValue(x)).slice(0, 5));

export function normalizeDate(v) {
  const m = normalizeDigits(String(v || "")).match(/(\d{4})\s*[\/\-.،]\s*(\d{1,2})\s*[\/\-.،]\s*(\d{1,2})/);
  return m ? m[1] + "/" + p2(m[2]) + "/" + p2(m[3]) : "";
}

function interpretBlock(f) {
  if (!Object.keys(f).length) return null;
  const setId = resolveSetId(f);
  const spec = formSpec(setId);
  const warnings = [];
  const answers = spec.items.map((item) => {
    const answer = oneLine(f[item.code]);
    const answered = !isEmptyValue(answer);
    const ev = f[item.code + ".EVIDENCE"];
    return {
      code: item.code, question: item.question, answered,
      answer: answered ? answer : "",
      evidence: answered && !isEmptyValue(ev) ? oneLine(ev) : "",
      confidence: answered ? normConf(f[item.code + ".CONF"]) : ""
    };
  });
  for (const k of Object.keys(f)) {
    const m = k.match(/^Q\d{1,2}-\d{2,3}$/);
    if (m && !spec.items.some((i) => i.code === k)) warnings.push("کد " + k + " در فرم «" + spec.label + "» وجود ندارد و نادیده گرفته شد.");
  }
  const comps = COMPETENCIES.map((name, i) => {
    const code = "C" + (i + 1);
    const raw = f[code];
    let score = null;
    if (!isEmptyValue(raw)) {
      const m = normalizeDigits(raw).match(/\d+(?:\.\d+)?/);
      if (m) {
        let v = parseFloat(m[0]);
        if (v > 10 && v <= 100) { v = v / 10; warnings.push("نمرهٔ " + code + " در مقیاس ۱۰۰ بود و به ۱۰ تبدیل شد."); }
        score = Math.max(0, Math.min(10, Math.round(v)));
      } else warnings.push("نمرهٔ " + code + " عدد معتبر نبود.");
    }
    const note = f[code + ".NOTE"];
    return { code, name, score, note: isEmptyValue(note) ? "" : oneLine(note) };
  });
  const stats = computeStats(spec.items.length, answers, comps);
  const givenOverall = parseFloat(normalizeDigits(f.OVERALL || ""));
  if (Number.isFinite(givenOverall) && stats.overall !== null && Math.abs(givenOverall - stats.overall) >= 1) warnings.push("OVERALL اعلام‌شده (" + givenOverall + ") با محاسبهٔ برنامه (" + stats.overall + ") نمی‌خواند؛ مقدار برنامه ثبت شد.");
  const givenCoverage = parseFloat(normalizeDigits(f.COVERAGE || ""));
  if (Number.isFinite(givenCoverage) && Math.abs(givenCoverage - stats.coverage) >= 1) warnings.push("COVERAGE اعلام‌شده (" + givenCoverage + ") با محاسبهٔ برنامه (" + stats.coverage + ") نمی‌خواند؛ مقدار برنامه ثبت شد.");
  if (stats.overall === null && comps.some((c) => c.score !== null)) warnings.push("همهٔ شش نمرهٔ C1 تا C6 کامل نبود؛ امتیاز کل محاسبه نشد.");
  const row = {
    setId, formCode: spec.prefix, label: spec.label,
    recordId: oneLine(f.RECORD_ID),
    caseNumber: normalizeDigits(f.CASE_NUMBER || "").replace(/\D/g, "").slice(0, 6),
    date: normalizeDate(f.DATE_JALALI),
    clientName: isEmptyValue(f.CLIENT_NAME) ? "" : oneLine(f.CLIENT_NAME),
    answers, comps, stats, warnings,
    summary: isEmptyValue(f.SUMMARY) ? "" : oneLine(f.SUMMARY),
    strengths: splitList(f.STRENGTHS), weaknesses: splitList(f.WEAKNESSES), redFlags: splitList(f.REDFLAGS), followUp: splitList(f.FOLLOWUP),
    aiWarnings: splitList(f.WARNINGS),
    transcript: String(f.TRANSCRIPT || "").trim()
  };
  row.hasContent = answers.some((a) => a.answered) || comps.some((c) => c.score !== null) || !!row.summary || !!row.transcript ||
    row.strengths.length + row.weaknesses.length + row.redFlags.length + row.followUp.length > 0;
  return row;
}

// Parse one or more #YAVAR_RESULT blocks out of any text (txt, pasted, or extracted from Word).
export function parseResults(raw) {
  const text = fixLetters(String(raw || "").replace(/^\uFEFF/, ""));
  return splitBlocks(text).map((lines) => interpretBlock(parseBlock(lines))).filter(Boolean);
}

// ------------------------------------------------------------------ matching a result to a saved interview
export function matchRecord(row, items) {
  const list = Array.isArray(items) ? items : [];
  if (row.recordId) {
    const r = list.find((i) => i.id === row.recordId);
    if (r) return { record: r, how: "شناسهٔ رکورد", candidates: [r] };
  }
  let c = row.caseNumber ? list.filter((i) => String(i.caseNumber || "") === row.caseNumber) : [];
  if (!c.length && row.clientName) c = list.filter((i) => oneLine(i.candidate) === row.clientName);
  if (!c.length) return { record: null, how: "پروندهٔ مطابق این نتیجه پیدا نشد؛ یکی را انتخاب کنید", candidates: [] };
  if (row.date) {
    const same = c.filter((i) => dayKey(i.createdAt) === row.date);
    if (same.length === 1) return { record: same[0], how: "شمارهٔ پرونده + تاریخ", candidates: same };
    if (same.length > 1) c = same;
    else return { record: null, how: "تاریخ نتیجه با تاریخ ضبط نمی‌خواند؛ رکورد درست را انتخاب کنید", candidates: c };
  }
  const byForm = c.filter((i) => (i.questionSet || "critical12") === row.setId);
  const pool = byForm.length ? byForm : c;
  if (pool.length === 1) return { record: pool[0], how: row.date ? "شمارهٔ پرونده + تاریخ + فرم" : "شمارهٔ پرونده", candidates: pool };
  return { record: null, how: "چند رکورد مشابه وجود دارد؛ یکی را انتخاب کنید", candidates: pool };
}

// ------------------------------------------------------------------ result -> interview patch
export function buildAnalysis(row) {
  return {
    summary: row.summary,
    overall: row.stats.overall,
    verdict: row.stats.verdict || VERDICTS.mid,
    competencies: row.comps.filter((c) => c.score !== null).map((c) => ({ name: c.name, score: c.score, note: c.note || "شواهد کافی نبود" })),
    strengths: row.strengths, weaknesses: row.weaknesses, redFlags: row.redFlags, followUp: row.followUp,
    cleanTranscript: "", qaPairs: [],
    transcriptWarnings: [...row.aiWarnings, ...row.warnings].slice(0, 10),
    formAnswers: row.answers, coverage: row.stats.coverage, answeredCount: row.stats.answered,
    formId: row.setId, formCode: row.formCode,
    source: "external", model: "هوش مصنوعی بیرونی", provider: "external", at: Date.now()
  };
}
export function buildPatch(iv, row) {
  const patch = {
    analysis: buildAnalysis(row), status: "done", step: "", error: "", failedAt: null,
    questionSet: row.setId, questionSetLabel: row.label, externalImportAt: Date.now()
  };
  if (!String(iv.transcript || "").trim() && row.transcript) { patch.transcript = row.transcript; patch.transcribeProviderUsed = "external"; }
  return patch;
}

// In-app AI results: derive the same coded answers from qaPairs so exports look identical.
export function formAnswersFromQa(setId, qaPairs) {
  const spec = formSpec(setId);
  const pairs = Array.isArray(qaPairs) ? qaPairs : [];
  const used = new Set();
  const norm = (s) => String(s || "").replace(/[\s\u200c؟?.,،:؛"'«»()\-–—]/g, "").toLowerCase();
  return spec.items.map((item) => {
    const nq = norm(item.question);
    const at = pairs.findIndex((p, i) => {
      if (used.has(i)) return false;
      const nm = norm(p && p.matchedQuestion);
      return nm.length >= 8 && (nm.includes(nq.slice(0, 24)) || nq.includes(nm.slice(0, 24)));
    });
    const p = at >= 0 ? pairs[at] : null;
    if (at >= 0) used.add(at);
    const answer = p ? oneLine(p.answer) : "";
    const answered = !!answer && !/پاسخ روشن در متن پیدا نشد/.test(answer);
    return { code: item.code, question: item.question, answered, answer: answered ? answer : "", evidence: answered ? oneLine(p.evidence) : "", confidence: answered ? p.confidence || "پایین" : "" };
  });
}
export const coverageOf = (formAnswers) => (formAnswers.length ? Math.round((formAnswers.filter((a) => a.answered).length / formAnswers.length) * 100) : 0);

// ------------------------------------------------------------------ files shared with the external AI
export const audioExt = (mime) => (/mp4/.test(mime || "") ? "m4a" : /ogg/.test(mime || "") ? "ogg" : "webm");
export const audioFileName = (rec, k) => (rec.exchangeAudioFiles && rec.exchangeAudioFiles[k]) || ("yavar-" + rec.id + "-" + (k + 1) + "." + audioExt(rec.mime));
export const transcriptFileName = (rec) => rec.exchangeTranscriptFile || ("yavar-" + rec.id + "-transcript.txt");
export const promptFileName = (records, key) => (records.length === 1
  ? "yavar-prompt-" + (records[0].caseNumber || records[0].id) + ".txt"
  : "yavar-prompt-" + String(key || "batch").replace(/\//g, "-") + ".txt");

function recordTemplate(rec) {
  const spec = formSpec(rec.questionSet);
  const L = [];
  L.push("#YAVAR_RESULT v1");
  L.push("RECORD_ID: " + rec.id);
  L.push("CASE_NUMBER: " + (rec.caseNumber || ""));
  L.push("DATE_JALALI: " + dayKey(rec.createdAt));
  L.push("FORM: " + spec.prefix);
  L.push("CLIENT_NAME: " + oneLine(rec.candidate));
  L.push("SOURCE_TRANSCRIPT_FILE: " + transcriptFileName(rec));
  L.push("DATA_FORMAT: plain UTF-8 text; NOT encrypted; NO password; NO Base64; NO hidden encoding.");
  L.push("# --- پاسخ سؤال‌ها: برای هر کد سه خط (پاسخ، شاهد، اطمینان) ---");
  for (const it of spec.items) {
    L.push("# " + it.code + " | " + it.question);
    L.push(it.code + ": ");
    L.push(it.code + ".EVIDENCE: ");
    L.push(it.code + ".CONF: ");
  }
  L.push("# --- شایستگی‌ها: عدد صحیح ۰ تا ۱۰ ---");
  COMPETENCIES.forEach((name, i) => {
    L.push("# C" + (i + 1) + " | " + name);
    L.push("C" + (i + 1) + ": ");
    L.push("C" + (i + 1) + ".NOTE: ");
  });
  L.push("# --- جمع‌بندی ---");
  for (const k of ["SUMMARY", "STRENGTHS", "WEAKNESSES", "REDFLAGS", "FOLLOWUP", "WARNINGS", "COVERAGE", "OVERALL"]) L.push(k + ": ");
  L.push("TRANSCRIPT_BEGIN");
  L.push("TRANSCRIPT_END");
  L.push("#END_RESULT");
  return L.join("\n");
}

// records: [{ id, caseNumber, candidate, createdAt, questionSet, segs, mime, durationSec }]
export function buildExchangePrompt(records, opts = {}) {
  const list = Array.isArray(records) ? records : [];
  const L = [];
  L.push("#YAVAR_EXCHANGE_PROMPT v1");
  L.push("INTEROPERABILITY: همهٔ فایل‌ها بدون رمزگذاری یا رمز عبور هستند. متن UTF-8 معمولی و برچسب‌ها و کدها اسم‌های خوانای فیلد هستند؛ هیچ رمزگشایی، بازکردن قفل، Base64 یا تبدیل مخفی لازم نیست.");
  L.push("AUDIO NOTE: صوت تا حد امکان به WAV استاندارد PCM تک‌کاناله 16kHz تبدیل شده است. پشتیبانی از دریافت یا شنیدن صوت به برنامه و مدل مقصد وابسته است و یکسان نیست؛ اگر رابط تو صوت را نمی‌پذیرد یا نمی‌توانی واقعاً آن را بشنوی، فایل متن transcript را تحلیل کن و هرگز ادعا نکن صوت را شنیده‌ای.");
  L.push("نقش تو: دستیار استخراج اطلاعات از گفت‌وگوی فارسی مصاحبه با مددجو یا متقاضی، قابل‌استفاده در هر مدل هوش مصنوعی که متن ساده را می‌خواند.");
  L.push("ورودی: پرامپت متنی حاضر، فایل(های) صوتی با نام‌های ذکرشده و در صورت موجود بودن یک فایل TXT با متن گفت‌وگوی همان رکورد. فایل TXT مرجع پشتیبان برای رابط‌هایی است که صوت را نمی‌پذیرند.");
  L.push("کار تو: اگر ابزار صوتی در دسترس است، صوت همان رکورد را بررسی و با متن TXT مقایسه کن؛ اگر ابزار صوتی در دسترس نیست، فقط از متن TXT استفاده کن و این محدودیت را در WARNINGS گزارش کن. سپس قالب همان رکورد را پر کن.");
  if (opts.dayKey) L.push("روز (شمسی): " + opts.dayKey);
  L.push("");
  L.push("قواعد الزامی:");
  L.push("1) اگر صوت واقعاً قابل پردازش است فقط از محتوای صوت و متن همراه آن استفاده کن؛ در غیر این صورت از متن TXT استفاده کن. چیزی را حدس نزن، کامل نکن و اختراع نکن.");
  L.push("2) هر کد Q..-.. فقط وقتی پاسخ دارد که پاسخ همان سؤال در صوت واقعاً آمده باشد. اگر سؤال پرسیده نشد، پاسخ داده نشد یا نامفهوم بود، دقیقاً EMPTY بنویس (برای EVIDENCE و CONF همان کد هم EMPTY).");
  L.push("3) پاسخ هر کد: خلاصهٔ وفادار حرف مددجو/متقاضی در یک خط (حداکثر ۴۰ واژه). EVIDENCE: عین یک عبارت کوتاه از صوت (حداکثر ۲۵ واژه). CONF: فقط HIGH یا MEDIUM یا LOW.");
  L.push("4) هر مقدار فقط در یک خط باشد؛ از Markdown، جدول، فهرست شماره‌دار، کدبلاک و خط جدید داخل مقدار استفاده نکن. خود فایل در قالب متن ساده است و رمزگذاری یا قفل ندارد.");
  L.push("5) نمرهٔ C1 تا C6: عدد صحیح ۰ تا ۱۰ فقط بر پایهٔ شواهد صوت؛ اگر شواهد کافی نیست EMPTY بنویس و دلیلش را در NOTE بیاور.");
  L.push("6) کلیدها و کدها (مثل Q12-03.EVIDENCE) را ترجمه یا تغییر نده. فقط مقدارها فارسی باشند؛ مقدارهای CONF و EMPTY انگلیسی بمانند.");
  L.push("7) RECORD_ID، CASE_NUMBER، DATE_JALALI و FORM را عیناً از قالب بگذار.");
  L.push("8) فهرست‌ها (STRENGTHS، WEAKNESSES، REDFLAGS، FOLLOWUP، WARNINGS): هر مورد را با علامت | جدا کن؛ حداکثر ۵ مورد؛ اگر چیزی نبود EMPTY.");
  L.push("9) متن کامل گفت‌وگو (اختیاری ولی توصیه‌شده) را بین TRANSCRIPT_BEGIN و TRANSCRIPT_END بگذار؛ بخش‌های نامفهوم را با [نامفهوم] علامت بزن.");
  L.push("10) خروجی فقط متن سادهٔ UTF-8 یا فایل TXT/DOCX خوانا باشد؛ هیچ رمزگذاری، رمزعبور، Base64، کدبلاک یا JSON لازم نیست. خروجی نهایی فقط بلوک‌های #YAVAR_RESULT v1 باشد، برای هر رکورد یک بلوک جدا. کدهای Q5/Q12/Q24 فقط شناسهٔ خوانای سؤال‌اند، نه دادهٔ رمزگذاری‌شده.");
  L.push("");
  L.push("محاسبات (برنامهٔ یاور همین فرمول‌ها را دوباره حساب می‌کند و اگر مقدار تو فرق داشته باشد مقدار خودش را ثبت و هشدار می‌دهد؛ نوشتن COVERAGE و OVERALL اختیاری است):");
  L.push("- COVERAGE = گرد( تعداد کدهای دارای پاسخ ÷ تعداد کل سؤال‌های فرم × ۱۰۰ )");
  L.push("- OVERALL = گرد( میانگین C1 تا C6 × ۱۰ ) فقط وقتی هر شش نمره موجود باشد؛ وگرنه EMPTY");
  L.push("- نتیجه: OVERALL از ۷۰ به بالا «" + VERDICTS.high + "»؛ ۵۰ تا ۶۹ «" + VERDICTS.mid + "»؛ کمتر از ۵۰ «" + VERDICTS.low + "» (برنامه خودش تعیین می‌کند؛ لازم نیست بنویسی)");
  L.push("- ترتیب شایستگی‌ها: " + COMPETENCIES.map((n, i) => "C" + (i + 1) + "=" + n).join("، "));
  L.push("");
  L.push("فرم‌ها: Q5 = سوالات فوری (۵ سؤال)، Q12 = ۱۲ سؤال حیاتی، Q24 = پرسش‌نامهٔ کامل (۲۴ سؤال). هر رکورد دقیقاً یکی از این‌هاست و در خط FORM قالبش آمده است.");
  L.push("");
  L.push("رکوردها:");
  list.forEach((rec, n) => {
    const names = Array.from({ length: Math.max(1, rec.segs || 1) }, (_, k) => audioFileName(rec, k)).join("، ");
    const spec = formSpec(rec.questionSet);
    L.push("- رکورد " + (n + 1) + ": RECORD_ID=" + rec.id + " | پرونده " + (rec.caseNumber || "نامشخص") + " | تاریخ " + dayKey(rec.createdAt) + " (" + dayLabel(rec.createdAt) + ") | فرم " + spec.prefix + " (" + spec.label + ") | فایل(های) صوتی: " + names);
  });
  L.push("");
  L.push("قالب‌های خروجی (هر رکورد یک قالب):");
  list.forEach((rec) => { L.push(""); L.push(recordTemplate(rec)); });
  L.push("");
  return L.join("\n");
}
