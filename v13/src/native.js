import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = () => { const t = String(r.result || ""); resolve(t.slice(t.indexOf(",") + 1)); };
    r.readAsDataURL(blob);
  });
}
// Android WebView can't download blobs: write to cache and open the system share sheet (Save / Send).
export async function saveFile(blob, name) {
  if (Capacitor.isNativePlatform()) {
    try {
      const data = await toBase64(blob);
      const w = await Filesystem.writeFile({ path: name, data, directory: Directory.Cache });
      await Share.share({ title: name, url: w.uri, dialogTitle: "ذخیره یا ارسال" });
      return true;
    } catch (e) {
      if (/cancel/i.test(String(e && e.message))) return false;
      throw e;
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  return true;
}


// Save/share a collection of files together for the external-AI prompt + audio hand-off.
export async function saveFiles(files) {
  if (!Array.isArray(files) || files.length === 0) throw new Error("فایلی برای ذخیره یا ارسال وجود ندارد.");
  if (Capacitor.isNativePlatform()) {
    const urls = [];
    for (const file of files) {
      const data = await toBase64(file.blob);
      const path = String(file.name || "yavar-export.txt").replace(/[\\/:*?"<>|]+/g, "-");
      const saved = await Filesystem.writeFile({ path, data, directory: Directory.Cache });
      urls.push(saved.uri);
    }
    await Share.share({
      title: files.length === 1 ? files[0].name : "بستهٔ تبادل یاور (" + files.length + " فایل)",
      files: urls, dialogTitle: "ذخیره یا ارسال فایل‌ها"
    });
    return true;
  }
  for (const file of files) {
    const url = URL.createObjectURL(file.blob);
    const a = document.createElement("a");
    a.href = url; a.download = file.name || "yavar-export.txt";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  return true;
}
