import type { AgentKey, ProviderSelection } from "./types";

export const PROVIDERS_STORAGE_KEY = "avatrip.providers";

export function readStoredProviders(): ProviderSelection {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PROVIDERS_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ProviderSelection;
  } catch {
    return {};
  }
}

export function writeStoredProviders(selection: ProviderSelection): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PROVIDERS_STORAGE_KEY, JSON.stringify(selection));
}

export function patchStoredProvider(key: AgentKey, address: string): void {
  const next = { ...readStoredProviders(), [key]: address as `0x${string}` };
  writeStoredProviders(next);
}
