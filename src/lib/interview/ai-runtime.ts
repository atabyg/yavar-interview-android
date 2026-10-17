/**
 * Provider API keys are kept only in JS memory for this app session.
 * They are never written to local storage, case files, exports, or the repository.
 */
const sessionAiApiKeys: Partial<Record<"deepseek" | "openai" | "groq" | "openrouter" | "mistral" | "cerebras", string>> = {};

type Provider = "deepseek" | "openai" | "groq" | "openrouter" | "mistral" | "cerebras";

export function setSessionAiApiKey(value: string, provider: Provider = "groq"): void {
  const key = value.trim();
  if (key) sessionAiApiKeys[provider] = key;
  else delete sessionAiApiKeys[provider];
}

export function getSessionAiApiKey(provider: Provider = "groq"): string {
  return sessionAiApiKeys[provider] ?? "";
}

export function hasSessionAiApiKey(provider: Provider = "groq"): boolean {
  return Boolean(sessionAiApiKeys[provider]?.length);
}

export function clearSessionAiApiKey(provider: Provider = "groq"): void {
  delete sessionAiApiKeys[provider];
}
