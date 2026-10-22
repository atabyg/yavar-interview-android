// A silent or unintelligible audio part is recorded explicitly instead of aborting the whole transcription.
// The marker is plain text so it travels in the transcript, the exports and the external-AI files.
const PREFIX = "[بخش ";
const SUFFIX = ": گفتار قابل تشخیص نبود]";

export const noSpeechMark = (n) => PREFIX + n + SUFFIX;

export function isNoSpeechMark(text) {
  const s = String(text == null ? "" : text).trim();
  return s.length > PREFIX.length + SUFFIX.length && s.startsWith(PREFIX) && s.endsWith(SUFFIX) && /^\d+$/.test(s.slice(PREFIX.length, s.length - SUFFIX.length));
}
