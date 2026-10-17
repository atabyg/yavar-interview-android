import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { CaseFile, PinRecord, Settings, View } from "@/lib/interview/types";
import { authenticateBiometric } from "@/lib/interview/native-exports";
import {
  DEFAULT_SETTINGS,
  createPin,
  deleteAudio,
  loadSaved,
  lockoutMs,
  saveSaved,
  verifyPin,
} from "@/lib/interview/persist";

export interface AppState {
  pin: PinRecord | null;
  failedAttempts: number;
  lockUntil: number;
  unlocked: boolean;
  settings: Settings;
  cases: CaseFile[];
  activeId: string | null;
  view: View;
  ready: boolean;
}

interface Api {
  state: AppState;
  active: CaseFile | null;
  setupPin: (pin: string) => Promise<void>;
  unlockWith: (pin: string) => Promise<"ok" | "bad" | "wait">;
  unlockWithBiometric: () => Promise<boolean>;
  lock: () => void;
  go: (view: View) => void;
  openCase: (id: string, view?: View) => void;
  addCase: (file: CaseFile, view?: View) => void;
  patchActive: (mutate: (file: CaseFile) => CaseFile, clearApproval?: boolean) => void;
  patchSettings: (partial: Partial<Settings>) => void;
  removeActive: () => Promise<void>;
  wipeAll: () => Promise<void>;
}

const InterviewContext = createContext<Api | null>(null);

const INITIAL: AppState = {
  pin: null,
  failedAttempts: 0,
  lockUntil: 0,
  unlocked: false,
  settings: DEFAULT_SETTINGS,
  cases: [],
  activeId: null,
  view: "lock",
  ready: false,
};

export function InterviewProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(INITIAL);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const saved = loadSaved();
    setState((current) => ({
      ...current,
      pin: saved.pin,
      failedAttempts: saved.failedAttempts,
      lockUntil: saved.lockUntil,
      settings: saved.settings,
      cases: saved.cases,
      unlocked: false,
      view: "lock",
      ready: true,
    }));
  }, []);

  useEffect(() => {
    if (!state.ready) return;
    saveSaved({
      v: 1,
      pin: state.pin,
      failedAttempts: state.failedAttempts,
      lockUntil: state.lockUntil,
      settings: state.settings,
      cases: state.cases,
    });
  }, [state.ready, state.pin, state.failedAttempts, state.lockUntil, state.settings, state.cases]);

  useEffect(() => {
    if (!state.unlocked || state.settings.autoLockMin <= 0) return;
    const wait = state.settings.autoLockMin * 60_000;
    let timer = window.setTimeout(() => {
      setState((current) => ({ ...current, unlocked: false, view: "lock" }));
    }, wait);
    const bump = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setState((current) => ({ ...current, unlocked: false, view: "lock" }));
      }, wait);
    };
    window.addEventListener("pointerdown", bump);
    window.addEventListener("keydown", bump);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", bump);
      window.removeEventListener("keydown", bump);
    };
  }, [state.unlocked, state.settings.autoLockMin]);

  const api: Api = {
    state,
    active: state.cases.find((file) => file.id === state.activeId) ?? null,
    async setupPin(pin: string) {
      const record = await createPin(pin);
      setState((current) => ({ ...current, pin: record, unlocked: true, failedAttempts: 0, lockUntil: 0, view: "home" }));
    },
    async unlockWith(pin: string) {
      const current = stateRef.current;
      if (!current.pin) return "bad";
      if (Date.now() < current.lockUntil) return "wait";
      const ok = await verifyPin(pin, current.pin);
      if (ok) {
        setState((prev) => ({ ...prev, unlocked: true, failedAttempts: 0, lockUntil: 0, view: "home" }));
        return "ok";
      }
      setState((prev) => {
        const failedAttempts = prev.failedAttempts + 1;
        return { ...prev, failedAttempts, lockUntil: Date.now() + lockoutMs(failedAttempts) };
      });
      return "bad";
    },
    async unlockWithBiometric() {
      const current = stateRef.current;
      if (!current.pin || !current.settings.biometricEnabled || Date.now() < current.lockUntil) return false;
      const ok = await authenticateBiometric().catch(() => false);
      if (!ok) return false;
      setState((prev) => ({ ...prev, unlocked: true, failedAttempts: 0, lockUntil: 0, view: "home" }));
      return true;
    },
    lock() {
      setState((current) => ({ ...current, unlocked: false, view: "lock" }));
    },
    go(view: View) {
      setState((current) => ({ ...current, view }));
    },
    openCase(id: string, view: View = "case") {
      setState((current) => ({ ...current, activeId: id, view }));
    },
    addCase(file: CaseFile, view: View = "case") {
      setState((current) => ({ ...current, cases: [file, ...current.cases], activeId: file.id, view }));
    },
    patchActive(mutate, clearApproval = true) {
      setState((current) => {
        if (!current.activeId) return current;
        return {
          ...current,
          cases: current.cases.map((file) => {
            if (file.id !== current.activeId) return file;
            let next = mutate(file);
            if (clearApproval) {
              next = {
                ...next,
                expertApprovedAt: null,
                secondApprovedAt: null,
                status: next.status === "signed" ? "review" : next.status,
              };
            }
            next.updatedAt = new Date().toISOString();
            return next;
          }),
        };
      });
    },
    patchSettings(partial) {
      setState((current) => ({ ...current, settings: { ...current.settings, ...partial } }));
    },
    async removeActive() {
      const id = stateRef.current.activeId;
      if (!id) return;
      await deleteAudio(id).catch(() => undefined);
      setState((current) => ({
        ...current,
        cases: current.cases.filter((file) => file.id !== id),
        activeId: null,
        view: "home",
      }));
    },
    async wipeAll() {
      const ids = stateRef.current.cases.map((file) => file.id);
      await Promise.all(ids.map((id) => deleteAudio(id).catch(() => undefined)));
      setState((current) => ({ ...current, cases: [], activeId: null, view: "home" }));
    },
  };

  return <InterviewContext.Provider value={api}>{children}</InterviewContext.Provider>;
}

export function useInterview(): Api {
  const value = useContext(InterviewContext);
  if (!value) throw new Error("interview context missing");
  return value;
}
