const UNKNOWN = "نامشخص";

export function transcriptGuidance(enabled = true) {
  const common = "قاعدهٔ الزامی: از شنیده‌نشدن یا مبهم‌بودن، پاسخ نساز. اصلاح املای فارسی، علائم نگارشی و واژهٔ واضح مجاز است، اما بازنویسی معنایی بدون شاهد ممنوع است. نمره را فقط به شواهد روشن دربارهٔ پرسش‌نامه و شغل نسبت بده؛ صدای نامفهوم، تکرار و پاسخ قابل‌انتساب‌نبودن امتیاز مثبت یا منفی نیست. اگر شواهد کافی نیست، صریح بگو «شواهد کافی نبود» و برای رفع ابهام سؤال پیگیری پیشنهاد کن.";
  if (!enabled) return common + " متن پاک‌سازی‌شده را محافظه‌کارانه نگه دار و از ادعای تشخیص قطعی گوینده خودداری کن.";
  return common + " بازسازی هوشمند گفت‌وگو را انجام بده: (۱) پرسش‌های مشخص مصاحبه‌گر را از جواب‌های متقاضی جدا کن و در cleanTranscript برچسب «مصاحبه‌گر»، «متقاضی» یا «گوینده نامشخص» بگذار؛ نقش را فقط از شواهد مکالمه تشخیص بده، نه بر اساس ترتیب یا حدس. (۲) گفت‌وگوی رهگذران، تلویزیون، صدای محیط، پژواک، هجاهای تصادفی و تکه‌های تکراریِ آشکار ناشی از تشخیص گفتار را در cleanTranscript وارد نکن؛ اگر شک داری، آن را با [نامفهوم/گوینده نامشخص] علامت بزن یا در transcriptWarnings توضیح بده، نه اینکه کلمه بسازی. (۳) جملهٔ ناقص را کامل نکن مگر ادامه در همان متن موجود باشد. (۴) پرسش و پاسخ را به سؤال‌های همین فرم/سمت وصل کن؛ اگر هم‌پوشانی صدا یا نقش مبهم است confidence را «پایین» بگذار و بنویس شواهد کافی نیست. (۵) در qaPairs حداکثر ۱۲ جفت مهمِ مستند ثبت کن؛ متن سؤال و جواب می‌تواند کوتاه و faithful باشد و matchedQuestion باید سؤال مرتبط از فرم را نشان دهد. (۶) اطلاعات متناقض را آشتی نده؛ تناقض و ابهام را در transcriptWarnings نگه دار. متن تمیزشده فقط گفتار قابل‌انتساب و مرتبط را نگه دارد و نباید شواهد اصلی را بیش از حد حذف کند.";
}

function normalizeSpeaker(value) {
  const s = String(value || "").toLowerCase();
  if (/مصاحبه.?گر|پرسش.?گر|ارزیاب|interviewer|questioner/.test(s)) return "مصاحبه‌گر";
  if (/متقاضی|مصاحبه.?شونده|مددجو|داوطلب|candidate|applicant/.test(s)) return "متقاضی";
  return UNKNOWN;
}

export function sanitizeQaPairs(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).filter((item) => item && typeof item === "object").map((item) => ({
    question: String(item.question || "").trim().slice(0, 1200),
    answer: String(item.answer || "").trim().slice(0, 2200),
    questionSpeaker: normalizeSpeaker(item.questionSpeaker),
    answerSpeaker: normalizeSpeaker(item.answerSpeaker),
    matchedQuestion: String(item.matchedQuestion || "").trim().slice(0, 600),
    confidence: ["بالا", "متوسط", "پایین"].includes(String(item.confidence || "")) ? String(item.confidence) : "پایین",
    evidence: String(item.evidence || "").trim().slice(0, 600)
  })).filter((item) => item.question);
}
