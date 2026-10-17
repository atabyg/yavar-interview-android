// IndexedDB storage: interviews, folders, audio chunks (written every second), final audio segments.
const DB_NAME = "yavar8";
let dbp = null;
const listeners = new Set();
export const onChange = (f) => { listeners.add(f); return () => listeners.delete(f); };
const emit = () => listeners.forEach((f) => { try { f(); } catch (e) { /* ignore */ } });

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore("interviews", { keyPath: "id" });
      d.createObjectStore("folders", { keyPath: "id" });
      d.createObjectStore("chunks", { keyPath: "k" });
      d.createObjectStore("audio", { keyPath: "k" });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}
const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
async function store(name, mode = "readonly") { const d = await open(); return d.transaction(name, mode).objectStore(name); }
const range = (id) => IDBKeyRange.bound(id + "|", id + "|\uffff");
const pad = (n, l) => String(n).padStart(l, "0");

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export async function listInterviews() {
  const all = await wrap((await store("interviews")).getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}
export async function getInterview(id) { return wrap((await store("interviews")).get(id)); }
export async function saveInterview(obj) { await wrap((await store("interviews", "readwrite")).put(obj)); emit(); return obj; }
export async function patchInterview(id, patch, silent = false) {
  const cur = await getInterview(id);
  if (!cur) return null;
  const next = { ...cur, ...patch };
  await wrap((await store("interviews", "readwrite")).put(next));
  if (!silent) emit();
  return next;
}
export async function listFolders() { return wrap((await store("folders")).getAll()); }
export async function saveFolder(f) { await wrap((await store("folders", "readwrite")).put(f)); emit(); }
export async function deleteFolder(id) {
  await wrap((await store("folders", "readwrite")).delete(id));
  const all = await listInterviews();
  for (const i of all) if (i.folderId === id) await patchInterview(i.id, { folderId: null }, true);
  emit();
}

export const putChunk = async (id, seg, n, blob) =>
  wrap((await store("chunks", "readwrite")).put({ k: `${id}|${pad(seg, 3)}|${pad(n, 6)}`, blob }));

// Turn raw chunks into one blob per segment. Used on normal stop AND for crash recovery.
export async function finalizeAudio(id) {
  const iv = await getInterview(id);
  const mime = (iv && iv.mime) || "audio/webm";
  const chunks = await wrap((await store("chunks")).getAll(range(id)));
  const bySeg = {};
  for (const c of chunks) { const seg = parseInt(c.k.split("|")[1], 10); (bySeg[seg] = bySeg[seg] || []).push(c); }
  let size = 0;
  const segs = Object.keys(bySeg).map(Number).sort((a, b) => a - b);
  let idx = 0;
  for (const s of segs) {
    const blob = new Blob(bySeg[s].map((c) => c.blob), { type: mime });
    size += blob.size;
    await wrap((await store("audio", "readwrite")).put({ k: `${id}|${pad(idx, 3)}`, blob }));
    idx++;
  }
  const keys = chunks.map((c) => c.k);
  const cs = await store("chunks", "readwrite");
  for (const k of keys) cs.delete(k);
  const existing = await getAudioSegments(id);
  const total = existing.reduce((a, b) => a + b.size, 0);
  await patchInterview(id, { segs: existing.length, sizeBytes: total || size });
  return existing.length;
}
export async function getAudioSegments(id) {
  const rows = await wrap((await store("audio")).getAll(range(id)));
  return rows.sort((a, b) => (a.k < b.k ? -1 : 1)).map((r) => r.blob);
}
export async function deleteInterview(id) {
  await wrap((await store("interviews", "readwrite")).delete(id));
  const a = await store("audio", "readwrite");
  const ka = await wrap(a.getAllKeys(range(id)));
  ka.forEach((k) => a.delete(k));
  const c = await store("chunks", "readwrite");
  const kc = await wrap(c.getAllKeys(range(id)));
  kc.forEach((k) => c.delete(k));
  emit();
}
export async function storageInfo() {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const e = await navigator.storage.estimate();
      return { used: e.usage || 0, quota: e.quota || 0 };
    }
  } catch (e) { /* ignore */ }
  return { used: 0, quota: 0 };
}
export async function requestPersist() {
  try { return navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; } catch (e) { return false; }
}
