import { useMemo, useState } from "react";
import { Search, Star, Folder, FolderPlus, Trash2, FileSpreadsheet, CheckSquare, X, FolderInput, HardDrive, Pencil, Mic, Loader2, AlertTriangle } from "lucide-react";
import { deleteFolder, deleteInterview, patchInterview, saveFolder, uid } from "../db";
import { compareExcel, fmtDate, fmtDur } from "../export";
import { saveFile } from "../native";
import { Sheet, STATUS, ask, fa, scoreColor, size, toast } from "../ui";

export default function Archive({ items, folders, storage, onOpen }) {
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState("all");
  const [sort, setSort] = useState("date");
  const [sel, setSel] = useState([]);
  const [sheet, setSheet] = useState(null);
  const [fname, setFname] = useState("");

  const list = useMemo(() => {
    let l = items.filter((i) => (folder === "all" ? true : folder === "star" ? i.starred : folder === "none" ? !i.folderId : i.folderId === folder));
    const s = q.trim();
    if (s) l = l.filter((i) => [i.title, i.candidate, i.position, i.transcript].join(" ").includes(s));
    const by = { date: (a, b) => b.createdAt - a.createdAt, score: (a, b) => ((b.analysis && b.analysis.overall) || -1) - ((a.analysis && a.analysis.overall) || -1), name: (a, b) => (a.candidate || a.title).localeCompare(b.candidate || b.title, "fa") };
    return [...l].sort(by[sort]);
  }, [items, q, folder, sort]);

  const selMode = sel.length > 0;
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const pct = storage.quota ? Math.min(100, (storage.used / storage.quota) * 100) : 0;

  async function delSel() {
    if (!(await ask(`${fa(sel.length)} مصاحبه (همراه با صوت) برای همیشه حذف شود؟`, "حذف", true))) return;
    for (const id of sel) await deleteInterview(id);
    setSel([]); toast("حذف شد");
  }
  async function moveSel(fid) { for (const id of sel) await patchInterview(id, { folderId: fid }, true); await patchInterview(sel[0], {}); setSel([]); setSheet(null); toast("منتقل شد"); }
  async function exportSel() {
    const chosen = items.filter((i) => sel.includes(i.id));
    if (!chosen.some((i) => i.analysis)) { toast("هیچ‌کدام تحلیل کامل ندارند."); return; }
    await saveFile(compareExcel(chosen), "مقایسه-مصاحبه‌ها.xlsx"); setSel([]);
  }
  async function submitFolder() {
    const n = fname.trim();
    if (!n) return;
    await saveFolder({ id: sheet.edit ? sheet.edit.id : uid(), name: n });
    setFname(""); setSheet(null);
  }

  return (
    <div>
      <div className="card" style={{ padding: 11 }}>
        <div className="row mut"><HardDrive size={15} /> <span className="grow">{fa(items.length)} مصاحبه • {size(storage.used)} فضای مصرفی</span></div>
        <div className="bar" style={{ marginTop: 6, height: 6 }}><i style={{ width: pct + "%" }} /></div>
      </div>
      <div className="row" style={{ marginBottom: 10 }}>
        <div className="grow" style={{ position: "relative" }}>
          <Search size={16} style={{ position: "absolute", right: 12, top: 13, color: "var(--slate)" }} />
          <input className="inp" style={{ paddingRight: 36 }} placeholder="جستجو در نام، سمت و متن" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="inp" style={{ width: 104 }} value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="date">جدیدترین</option><option value="score">بیشترین امتیاز</option><option value="name">نام</option>
        </select>
      </div>
      <div className="chips">
        <button className={"chip " + (folder === "all" ? "on" : "")} onClick={() => setFolder("all")}>همه</button>
        <button className={"chip " + (folder === "star" ? "on" : "")} onClick={() => setFolder("star")}><Star size={13} /> نشان‌دار</button>
        {folders.map((f) => (
          <button key={f.id} className={"chip " + (folder === f.id ? "on" : "")} onClick={() => setFolder(f.id)}
            onContextMenu={(e) => { e.preventDefault(); setFname(f.name); setSheet({ type: "folder", edit: f }); }}><Folder size={13} /> {f.name}</button>
        ))}
        <button className="chip" onClick={() => { setFname(""); setSheet({ type: "folder" }); }}><FolderPlus size={14} /> پوشه</button>
        {folder !== "all" && folder !== "star" && folder !== "none" && (
          <button className="chip" onClick={() => { const f = folders.find((x) => x.id === folder); setFname(f.name); setSheet({ type: "folder", edit: f }); }}><Pencil size={13} /> ویرایش پوشه</button>
        )}
      </div>

      {selMode && (
        <div className="card row" style={{ position: "sticky", top: -6, zIndex: 5, background: "var(--navy)", color: "#fff", padding: 9 }}>
          <button className="ib" onClick={() => setSel([])}><X size={18} /></button>
          <b className="grow">{fa(sel.length)} انتخاب</b>
          <button className="ib" onClick={() => setSel(list.map((i) => i.id))}><CheckSquare size={18} /></button>
          <button className="ib" onClick={() => setSheet({ type: "move" })}><FolderInput size={18} /></button>
          <button className="ib" onClick={exportSel}><FileSpreadsheet size={18} /></button>
          <button className="ib red" onClick={delSel}><Trash2 size={18} /></button>
        </div>
      )}

      {list.length === 0 && <div className="empty"><Mic size={40} /><div style={{ marginTop: 8 }}>{items.length ? "موردی پیدا نشد" : "هنوز مصاحبه‌ای ضبط نشده است"}</div></div>}
      {list.map((i) => {
        const [lbl, cls] = STATUS[i.status] || ["", ""];
        const a = i.analysis;
        return (
          <div key={i.id} className={"item " + (sel.includes(i.id) ? "sel" : "")}
            onClick={() => (selMode ? toggle(i.id) : onOpen(i.id))}
            onTouchStart={(e) => { const t = setTimeout(() => { toggle(i.id); navigator.vibrate && navigator.vibrate(15); }, 500); e.currentTarget._t = t; }}
            onTouchEnd={(e) => clearTimeout(e.currentTarget._t)} onTouchMove={(e) => clearTimeout(e.currentTarget._t)}>
            {a ? <div className="ring" style={{ background: scoreColor(a.overall) }}>{fa(a.overall)}</div> : <div className="ico">{i.status === "error" ? <AlertTriangle size={22} /> : /ing$/.test(i.status) ? <Loader2 size={22} className="spin" /> : <Mic size={22} />}</div>}
            <div className="grow">
              <div className="ell" style={{ fontWeight: 600 }}>{i.candidate || i.title}</div>
              <div className="mut ell">{[i.position, fmtDate(i.createdAt), fmtDur(i.durationSec)].filter(Boolean).join(" • ")}</div>
              <span className={"badge " + cls}>{lbl}</span>
            </div>
            <button className="ib" style={{ background: "none" }} onClick={(e) => { e.stopPropagation(); patchInterview(i.id, { starred: !i.starred }); }}>
              <Star size={20} fill={i.starred ? "#D4A237" : "none"} color={i.starred ? "#D4A237" : "#566A7A"} />
            </button>
          </div>
        );
      })}

      {sheet && sheet.type === "folder" && (
        <Sheet title={sheet.edit ? "ویرایش پوشه" : "پوشهٔ جدید"} onClose={() => setSheet(null)}>
          <input className="inp" autoFocus placeholder="نام پوشه" value={fname} onChange={(e) => setFname(e.target.value)} />
          <div className="row" style={{ marginTop: 12 }}>
            {sheet.edit && <button className="btn red" onClick={async () => { if (await ask("پوشه حذف شود؟ مصاحبه‌ها حذف نمی‌شوند.", "حذف", true)) { await deleteFolder(sheet.edit.id); setFolder("all"); setSheet(null); } }}>حذف</button>}
            <button className="btn grow" onClick={submitFolder}>ذخیره</button>
          </div>
        </Sheet>
      )}
      {sheet && sheet.type === "move" && (
        <Sheet title="انتقال به پوشه" onClose={() => setSheet(null)}>
          <button className="item" style={{ width: "100%" }} onClick={() => moveSel(null)}><Folder size={18} /> بدون پوشه</button>
          {folders.map((f) => <button key={f.id} className="item" style={{ width: "100%" }} onClick={() => moveSel(f.id)}><Folder size={18} /> {f.name}</button>)}
          {folders.length === 0 && <div className="mut">ابتدا یک پوشه بسازید.</div>}
        </Sheet>
      )}
    </div>
  );
}
