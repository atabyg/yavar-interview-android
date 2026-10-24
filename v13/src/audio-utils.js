// Decode any WebView-playable recording to mono PCM and wrap it as WAV.
// Used (1) as a fallback for seekable playback and (2) as a fallback input for offline Whisper.
export async function decodeToMono(blob, targetRate) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!AC || !OAC) throw new Error("AudioContext unavailable");
  const ctx = new AC();
  try {
    const arr = await blob.arrayBuffer();
    const decoded = await new Promise((resolve, reject) => {
      const p = ctx.decodeAudioData(arr, resolve, reject);
      if (p && typeof p.catch === "function") p.catch(reject);
    });
    const frames = Math.max(1, Math.ceil(decoded.duration * targetRate));
    const off = new OAC(1, frames, targetRate);
    const src = off.createBufferSource();
    src.buffer = decoded;
    src.connect(off.destination);
    src.start(0);
    const rendered = await off.startRendering();
    return rendered.getChannelData(0);
  } finally {
    try { await ctx.close(); } catch (e) { /* ignore */ }
  }
}

export function pcmToWavBlob(samples, rate) {
  const n = samples.length;
  const buffer = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buffer);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, n * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export async function blobToWav(blob, rate) {
  return pcmToWavBlob(await decodeToMono(blob, rate), rate);
}
