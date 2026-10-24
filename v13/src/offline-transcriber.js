import { OfflineWhisper } from "./native-bridge";

function blobPartToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("خواندن بخش صوت ممکن نشد."));
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

export async function transcribeOfflineBlob(blob, segmentIndex = 0) {
  const token = "yavar_" + Date.now().toString(36) + "_" + segmentIndex + "_" +
    Math.random().toString(36).slice(2, 9);
  await OfflineWhisper.beginAudio({ token, mimeType: blob.type || "audio/webm" });
  try {
    const partSize = 256 * 1024;
    for (let offset = 0; offset < blob.size; offset += partSize) {
      const piece = blob.slice(offset, Math.min(offset + partSize, blob.size));
      const data = await blobPartToBase64(piece);
      await OfflineWhisper.appendAudioPart({ token, data });
    }
    const result = await OfflineWhisper.transcribeAudio({ token });
    return String((result && result.text) || "").trim();
  } catch (error) {
    try { await OfflineWhisper.cancelAudio({ token }); } catch (ignored) {}
    throw error;
  }
}
