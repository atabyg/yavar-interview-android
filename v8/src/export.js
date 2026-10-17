import * as XLSX from "xlsx";
import logo from "./assets/logo.png";
import { COMPETENCIES } from "./openai";

export const fmtDate = (t) => new Date(t).toLocaleDateString("fa-IR", { year: "numeric", month: "long", day: "numeric" });
export const fmtTime = (t) => new Date(t).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
export const fmtDur = (s) => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ":" : "") + String(m).padStart(h ? 2 : 1, "0") + ":" + String(x).padStart(2, "0"); };
export const fileBase = (iv) => ("مصاحبه-" + (iv.candidate || iv.title || iv.id)).replace(/[\\/:*?"<>|\s]+/g, "-");
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ------------------------------ Excel ------------------------------ */
function sheet(rows, widths) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = widths.map((w) => ({ wch: w }));
  return ws;
}
function book(sheets) {
  const wb = XLSX.utils.book_new();
  sheets.forEach(([n, ws]) => XLSX.utils.book_append_sheet(wb, ws, n));
  wb.Workbook = { Views: [{ RTL: true }] };
  return wb;
}
const toBlob = (wb) => new Blob([XLSX.write(wb, { bookType: "xlsx", type: "array" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

export function interviewExcel(iv) {
  const a = iv.analysis || {};
  const info = [
    ["گزارش مصاحبه", ""], ["نام متقاضی", iv.candidate || "-"], ["سمت", iv.position || "-"], ["مصاحبه‌گر", iv.interviewer || "-"],
    ["تاریخ", fmtDate(iv.createdAt)], ["مدت", fmtDur(iv.durationSec)], ["امتیاز کل (از ۱۰۰)", a.overall ?? "-"], ["نتیجه", a.verdict || "-"], ["خلاصه", a.summary || "-"],
  ];
  const comps = [["شایستگی", "امتیاز (از ۱۰)", "توضیح"], ...(a.competencies || []).map((c) => [c.name, c.score, c.note])];
  const n = Math.max((a.strengths || []).length, (a.weaknesses || []).length, (a.redFlags || []).length, (a.followUp || []).length);
  const lists = [["نقاط قوت", "نقاط ضعف", "هشدارها", "سؤال‌های پیشنهادی"]];
  for (let i = 0; i < n; i++) lists.push([(a.strengths || [])[i] || "", (a.weaknesses || [])[i] || "", (a.redFlags || [])[i] || "", (a.followUp || [])[i] || ""]);
  const tr = [["متن مصاحبه"], ...String(iv.transcript || "").split(/\n+/).map((p) => [p])];
  return toBlob(book([["خلاصه", sheet(info, [22, 80])], ["شایستگی‌ها", sheet(comps, [26, 14, 70])], ["قوت و ضعف", sheet(lists, [38, 38, 38, 38])], ["متن مصاحبه", sheet(tr, [120])]]));
}

export function compareExcel(list) {
  const done = list.filter((i) => i.analysis).sort((a, b) => b.analysis.overall - a.analysis.overall);
  const head = ["رتبه", "متقاضی", "سمت", "تاریخ", "امتیاز کل", ...COMPETENCIES, "نتیجه"];
  const rows = [head, ...done.map((i, k) => [k + 1, i.candidate || i.title, i.position || "-", fmtDate(i.createdAt), i.analysis.overall, ...COMPETENCIES.map((c) => (i.analysis.competencies.find((x) => x.name === c) || {}).score ?? ""), i.analysis.verdict])];
  return toBlob(book([["مقایسه", sheet(rows, [7, 24, 22, 16, 11, 14, 14, 14, 14, 14, 14, 26])]]));
}

/* ------------------------------- PDF ------------------------------- */
const css = `.rp{width:794px;box-sizing:border-box;background:#fff;color:#14284B;font-family:Vazirmatn,Tahoma,sans-serif;direction:rtl;text-align:right;line-height:1.9;font-size:14px}
.rp *{box-sizing:border-box}.hd{background:#14284B;color:#fff;padding:28px 36px;display:flex;align-items:center;gap:22px;border-bottom:6px solid #D4A237}
.hd img{height:92px;background:#fff;border-radius:12px;padding:8px}.hd h1{margin:0;font-size:26px}.hd p{margin:2px 0 0;color:#BFD9DC;font-size:13px}
.pad{padding:10px 36px}.meta{display:flex;flex-wrap:wrap;gap:8px 0}.meta div{width:50%;font-size:13px}.meta b{color:#0F7F8A}
.score{display:flex;align-items:center;gap:22px;background:#E8F3F3;border-radius:16px;padding:16px 22px}.ring{width:92px;height:92px;border-radius:50%;background:#0F7F8A;color:#fff;display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:700;flex:none}
.vd{font-size:19px;font-weight:700}.sm{font-size:12px;color:#566A7A}h2{font-size:17px;color:#0F7F8A;margin:6px 0;border-right:5px solid #D4A237;padding-right:10px}
.cr{display:flex;align-items:center;gap:10px;margin:7px 0}.cr .n{width:150px;font-weight:600;font-size:13px}.bar{flex:1;height:12px;background:#E8F3F3;border-radius:6px;overflow:hidden}.bar i{display:block;height:100%;background:#0F7F8A;border-radius:6px}.cr .s{width:34px;font-weight:700;text-align:left}
.nt{font-size:12px;color:#566A7A;margin:-4px 0 6px 0;padding-right:160px}ul{margin:4px 0;padding-right:20px}li{margin:3px 0}.red li{color:#C0583A}.tx{white-space:pre-wrap;font-size:13px;line-height:2}.ft{font-size:11px;color:#566A7A;border-top:1px solid #BFD9DC;padding-top:8px}`;

function blocks(iv, org) {
  const a = iv.analysis || { competencies: [], strengths: [], weaknesses: [], redFlags: [], followUp: [], summary: "", overall: 0, verdict: "" };
  const li = (x) => x.map((t) => `<li>${esc(t)}</li>`).join("");
  const B = [];
  B.push(`<div class="hd"><img src="${logo}"/><div><h1>گزارش مصاحبهٔ شغلی</h1><p>${esc(org)}</p></div></div>
  <div class="pad"><div class="meta"><div><b>متقاضی:</b> ${esc(iv.candidate || "-")}</div><div><b>سمت:</b> ${esc(iv.position || "-")}</div><div><b>مصاحبه‌گر:</b> ${esc(iv.interviewer || "-")}</div><div><b>تاریخ:</b> ${fmtDate(iv.createdAt)} — ${fmtTime(iv.createdAt)}</div><div><b>مدت:</b> ${fmtDur(iv.durationSec)}</div></div></div>`);
  B.push(`<div class="pad"><div class="score"><div class="ring">${a.overall}</div><div><div class="vd">${esc(a.verdict)}</div><div class="sm">امتیاز کل از ۱۰۰ — ارزیابی هوش مصنوعی (مدل ${esc(a.model || "")})</div></div></div></div>`);
  B.push(`<div class="pad"><h2>خلاصه</h2><div>${esc(a.summary)}</div></div>`);
  B.push(`<div class="pad"><h2>شایستگی‌ها</h2>${a.competencies.map((c) => `<div class="cr"><div class="n">${esc(c.name)}</div><div class="bar"><i style="width:${c.score * 10}%"></i></div><div class="s">${c.score}</div></div><div class="nt">${esc(c.note)}</div>`).join("")}</div>`);
  if (a.strengths.length) B.push(`<div class="pad"><h2>نقاط قوت</h2><ul>${li(a.strengths)}</ul></div>`);
  if (a.weaknesses.length) B.push(`<div class="pad"><h2>نقاط قابل بهبود</h2><ul>${li(a.weaknesses)}</ul></div>`);
  if (a.redFlags.length) B.push(`<div class="pad red"><h2>هشدارها</h2><ul>${li(a.redFlags)}</ul></div>`);
  if (a.followUp.length) B.push(`<div class="pad"><h2>سؤال‌های پیشنهادی مرحلهٔ بعد</h2><ul>${li(a.followUp)}</ul></div>`);
  const paras = String(iv.transcript || "").split(/\n+/).filter(Boolean);
  if (paras.length) {
    B.push(`<div class="pad"><h2>متن مصاحبه</h2></div>`);
    let cur = "";
    for (const p of paras) { if ((cur + p).length > 700 && cur) { B.push(`<div class="pad tx">${esc(cur)}</div>`); cur = ""; } cur += (cur ? "\n" : "") + p; }
    if (cur) B.push(`<div class="pad tx">${esc(cur)}</div>`);
  }
  B.push(`<div class="pad"><div class="ft">این گزارش را هوش مصنوعی از روی متن مصاحبه تولید کرده و فقط ابزار کمک‌تصمیم است؛ تصمیم نهایی با کارشناس انسانی است.</div></div>`);
  return B;
}

export async function interviewPdf(iv, org, onProgress) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  try { await Promise.all([document.fonts.load("400 14px Vazirmatn"), document.fonts.load("700 14px Vazirmatn")]); await document.fonts.ready; } catch (e) { /* ignore */ }
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;";
  host.innerHTML = `<style>${css}</style>`;
  document.body.appendChild(host);
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), FOOT = 26;
  let y = 0, page = 1;
  try {
    const list = blocks(iv, org);
    for (let i = 0; i < list.length; i++) {
      const el = document.createElement("div"); el.className = "rp"; el.innerHTML = list[i]; host.appendChild(el);
      await Promise.all(Array.from(el.querySelectorAll("img")).map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; }))));
      const cv = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", logging: false, useCORS: true });
      const h = (cv.height * W) / cv.width;
      if (y + h > H - FOOT && y > 0) { doc.addPage(); page++; y = 0; }
      doc.addImage(cv.toDataURL("image/jpeg", 0.88), "JPEG", 0, y, W, h);
      y += h;
      host.removeChild(el); cv.width = cv.height = 0;
      if (onProgress) onProgress(Math.round(((i + 1) / list.length) * 100));
    }
    const n = doc.getNumberOfPages();
    doc.setFontSize(9); doc.setTextColor(86, 106, 122);
    for (let p = 1; p <= n; p++) { doc.setPage(p); doc.text(`${p} / ${n}`, W / 2, H - 10, { align: "center" }); }
    return doc.output("blob");
  } finally { document.body.removeChild(host); }
}
