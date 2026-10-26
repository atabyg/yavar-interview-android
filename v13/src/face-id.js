// Face-ID store + matching. Fully offline.
// A face never yields bit-identical data twice (light, angle, sensor noise), so we do NOT hash it.
// We keep a few encrypted embedding "templates" per case number and MATCH new scans against them:
// a match returns the SAME stored case number every time, no match issues a new one.
import { newCaseNumber } from "./daily.js";

export const MATCH_THRESHOLD = 0.5;    // cosine similarity; SFace verification default is 0.363, we are stricter for 1:N search
export const AMBIGUOUS_MARGIN = 0.06;  // best vs second-best person closer than this => ask the operator
export const MAX_TEMPLATES = 5;

// ---------- vector helpers ----------
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

// Portable text form: "YFV1:" + base64 of the int8-quantised unit vector (cosine error < 0.002).
export function toVectorString(e) {
  const q = Int8Array.from(normalize(e), (x) => Math.max(-127, Math.min(127, Math.round(x * 127))));
  let s = ""; q.forEach((b) => (s += String.fromCharCode(b & 255)));
  return "YFV1:" + btoa(s);
}
export function fromVectorString(t) {
  if (!/^YFV1:[A-Za-z0-9+/]+=*$/.test(t || "")) return null;
  const s = atob(t.slice(5));
  return normalize(Array.from(s, (c) => ((c.charCodeAt(0) << 24) >> 24) / 127));
}

// ---------- matching (pure) ----------
// faces: [{ caseNumber, templates: [unit vectors] }]
export function scoreFaces(embedding, faces) {
  const q = normalize(embedding);
  return faces
    .map((f) => ({ caseNumber: f.caseNumber, score: Math.max(-1, ...f.templates.map((t) => cosine(q, t))) }))
    .sort((a, b) => b.score - a.score);
}
export function findMatch(embedding, faces) {
  const s = scoreFaces(embedding, faces);
  if (!s.length || s[0].score < MATCH_THRESHOLD) return { status: "new", best: s[0] || null };
  if (s[1] && s[1].score >= MATCH_THRESHOLD && s[0].score - s[1].score < AMBIGUOUS_MARGIN)
    return { status: "ambiguous", candidates: s.filter((x) => x.score >= MATCH_THRESHOLD).slice(0, 3) };
  return { status: "match", caseNumber: s[0].caseNumber, score: s[0].score };
}
// Which number does a NEW face get? The number already typed in the form if it is not tied to another face
// (links an existing paper/voice case to a face), otherwise a fresh never-used 6-digit number.
export function chooseCaseNumber(preferred, faces, usedNumbers = []) {
  const bound = new Set(faces.map((f) => f.caseNumber));
  if (/^\d{6}$/.test(preferred || "") && !bound.has(preferred)) return preferred;
  return newCaseNumber([...usedNumbers, ...bound]);
}
// Add a template to a person: skip near-duplicates, keep at most `max` (replace the most redundant one).
export function addTemplate(templates, emb, max = MAX_TEMPLATES) {
  const e = normalize(emb);
  if (templates.some((t) => cosine(t, e) > 0.97)) return templates;
  if (templates.length < max) return [...templates, e];
  let worst = 0, worstScore = -2;
  templates.forEach((t, i) => {
    const m = templates.reduce((s, u, j) => (j === i ? s : s + cosine(t, u)), 0) / (templates.length - 1);
    if (m > worstScore) { worstScore = m; worst = i; }
  });
  const next = templates.slice(); next[worst] = e; return next;
}

// ---------- encrypted storage (AES-GCM; non-extractable key kept in IndexedDB) ----------
// Protects the vectors at rest on the phone. A hardware-backed Android Keystore key would be stronger.
const DB = "yavar-faceid", ST = "kv";
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(ST);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function kvGet(k) { const d = await idb(); return new Promise((res, rej) => { const q = d.transaction(ST).objectStore(ST).get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
async function kvSet(k, v) { const d = await idb(); return new Promise((res, rej) => { const tx = d.transaction(ST, "readwrite"); tx.objectStore(ST).put(v, k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
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
    return JSON.parse(new TextDecoder().decode(pt)).map((f) => ({
      caseNumber: f.caseNumber, createdAt: f.createdAt, updatedAt: f.updatedAt,
      templates: f.templates.map(fromVectorString).filter(Boolean)
    })).filter((f) => f.templates.length);
  } catch (e) { return []; }
}
async function saveFaces(faces) {
  const plain = faces.map((f) => ({ caseNumber: f.caseNumber, createdAt: f.createdAt, updatedAt: f.updatedAt, templates: f.templates.map(toVectorString) }));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cryptoKey(), new TextEncoder().encode(JSON.stringify(plain)));
  await kvSet("faces", { iv, ct });
}
// Enrol a new person or add a template to an existing one.
export async function commitFace(caseNumber, embedding) {
  const faces = await loadFaces(), now = Date.now();
  const f = faces.find((x) => x.caseNumber === caseNumber);
  if (f) { f.templates = addTemplate(f.templates, embedding); f.updatedAt = now; }
  else faces.push({ caseNumber, createdAt: now, updatedAt: now, templates: [normalize(embedding)] });
  await saveFaces(faces);
}
export async function faceCount() { return (await loadFaces()).length; }
export async function forgetFace(caseNumber) { await saveFaces((await loadFaces()).filter((f) => f.caseNumber !== caseNumber)); }
export async function forgetAllFaces() { await saveFaces([]); }
// Match a portable vector string (e.g. produced earlier by this app) against the store.
export async function matchVectorString(text) {
  const v = fromVectorString(text);
  return v ? findMatch(v, await loadFaces()) : null;
}

// ---------- QR payload ----------
export function checksum(caseNumber) { return String([...caseNumber].reduce((a, c) => (a * 7 + +c) % 97, 11)).padStart(2, "0"); }
export function qrPayload(caseNumber) { return `YAVAR:${caseNumber}:${checksum(caseNumber)}`; }
export function parseQr(text) {
  const m = /^YAVAR:(\d{6}):(\d{2})$/.exec((text || "").trim());
  return m && checksum(m[1]) === m[2] ? m[1] : null;
}
