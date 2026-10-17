package ir.yavarshahrha.interview

import android.graphics.Color
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import java.io.ByteArrayOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object PdfReport {

    private fun fmt(ms: Long): String =
        SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US).format(Date(ms))

    fun build(c: CaseFile, r: Scoring.EvalResult, blockers: List<String>): ByteArray {
        val doc = PdfDocument()
        val pw = 595
        val ph = 842
        val m = 40
        val paint = TextPaint(Paint.ANTI_ALIAS_FLAG)
        paint.color = Color.BLACK

        var pageNo = 1
        var page = doc.startPage(PdfDocument.PageInfo.Builder(pw, ph, pageNo).create())
        var y = m.toFloat()

        fun newPage() {
            doc.finishPage(page)
            pageNo += 1
            page = doc.startPage(PdfDocument.PageInfo.Builder(pw, ph, pageNo).create())
            y = m.toFloat()
        }

        fun block(text: String, size: Float = 11f, bold: Boolean = false) {
            paint.textSize = size
            paint.isFakeBoldText = bold
            for (line in text.split("\n")) {
                val layout = StaticLayout(
                    "\u200F" + line, paint, pw - 2 * m,
                    Layout.Alignment.ALIGN_NORMAL, 1.25f, 0f, false
                )
                if (y + layout.height > ph - m) newPage()
                val cv = page.canvas
                cv.save()
                cv.translate(m.toFloat(), y)
                layout.draw(cv)
                cv.restore()
                y += layout.height + 3f
            }
        }

        val draft = blockers.isNotEmpty()
        block("گزارش مصاحبه یاورشهرها", 18f, true)
        if (draft) block("پیش‌نویس — غیررسمی (تأیید دوگانه یا شرایط امضا کامل نیست)", 12f, true)
        if (c.synthetic) block("پرونده آموزشی/مصنوعی — مبنای ارجاع واقعی نیست", 12f, true)
        block("کد پرونده: " + c.code)
        if (c.alias.isNotBlank()) block("نام مستعار: " + c.alias)
        if (c.center.isNotBlank()) block("مرکز: " + c.center)
        block("نوع مصاحبه: " + (if (c.kind == Kind.FULL) "کامل" else "فوری") +
            (if (c.kind == Kind.URGENT) " — علت: " + c.urgentReason else ""))
        block("تاریخ تهیه: " + fmt(System.currentTimeMillis()))
        block("نسخه قواعد: " + Rules.VERSION + " (تطبیق با PDF رسمی انجام نشده)")
        block(" ")

        block("نتیجه", 14f, true)
        block("جمع خام: " + r.raw + " از " + r.maxRaw)
        block("کسر اعمال‌شده: " + r.deductionApplied)
        block("امتیاز خالص: " + r.net)
        if (c.kind == Kind.FULL) {
            block("سؤال‌های حیاتی: " + (r.criticalSum?.toString() ?: "ناقص") + " از " + r.criticalMax +
                " (حداقل " + Scoring.CRITICAL_MIN + ")")
        }
        for (rl in r.redLines) block("خط قرمز: " + rl, 11f, true)
        block("پیشنهاد سامانه: " + r.suggestion.label, 12f, true)
        for (n in r.notes) block("• " + n, 10f)
        block(" ")

        block("سؤال‌ها و شواهد", 14f, true)
        for (id in Rules.scope(c.kind)) {
            val q = Rules.byId(id) ?: continue
            val a = c.answers[id]
            val score = if (a == null || a.score < 0) "بدون امتیاز" else a.score.toString()
            val st = a?.status?.label ?: Status.UNANSWERED.label
            block(id + (if (q.critical) " (حیاتی)" else "") + " — امتیاز: " + score + " — وضعیت: " + st, 11f, true)
            block(q.text, 10f)
            if (a != null && a.evidence.isNotBlank()) {
                block("شاهد" + (if (a.speakerClient) " (گوینده: مددجو تأیید شده)" else " (گوینده تأیید نشده)") + ": " + a.evidence, 10f)
            }
            if (a != null && a.note.isNotBlank()) block("یادداشت: " + a.note, 10f)
            if (a != null && a.score == 0 && a.zeroResolved) block("صفر بررسی و حل شده", 10f)
        }
        block(" ")

        if (c.kind == Kind.FULL && c.deduction.requested > 0) {
            val d = c.deduction
            block("کسر رفتاری", 14f, true)
            block("مقدار درخواستی: " + d.requested + " — اعمال‌شده: " + r.deductionApplied)
            block("شاهد: " + d.evidence, 10f)
            block("زمان و زمینه: " + d.contextTime, 10f)
            block("تکرار: " + d.repetition, 10f)
            block("خط پایه: " + d.baseline, 10f)
            block("عوامل مخدوش‌کننده بررسی شده: " + (if (d.confounders) "بله" else "خیر"), 10f)
            block(" ")
        }

        block("تأیید دوگانه", 14f, true)
        val a1 = c.approval1
        val a2 = c.approval2
        block("کارشناس اول: " + (if (a1 != null && Scoring.approvalValid(c, a1)) a1.name + " — " + fmt(a1.atMs) else "ثبت نشده"))
        block("کارشناس دوم: " + (if (a2 != null && Scoring.approvalValid(c, a2)) a2.name + " — " + fmt(a2.atMs) else "ثبت نشده"))
        for (b in blockers) block("• " + b, 10f)
        block(" ")
        block("این گزارش پیشنهاد بازبینی است؛ تصمیم نهایی و تشخیص بالینی نیست.", 10f)

        doc.finishPage(page)
        val out = ByteArrayOutputStream()
        doc.writeTo(out)
        doc.close()
        return out.toByteArray()
    }
}
