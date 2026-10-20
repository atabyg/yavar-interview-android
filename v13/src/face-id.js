// Face-ID: fully offline face -> case number mapping.
// IMPORTANT: a face never produces bit-identical data twice (light, angle, camera noise).
// So we do NOT hash the face. We enroll an embedding once, then MATCH new scans against
// enrolled ones by cosine similarity. A match returns the SAME stored case number every time;
// no match creates a new one. The QR encodes that case number (+ checksum), not the face.
import { newCaseNumber } from "./daily";

const KEY = "yavar.faceid.v1";
export const MATCH_THRESHOLD = 0.62;   // cosine similarity; tune with real tests on the target phone
export const AMBIGUOUS_MARGIN = 0.04;  // best vs second-best closer than this => ask user to confirm

export function normalize(v) {
  let s = 0; for (const x of v) s += x * x;
  const n = Math.sqrt(s) || 1;
  return Array.from(v, (x) => x / n);
}
export function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return -1;
  let d = 0; for (let i = 0; i < a.length; i++) d += a[i] * b[i];
  return d; // inputs are L2-normalized
}
export function averageEmbeddings(list) {
  const out = new Array(list[0].length).fill(0);
  for (const e of list) for (let i = 0; i < out.length; i++) out[i] += e[i];
  return normalize(out);
}

export function loadFaces() {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return []; }
}
function saveFaces(f) { localStorage.setItem(KEY, JSON.stringify(f)); }
export function forgetFace(caseNumber) { saveFaces(loadFaces().filter((f) => f.caseNumber !== caseNumber)); }
export function forgetAllFaces() { saveFaces([]); }

// Returns { status: "match"|"ambiguous"|"new", caseNumber?, score?, candidates? }
export function findMatch(embedding, faces = loadFaces()) {
  const q = normalize(embedding);
  const scored = faces.map((f) => ({ caseNumber: f.caseNumber, score: cosine(q, f.embedding) })).sort((a, b) => b.score - a.score);
  if (!scored.length || scored[0].score < MATCH_THRESHOLD) return { status: "new" };
  if (scored[1] && scored[0].score - scored[1].score < AMBIGUOUS_MARGIN && scored[1].score >= MATCH_THRESHOLD)
    return { status: "ambiguous", candidates: scored.slice(0, 3) };
  return { status: "match", caseNumber: scored[0].caseNumber, score: scored[0].score };
}

// Enroll a new person (several frames averaged) and issue a never-repeated 6-digit case number.
export function enroll(embeddings, usedNumbers = []) {
  const faces = loadFaces();
  const taken = [...usedNumbers, ...faces.map((f) => f.caseNumber)];
  const caseNumber = newCaseNumber(taken);
  faces.push({ caseNumber, embedding: averageEmbeddings(embeddings.map(normalize)), createdAt: Date.now() });
  saveFaces(faces);
  return caseNumber;
}
// Improve an existing record after a confirmed match (slow moving average keeps it stable).
export function refine(caseNumber, embedding) {
  const faces = loadFaces();
  const f = faces.find((x) => x.caseNumber === caseNumber);
  if (!f) return;
  f.embedding = normalize(f.embedding.map((x, i) => x * 0.9 + normalize(embedding)[i] * 0.1));
  saveFaces(faces);
}

// QR payload: case number + 2-digit checksum so a scan can be validated offline.
export function checksum(caseNumber) { return String([...caseNumber].reduce((a, c) => (a * 7 + +c) % 97, 11)).padStart(2, "0"); }
export function qrPayload(caseNumber) { return `YAVAR:${caseNumber}:${checksum(caseNumber)}`; }
export function parseQr(text) {
  const m = /^YAVAR:(\d{6}):(\d{2})$/.exec((text || "").trim());
  return m && checksum(m[1]) === m[2] ? m[1] : null;
}
