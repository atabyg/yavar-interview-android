package ir.yavarshahrha.interview

enum class Status(val label: String) {
    ANSWERED("پاسخ کامل"),
    PARTIAL("پاسخ ناقص"),
    UNANSWERED("بی‌پاسخ"),
    CONTRADICTORY("متناقض"),
    UNCLEAR("نامفهوم"),
    NEEDS_REVIEW("نیازمند بازبینی")
}

class Answer {
    var evidence: String = ""
    var speakerClient: Boolean = false
    var status: Status = Status.UNANSWERED
    /** -1 means not scored yet; otherwise 0, 1 or 2. */
    var score: Int = -1
    var zeroResolved: Boolean = false
    var note: String = ""
}

class Deduction {
    var requested: Int = 0
    var evidence: String = ""
    var contextTime: String = ""
    var repetition: String = ""
    var baseline: String = ""
    var confounders: Boolean = false
}

class Approval(
    val userId: String,
    val name: String,
    val atMs: Long,
    /** Hash of the case content at the moment of approval. Any later change invalidates it. */
    val hash: String
)

class AuditEvent(val atMs: Long, val action: String, val detail: String)

class AppUser(
    val id: String,
    val name: String,
    val saltB64: String,
    val hashB64: String
)

class CaseFile(val id: String) {
    var code: String = ""
    var alias: String = ""
    var center: String = ""
    var kind: Kind = Kind.FULL
    var urgentReason: String = ""
    var synthetic: Boolean = false

    var consentRecorded: Boolean = false
    var consentExplained: Boolean = false
    var dischargeConfirmed: Boolean = false
    var psychCrisis: Boolean = false
    var medicalUnstable: Boolean = false
    var noSafeNight: Boolean = false
    var clinicalGateActive: Boolean = false
    var clinicalCleared: Boolean = false

    val answers: LinkedHashMap<String, Answer> = LinkedHashMap()
    val deduction: Deduction = Deduction()
    var approval1: Approval? = null
    var approval2: Approval? = null
    val audit: ArrayList<AuditEvent> = ArrayList()

    var createdAt: Long = System.currentTimeMillis()
    var updatedAt: Long = System.currentTimeMillis()

    fun answer(qid: String): Answer = answers.getOrPut(qid) { Answer() }

    fun log(action: String, detail: String) {
        audit.add(AuditEvent(System.currentTimeMillis(), action, detail))
    }

    fun touch() {
        updatedAt = System.currentTimeMillis()
    }
}

/** Converts Persian/Arabic-Indic digits to ASCII so numeric fields parse correctly. */
fun normDigits(s: String): String {
    val sb = StringBuilder()
    for (ch in s) {
        if (ch in '\u06F0'..'\u06F9') {
            sb.append('0' + (ch - '\u06F0'))
        } else if (ch in '\u0660'..'\u0669') {
            sb.append('0' + (ch - '\u0660'))
        } else {
            sb.append(ch)
        }
    }
    return sb.toString().trim()
}
