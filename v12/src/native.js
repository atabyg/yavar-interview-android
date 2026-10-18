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
