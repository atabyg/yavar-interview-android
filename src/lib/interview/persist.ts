import type { CaseFile, PinRecord, Settings } from "./types.ts";

export const STORAGE_KEY = "yavar-interview-v1";

export const DEFAULT_SETTINGS: Settings = {
  orgTitle: "عنوان سازمان",
  deptTitle: "میز مصاحبه شغلی",
  centerDefault: "",
  autoLockMin: 5,
  endPhrase: "",
  allowBrowserSpeech: false,
  biometricEnabled: false,
};

export interface SavedState {
  v: 1;
  pin: PinRecord | null;
  failedAttempts: number;
  lockUntil: number;
  settings: Settings;
  cases: CaseFile[];
}

export function lockoutMs(failedAttempts: number): number {
  if (failedAttempts < 5) return 0;
  const step = failedAttempts - 4;
  return Math.min(15 * 60 * 1000, 30_000 * 2 ** (step - 1));
}

function bytesToB64(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

function b64ToBytes(value: string): Uint8Array {
  const text = atob(value);
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index);
  return bytes;
}

async function pbkdf2(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const saltBuffer = salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer;
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBuffer, iterations, hash: "SHA-256" },
    key,
    256,
  );
  return new Uint8Array(bits);
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

export async function createPin(pin: string): Promise<PinRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 120_000;
  const hash = await pbkdf2(pin, salt, iterations);
  return { saltB64: bytesToB64(salt), hashB64: bytesToB64(hash), iterations };
}

export async function verifyPin(pin: string, record: PinRecord): Promise<boolean> {
  const hash = await pbkdf2(pin, b64ToBytes(record.saltB64), record.iterations);
  return sameText(bytesToB64(hash), record.hashB64);
}

export function loadSaved(): SavedState {
  const empty: SavedState = {
    v: 1,
    pin: null,
    failedAttempts: 0,
    lockUntil: 0,
    settings: DEFAULT_SETTINGS,
    cases: [],
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<SavedState>;
    if (parsed.v !== 1 || !Array.isArray(parsed.cases)) return empty;
    return {
      v: 1,
      pin: parsed.pin ?? null,
      failedAttempts: parsed.failedAttempts ?? 0,
      lockUntil: parsed.lockUntil ?? 0,
      settings: { ...DEFAULT_SETTINGS, ...parsed.settings, endPhrase: parsed.settings?.endPhrase ?? "", allowBrowserSpeech: false },
      cases: parsed.cases.map((rawCase) => {
        const file = rawCase as CaseFile;
        const audit = Array.isArray(file.audit) ? file.audit : [];
        const cloudAiConsent = file.cloudAiConsent ?? false;
        // In V1, "signed" only represented two expert reviews. It is not the required written F04 approval by the head and deputy.
        if (file.status === "signed") {
          return {
            ...file,
            cloudAiConsent,
            status: "review" as const,
            audit: [...audit, {
              at: new Date().toISOString(),
              action: "v2_migration_reopen_for_F04",
              detail: "وضعیت نسخه قبلی بازبینی شد؛ دو تأیید کارشناسی جایگزین تأیید مکتوب رئیس و معاون در F04 نیست.",
            }].slice(-200),
          };
        }
        return { ...file, cloudAiConsent, audit };
      }),
    };
  } catch {
    return empty;
  }
}

export function saveSaved(state: SavedState): void {
  const copy: SavedState = {
    ...state,
    settings: { ...state.settings, allowBrowserSpeech: false },
    cases: state.cases.map((file) => ({
      ...file,
      audit: file.audit.map((event) => ({ at: event.at, action: event.action, detail: event.detail })),
    })),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(copy));
}

export async function saveAudio(id: string, blob: Blob): Promise<void> {
  const db = await openAudio();
  await run(db, "readwrite", (store) => store.put(blob, id));
  db.close();
}

export async function loadAudio(id: string): Promise<Blob | null> {
  const db = await openAudio();
  const blob = await run<Blob | undefined>(db, "readonly", (store) => store.get(id));
  db.close();
  return blob ?? null;
}

export async function deleteAudio(id: string): Promise<void> {
  const db = await openAudio();
  await run(db, "readwrite", (store) => store.delete(id));
  db.close();
}

function openAudio(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("yavar-audio", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("clips")) request.result.createObjectStore("clips");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(db: IDBDatabase, mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("clips", mode);
    const request = op(tx.objectStore("clips"));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
