package ir.yavarshahrha.interview

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import java.io.File
import java.util.UUID

class MainActivity : Activity() {

    private lateinit var vault: Vault
    private var back: (() -> Unit)? = null
    private var suppressLock = false
    private var pendingPdf: ByteArray? = null

    private val matchParent = ViewGroup.LayoutParams.MATCH_PARENT
    private val wrapContent = ViewGroup.LayoutParams.WRAP_CONTENT
    private val red = Color.rgb(176, 0, 32)
    private val green = Color.rgb(27, 94, 32)
    private val orange = Color.rgb(191, 87, 0)
    private val gray = Color.rgb(90, 90, 90)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Block screenshots and the recent-apps thumbnail: the data is sensitive.
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
        vault = Vault(File(filesDir, "vault.bin"))
        showLock()
    }

    override fun onStop() {
        super.onStop()
        if (!suppressLock && vault.isUnlocked()) {
            try {
                vault.save()
            } catch (e: Exception) {
                // nothing sensible to do while leaving the screen
            }
            vault.lock()
            showLock()
        }
    }

    override fun onBackPressed() {
        val b = back
        if (b != null) b() else super.onBackPressed()
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        suppressLock = false
        if (requestCode == REQ_SAVE_PDF && resultCode == RESULT_OK) {
            val uri = data?.data
            val bytes = pendingPdf
            if (uri != null && bytes != null) {
                try {
                    contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
                    toast("فایل PDF ذخیره شد")
                } catch (e: Exception) {
                    toast("خطا در ذخیره فایل")
                }
            }
        }
        pendingPdf = null
    }

    // ------------------------------------------------------------------ helpers

    private fun px(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    private fun toast(t: String) {
        Toast.makeText(this, t, Toast.LENGTH_LONG).show()
    }

    private fun dialog(): AlertDialog.Builder = AlertDialog.Builder(this)

    private fun persist() {
        if (vault.isUnlocked()) {
            try {
                vault.save()
            } catch (e: Exception) {
                toast("خطا در ذخیره‌سازی امن")
            }
        }
    }

    /** Runs slow work (key derivation) off the UI thread. */
    private fun async(work: () -> Boolean, done: (Boolean) -> Unit) {
        toast("لطفاً صبر کنید…")
        Thread {
            val ok = try {
                work()
            } catch (e: Exception) {
                false
            }
            runOnUiThread { done(ok) }
        }.start()
    }

    private fun screen(backAction: (() -> Unit)?, build: LinearLayout.() -> Unit) {
        persist()
        back = backAction
        val col = LinearLayout(this)
        col.orientation = LinearLayout.VERTICAL
        col.setPadding(px(16), px(16), px(16), px(40))
        col.build()
        val sv = ScrollView(this)
        sv.addView(col)
        sv.setBackgroundColor(Color.WHITE)
        sv.layoutDirection = View.LAYOUT_DIRECTION_RTL
        sv.isFillViewport = true
        setContentView(sv)
    }

    private fun LinearLayout.tv(
        t: String,
        size: Float = 15f,
        color: Int = Color.BLACK,
        bold: Boolean = false
    ): TextView {
        val v = TextView(context)
        v.text = t
        v.textSize = size
        v.setTextColor(color)
        if (bold) v.setTypeface(v.typeface, Typeface.BOLD)
        v.gravity = Gravity.START
        v.textDirection = View.TEXT_DIRECTION_RTL
        v.setPadding(0, px(6), 0, px(2))
        addView(v, LinearLayout.LayoutParams(matchParent, wrapContent))
        return v
    }

    private fun LinearLayout.field(
        label: String,
        value: String,
        multiline: Boolean = false,
        numeric: Boolean = false,
        password: Boolean = false,
        onChange: (String) -> Unit
    ): EditText {
        tv(label, 13f, gray)
        val e = EditText(context)
        e.setText(value)
        var type = if (numeric) InputType.TYPE_CLASS_NUMBER else InputType.TYPE_CLASS_TEXT
        if (password) {
            type = if (numeric) {
                InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
            } else {
                InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            }
        }
        if (multiline) {
            type = type or InputType.TYPE_TEXT_FLAG_MULTI_LINE
            e.minLines = 3
            e.gravity = Gravity.START or Gravity.TOP
        } else {
            e.gravity = Gravity.START
        }
        e.inputType = type
        e.textDirection = View.TEXT_DIRECTION_RTL
        e.addTextChangedListener(object : TextWatcher {
            override fun afterTextChanged(s: Editable?) {
                onChange(s?.toString() ?: "")
            }

            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
        })
        addView(e, LinearLayout.LayoutParams(matchParent, wrapContent))
        return e
    }

    private fun LinearLayout.check(label: String, value: Boolean, onChange: (Boolean) -> Unit): CheckBox {
        val cb = CheckBox(context)
        cb.text = label
        cb.textSize = 15f
        cb.isChecked = value
        cb.setOnCheckedChangeListener { _, v -> onChange(v) }
        addView(cb, LinearLayout.LayoutParams(matchParent, wrapContent))
        return cb
    }

    private fun LinearLayout.btn(label: String, enabled: Boolean = true, onClick: () -> Unit): Button {
        val b = Button(context)
        b.text = label
        b.isEnabled = enabled
        b.setOnClickListener { onClick() }
        val lp = LinearLayout.LayoutParams(matchParent, wrapContent)
        lp.topMargin = px(8)
        addView(b, lp)
        return b
    }

    private fun LinearLayout.choice(options: List<String>, selected: Int, onSelect: (Int) -> Unit) {
        val buttons = ArrayList<RadioButton>()
        for (i in options.indices) {
            val rb = RadioButton(context)
            rb.text = options[i]
            rb.isChecked = (i == selected)
            rb.setOnClickListener {
                for (j in buttons.indices) buttons[j].isChecked = (j == i)
                onSelect(i)
            }
            buttons.add(rb)
            addView(rb, LinearLayout.LayoutParams(matchParent, wrapContent))
        }
    }

    // ------------------------------------------------------------------ screens

    private fun showLock() {
        screen(null) {
            tv("مصاحبه یاورشهرها", 24f, Color.BLACK, true)
            if (!vault.exists()) {
                tv(
                    "اولین اجرا: یک گذرواژه قوی (حداقل ۸ نویسه) برای رمزگذاری داده‌ها انتخاب کنید. " +
                        "اگر گم شود هیچ راهی برای بازیابی داده‌ها نیست.",
                    14f
                )
                var p1 = ""
                var p2 = ""
                field("گذرواژه", "", password = true) { p1 = it }
                field("تکرار گذرواژه", "", password = true) { p2 = it }
                btn("ایجاد و ورود") {
                    if (p1.length < 8) {
                        toast("گذرواژه باید حداقل ۸ نویسه باشد")
                    } else if (p1 != p2) {
                        toast("دو گذرواژه یکسان نیستند")
                    } else {
                        val chars = p1.toCharArray()
                        async({ vault.create(chars); true }) { ok ->
                            if (ok) showHome() else toast("خطا در ایجاد پایگاه داده")
                        }
                    }
                }
            } else {
                var p = ""
                field("گذرواژه", "", password = true) { p = it }
                btn("باز کردن") {
                    val chars = p.toCharArray()
                    async({ vault.unlock(chars) }) { ok ->
                        if (ok) showHome() else toast("گذرواژه نادرست است")
                    }
                }
            }
            tv("داده‌ها فقط روی همین دستگاه و با AES-256 ذخیره می‌شوند. این برنامه مجوز اینترنت ندارد.", 12f, gray)
        }
    }

    private fun caseStatus(c: CaseFile): String {
        val r = Scoring.evaluate(c)
        return if (Scoring.closeBlockers(c, r).isEmpty()) {
            "امضاشده"
        } else if (c.answers.isNotEmpty()) {
            "در جریان"
        } else {
            "جدید"
        }
    }

    private fun showHome() {
        screen(null) {
            tv("پرونده‌ها", 22f, Color.BLACK, true)
            tv("خروجی برنامه پیشنهاد بازبینی است؛ تصمیم نهایی با کارشناس است.", 12f, gray)
            btn("پرونده جدید") {
                val c = CaseFile(UUID.randomUUID().toString())
                c.log("create", "ایجاد پرونده")
                vault.cases.add(c)
                showCase(c)
            }
            val sorted = vault.cases.sortedByDescending { it.updatedAt }
            for (c in sorted) {
                val title = if (c.code.isBlank()) "(بدون کد)" else c.code
                val kind = if (c.kind == Kind.FULL) "کامل" else "فوری"
                btn(title + " · " + kind + " · " + caseStatus(c)) { showCase(c) }
            }
            btn("کارشناسان (برای تأیید دوگانه)") { showUsers() }
            btn("روش و محدودیت‌ها") { showMethod() }
            btn("قفل کردن") {
                persist()
                vault.lock()
                showLock()
            }
        }
    }

    private fun showMethod() {
        screen({ showHome() }) {
            tv("روش و محدودیت‌ها", 20f, Color.BLACK, true)
            tv("• این ابزار جایگزین مشاور، روان‌شناس، پزشک یا تصمیم‌گیر سازمانی نیست. ممدجو را قبول/رد نمی‌کند و تشخیص بالینی نمی‌دهد.", 14f)
            tv("• نشانه منفرد یا زبان بدن به‌تنهایی دلیل دروغ‌گویی نیست.", 14f)
            tv("• متن ۲۴ سؤال و قواعد از خلاصهٔ ابرپرامپت آمده است؛ قبل استفادهٔ واقعی باید با PDF رسمی «شیوه‌نامه» و «پشتوانه علمی» نسخه ۱۴۰۵ تطبیق داده شود. نسخه فوری (ح۱ تا ح۶) موقت است.", 14f)
            tv("• خطوط قرمز (نبود رضایت، ترخیص، بحران، ناپایداری پزشکی، نبود محل امن، دروازه بالینی) بر امتیاز عددی مقدم‌اند.", 14f)
            tv("• امتیاز ۲ فقط با شاهد، تأیید گوینده (ممدجو) و وضعیت «پاسخ کامل» پذیرفته می‌شود.", 14f)
            tv("• تأیید نهایی نیاز به دو کارشناس متفاوت با PIN جداگانه دارد. هر تغییر در امتیاز، شاهد یا وضعیت پس از تأیید، تأییدها را باطل می‌کند.", 14f)
            tv("• ضبط صدا و تبدیل گفتار به متن در این نسخه وجود ندارد؛ کارشناس خلاصهٔ پاسخ ممدجو را دستی ثبت می‌کند.", 14f)
            tv("• به جای نام و مشخصات هویتی، فقط کد پرونده را بنویسید. فایل PDF خارج‌شده دیگر رمزگذاری نیست.", 14f)
            btn("بازگشت") { showHome() }
        }
    }

    private fun showUsers() {
        screen({ showHome() }) {
            tv("کارشناسان", 20f, Color.BLACK, true)
            tv("برای تأیید دوگانه حداقل دو کارشناس با PIN جداگانه لازم است. هر کارشناس PIN خود را فقط خودش بداند.", 13f, gray)
            if (vault.users.isEmpty()) tv("هنوز کارشناسی ثبت نشده است.", 14f, orange)
            for (u in vault.users) tv("• " + u.name, 16f)
            var name = ""
            var pin = ""
            field("نام کارشناس", "") { name = it }
            field("PIN (حداقل ۴ رقم)", "", numeric = true, password = true) { pin = it }
            btn("افزودن کارشناس") {
                val n = name.trim()
                val p = normDigits(pin)
                if (n.isEmpty() || p.length < 4) {
                    toast("نام و PIN (حداقل ۴ رقم) لازم است")
                } else if (vault.users.any { it.name == n }) {
                    toast("این نام قبلاً ثبت شده است")
                } else {
                    val chars = p.toCharArray()
                    async({ vault.addUser(n, chars); true }) { ok ->
                        if (ok) showUsers() else toast("خطا در ثبت کارشناس")
                    }
                }
            }
            btn("بازگشت") { showHome() }
        }
    }

    private fun showCase(c: CaseFile) {
        screen({ showHome() }) {
            tv("اطلاعات پرونده", 20f, Color.BLACK, true)
            field("کد پرونده (بدون نام و مشخصات هویتی)", c.code) { c.code = it.trim(); c.touch() }
            field("نام مستعار (اختیاری)", c.alias) { c.alias = it.trim(); c.touch() }
            field("مرکز", c.center) { c.center = it.trim(); c.touch() }

            tv("نوع مصاحبه", 14f, gray)
            choice(listOf("کامل (۲۴ سؤال)", "فوری (۶ سؤال، موقت)"), c.kind.ordinal) {
                c.kind = Kind.values()[it]
                c.touch()
            }
            field("علت استفاده از نسخه فوری (فقط برای نسخه فوری)", c.urgentReason, multiline = true) {
                c.urgentReason = it
                c.touch()
            }

            tv("رضایت و شرایط ورود", 16f, Color.BLACK, true)
            check("رضایت آگاهانهٔ مکتوب ثبت شده است", c.consentRecorded) { c.consentRecorded = it; c.touch() }
            check("هدف مصاحبه، نحوهٔ ثبت و پردازش برای ممدجو توضیح داده شد", c.consentExplained) { c.consentExplained = it; c.touch() }
            check("مرجع ترخیص تأیید کرده است", c.dischargeConfirmed) { c.dischargeConfirmed = it; c.touch() }

            tv("خطوط قرمز (اگر برقرار است تیک بزنید)", 16f, red, true)
            check("بحران روانی یا قصد آسیب", c.psychCrisis) { c.psychCrisis = it; c.touch() }
            check("ناپایداری پزشکی", c.medicalUnstable) { c.medicalUnstable = it; c.touch() }
            check("نبود محل امن برای شب اول", c.noSafeNight) { c.noSafeNight = it; c.touch() }
            check("دروازه بالینی فعال است", c.clinicalGateActive) { c.clinicalGateActive = it; c.touch() }
            check("دروازه بالینی توسط متخصص تأیید و برطرف شده است", c.clinicalCleared) { c.clinicalCleared = it; c.touch() }
            check("پرونده آموزشی/مصنوعی است", c.synthetic) { c.synthetic = it; c.touch() }

            btn("سؤال‌ها و ثبت امتیاز") { showQuestions(c) }
            btn("جمع‌بندی، تأیید و PDF") { showSummary(c) }
            btn("حذف پرونده") {
                dialog()
                    .setMessage("این پرونده برای همیشه حذف شود؟")
                    .setPositiveButton("حذف") { _, _ ->
                        vault.cases.remove(c)
                        showHome()
                    }
                    .setNegativeButton("لغو", null)
                    .show()
            }
        }
    }

    private fun showQuestions(c: CaseFile) {
        screen({ showCase(c) }) {
            tv("سؤال‌ها", 20f, Color.BLACK, true)
            tv("★ = سؤال حیاتی", 12f, gray)
            for (id in Rules.scope(c.kind)) {
                val q = Rules.byId(id) ?: continue
                val a = c.answers[id]
                val s = if (a == null || a.score < 0) "بدون امتیاز" else "امتیاز " + a.score
                val st = (a?.status ?: Status.UNANSWERED).label
                val mark = if (q.critical) "★ " else ""
                btn(mark + id + " · " + s + " · " + st) { showQuestion(c, id) }
            }
            btn("جمع‌بندی") { showSummary(c) }
            btn("بازگشت") { showCase(c) }
        }
    }

    private fun showQuestion(c: CaseFile, id: String) {
        val q = Rules.byId(id) ?: return
        val a = c.answer(id)
        screen({ showQuestions(c) }) {
            tv(id + (if (q.critical) " (حیاتی)" else ""), 20f, Color.BLACK, true)
            tv(q.text, 17f)
            val warn = tv("", 13f, red)
            fun refresh() {
                warn.text = if (a.score == 2 && !Scoring.scoreAllowed(2, a)) {
                    "امتیاز ۲ بدون شاهد، تأیید گوینده و وضعیت «پاسخ کامل» در جمع وارد نمی‌شود."
                } else {
                    ""
                }
            }
            refresh()
            field("شاهد: خلاصهٔ پاسخ ممدجو (گفتهٔ خود ممدجو)", a.evidence, multiline = true) {
                a.evidence = it
                c.touch()
                refresh()
            }
            check("تأیید می‌کنم این پاسخ از خود ممدجو بوده است", a.speakerClient) {
                a.speakerClient = it
                c.touch()
                refresh()
            }
            tv("وضعیت پاسخ", 14f, gray)
            choice(Status.values().map { it.label }, a.status.ordinal) {
                a.status = Status.values()[it]
                c.touch()
                refresh()
            }
            tv("امتیاز کارشناس", 14f, gray)
            choice(listOf("بدون امتیاز", "۰", "۱", "۲"), a.score + 1) {
                a.score = it - 1
                c.touch()
                refresh()
            }
            check("اگر امتیاز صفر است: مورد بررسی و حل‌شده است", a.zeroResolved) {
                a.zeroResolved = it
                c.touch()
            }
            field("یادداشت کارشناس", a.note, multiline = true) {
                a.note = it
                c.touch()
            }
            btn("ذخیره و بازگشت") { showQuestions(c) }
        }
    }

    private fun showSummary(c: CaseFile) {
        val r = Scoring.evaluate(c)
        screen({ showCase(c) }) {
            tv("جمع‌بندی", 20f, Color.BLACK, true)
            if (c.synthetic) tv("پروندهٔ آموزشی/مصنوعی", 14f, orange, true)

            val color = when (r.suggestion) {
                Scoring.Suggestion.DIRECT_REFERRAL_REVIEW -> green
                Scoring.Suggestion.CONDITIONAL_REVIEW, Scoring.Suggestion.DEFER_COMPLETE_INFO -> orange
                else -> red
            }
            tv("پیشنهاد سامانه (نه تصمیم نهایی)", 13f, gray)
            tv(r.suggestion.label, 17f, color, true)
            tv("جمع خام: " + r.raw + " از " + r.maxRaw)
            tv("کسر اعمال‌شده: " + r.deductionApplied)
            tv("امتیاز خالص: " + r.net, 17f, Color.BLACK, true)
            if (c.kind == Kind.FULL) {
                val cs = r.criticalSum?.toString() ?: "ناقص"
                tv("سؤال‌های حیاتی: " + cs + " از " + r.criticalMax + " (حداقل " + Scoring.CRITICAL_MIN + ")")
                if (r.unresolvedZeroIds.isNotEmpty()) {
                    tv("صفر حل‌نشده: " + r.unresolvedZeroIds.joinToString("، "), 14f, red)
                }
            }
            for (rl in r.redLines) tv("⛔ " + rl, 15f, red, true)
            for (n in r.notes) tv("• " + n, 13f, gray)

            if (c.kind == Kind.FULL) {
                tv("کسر رفتاری (اختیاری، حداکثر ۸)", 16f, Color.BLACK, true)
                tv("فقط با شرح شاهد، زمان و زمینه، تکرار، خط پایه و بررسی عوامل مخدوش‌کننده اعمال می‌شود.", 12f, gray)
                val d = c.deduction
                field("مقدار کسر درخواستی (۰ تا ۸)", if (d.requested > 0) d.requested.toString() else "", numeric = true) {
                    d.requested = normDigits(it).toIntOrNull() ?: 0
                    c.touch()
                }
                field("شاهد رفتاری توصیفی", d.evidence, multiline = true) { d.evidence = it; c.touch() }
                field("زمان و زمینه", d.contextTime) { d.contextTime = it; c.touch() }
                field("تکرار", d.repetition) { d.repetition = it; c.touch() }
                field("خط پایه رفتاری ممدجو", d.baseline) { d.baseline = it; c.touch() }
                check("عوامل مخدوش‌کننده (خستگی، دارو، اضطراب، زبان و فرهنگ و ...) بررسی شده است", d.confounders) {
                    d.confounders = it
                    c.touch()
                }
                btn("محاسبهٔ مجدد") { showSummary(c) }
            }

            tv("تأیید دوگانه", 16f, Color.BLACK, true)
            val pre = Scoring.preApprovalBlockers(c, r)
            for (b in pre) tv("• " + b, 13f, red)
            tv(approvalLine(c, c.approval1, "کارشناس اول"), 14f)
            tv(approvalLine(c, c.approval2, "کارشناس دوم"), 14f)
            btn("ثبت تأیید کارشناس اول", pre.isEmpty()) { approve(c, 1) }
            btn("ثبت تأیید کارشناس دوم", pre.isEmpty()) { approve(c, 2) }

            val blockers = Scoring.closeBlockers(c, r)
            tv(
                if (blockers.isEmpty()) "گزارش رسمی آماده است." else "گزارش فعلاً «پیش‌نویس» است (تأیید کامل نیست).",
                14f,
                if (blockers.isEmpty()) green else orange,
                true
            )
            btn("خروجی PDF") { exportPdf(c) }
            btn("بازگشت") { showCase(c) }
        }
    }

    private fun approvalLine(c: CaseFile, a: Approval?, label: String): String {
        if (a == null) return label + ": ثبت نشده"
        return if (Scoring.approvalValid(c, a)) {
            label + ": " + a.name + " ✓"
        } else {
            label + ": " + a.name + " — به‌دلیل تغییر پرونده نامعتبر شده"
        }
    }

    private fun approve(c: CaseFile, slot: Int) {
        val r = Scoring.evaluate(c)
        if (Scoring.preApprovalBlockers(c, r).isNotEmpty()) {
            toast("ابتدا موانع تأیید را برطرف کنید")
            return
        }
        if (vault.users.isEmpty()) {
            toast("ابتدا کارشناسان را ثبت کنید")
            return
        }
        val other = if (slot == 1) c.approval2 else c.approval1
        val otherId = if (other != null && Scoring.approvalValid(c, other)) other.userId else null
        val candidates = vault.users.filter { it.id != otherId }
        if (candidates.isEmpty()) {
            toast("برای تأیید دوگانه کارشناس دیگری لازم است")
            return
        }
        val names = candidates.map { it.name }.toTypedArray()
        dialog()
            .setTitle("کارشناس تأییدکننده")
            .setItems(names) { _, i -> askPin(c, slot, candidates[i]) }
            .setNegativeButton("لغو", null)
            .show()
    }

    private fun askPin(c: CaseFile, slot: Int, user: AppUser) {
        val et = EditText(this)
        et.inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
        et.hint = "PIN"
        dialog()
            .setTitle("PIN " + user.name)
            .setView(et)
            .setPositiveButton("تأیید") { _, _ ->
                val pin = normDigits(et.text.toString()).toCharArray()
                async({ vault.verifyUser(user, pin) }) { ok ->
                    if (!ok) {
                        toast("PIN نادرست است")
                    } else {
                        val ap = Approval(user.id, user.name, System.currentTimeMillis(), Scoring.canonicalHash(c))
                        if (slot == 1) c.approval1 = ap else c.approval2 = ap
                        c.log("approve", "تأیید کارشناس " + slot + ": " + user.name)
                        c.touch()
                        showSummary(c)
                    }
                }
            }
            .setNegativeButton("لغو", null)
            .show()
    }

    private fun exportPdf(c: CaseFile) {
        val r = Scoring.evaluate(c)
        val blockers = Scoring.closeBlockers(c, r)
        pendingPdf = PdfReport.build(c, r, blockers)
        val safe = c.code.replace(Regex("[^A-Za-z0-9_-]"), "_")
        val name = "report-" + safe + (if (blockers.isEmpty()) "" else "-draft") + ".pdf"
        val i = Intent(Intent.ACTION_CREATE_DOCUMENT)
        i.addCategory(Intent.CATEGORY_OPENABLE)
        i.type = "application/pdf"
        i.putExtra(Intent.EXTRA_TITLE, name)
        suppressLock = true
        c.log("export", "خروجی PDF")
        startActivityForResult(i, REQ_SAVE_PDF)
    }

    companion object {
        private const val REQ_SAVE_PDF = 1001
    }
}
