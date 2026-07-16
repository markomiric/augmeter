import type { ProviderHealthSnapshot } from "../types/provider-usage";

export function providerDisplayName(providerId: string): string {
  if (providerId === "augment") return "Augment";
  if (providerId === "claude") return "Claude Code";
  if (providerId === "codex") return "Codex";
  if (providerId === "copilot") return "GitHub Copilot";
  return providerId;
}

export function providerMetricNoun(providerId: string): string {
  if (providerId === "copilot") return "request";
  if (providerId === "claude" || providerId === "codex") return "turn";
  return "message";
}

export function pluralize(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
}

export function providerHealthText(health: ProviderHealthSnapshot | undefined): string {
  if (health?.errorCode === "CLAUDE_PATH_MISSING") {
    return "no history found; check the Claude Code path in Augmeter settings";
  }
  if (health?.errorCode === "CODEX_PATH_MISSING") {
    return "no history found; check the Codex path in Augmeter settings";
  }
  if (health?.errorCode === "COPILOT_STATE_DB_MISSING") {
    return "no local counters found; check the Copilot database path in Augmeter settings";
  }
  if (
    health?.errorCode === "CLAUDE_NO_LOGS" ||
    health?.errorCode === "CODEX_NO_LOGS" ||
    health?.errorCode === "COPILOT_COUNTERS_MISSING"
  ) {
    return "no activity recorded yet";
  }
  if (
    health?.errorCode === "COPILOT_QUERY_FAILED" ||
    health?.errorCode === "PROVIDER_COLLECTION_FAILED"
  ) {
    return "couldn't read local activity; check Output > Augmeter";
  }
  if (!health || health.status === "unavailable" || health.status === "degraded") {
    return "activity unavailable; check Output > Augmeter";
  }
  if (health.status === "restricted") {
    return "local activity off in untrusted workspaces";
  }
  if (health.status === "disabled") {
    return "activity tracking off";
  }
  return "no activity recorded yet";
}
