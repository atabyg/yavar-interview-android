package ir.yavarshahrha.interview

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ScoringTest {

    private fun fullCase(score: Int = 2): CaseFile {
        val c = CaseFile("t1")
        c.code = "T1"
        c.consentRecorded = true
        c.consentExplained = true
        c.dischargeConfirmed = true
        for (q in Rules.QUESTIONS) {
            val a = c.answer(q.id)
            a.evidence = "evidence"
            a.speakerClient = true
            a.status = Status.ANSWERED
            a.score = score
        }
        return c
    }

    private fun documentDeduction(c: CaseFile, requested: Int) {
        val d = c.deduction
        d.requested = requested
        d.evidence = "e"
        d.contextTime = "t"
        d.repetition = "r"
        d.baseline = "b"
        d.confounders = true
    }

    @Test
    fun questionCounts() {
        assertEquals(24, Rules.QUESTIONS.size)
        assertEquals(12, Rules.CRITICAL_IDS.size)
        assertEquals(6, Rules.URGENT_IDS.size)
    }

    @Test
    fun perfectCaseSuggestsDirectReview() {
        val r = Scoring.evaluate(fullCase())
        assertEquals(48, r.raw)
        assertEquals(48, r.net)
        assertTrue(r.criticalGatePassed)
        assertEquals(Scoring.Suggestion.DIRECT_REFERRAL_REVIEW, r.suggestion)
    }

    @Test
    fun redLineBeatsScore() {
        val c = fullCase()
        c.dischargeConfirmed = false
        assertEquals(Scoring.Suggestion.RED_LINE, Scoring.evaluate(c).suggestion)
        val c2 = fullCase()
        c2.psychCrisis = true
        assertEquals(Scoring.Suggestion.RED_LINE, Scoring.evaluate(c2).suggestion)
        val c3 = fullCase()
        c3.clinicalGateActive = true
        assertEquals(Scoring.Suggestion.RED_LINE, Scoring.evaluate(c3).suggestion)
        c3.clinicalCleared = true
        assertEquals(Scoring.Suggestion.DIRECT_REFERRAL_REVIEW, Scoring.evaluate(c3).suggestion)
    }

    @Test
    fun fullMarkWithoutEvidenceIsIgnored() {
        val c = fullCase()
        c.answer("Q13").evidence = ""
        val r = Scoring.evaluate(c)
        assertEquals(46, r.raw)
        assertTrue(r.ignoredInvalidFullScoreIds.contains("Q13"))
        assertEquals(Scoring.Suggestion.INCOMPLETE, r.suggestion)
    }

    @Test
    fun fullMarkWithoutClientConfirmationIsIgnored() {
        val c = fullCase()
        c.answer("Q14").speakerClient = false
        assertEquals(Scoring.Suggestion.INCOMPLETE, Scoring.evaluate(c).suggestion)
    }

    @Test
    fun unresolvedZeroInCriticalClosesGate() {
        val c = fullCase()
        c.answer("H01").score = 0
        val r = Scoring.evaluate(c)
        assertEquals(22, r.criticalSum)
        assertFalse(r.criticalGatePassed)
        assertEquals(Scoring.Suggestion.CRITICAL_GATE_CLOSED, r.suggestion)
        c.answer("H01").zeroResolved = true
        val r2 = Scoring.evaluate(c)
        assertTrue(r2.criticalGatePassed)
        assertEquals(46, r2.net)
        assertEquals(Scoring.Suggestion.DIRECT_REFERRAL_REVIEW, r2.suggestion)
    }

    @Test
    fun lowCriticalSumClosesGate() {
        val c = fullCase()
        for (id in Rules.CRITICAL_IDS) c.answer(id).score = 1
        val r = Scoring.evaluate(c)
        assertEquals(12, r.criticalSum)
        assertEquals(36, r.raw)
        assertEquals(Scoring.Suggestion.CRITICAL_GATE_CLOSED, r.suggestion)
    }

    @Test
    fun deductionIsCappedAtEight() {
        val c = fullCase()
        documentDeduction(c, 12)
        val r = Scoring.evaluate(c)
        assertEquals(8, r.deductionApplied)
        assertTrue(r.deductionClamped)
        assertEquals(40, r.net)
    }

    @Test
    fun undocumentedDeductionIsNotApplied() {
        val c = fullCase()
        c.deduction.requested = 5
        val r = Scoring.evaluate(c)
        assertEquals(0, r.deductionApplied)
        assertEquals(Scoring.Suggestion.DEDUCTION_UNDOCUMENTED, r.suggestion)
    }

    @Test
    fun urgentNeverSuggestsDirectReferral() {
        val c = fullCase()
        c.kind = Kind.URGENT
        val r = Scoring.evaluate(c)
        assertEquals(12, r.maxRaw)
        assertEquals(12, r.raw)
        assertNull(r.criticalSum)
        assertEquals(Scoring.Suggestion.URGENT_PROHIBITED_DIRECT, r.suggestion)
    }

    @Test
    fun bandsFollowNetScore() {
        val c = fullCase(1)
        for (q in Rules.QUESTIONS.take(8)) c.answer(q.id).score = 2
        // raw = 8*2 + 16*1 = 32 ; critical sum = 8*2 + 4*1 = 20 -> gate passes
        val r = Scoring.evaluate(c)
        assertEquals(32, r.raw)
        assertEquals(Scoring.Suggestion.CONDITIONAL_REVIEW, r.suggestion)
    }

    @Test
    fun approvalIsInvalidatedByChanges() {
        val c = fullCase()
        val h1 = Scoring.canonicalHash(c)
        c.approval1 = Approval("u1", "A", 1L, h1)
        assertTrue(Scoring.approvalValid(c, c.approval1))
        c.answer("Q13").evidence = "changed"
        assertFalse(Scoring.approvalValid(c, c.approval1))
        assertNotEquals(h1, Scoring.canonicalHash(c))
    }

    @Test
    fun closingNeedsTwoDifferentValidApprovers() {
        val c = fullCase()
        val h = Scoring.canonicalHash(c)
        c.approval1 = Approval("u1", "A", 1L, h)
        assertFalse(Scoring.closeBlockers(c, Scoring.evaluate(c)).isEmpty())
        c.approval2 = Approval("u1", "A", 2L, h)
        assertFalse(Scoring.closeBlockers(c, Scoring.evaluate(c)).isEmpty())
        c.approval2 = Approval("u2", "B", 2L, h)
        assertTrue(Scoring.closeBlockers(c, Scoring.evaluate(c)).isEmpty())
    }

    @Test
    fun persianDigitsAreNormalised() {
        assertEquals("1234", normDigits("۱۲۳۴"))
        assertEquals("90", normDigits("٩٠"))
    }
}
