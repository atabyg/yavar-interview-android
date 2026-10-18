import { useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { FileText, Copy, Share2, EyeOff, Eye, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { patchInterview } from "../db";
import { groupByDay, buildDayText, dayLabel, dayFileName, timeLabel, AI_PROMPT } from "../daily";
import { toast } from "../ui";

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) {}
  try {
    const t = document.createElement("textarea");
    t.value = text; document.body.appendChild(t); t.select();
    const ok = document.execCommand("copy"); document.body.removeChild(t); return ok;
  } catch (e) { return false; }
}

async function shareFile(name, text) {
  if (!Capacitor.isNativePlatform()) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    a.download = name; a.click(); return;
  }
  const w = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
  await Share.share({ title: name, url: w.uri, dialogTitle: "ذخیره یا ارسال فایل متنی روزانه" });
}

export default function Daily({ items }) {
  const days = useMemo(() => groupByDay(items), [items]);
  const [openKey, setOpenKey] = useState(null);
  const [preview, setPreview] = useState(null);

  async function toggle(i) { await patchInterview(i.id, { dailyExcluded: !i.dailyExcluded }); }
  async function copy(key, list) {
    toast((await copyText(buildDayText(key, list))) ? "متن روز کپی شد." : "کپی ممکن نشد.");
  }
  async function share(key, list) {
    try { await shareFile(dayFileName(key), buildDayText(key, list)); } catch (e) { toast("ذخیره یا اشتراک فایل ممکن نشد."); }
  }

  return (
    <div>
      <div className="card">
        <div className="row"><Sparkles size={16} /><b className="grow">متن روزانه برای هوش مصنوعی</b></div>
        <div className="mut" style={{ marginTop: 6, lineHeight: 1.9 }}>برای هر روز شمسی یک فایل متنی ساخته می‌شود که همهٔ گفت‌وگوهای متنی‌شدهٔ همان روز را به تفکیک مددجو و شمارهٔ پرونده دارد. هر رکورد را می‌توانید از فایل حذف یا دوباره اضافه کنید (صدا و متن اصلی پاک نمی‌شود).</div>
        <button className="btn alt sm" style={{ marginTop: 8 }} onClick={async () => toast((await copyText(AI_PROMPT)) ? "پرامپت آمادهٔ هوش مصنوعی کپی شد." : "کپی ممکن نشد.")}><Copy size={14} /> کپی پرامپت پیشنهادی</button>
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
              <div className="grow"><b>{dayLabel(list[0].createdAt)}</b><div className="mut">{key} — {included} از {list.length} رکورد در فایل</div></div>
              {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </div>
            {open && <div style={{ marginTop: 10 }}>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <button className="btn sm" onClick={() => share(key, list)}><Share2 size={14} /> ذخیره / ارسال فایل</button>
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
