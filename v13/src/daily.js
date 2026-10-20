// v11: Jalali (Shamsi) dates in Tehran time, unique 6-digit case numbers, daily AI-readable text files.
const TEHRAN_OFFSET_MS = 3.5 * 3600 * 1000; // Iran has no DST since 2022
const WEEKDAYS = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];
const MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
const p2 = (n) => String(n).padStart(2, "0");

function g2j(gy, gm, gd) {
  const g = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days = 355666 + 365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) + gd + g[gm - 1];
  let jy = -1595 + 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}

// ms timestamp -> Jalali parts in Tehran time (independent of the phone's time zone setting).
export function jalaliParts(ms) {
  const d = new Date(ms + TEHRAN_OFFSET_MS);
  const [jy, jm, jd] = g2j(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  return { jy, jm, jd, hh: d.getUTCHours(), mi: d.getUTCMinutes(), weekday: WEEKDAYS[d.getUTCDay()], monthName: MONTHS[jm - 1] };
}
export const dayKey = (ms) => { const j = jalaliParts(ms); return `${j.jy}/${p2(j.jm)}/${p2(j.jd)}`; };
export const dayLabel = (ms) => { const j = jalaliParts(ms); return `${j.weekday} ${j.jd} ${j.monthName} ${j.jy}`; };
export const timeLabel = (ms) => { const j = jalaliParts(ms); return `${p2(j.hh)}:${p2(j.mi)}`; };
export const dayFileName = (key) => `yavar-${key.replace(/\//g, "-")}.txt`;

// Unique 6-digit case number (100000-999999). Numbers are remembered forever so deleted cases never reuse one.
export function newCaseNumber(used) {
  const taken = new Set((used || []).map(String));
  for (let i = 0; i < 200; i++) {
    let n;
    try {
      const a = new Uint32Array(1);
      crypto.getRandomValues(a);
      n = 100000 + (a[0] % 900000);
    } catch (e) { n = 100000 + Math.floor(Math.random() * 900000); }
    if (!taken.has(String(n))) return String(n);
  }
  for (let n = 100000; n <= 999999; n++) if (!taken.has(String(n))) return String(n);
  throw new Error("تمام شماره‌های ۶ رقمی پرونده استفاده شده‌اند.");
}

const clean = (s) => String(s == null ? "" : s).replace(/\r/g, "").trim();
const oneLine = (s) => clean(s).replace(/\s*\n\s*/g, " ");
const fmtDur = (s) => { s = Math.round(s || 0); return `${p2(Math.floor(s / 3600))}:${p2(Math.floor((s % 3600) / 60))}:${p2(s % 60)}`; };

// Group interviews by Jalali day -> { key: [interviews] } (newest day first).
export function groupByDay(items) {
  const map = {};
  for (const i of items) (map[dayKey(i.createdAt)] = map[dayKey(i.createdAt)] || []).push(i);
  return Object.keys(map).sort().reverse().map((key) => ({ key, items: map[key].sort((a, b) => a.createdAt - b.createdAt) }));
}

// Build the structured text file for one day. Excluded records (dailyExcluded) and records without text are skipped.
export function buildDayText(key, items) {
  const included = items.filter((i) => !i.dailyExcluded && clean(i.transcript));
  const first = items[0] ? jalaliParts(items[0].createdAt) : null;
  const byClient = {};
  for (const i of included) {
    const k = (i.caseNumber || "بدون-شماره") + "|" + oneLine(i.candidate || "");
    (byClient[k] = byClient[k] || []).push(i);
  }
  const groups = Object.values(byClient);
  const L = [];
  L.push("#YAVAR_DAILY_LOG v1");
  L.push("FORMAT: plain text; blocks start with '###'; fields are 'KEY: value'; transcript is between TRANSCRIPT_BEGIN and TRANSCRIPT_END.");
  L.push("LANGUAGE: fa");
  L.push("DATE_JALALI: " + key);
  L.push("WEEKDAY: " + (first ? first.weekday : ""));
  L.push("TIMEZONE: Asia/Tehran");
  L.push("CLIENT_COUNT: " + groups.length);
  L.push("RECORD_COUNT: " + included.length);
  L.push("NOTE: transcripts are automatic speech-to-text output and may contain recognition errors.");
  groups.forEach((g, gi) => {
    L.push("");
    L.push("### CLIENT " + (gi + 1));
    L.push("CLIENT_NAME: " + (oneLine(g[0].candidate) || "نامشخص"));
    L.push("CASE_NUMBER: " + (g[0].caseNumber || "نامشخص"));
    L.push("CLIENT_RECORD_COUNT: " + g.length);
    g.forEach((i, ri) => {
      L.push("");
      L.push("## RECORD " + (gi + 1) + "." + (ri + 1));
      L.push("RECORD_ID: " + i.id);
      L.push("TIME: " + timeLabel(i.createdAt));
      L.push("DURATION: " + fmtDur(i.durationSec));
      if (clean(i.position)) L.push("POSITION: " + oneLine(i.position));
      if (clean(i.interviewer)) L.push("INTERVIEWER: " + oneLine(i.interviewer));
      L.push("TRANSCRIPT_BEGIN");
      L.push(clean(i.transcript));
      L.push("TRANSCRIPT_END");
    });
  });
  L.push("");
  L.push("#END_OF_DAILY_LOG");
  return L.join("\n") + "\n";
}

export const AI_PROMPT = `تو یک دستیار تحلیل پرونده هستی. فایل متنی پیوست «لاگ روزانه یاور» است (قالب #YAVAR_DAILY_LOG v1).\nقواعد:\n1) فقط از اطلاعاتی که در بخش‌های TRANSCRIPT_BEGIN تا TRANSCRIPT_END آمده استفاده کن؛ چیزی اضافه یا حدس نزن. اگر اطلاعاتی نبود بنویس «در متن نیامده است».\n2) هر مددجو را با CASE_NUMBER و CLIENT_NAME از هم جدا کن. چند رکورد یک مددجو را ترکیب کن.\n3) متن‌ها خروجی خودکار گفتار به متن هستند و ممکن است اشتباه تشخیص داشته باشند؛ موارد مبهم را مشخص کن.\n4) تاریخ‌ها شمسی هستند (DATE_JALALI).\nخروجی برای هر مددجو:\n- شماره پرونده و نام\n- خلاصهٔ گفت‌وگو (حداکثر ۵ خط)\n- مشکلات و نیازهای مطرح‌شده\n- نکات مهم و اقدام‌های پیشنهادی\n- موارد نیازمند پیگیری یا بررسی انسانی\nدر پایان یک جدول خلاصهٔ همهٔ مددجویان آن روز بساز.`;
