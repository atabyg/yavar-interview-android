import { useCallback, useEffect, useState } from "react";
import { Archive as ArchiveIcon, FileText, Mic, Settings as Cog } from "lucide-react";
import logo from "./assets/logo.png";
import { finalizeAudio, getAudioSegments, listFolders, listInterviews, onChange, patchInterview, requestPersist, storageInfo } from "./db";
import { loadSettings, getSettings } from "./settings";
import { processInterview } from "./pipeline";
import Record from "./components/Record";
import Archive from "./components/Archive";
import Daily from "./components/Daily";
import Detail from "./components/Detail";
import Settings from "./components/Settings";
import ImportResult from "./components/ImportResult";
import { startSharedInbox } from "./shared-inbox";
import { Host } from "./ui";

// On launch: rescue any recording that was cut off (app killed, phone restarted), resume interrupted processing.
async function recover() {
  const all = await listInterviews();
  const s = getSettings();
  for (const i of all) {
    if (i.status === "recording") {
      await finalizeAudio(i.id);
      const segs = await getAudioSegments(i.id);
      if (!segs.length) { await patchInterview(i.id, { status: "error", error: "ضبط ناقص بود و صدایی ذخیره نشده بود.", failedAt: "transcribe" }); continue; }
      await patchInterview(i.id, { status: "recorded", title: i.title + " (بازیابی‌شده)" });
      processInterview(i.id, { transcribeOnly: !s.autoProcess });
    } else if (i.status === "recorded" && !i.transcript) {
      // Resume legacy/stale recordings that were saved but never successfully transcribed.
      processInterview(i.id, { transcribeOnly: !s.autoProcess });
    } else if (i.status === "transcribing" || i.status === "analyzing") processInterview(i.id);
  }
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("rec");
  const [items, setItems] = useState([]);
  const [folders, setFolders] = useState([]);
  const [storage, setStorage] = useState({ used: 0, quota: 0 });
  const [open, setOpen] = useState(null);
  const [importPanel, setImportPanel] = useState(null);

  const reload = useCallback(async () => {
    setItems(await listInterviews()); setFolders(await listFolders()); setStorage(await storageInfo());
  }, []);

  useEffect(() => {
    (async () => { await loadSettings(); requestPersist(); await recover(); await reload(); setReady(true); })();
    return onChange(reload);
  }, [reload]);

  // Accept coded text shared from another Android app.
  useEffect(() => {
    let alive = true;
    let dispose = () => {};
    startSharedInbox((payload) => {
      if (!alive) return;
      setOpen(null); setTab("day");
      setImportPanel({ ...payload, _key: String(Date.now()) });
    }).then((stop) => { if (alive) dispose = stop; else stop(); }).catch((error) => {
      if (alive) setImportPanel({ error: "دریافت فایل اشتراک‌گذاری‌شده ناموفق بود: " + String((error && error.message) || error), _key: String(Date.now()) });
    });
    return () => { alive = false; dispose(); };
  }, []);

  // back button / swipe closes the detail page instead of exiting the app
  useEffect(() => {
    if (!open) return;
    window.history.pushState({ d: 1 }, "");
    const pop = () => setOpen(null);
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [open]);

  if (!ready) return <div className="app" style={{ alignItems: "center", justifyContent: "center" }}><img src={logo} alt="" height="90" /></div>;
  const cur = items.find((i) => i.id === open);
  const T = [["rec", "ضبط", Mic], ["arc", "آرشیو", ArchiveIcon], ["day", "متن روزانه", FileText], ["set", "تنظیمات", Cog]];
  return (
    <div className="app">
      <div className="top"><img src={logo} alt="" /><div><b>یاور مصاحبه</b><small>ضبط، متن، تحلیل و گزارش</small><small className="org-tagline">معاونت کارآفرینی و توانمندسازی</small></div></div>
      <div className="main">
        <div style={{ display: tab === "rec" ? "block" : "none" }}><Record folders={folders} items={items} onOpen={(id) => { setOpen(id); }} /></div>
        {tab === "arc" && <Archive items={items} folders={folders} storage={storage} onOpen={setOpen} />}
        <div style={{ display: tab === "day" ? "block" : "none" }}><Daily items={items} onImportResult={() => setImportPanel({ _key: String(Date.now()) })} /></div>
        {tab === "set" && <Settings storage={storage} onChange={reload} />}
      </div>
      <div className="tabs">{T.map(([k, n, Ic]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}><Ic size={22} />{n}</button>)}</div>
      {cur && <Detail key={cur.id} iv={cur} onImportResult={() => setImportPanel({ _key: String(Date.now()) })} onBack={() => { setOpen(null); }} />}
      {importPanel && <ImportResult key={importPanel._key} items={items} initialText={importPanel.text || ""} initialName={importPanel.name || ""} initialError={importPanel.error || ""} initialBase64={importPanel.base64 || ""} initialMime={importPanel.mimeType || ""} onClose={() => setImportPanel(null)} />}
      <Host />
    </div>
  );
}
