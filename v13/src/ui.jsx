import { useEffect, useState } from "react";

let toastFn = null, askFn = null;
export const toast = (m) => toastFn && toastFn(m);
export const ask = (m, ok = "تأیید", danger = false) => new Promise((r) => (askFn ? askFn({ m, ok, danger, r }) : r(true)));

export function Host() {
  const [t, setT] = useState("");
  const [q, setQ] = useState(null);
  useEffect(() => {
    let h;
    toastFn = (m) => { setT(m); clearTimeout(h); h = setTimeout(() => setT(""), 2800); };
    askFn = setQ;
    return () => { toastFn = askFn = null; };
  }, []);
  return (
    <>
      {t && <div className="toast">{t}</div>}
      {q && (
        <div className="sheetbg" onClick={() => { q.r(false); setQ(null); }}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <p style={{ margin: "0 0 14px", lineHeight: 1.9 }}>{q.m}</p>
            <div className="row">
              <button className="btn line grow" onClick={() => { q.r(false); setQ(null); }}>انصراف</button>
              <button className={"btn grow " + (q.danger ? "red" : "")} onClick={() => { q.r(true); setQ(null); }}>{q.ok}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function Sheet({ title, onClose, children }) {
  return (
    <div className="sheetbg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        {title && <h3>{title}</h3>}
        {children}
      </div>
    </div>
  );
}

export const scoreColor = (v) => (v >= 75 ? "#2E8B57" : v >= 55 ? "#0F7F8A" : v >= 40 ? "#D4A237" : "#C0583A");
export const fa = (n) => Number(n).toLocaleString("fa-IR");
export const size = (b) => (b > 1048576 ? fa((b / 1048576).toFixed(1)) + " مگابایت" : fa(Math.max(1, Math.round(b / 1024))) + " کیلوبایت");
export const STATUS = {
  recording: ["در حال ضبط", "go"], recorded: ["ضبط شد", ""], transcribing: ["تبدیل به متن…", "go"], transcribed: ["متن آماده", ""],
  analyzing: ["در حال تحلیل…", "go"], done: ["کامل", ""], error: ["نیازمند تلاش مجدد", "err"],
};
