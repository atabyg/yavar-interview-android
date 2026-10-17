/**
 * API secrets intentionally live only in JS memory for this app session.
 * Never persist provider keys into localStorage, case files, exports, or the repository.
 */
let sessionAiApiKey = "";

export function setSessionAiApiKey(value: string): void {
  sessionAiApiKey = value.trim();
}

export function getSessionAiApiKey(): string {
  return sessionAiApiKey;
}

export function hasSessionAiApiKey(): boolean {
  return sessionAiApiKey.length > 0;
}

export function clearSessionAiApiKey(): void {
  sessionAiApiKey = "";
}
