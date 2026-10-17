import { useMemo, useState } from "react";
import { ArrowRight, ArchiveRestore, CalendarClock, FolderArchive, LockKeyhole, Plus, Search, Settings2, X, Archive } from "lucide-react";
import { useInterview } from "@/components/interview/context";
import { createEmptyCase, withAudit } from "@/lib/interview/factory";
import { faDate } from "@/lib/interview/format";
import { Btn, Panel } from "@/components/interview/ui";
import type { View } from "@/lib/interview/types";

const previousView: Partial<Record<View, View>> = {
  case: "home", ready: "case", record: "ready", transcript: "record",
  questions: "transcript", summary: "questions", report: "summary",
  settings: "home", method: "home",
};

function newUniqueCode(codes: string[]): string {
  const taken = new Set(codes);
  for (let i = 0; i < 30; i += 1) {
    const candidate = String(Math.floor(100000 + Math.random() * 900000));
    if (!taken.has(candidate)) return candidate;
  }
  return `${Date.now()}`.slice(-6);
}

export function V5Toolbar() {
  const { state, active, go, lock, addCase, patchActive, patchCase, openCase } = useInterview();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [reminder, setReminder] = useState("");
  const [notice, setNotice] = useState("");

  const archived = useMemo(() => state.cases
    .filter((file) => Boolean(file.archivedAt))
    .filter((file) => {
      const term = search.trim().toLocaleLowerCase();
      return !term || [file.code, file.alias, file.clientName ?? ""].some((value) => value.toLocaleLowerCase().includes(term));
    }), [state.cases, search]);

  function createCase() {
    const code = newUniqueCode(state.cases.map((file) => file.code));
    const file = createEmptyCase({ center: state.settings.centerDefault, code });
    addCase(withAudit(file, "case_created", "نسخه ۵: ایجاد پرونده جدید"), "case");
    setNotice("پرونده جدید ساخته شد؛ اطلاعات را تکمیل و دکمه ذخیره را بزنید.");
    setArchiveOpen(false);
  }

  function toggleArchive() {
    if (!active) {
      setNotice("برای بایگانی، ابتدا یک پرونده را باز کنید.");
      return;
    }
    const wasArchived = Boolean(active.archivedAt);
    patchActive((file) => withAudit({
      ...file,
      archivedAt: wasArchived ? null : new Date().toISOString(),
    }, wasArchived ? "case_restored" : "case_archived", wasArchived ? "بازگردانی از آرشیو" : "انتقال به آرشیو"), false);
    setNotice(wasArchived ? "پرونده از آرشیو خارج شد." : "پرونده بایگانی شد.");
    if (!wasArchived) go("home");
  }

  function saveReminder() {
    if (!active) return;
    if (!reminder) {
      setNotice("ابتدا تاریخ و ساعت یادآوری را انتخاب کنید.");
      return;
    }
    const date = new Date(reminder);
    if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) {
      setNotice("زمان یادآوری باید در آینده باشد.");
      return;
    }
    patchActive((file) => withAudit({ ...file, reminderAt: date.toISOString() }, "reminder_set", date.toISOString()), false);
    setNotice("زمان یادآوری در پرونده ذخیره شد. در این نسخه هنوز اعلان سیستم‌عامل زمان‌بندی نمی‌شود.");
  }

  return (
    <header className="no-print sticky top-0 z-20 border-b border-line bg-bg/95 px-3 py-3 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <button className="min-w-0 text-start" onClick={() => go("home")} aria-label="رفتن به میز کار">
            <span className="block text-base font-semibold">یاور</span>
            <span className="block text-xs text-muted">میز مصاحبه · نسخه ۵</span>
          </button>
          <div className="flex shrink-0 items-center gap-1.5">
            <button title="بازگشت" aria-label="بازگشت" disabled={state.view === "home" || state.view === "lock"} onClick={() => go(previousView[state.view] ?? "home")} className="flex size-11 items-center justify-center rounded-lg border border-line bg-surface disabled:opacity-40">
              <ArrowRight className="size-5" aria-hidden />
            </button>
            <button title="تنظیمات" aria-label="تنظیمات" onClick={() => go("settings")} className="flex size-11 items-center justify-center rounded-lg border border-line bg-surface">
              <Settings2 className="size-5" aria-hidden />
            </button>
            <button title="قفل برنامه" aria-label="قفل برنامه" onClick={lock} className="flex size-11 items-center justify-center rounded-lg border border-line bg-surface">
              <LockKeyhole className="size-5" aria-hidden />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Btn tone="primary" className="min-h-11 px-2 text-sm" onClick={createCase}><Plus className="size-4" aria-hidden /> پرونده جدید</Btn>
          <Btn className="min-h-11 px-2 text-sm" onClick={() => { setArchiveOpen((value) => !value); setSearch(""); }}><FolderArchive className="size-4" aria-hidden /> آرشیو</Btn>
          <Btn className="min-h-11 px-2 text-sm" onClick={() => go("method")}>راهنما</Btn>
        </div>
        {active ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface p-2">
            <span className="min-w-0 flex-1 text-sm">پرونده فعال: <strong>{active.code || "بدون شناسه"}</strong></span>
            <button className="flex min-h-10 items-center gap-1 rounded-md border border-line px-2 text-sm" onClick={toggleArchive}>
              <Archive className="size-4" aria-hidden /> {active.archivedAt ? "بازیابی" : "بایگانی"}
            </button>
          </div>
        ) : null}
        {active ? (
          <div className="grid grid-cols-[1fr_auto] items-end gap-2">
            <label className="block min-w-0 text-xs text-muted">
              زمان یادآوری پرونده
              <input type="datetime-local" value={reminder || (active.reminderAt ? new Date(active.reminderAt).toISOString().slice(0,16) : "")} onChange={(event) => setReminder(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-line bg-surface px-2 text-sm text-ink" />
            </label>
            <Btn className="min-h-10 px-3 text-sm" onClick={saveReminder}><CalendarClock className="size-4" aria-hidden /> ثبت زمان</Btn>
          </div>
        ) : null}
        {notice ? <div role="status" className="flex items-start justify-between gap-2 rounded-md border border-line bg-surface px-3 py-2 text-sm"><span>{notice}</span><button aria-label="بستن پیام" onClick={() => setNotice("")}><X className="size-4" /></button></div> : null}
        {archiveOpen ? (
          <Panel className="max-h-80 overflow-y-auto">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">پرونده‌های بایگانی‌شده</h2>
              <button aria-label="بستن آرشیو" onClick={() => setArchiveOpen(false)} className="flex size-10 items-center justify-center rounded-md border border-line"><X className="size-4" /></button>
            </div>
            <label className="mt-2 flex h-11 items-center gap-2 rounded-md border border-line bg-bg px-3">
              <Search className="size-4 text-muted" aria-hidden />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="جست‌وجو با شناسه یا نام مستعار" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
            </label>
            {archived.length === 0 ? <p className="py-3 text-sm text-muted">پرونده بایگانی‌شده‌ای پیدا نشد.</p> : null}
            <ul className="mt-2 flex flex-col gap-2">
              {archived.map((file) => (
                <li key={file.id} className="rounded-md border border-line bg-bg p-2">
                  <div className="flex items-start justify-between gap-2">
                    <button className="min-w-0 flex-1 text-start" onClick={() => { openCase(file.id, "case"); setArchiveOpen(false); }}>
                      <span className="block font-medium">{file.code || "بدون شناسه"}</span>
                      <span className="block text-xs text-muted">{file.alias || "بدون نام مستعار"} · ویرایش: {faDate(file.updatedAt)}</span>
                    </button>
                    <button aria-label="بازیابی پرونده" title="بازیابی پرونده" className="flex size-10 items-center justify-center rounded-md border border-line" onClick={() => patchCase(file.id, (current) => withAudit({ ...current, archivedAt: null }, "case_restored", "بازگردانی از آرشیو"), false)}>
                      <ArchiveRestore className="size-4" aria-hidden />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}
        <nav className="flex gap-1.5 overflow-x-auto pb-0.5" aria-label="مراحل پرونده">
          {([
            ["case", "پرونده"], ["ready", "آمادگی"], ["record", "ضبط"],
            ["transcript", "متن"], ["questions", "سؤال‌ها"], ["summary", "جمع‌بندی"], ["report", "گزارش"],
          ] as [View, string][]).map(([view, label]) => (
            <button key={view} disabled={!active} onClick={() => go(view)} className={`min-h-10 shrink-0 rounded-md border px-3 text-sm disabled:opacity-40 ${state.view === view ? "border-transparent bg-accent text-accent-fg" : "border-line bg-surface"}`}>
              {label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}
