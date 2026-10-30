// Deterministic segment labels for the plain transcript shared with an external AI.
// Export labels the stored transcript as [seg-001] ...; import re-derives the same segmentation from the stored
// transcript, so the segment ids an engine cites can be cross-checked (warnings only; evidence text is verified separately).
import { normalizeForMatch } from "./contract.js";

export const SEGMENT_MAX_CHARS = 400;
const compact = (s) => normalizeForMatch(s).replace(/ /g, "");
const fragments = (t) => String(t || "").split(/…|\.{3}|\[\.\.\.\]|\[نامفهوم\]/).map(compact).filter((f) => f.length >= 4);

// One segment per non-empty line; a longer line is split at sentence ends into chunks of at most maxLen characters.
export function segmentTranscript(text, maxLen = SEGMENT_MAX_CHARS) {
  const lines = String(text == null ? "" : text).replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  const chunks = [];
  for (const line of lines) {
    if (line.length <= maxLen) { chunks.push(line); continue; }
    let cur = "";
    for (const part of line.split(/(?<=[.!?؟…])\s+/)) {
      if (cur && (cur + " " + part).length > maxLen) { chunks.push(cur); cur = part; } else cur = cur ? cur + " " + part : part;
    }
    if (cur) chunks.push(cur);
  }
  return chunks.map((t, i) => ({ id: "seg-" + String(i + 1).padStart(3, "0"), text: t }));
}

export const labelTranscript = (text) => segmentTranscript(text).map((s) => "[" + s.id + "] " + s.text).join("\n");

// Models sometimes copy the [seg-001] label into the quoted evidence. The label is not spoken text, so it is removed before the
// evidence is compared with the stored transcript, and the id it carries is kept as a citation.
export function stripSegmentLabels(row) {
  if (!row || !Array.isArray(row.referralAnswers)) return row;
  const referralAnswers = row.referralAnswers.map((a) => {
    if (!a) return a;
    const texts = Array.isArray(a.evidenceList) && a.evidenceList.length ? a.evidenceList : (a.evidence ? [a.evidence] : []);
    if (!texts.some((t) => /\[seg-\d{3,6}\]/.test(String(t)))) return a;
    const ids = new Set(Array.isArray(a.sourceSegmentIds) ? a.sourceSegmentIds : []);
    const clean = texts.map((t) => String(t).replace(/\[(seg-\d{3,6})\]/g, (m, id) => { ids.add(id); return " "; }).replace(/\s+/g, " ").trim());
    return { ...a, evidenceList: clean, evidence: clean.join(" | "), sourceSegmentIds: [...ids] };
  });
  return { ...row, referralAnswers };
}

// Cross-check the source_segment_ids cited by an engine against the segmentation of the stored transcript.
export function checkSegmentCitations(row, transcript) {
  if (!row || !Array.isArray(row.referralAnswers)) return row;
  const segs = segmentTranscript(transcript);
  if (!segs.length) return row;
  const byId = new Map(segs.map((s) => [s.id, compact(s.text)]));
  const warnings = [];
  const referralAnswers = row.referralAnswers.map((a) => {
    const ids = Array.isArray(a && a.sourceSegmentIds) ? a.sourceSegmentIds : [];
    if (!ids.length) return a;
    const unknown = ids.filter((id) => !byId.has(id));
    if (unknown.length) {
      warnings.push(a.code + ": شناسهٔ قطعهٔ " + unknown.slice(0, 2).join("، ") + " در متن این پرونده وجود ندارد.");
      return { ...a, segmentCitationOk: false };
    }
    const texts = Array.isArray(a.evidenceList) && a.evidenceList.length ? a.evidenceList : (a.evidence ? [a.evidence] : []);
    const cited = ids.map((id) => byId.get(id)).join("");
    const ok = texts.length === 0 || texts.some((t) => { const fr = fragments(t); return fr.length > 0 && fr.every((f) => cited.includes(f)); });
    if (!ok) warnings.push(a.code + ": شاهد در قطعهٔ ذکرشده (" + ids.join("، ") + ") پیدا نشد؛ ارجاع قطعه بازبینی شود.");
    return { ...a, segmentCitationOk: ok };
  });
  return { ...row, referralAnswers, warnings: [...(row.warnings || []), ...warnings] };
}
