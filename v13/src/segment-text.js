// Offline transcription is resumable per audio segment. A segment without recognisable speech (silence, noise) must not
// abort the whole interview: it stays visible as a marker, and only a recording with no speech at all is an error.
export const NO_SPEECH_MARK = "[بخش بدون گفتار قابل\u200cتشخیص]";

export function segmentText(text) {
  const t = String(text == null ? "" : text).trim();
  return t || NO_SPEECH_MARK;
}

export function joinSegmentTexts(texts) {
  const parts = (Array.isArray(texts) ? texts : []).map((t) => String(t == null ? "" : t).trim());
  const speech = parts.filter((t) => t && t !== NO_SPEECH_MARK).length;
  return {
    transcript: parts.map((t) => t || NO_SPEECH_MARK).join("\n\n").trim(),
    speechSegments: speech,
    emptySegments: parts.length - speech,
    allEmpty: parts.length > 0 && speech === 0
  };
}
