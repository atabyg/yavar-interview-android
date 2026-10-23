import { useEffect, useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { FileText, Copy, Share2, EyeOff, Eye, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { patchInterview } from "../db";
import { groupByDay, buildDayText, dayLabel, dayFileName, timeLabel, AI_PROMPT } from "../daily";
import { ask, toast } from "../ui";
import { shareExchangePack } from "../exchange-share";

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) {}
  try {
    const t = document.createElement("textarea");
    t.value = text; document.body.appendChild(t); t.select();
    const ok = document.execCommand("copy"); document.body.removeChild(t); return ok;
  } catch (e) { return false; }
}

// Privacy gate for every path that sends interview content out of the app: the files are plain (unencrypted) and the chosen app receives them.
const PRIVACY_NOTE = "این فایل‌ها رمزگذاری نمی‌شوند و ممکن است صدا، نام مددجو، شمارهٔ پرونده یا محتوای حساس گفت‌وگو را داشته باشند؛ هر برنامه‌ای که انتخاب کنید آن‌ها را دریافت می‌کند. ادامه می‌دهید؟";

let dailySaveQueue = Promise.resolve();

async function shareFile(name, text) {
  if (!Capacitor.isNativePlatform()) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    a.download = name; a.click(); return;
  }
  const w = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
  await Share.share({ title: name, url: w.uri, dialogTitle: "ذخیره یا ارسال فایل متنی روزانه" });
}

export default function Daily({ items, onImportResult }) {
  const days = useMemo(() => groupByDay(items), [items]);
  const [openKey, setOpenKey] = useState(null);
  const [preview, setPreview] = useState(null);
  const [syncState, setSyncState] = useState("در حال آماده‌سازی آرشیو متنی…");

  useEffect(() => {
    let cancelled = false;
    dailySaveQueue = dailySaveQueue.then(async () => {
      if (cancelled) return;
      if (!Capacitor.isNativePlatform()) {
        setSyncState("در نسخهٔ وب برای دریافت فایل TXT از «ذخیره / ارسال فایل» استفاده کنید.");
        return;
      }
      try {
        await Filesystem.mkdir({ path: "yavar-daily", directory: Directory.Data, recursive: true }).catch(() => {});
        const activeNames = new Set();
        let saved = 0;
        for (const day of days) {
          if (cancelled) return;
          if (!day.items.some((i) => !i.dailyExcluded && (i.transcript || "").trim())) continue;
          const name = dayFileName(day.key);
          activeNames.add(name);
          await Filesystem.writeFile({
            path: "yavar-daily/" + name,
            data: buildDayText(day.key, day.items),
            directory: Directory.Data,
            encoding: Encoding.UTF8,
            recursive: true
          });
          saved++;
        }
        try {
          const listing = await Filesystem.readdir({ path: "yavar-daily", directory: Directory.Data });
          for (const file of (listing.files || [])) {
            if (/^yavar-\d{4}-\d{2}-\d{2}\.txt$/.test(file.name) && !activeNames.has(file.name)) {
              await Filesystem.deleteFile({ path: "yavar-daily/" + file.name, directory: Directory.Data });
            }
          }
        } catch (e) { /* Keep successfully written files if cleanup is unsupported. */ }
        if (!cancelled) setSyncState(`${saved} فایل TXT شمسی در حافظهٔ داخلی یاور ذخیره شد.`);
      } catch (error) {
        if (!cancelled) setSyncState("ذخیرهٔ خودکار TXT موفق نبود؛ فایل را با دکمهٔ ذخیره/ارسال خروجی بگیرید. " + String((error && error.message) || error || ""));
      }
    }).catch((error) => {
      if (!cancelled) setSyncState("خطا در به‌روزرسانی آرشیو TXT: " + String((error && error.message) || error || ""));
    });
    return () => { cancelled = true; };
  }, [days]);

  async function toggle(i) { await patchInterview(i.id, { dailyExcluded: !i.dailyExcluded }); }
  async function copy(key, list) {
    if (!(await ask("متن روز (با نام مددجو و شمارهٔ پرونده) در کلیپ‌بورد قرار می‌گیرد و برنامه‌های دیگر می‌توانند آن را بخوانند. ادامه می‌دهید؟", "کپی متن روز"))) return;
    toast((await copyText(buildDayText(key, list))) ? "متن روز کپی شد." : "کپی ممکن نشد.");
  }
  async function share(key, list) {
    if (!(await ask(PRIVACY_NOTE, "ذخیره یا ارسال متن روز"))) return;
    try { await shareFile(dayFileName(key), buildDayText(key, list)); } catch (e) { toast("ذخیره یا اشتراک فایل ممکن نشد."); }
  }
  async function shareExchange(key, list) {
    const records = list.filter((i) => !i.dailyExcluded);
    if (!(await ask(PRIVACY_NOTE + " نام مددجو در فایل‌های قرارداد JSON نیامده است.", "ارسال به هوش مصنوعی بیرونی"))) return;
    try { await shareExchangePack(records, key); toast("فایل‌های صوتی، متن با شناسهٔ قطعه‌ها و پرامپت قرارداد JSON آماده شد."); }
    catch (e) { toast("ارسال بستهٔ صوتی/پرامپت ممکن نشد: " + String((e && e.message) || e)); }
  }

  return (
    <div>
      <div className="card">
        <div className="row"><Sparkles size={16} /><b className="grow">متن روزانه برای هوش مصنوعی</b></div>
        <div className="mut" style={{ marginTop: 6, lineHeight: 1.9 }}>برای هر روز شمسی یک فایل متنی ساخته می‌شود که همهٔ گفت‌وگوهای متنی‌شدهٔ همان روز را به تفکیک مددجو و شمارهٔ پرونده دارد. هر رکورد را می‌توانید از فایل حذف یا دوباره اضافه کنید (صدا و متن اصلی پاک نمی‌شود).</div>
        <div className="mut" style={{ marginTop: 7, lineHeight: 1.8 }}>{syncState}</div>
        <div className="row" style={{ flexWrap: "wrap", gap: 8, marginTop: 8 }}><button className="btn alt sm" onClick={async () => toast((await copyText(AI_PROMPT)) ? "پرامپت آمادهٔ هوش مصنوعی کپی شد." : "کپی ممکن نشد.")}><Copy size={14} /> کپی پرامپت پیشنهادی</button>{onImportResult && <button className="btn sm" onClick={onImportResult}><FileText size={14} /> ثبت نتیجهٔ هوش مصنوعی بیرونی</button>}</div>
      </div>
      {days.length === 0 && <div className="card mut">هنوز مصاحبه‌ای ثبت نشده است.</div>}
      {days.map(({ key, items: list }) => {
        const withText = list.filter((i) => (i.transcript || "").trim());
        const included = withText.filter((i) => !i.dailyExcluded).length;
        const open = openKey === key;
        return (
          <div className="card" key={key}>
            <div className="row" onClick={() => setOpenKey(open ? null : key)} style={{ cursor: "pointer" }}>
              <FileText size={17} />
              <div className="grow"><b>{dayLabel(list[0].createdAt)}</b><div className="mut">{key} — {included} متن از {list.length} مصاحبه در فایل</div></div>
              {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </div>
            {open && <div style={{ marginTop: 10 }}>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <button className="btn alt sm" onClick={() => share(key, list)}><Share2 size={14} /> ذخیره / ارسال متن روز</button><button className="btn sm" onClick={() => shareExchange(key, list)}><Share2 size={14} /> ارسال صوت + پرامپت JSON</button>
                <button className="btn alt sm" onClick={() => copy(key, list)}><Copy size={14} /> کپی</button>
                <button className="btn alt sm" onClick={() => setPreview(preview === key ? null : key)}>پیش‌نمایش</button>
              </div>
              {list.map((i) => (
                <div className="row" key={i.id} style={{ marginTop: 8, opacity: i.dailyExcluded ? 0.55 : 1 }}>
                  <div className="grow">
                    <div style={{ fontSize: 13 }}><b>{i.candidate || "بدون نام"}</b> {i.caseNumber ? <span className="mut">· پرونده {i.caseNumber}</span> : null}</div>
                    <div className="mut">{timeLabel(i.createdAt)} — {(i.transcript || "").trim() ? "متن آماده" : "هنوز متنی ندارد"}</div>
                  </div>
                  <button className="btn alt sm" onClick={() => toggle(i)} disabled={!(i.transcript || "").trim()}>{i.dailyExcluded ? <><Eye size={14} /> افزودن</> : <><EyeOff size={14} /> حذف از فایل</>}</button>
                </div>
              ))}
              {preview === key && <textarea className="inp tx" readOnly rows={10} style={{ marginTop: 10, direction: "rtl", fontSize: 12 }} value={buildDayText(key, list)} />}
            </div>}
          </div>
        );
      })}
    </div>
  );
}
