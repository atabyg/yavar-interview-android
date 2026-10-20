// Face-ID: offline face -> case number mapping, encrypted at rest.
// A face never yields bit-identical data twice, so we ENROLL an embedding once and MATCH later scans
// (cosine similarity). A match returns the SAME stored case number every time; no match issues a new one.
import { newCaseNumber } from "./daily";

export const MATCH_THRESHOLD = 0.62;   // tune on the real phone with real people
export const AMBIGUOUS_MARGIN = 0.04;

export function normalize(v) {
  let s = 0; for (const x of v) s += x * x;
  const n = Math.sqrt(s) || 1;
  return Array.from(v, (x) => x / n);
}
export function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return -1;
  let d = 0; for (let i = 0; i < a.length; i++) d += a[i] * b[i];
  return d;
}
export function averageEmbeddings(list) {
  const out = new Array(list[0].length).fill(0);
  for (const e of list) for (let i = 0; i < out.length; i++) out[i] += e[i];
  return normalize(out);
}

// ---------- encrypted storage (AES-GCM; non-extractable key kept in IndexedDB) ----------
const DB = "yavar-faceid", ST = "kv";
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(ST);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function kvGet(k) { const d = await idb(); return new Promise((res, rej) => { const q = d.transaction(ST).objectStore(ST).get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
async function kvSet(k, v) { const d = await idb(); return new Promise((res, rej) => { const q = d.transaction(ST, "readwrite").objectStore(ST).put(v, k); q.onsuccess = () => res(); q.onerror = () => rej(q.error); }); }
async function cryptoKey() {
  let k = await kvGet("key");
  if (!k) { k = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]); await kvSet("key", k); }
  return k;
}
export async function loadFaces() {
  const rec = await kvGet("faces");
  if (!rec) return [];
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: rec.iv }, await cryptoKey(), rec.ct);
    return JSON.parse(new TextDecoder().decode(pt));
  } catch (e) { return []; }
}
async function saveFaces(faces) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cryptoKey(), new TextEncoder().encode(JSON.stringify(faces)));
  await kvSet("faces", { iv, ct });
}
export async function forgetFace(caseNumber) { await saveFaces((await loadFaces()).filter((f) => f.caseNumber !== caseNumber)); }
export async function forgetAllFaces() { await saveFaces([]); }

// ---------- matching ----------
export function findMatch(embedding, faces) {
  const q = normalize(embedding);
  const scored = faces.map((f) => ({ caseNumber: f.caseNumber, score: cosine(q, f.embedding) })).sort((a, b) => b.score - a.score);
  if (!scored.length || scored[0].score < MATCH_THRESHOLD) return { status: "new" };
  if (scored[1] && scored[1].score >= MATCH_THRESHOLD && scored[0].score - scored[1].score < AMBIGUOUS_MARGIN)
    return { status: "ambiguous", candidates: scored.slice(0, 3) };
  return { status: "match", caseNumber: scored[0].caseNumber, score: scored[0].score };
}
export async function enroll(embeddings, usedNumbers = []) {
  const faces = await loadFaces();
  const caseNumber = newCaseNumber([...usedNumbers, ...faces.map((f) => f.caseNumber)]);
  faces.push({ caseNumber, embedding: averageEmbeddings(embeddings.map(normalize)), createdAt: Date.now() });
  await saveFaces(faces);
  return caseNumber;
}
export async function refine(caseNumber, embeddings) {
  const faces = await loadFaces();
  const f = faces.find((x) => x.caseNumber === caseNumber);
  if (!f) return;
  const avg = averageEmbeddings(embeddings.map(normalize));
  f.embedding = normalize(f.embedding.map((x, i) => x * 0.9 + avg[i] * 0.1));
  await saveFaces(faces);
}

// ---------- portable vector (so the same vector can be moved/imported and matched) ----------
// "YFV1:" + base64 of int8-quantized unit vector. Produced ONLY by the app's own model.
export function toVectorString(e) {
  const q = Int8Array.from(normalize(e), (x) => Math.max(-127, Math.min(127, Math.round(x * 127))));
  let s = ""; q.forEach((b) => (s += String.fromCharCode(b & 255)));
  return "YFV1:" + btoa(s);
}
export function fromVectorString(t) {
  if (!/^YFV1:/.test(t || "")) return null;
  const s = atob(t.slice(5));
  return normalize(Array.from(s, (c) => ((c.charCodeAt(0) << 24) >> 24) / 127));
}

// ---------- QR payload ----------
export function checksum(caseNumber) { return String([...caseNumber].reduce((a, c) => (a * 7 + +c) % 97, 11)).padStart(2, "0"); }
export function qrPayload(caseNumber) { return `YAVAR:${caseNumber}:${checksum(caseNumber)}`; }
export function parseQr(text) {
  const m = /^YAVAR:(\d{6}):(\d{2})$/.exec((text || "").trim());
  return m && checksum(m[1]) === m[2] ? m[1] : null;
}
