// Read text out of a .docx (zip of XML) or a plain text file, fully offline.
import { unzipSync, strFromU8 } from "fflate";

const ENT = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };

export function docxXmlToText(xml) {
  return String(xml)
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENT[m])
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/\n{3,}/g, "\n\n");
}

export function readDocxText(bytes) {
  const files = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" });
  const xml = files["word/document.xml"];
  if (!xml) throw new Error("فایل Word معتبر نیست یا متنی ندارد. فایل .docx را انتخاب کنید (فرمت قدیمی .doc پشتیبانی نمی‌شود).");
  return docxXmlToText(strFromU8(xml)).trim();
}

export function readBytesText(bytes, name = "") {
  const isZip = bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (isZip || /\.docx$/i.test(name)) return readDocxText(bytes);
  return new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
}

export async function readFileText(file) {
  return readBytesText(new Uint8Array(await file.arrayBuffer()), file.name || "");
}

export function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
