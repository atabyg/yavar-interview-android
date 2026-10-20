package ir.yavarshahrha.interview

import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Encrypted on-device store. File layout: salt(16) | iv(12) | AES-256-GCM ciphertext.
 * The key is derived from the passphrase and is held in memory only while unlocked.
 */
class Vault(private val file: File) {
    private var key: ByteArray? = null
    private var salt: ByteArray = ByteArray(0)

    val users: ArrayList<AppUser> = ArrayList()
    val cases: ArrayList<CaseFile> = ArrayList()

    fun exists(): Boolean = file.exists()

    fun isUnlocked(): Boolean = key != null

    fun create(pass: CharArray) {
        salt = Crypto.randomBytes(16)
        key = Crypto.deriveKey(pass, salt)
        users.clear()
        cases.clear()
        save()
    }

    fun unlock(pass: CharArray): Boolean {
        try {
            val raw = file.readBytes()
            if (raw.size < 16 + 12 + 16) return false
            val s = raw.copyOfRange(0, 16)
            val k = Crypto.deriveKey(pass, s)
            val plain = Crypto.decrypt(k, raw.copyOfRange(16, raw.size))
            parse(String(plain, Charsets.UTF_8))
            salt = s
            key = k
            return true
        } catch (e: Exception) {
            return false
        }
    }

    fun lock() {
        key = null
        users.clear()
        cases.clear()
    }

    fun save() {
        val k = key ?: return
        val json = toJson().toString()
        val enc = Crypto.encrypt(k, json.toByteArray(Charsets.UTF_8))
        val tmp = File(file.parentFile, file.name + ".tmp")
        tmp.writeBytes(salt + enc)
        if (!tmp.renameTo(file)) {
            file.delete()
            tmp.renameTo(file)
        }
    }

    fun addUser(name: String, pin: CharArray) {
        val s = Crypto.randomBytes(16)
        val h = Crypto.deriveKey(pin, s)
        users.add(AppUser(java.util.UUID.randomUUID().toString(), name, Crypto.b64(s), Crypto.b64(h)))
        save()
    }

    fun verifyUser(u: AppUser, pin: CharArray): Boolean {
        val h = Crypto.deriveKey(pin, Crypto.unb64(u.saltB64))
        return Crypto.constantEquals(h, Crypto.unb64(u.hashB64))
    }

    // ---------- JSON ----------

    private fun toJson(): JSONObject {
        val root = JSONObject()
        root.put("v", 1)
        val ua = JSONArray()
        for (u in users) {
            val o = JSONObject()
            o.put("id", u.id)
            o.put("name", u.name)
            o.put("salt", u.saltB64)
            o.put("hash", u.hashB64)
            ua.put(o)
        }
        root.put("users", ua)
        val ca = JSONArray()
        for (c in cases) ca.put(caseToJson(c))
        root.put("cases", ca)
        return root
    }

    private fun parse(text: String) {
        val root = JSONObject(text)
        users.clear()
        cases.clear()
        val ua = root.optJSONArray("users")
        if (ua != null) {
            for (i in 0 until ua.length()) {
                val o = ua.getJSONObject(i)
                users.add(AppUser(o.getString("id"), o.getString("name"), o.getString("salt"), o.getString("hash")))
            }
        }
        val ca = root.optJSONArray("cases")
        if (ca != null) {
            for (i in 0 until ca.length()) cases.add(caseFromJson(ca.getJSONObject(i)))
        }
    }

    private fun approvalToJson(a: Approval): JSONObject {
        val o = JSONObject()
        o.put("userId", a.userId)
        o.put("name", a.name)
        o.put("at", a.atMs)
        o.put("hash", a.hash)
        return o
    }

    private fun approvalFromJson(o: JSONObject?): Approval? {
        if (o == null) return null
        return Approval(o.getString("userId"), o.getString("name"), o.getLong("at"), o.getString("hash"))
    }

    private fun caseToJson(c: CaseFile): JSONObject {
        val o = JSONObject()
        o.put("id", c.id)
        o.put("code", c.code)
        o.put("alias", c.alias)
        o.put("center", c.center)
        o.put("kind", c.kind.name)
        o.put("urgentReason", c.urgentReason)
        o.put("synthetic", c.synthetic)
        o.put("consentRecorded", c.consentRecorded)
        o.put("consentExplained", c.consentExplained)
        o.put("dischargeConfirmed", c.dischargeConfirmed)
        o.put("psychCrisis", c.psychCrisis)
        o.put("medicalUnstable", c.medicalUnstable)
        o.put("noSafeNight", c.noSafeNight)
        o.put("clinicalGateActive", c.clinicalGateActive)
        o.put("clinicalCleared", c.clinicalCleared)
        o.put("createdAt", c.createdAt)
        o.put("updatedAt", c.updatedAt)

        val ans = JSONObject()
        for ((qid, a) in c.answers) {
            val ao = JSONObject()
            ao.put("evidence", a.evidence)
            ao.put("speakerClient", a.speakerClient)
            ao.put("status", a.status.name)
            ao.put("score", a.score)
            ao.put("zeroResolved", a.zeroResolved)
            ao.put("note", a.note)
            ans.put(qid, ao)
        }
        o.put("answers", ans)

        val d = c.deduction
        val dob = JSONObject()
        dob.put("requested", d.requested)
        dob.put("evidence", d.evidence)
        dob.put("contextTime", d.contextTime)
        dob.put("repetition", d.repetition)
        dob.put("baseline", d.baseline)
        dob.put("confounders", d.confounders)
        o.put("deduction", dob)

        val a1 = c.approval1
        if (a1 != null) o.put("approval1", approvalToJson(a1))
        val a2 = c.approval2
        if (a2 != null) o.put("approval2", approvalToJson(a2))

        val au = JSONArray()
        for (e in c.audit) {
            val eo = JSONObject()
            eo.put("at", e.atMs)
            eo.put("action", e.action)
            eo.put("detail", e.detail)
            au.put(eo)
        }
        o.put("audit", au)
        return o
    }

    private fun caseFromJson(o: JSONObject): CaseFile {
        val c = CaseFile(o.getString("id"))
        c.code = o.optString("code", "")
        c.alias = o.optString("alias", "")
        c.center = o.optString("center", "")
        c.kind = try {
            Kind.valueOf(o.optString("kind", "FULL"))
        } catch (e: Exception) {
            Kind.FULL
        }
        c.urgentReason = o.optString("urgentReason", "")
        c.synthetic = o.optBoolean("synthetic", false)
        c.consentRecorded = o.optBoolean("consentRecorded", false)
        c.consentExplained = o.optBoolean("consentExplained", false)
        c.dischargeConfirmed = o.optBoolean("dischargeConfirmed", false)
        c.psychCrisis = o.optBoolean("psychCrisis", false)
        c.medicalUnstable = o.optBoolean("medicalUnstable", false)
        c.noSafeNight = o.optBoolean("noSafeNight", false)
        c.clinicalGateActive = o.optBoolean("clinicalGateActive", false)
        c.clinicalCleared = o.optBoolean("clinicalCleared", false)
        c.createdAt = o.optLong("createdAt", System.currentTimeMillis())
        c.updatedAt = o.optLong("updatedAt", System.currentTimeMillis())

        val ans = o.optJSONObject("answers")
        if (ans != null) {
            val it = ans.keys()
            while (it.hasNext()) {
                val qid = it.next()
                val ao = ans.getJSONObject(qid)
                val a = Answer()
                a.evidence = ao.optString("evidence", "")
                a.speakerClient = ao.optBoolean("speakerClient", false)
                a.status = try {
                    Status.valueOf(ao.optString("status", "UNANSWERED"))
                } catch (e: Exception) {
                    Status.UNANSWERED
                }
                a.score = ao.optInt("score", -1)
                a.zeroResolved = ao.optBoolean("zeroResolved", false)
                a.note = ao.optString("note", "")
                c.answers[qid] = a
            }
        }

        val dob = o.optJSONObject("deduction")
        if (dob != null) {
            val d = c.deduction
            d.requested = dob.optInt("requested", 0)
            d.evidence = dob.optString("evidence", "")
            d.contextTime = dob.optString("contextTime", "")
            d.repetition = dob.optString("repetition", "")
            d.baseline = dob.optString("baseline", "")
            d.confounders = dob.optBoolean("confounders", false)
        }

        c.approval1 = approvalFromJson(o.optJSONObject("approval1"))
        c.approval2 = approvalFromJson(o.optJSONObject("approval2"))

        val au = o.optJSONArray("audit")
        if (au != null) {
            for (i in 0 until au.length()) {
                val eo = au.getJSONObject(i)
                c.audit.add(AuditEvent(eo.optLong("at", 0L), eo.optString("action", ""), eo.optString("detail", "")))
            }
        }
        return c
    }
}
