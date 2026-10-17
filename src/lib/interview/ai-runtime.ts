/**
 * The one OpenAI API key remains only in JS memory for this app session.
 * It is never written to local storage, case files, exports, or the repository.
 */
let sessionOpenAiApiKey = "";
export function setSessionAiApiKey(value: string, _provider: "openai" = "openai"): void { sessionOpenAiApiKey = value.trim(); }
export function getSessionAiApiKey(_provider: "openai" = "openai"): string { return sessionOpenAiApiKey; }
export function hasSessionAiApiKey(_provider: "openai" = "openai"): boolean { return Boolean(sessionOpenAiApiKey.length); }
export function clearSessionAiApiKey(_provider: "openai" = "openai"): void { sessionOpenAiApiKey = ""; }
export function clearAllSessionAiApiKeys(): void { sessionOpenAiApiKey = ""; }
