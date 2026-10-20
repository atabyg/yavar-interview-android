package ir.yavarshahrha.interview

enum class Kind { FULL, URGENT }

class Question(
    val id: String,
    val critical: Boolean,
    val urgent: Boolean,
    val text: String
)

/**
 * Control-list questions taken from the project prompt (section 7).
 * The official PDF guideline was NOT available when this was built:
 * every rule here must be reconciled with the PDF by a human before real use.
 */
object Rules {
    const val VERSION = "control-list-v1.0"
    const val PDF_VERIFIED = false

    val QUESTIONS: List<Question> = listOf(
        Question("H01", true, true, "اگر خروج شما فردا قطعی شود، سه کار اول شما چیست؟ زمان و مکان هرکدام را بگویید."),
        Question("H02", true, true, "۷۲ ساعت اول بعد از خروج را قدم‌به‌قدم توضیح دهید."),
        Question("H03", true, true, "اگر کسی از ارتباطات قبلی شما دعوتی بدهد که مسیر جدیدتان را به خطر بیندازد، چه می‌کنید؟"),
        Question("H04", true, true, "اگر همکاری رفتار یا پیشنهادی برخلاف برنامه شما مطرح کند، یک پاسخ واقعی و کوتاه بگویید."),
        Question("H05", true, true, "چه چیزی ممکن است باعث شود کار را رها کنید و چه برنامه‌ای برای آن دارید؟"),
        Question("H06", true, true, "چه کسی از برنامه کار شما خبر دارد و دقیقاً چه کمکی می‌تواند بکند؟"),
        Question("H07", true, false, "آخرین بار که تحت فشار یا عصبانیت شدید بودید، چه شد و دقیقاً چه کردید؟"),
        Question("H08", true, false, "اگر شروع کار یک هفته عقب بیفتد، اما مسیر مطمئن‌تری پیدا شود، چه می‌کنید؟"),
        Question("H09", true, false, "اگر مانع غیرمنتظره‌ای در روز اول ایجاد شود، چه تصمیم عملی می‌گیرید؟"),
        Question("H10", true, false, "چرا می‌خواهید وارد این کار شوید و اگر کار دلخواه آماده نباشد، چه گزینه‌ای را می‌پذیرید؟"),
        Question("H11", true, false, "اگر اولین شغل مطابق انتظار شما نبود، سه راه جایگزین شما چیست؟"),
        Question("H12", true, false, "اگر در محل کار اشتباه کنید، اولین اقدام شما و اولین فردی که مطلع می‌کنید چیست؟"),
        Question("Q13", false, false, "چه چیزی در زندگی شما با داشتن این شغل واقعاً تغییر می‌کند؟ یک مثال عملی بزنید."),
        Question("Q14", false, false, "عنوان شغل، محل، ساعت و وظیفه اصلی کار موردنظر شما چیست و این اطلاعات را از کجا دارید؟"),
        Question("Q15", false, false, "از حقوق و شرایط کار چه انتظاری دارید و برای این انتظار چه سابقه یا مهارتی دارید؟"),
        Question("Q16", false, false, "یک روز کاری قبلی خود را از شروع تا پایان، مرحله‌به‌مرحله تعریف کنید."),
        Question("Q17", false, false, "اگر کاری را بلد نباشید، دقیقاً برای یادگیری چه می‌کنید و از چه کسی کمک می‌گیرید؟"),
        Question("Q18", false, false, "مسیر رفت‌وآمد شما چیست؟ وسیله، زمان تقریبی و هزینه را بگویید."),
        Question("Q19", false, false, "بعد از پذیرش در مرکز مقصد، چگونه و به چه کسی پاسخگو خواهید بود؟"),
        Question("Q20", false, false, "اگر پاسخ یک سؤال را ندانید یا مطمئن نباشید، چه می‌گویید و چه می‌کنید؟"),
        Question("Q21", false, false, "کدام بخش کاری را برای خودتان سخت‌تر از آنچه ابتدا فکر می‌کردید می‌دانید؟"),
        Question("Q22", false, false, "بخشی از توضیح قبلی‌تان را دوباره و این بار با ترتیب زمانی، مکان و افراد بازگو کنید."),
        Question("Q23", false, false, "برای هفته اول، دقیقاً چه کسی، چه زمانی و چگونه می‌تواند به شما کمک کند؟"),
        Question("Q24", false, false, "اگر کارشناس بگوید بخشی از برنامه شما هنوز روشن نیست، چه اطلاعات یا مدرکی برای روشن‌شدن آن ارائه می‌کنید؟")
    )

    val CRITICAL_IDS: List<String> = QUESTIONS.filter { it.critical }.map { it.id }
    val URGENT_IDS: List<String> = QUESTIONS.filter { it.urgent }.map { it.id }
    val FULL_IDS: List<String> = QUESTIONS.map { it.id }

    fun scope(kind: Kind): List<String> = if (kind == Kind.URGENT) URGENT_IDS else FULL_IDS

    fun byId(id: String): Question? = QUESTIONS.firstOrNull { it.id == id }
}
