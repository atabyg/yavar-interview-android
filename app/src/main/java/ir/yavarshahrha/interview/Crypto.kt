package ir.yavarshahrha.interview

import android.util.Base64
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

object Crypto {
    private val rng = SecureRandom()
    const val ITERATIONS = 100_000
    private const val IV_LEN = 12

    fun randomBytes(n: Int): ByteArray {
        val b = ByteArray(n)
        rng.nextBytes(b)
        return b
    }

    /** PBKDF2-HMAC-SHA1 is the strongest variant available on API 21. */
    fun deriveKey(pass: CharArray, salt: ByteArray): ByteArray {
        val spec = PBEKeySpec(pass, salt, ITERATIONS, 256)
        try {
            return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA1").generateSecret(spec).encoded
        } finally {
            spec.clearPassword()
        }
    }

    /** Returns iv (12 bytes) followed by ciphertext+tag. */
    fun encrypt(key: ByteArray, plain: ByteArray): ByteArray {
        val iv = randomBytes(IV_LEN)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
        val ct = cipher.doFinal(plain)
        return iv + ct
    }

    /** Throws if the key is wrong or the data was tampered with. */
    fun decrypt(key: ByteArray, data: ByteArray): ByteArray {
        if (data.size < IV_LEN + 16) throw IllegalArgumentException("short")
        val iv = data.copyOfRange(0, IV_LEN)
        val ct = data.copyOfRange(IV_LEN, data.size)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
        return cipher.doFinal(ct)
    }

    fun b64(b: ByteArray): String = Base64.encodeToString(b, Base64.NO_WRAP)

    fun unb64(s: String): ByteArray = Base64.decode(s, Base64.NO_WRAP)

    fun constantEquals(a: ByteArray, b: ByteArray): Boolean = MessageDigest.isEqual(a, b)
}
