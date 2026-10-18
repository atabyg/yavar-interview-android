import test from "node:test";
import assert from "node:assert/strict";
import { buildDayText, dayKey, newCaseNumber } from "../src/daily.js";

test("Jalali date uses Tehran local day instead of the phone timezone", () => {
  assert.equal(dayKey(Date.UTC(2026, 9, 17, 21, 0, 0)), "1405/07/26");
  assert.equal(dayKey(Date.UTC(2026, 9, 17, 20, 0, 0)), "1405/07/25");
});

test("new case number is six digits and avoids all passed used numbers", () => {
  const used = ["123456", "234567", "345678"];
  const number = newCaseNumber(used);
  assert.match(number, /^\d{6}$/);
  assert.equal(used.includes(number), false);
});

test("daily AI text includes eligible transcripts and excludes hidden/empty records", () => {
  const stamp = Date.UTC(2026, 9, 17, 21, 0, 0);
  const txt = buildDayText("1405/07/26", [
    { id: "a", createdAt: stamp, durationSec: 90, candidate: "نمونه الف", caseNumber: "123456", position: "مددکار", interviewer: "مصاحبه‌گر", transcript: "نیاز به پیگیری دارد" },
    { id: "b", createdAt: stamp + 60000, durationSec: 60, candidate: "نمونه ب", caseNumber: "234567", transcript: "این متن نباید در فایل باشد", dailyExcluded: true },
    { id: "c", createdAt: stamp + 120000, durationSec: 60, candidate: "نمونه پ", caseNumber: "345678", transcript: "   " }
  ]);
  assert.match(txt, /#YAVAR_DAILY_LOG v1/);
  assert.match(txt, /DATE_JALALI: 1405\/07\/26/);
  assert.match(txt, /CLIENT_COUNT: 1/);
  assert.match(txt, /RECORD_COUNT: 1/);
  assert.match(txt, /نیاز به پیگیری دارد/);
  assert.doesNotMatch(txt, /این متن نباید در فایل باشد/);
});
