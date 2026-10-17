import { Capacitor } from "@capacitor/core";
import { saveFileWithPicker } from "@/lib/interview/native-exports";

// Android WebView cannot handle <a download> on blob: URLs or window.print().
// This bridge routes exports through the native share sheet instead.

const blobs = new Map<string, Blob>();

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const text = String(reader.result ?? "");
      resolve(text.slice(text.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}

async function saveBlob(blob: Blob, name: string): Promise<void> {
  const data = await blobToBase64(blob);
  await saveFileWithPicker(name, blob.type || "application/octet-stream", data);
}

export function installNativeBridge(): void {
  if (!Capacitor.isNativePlatform()) return;

  const originalCreate = URL.createObjectURL.bind(URL);
  const originalRevoke = URL.revokeObjectURL.bind(URL);

  URL.createObjectURL = (object: Blob | MediaSource): string => {
    const url = originalCreate(object);
    if (object instanceof Blob) blobs.set(url, object);
    return url;
  };
  URL.revokeObjectURL = (url: string): void => {
    window.setTimeout(() => blobs.delete(url), 60_000);
    originalRevoke(url);
  };

  const originalClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function patchedClick(this: HTMLAnchorElement) {
    const blob = this.href.startsWith("blob:") ? blobs.get(this.href) : undefined;
    if (this.download && blob) {
      void saveBlob(blob, this.download).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "ذخیره فایل ناموفق بود.";
        window.alert(message);
      });
      return;
    }
    originalClick.call(this);
  };

  window.print = () => {
    window.alert("چاپ مستقیم در این اپ پشتیبانی نمی‌شود. از «دانلود HTML» استفاده کنید و فایل را از طریق برنامه‌های دیگر چاپ یا PDF کنید.");
  };
}
