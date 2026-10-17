package ir.yavarshahrha.interview

import java.security.MessageDigest

object Scoring {
    const val MAX_DEDUCTION_FULL = 8
    const val CRITICAL_MIN = 18
    const val CRITICAL_MAX = 24

    enum class Suggestion(val label: String) {
        RED_LINE("خط قرمز بر امتیاز مقدم است؛ تصمیم عددی معتبر نیست"),
        INCOMPLETE("امتیاز همهٔ سؤال‌های این نسخه هنوز ثبت نشده"),
        DEDUCTION_UNDOCUMENTED("کسر رفتاری درخواستی مستند نیست؛ پیشنهاد بازه‌ای داده نمی‌شود"),
        CRITICAL_GATE_CLOSED("دروازه حیاتی برقرار نیست؛ ورود به تصمیم نهایی مجاز نیست"),
        URGENT_PROHIBITED_DIRECT("نسخه فوری؛ پیشنهاد ارجاع مستقیم ممنوع است"),
        DIRECT_REFERRAL_REVIEW("پیشنهاد بازبینی برای ارجاع مستقیم — تصمیم نهایی نیست"),
        CONDITIONAL_REVIEW("پیشنهاد مشروط برای بازبینی انسانی — تصمیم نهایی نیست"),
        DEFER_COMPLETE_INFO("تعویق و تکمیل اطلاعات — پیشنهاد بازبینی، نه تصمیم نهایی"),
        DEFER_OR_ALTERNATE("تعویق یا مسیر جایگزین — پیشنهاد بازبینی، نه تصمیم نهایی")
    }

    class EvalResult(
        val raw: Int,
        val maxRaw: Int,
        val missingIds: List<String>,
        val ignoredInvalidFullScoreIds: List<String>,
        val deductionApplied: Int,
        val deductionClamped: Boolean,
        val deductionRejected: String?,
        val net: Int,
        val criticalSum: Int?,
        val criticalMax: Int,
        val unresolvedZeroIds: List<String>,
        val criticalGatePassed: Boolean,
        val redLines: List<String>,
        val suggestion: Suggestion,
        val notes: List<String>
    )

    fun attributionReliable(a: Answer): Boolean {
        return a.speakerClient &&
            a.evidence.isNotBlank() &&
            a.status != Status.UNANSWERED &&
            a.status != Status.UNCLEAR &&
            a.status != Status.NEEDS_REVIEW
    }

    /** Full marks need reliable client attribution, evidence and an explicit answered status. */
    fun scoreAllowed(score: Int, a: Answer): Boolean {
        if (score != 2) return true
        return attributionReliable(a) && a.status == Status.ANSWERED
    }

    fun redLines(c: CaseFile): List<String> {
        val lines = ArrayList<String>()
        if (!c.consentRecorded || !c.consentExplained) {
            lines.add("نبود رضایت آگاهانهٔ مکتوب برای مصاحبه، ضبط یا پردازش")
        }
        if (!c.dischargeConfirmed) lines.add("نبود تأیید مرجع ترخیص")
        if (c.psychCrisis) lines.add("بحران روانی یا قصد آسیب")
        if (c.medicalUnstable) lines.add("ناپایداری پزشکی")
        if (c.noSafeNight) lines.add("نبود محل امن برای شب اول")
        if (c.clinicalGateActive && !c.clinicalCleared) {
            lines.add("دروازه بالینی فعال بدون تأیید حرفه‌ای")
        }
        return lines
    }

    /** Returns (score or null, invalidFullMark). */
    private fun readScore(a: Answer?): Pair<Int?, Boolean> {
        if (a == null || a.score < 0) return Pair(null, false)
        if (a.score > 2) return Pair(null, true)
        if (a.score == 2 && !scoreAllowed(2, a)) return Pair(null, true)
        return Pair(a.score, false)
    }

    private class Ded(val applied: Int, val clamped: Boolean, val rejected: String?)

    private fun resolveDeduction(c: CaseFile): Ded {
        val requested = c.deduction.requested
        if (requested <= 0) return Ded(0, false, null)
        if (c.kind == Kind.URGENT) {
            return Ded(0, false, "سقف کسر نسخه فوری در سند پیوست نیست؛ تا تأیید سازمان هیچ کسری اعمال نمی‌شود.")
        }
        val d = c.deduction
        val documented = d.evidence.isNotBlank() &&
            d.contextTime.isNotBlank() &&
            d.repetition.isNotBlank() &&
            d.baseline.isNotBlank() &&
            d.confounders
        if (!documented) {
            return Ded(
                0, false,
                "کسر بدون شرح شاهد، زمان و زمینه، تکرار، خط پایه و بررسی عوامل مخدوش‌کننده اعمال نشد."
            )
        }
        if (requested > MAX_DEDUCTION_FULL) return Ded(MAX_DEDUCTION_FULL, true, null)
        return Ded(requested, false, null)
    }

    fun evaluate(c: CaseFile): EvalResult {
        val ids = Rules.scope(c.kind)
        val missing = ArrayList<String>()
        val ignored = ArrayList<String>()
        var raw = 0
        for (id in ids) {
            val r = readScore(c.answers[id])
            if (r.second) ignored.add(id)
            val s = r.first
            if (s == null) missing.add(id) else raw += s
        }

        val ded = resolveDeduction(c)
        val net = raw - ded.applied
        val red = redLines(c)

        var criticalSum: Int? = null
        var gatePassed = false
        val unresolvedZero = ArrayList<String>()
        if (c.kind == Kind.FULL) {
            var sum = 0
            var missingCritical = false
            for (id in Rules.CRITICAL_IDS) {
                val s = readScore(c.answers[id]).first
                if (s == null) {
                    missingCritical = true
                } else {
                    sum += s
                }
                if (s == 0 && c.answers[id]?.zeroResolved != true) unresolvedZero.add(id)
            }
            criticalSum = if (missingCritical) null else sum
            gatePassed = !missingCritical && sum >= CRITICAL_MIN && unresolvedZero.isEmpty()
        }

        val notes = ArrayList<String>()
        notes.add("خروجی سامانه به‌تنهایی تصمیم نهایی ارجاع نیست.")
        if (!Rules.PDF_VERIFIED) {
            notes.add("معیارهای تفصیلی ۰ و ۱ و ۲ از PDF شیوه‌نامه بارگذاری نشده‌اند؛ امتیاز را فقط کارشناس وارد می‌کند و متن سؤال‌ها باید با PDF تطبیق داده شود.")
        }
        if (c.kind == Kind.URGENT) {
            notes.add("شش سؤال نسخه فوری موقتاً ح۱ تا ح۶ است و باید با شیوه‌نامه تطبیق داده شود. ارجاع مستقیم ممنوع است.")
        }
        if (c.synthetic) notes.add("این پرونده آموزشی و مصنوعی است و نباید مبنای ارجاع واقعی شود.")
        if (ded.rejected != null) notes.add(ded.rejected)
        if (ded.clamped) notes.add("کسر درخواستی بیش از سقف ۸ بود و روی ۸ محدود شد.")
        if (ignored.isNotEmpty()) {
            notes.add("امتیاز ۲ بدون شاهد معتبر یا با انتساب نامطمئن در جمع وارد نشده است.")
        }
        if (missing.isNotEmpty()) notes.add("سؤال بی‌امتیاز در این نسخه وجود دارد.")

        val suggestion: Suggestion = if (red.isNotEmpty()) {
            Suggestion.RED_LINE
        } else if (missing.isNotEmpty() || ignored.isNotEmpty()) {
            Suggestion.INCOMPLETE
        } else if (c.kind == Kind.FULL && c.deduction.requested > 0 && ded.applied == 0) {
            Suggestion.DEDUCTION_UNDOCUMENTED
        } else if (c.kind == Kind.URGENT) {
            Suggestion.URGENT_PROHIBITED_DIRECT
        } else if (!gatePassed) {
            Suggestion.CRITICAL_GATE_CLOSED
        } else if (net >= 40) {
            Suggestion.DIRECT_REFERRAL_REVIEW
        } else if (net >= 30) {
            Suggestion.CONDITIONAL_REVIEW
        } else if (net >= 20) {
            Suggestion.DEFER_COMPLETE_INFO
        } else {
            Suggestion.DEFER_OR_ALTERNATE
        }

        return EvalResult(
            raw = raw,
            maxRaw = ids.size * 2,
            missingIds = missing,
            ignoredInvalidFullScoreIds = ignored,
            deductionApplied = ded.applied,
            deductionClamped = ded.clamped,
            deductionRejected = ded.rejected,
            net = net,
            criticalSum = criticalSum,
            criticalMax = CRITICAL_MAX,
            unresolvedZeroIds = unresolvedZero,
            criticalGatePassed = gatePassed,
            redLines = red,
            suggestion = suggestion,
            notes = notes
        )
    }

    /** Hash of everything that affects the outcome. Approvals are bound to this hash. */
    fun canonicalHash(c: CaseFile): String {
        val sb = StringBuilder()
        sb.append(Rules.VERSION).append('|').append(c.id).append('|').append(c.kind.name).append('|')
        sb.append(c.code).append('|').append(c.synthetic).append('|').append(c.urgentReason).append('|')
        sb.append(c.consentRecorded).append(c.consentExplained).append(c.dischargeConfirmed)
        sb.append(c.psychCrisis).append(c.medicalUnstable).append(c.noSafeNight)
        sb.append(c.clinicalGateActive).append(c.clinicalCleared).append('|')
        for (id in Rules.scope(c.kind)) {
            val a = c.answers[id]
            sb.append(id).append(':')
            if (a == null) {
                sb.append("none")
            } else {
                sb.append(a.score).append(',').append(a.status.name).append(',')
                sb.append(a.zeroResolved).append(',').append(a.speakerClient).append(',')
                sb.append(a.evidence)
            }
            sb.append(';')
        }
        val d = c.deduction
        sb.append('|').append(d.requested).append(d.evidence).append(d.contextTime)
        sb.append(d.repetition).append(d.baseline).append(d.confounders)
        val digest = MessageDigest.getInstance("SHA-256").digest(sb.toString().toByteArray(Charsets.UTF_8))
        val hex = StringBuilder()
        for (b in digest) hex.append(String.format("%02x", b))
        return hex.toString()
    }

    fun approvalValid(c: CaseFile, ap: Approval?): Boolean {
        return ap != null && ap.hash == canonicalHash(c)
    }

    fun preApprovalBlockers(c: CaseFile, r: EvalResult): List<String> {
        val b = ArrayList<String>()
        if (!c.consentRecorded || !c.consentExplained) b.add("رضایت آگاهانه ثبت نشده است")
        if (c.kind == Kind.URGENT && c.urgentReason.isBlank()) b.add("علت استفاده از نسخه فوری ثبت نشده است")
        if (r.suggestion == Suggestion.INCOMPLETE || r.suggestion == Suggestion.DEDUCTION_UNDOCUMENTED) {
            b.add("جمع‌بندی هنوز قابل امضا نیست")
        }
        return b
    }

    fun closeBlockers(c: CaseFile, r: EvalResult): List<String> {
        val b = ArrayList<String>(preApprovalBlockers(c, r))
        val a1 = c.approval1
        val a2 = c.approval2
        val v1 = approvalValid(c, a1)
        val v2 = approvalValid(c, a2)
        if (!v1) b.add("تأیید کارشناس اول ثبت نشده یا پس از تغییر پرونده نامعتبر شده است")
        if (!v2) b.add("تأیید کارشناس دوم ثبت نشده یا پس از تغییر پرونده نامعتبر شده است")
        if (a1 != null && a2 != null && v1 && v2 && a1.userId == a2.userId) {
            b.add("تأیید دوم باید توسط فرد دیگری باشد")
        }
        return b
    }
}
