import type { ProviderHealthSnapshot } from "../types/provider-usage";

export function providerDisplayName(providerId: string): string {
  if (providerId === "augment") return "Augment";
  if (providerId === "claude") return "Claude Code";
  if (providerId === "codex") return "Codex";
  if (providerId === "copilot") return "GitHub Copilot";
  return providerId;
}

export function providerMetricNoun(providerId: string): string {
  if (providerId === "claude" || providerId === "codex") return "turn";
  return "message";
}

export function pluralize(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
}

/** Monthly Copilot unit from the snapshot's `details.mode`: AI Credits unless legacy premium requests. */
export function copilotMonthlyUnit(
  details: Record<string, string | number | boolean | null> | undefined,
  count: number
): { noun: string; suffix: string } {
  if (details?.mode === "premium_requests") {
    return { noun: pluralize(count, "premium request"), suffix: "this month" };
  }
  return { noun: pluralize(count, "AI Credit"), suffix: "used this month" };
}

/**
 * Copilot health messages are fixed adapter text that tells the user how to set up
 * or why GitHub returned nothing, so they are shown as-is.
 */
const COPILOT_MESSAGE_CODES = new Set([
  "COPILOT_API_NOT_CONFIGURED",
  "COPILOT_API_FORBIDDEN",
  "COPILOT_API_NO_BILLING_DATA",
  "COPILOT_API_USERNAME_MISSING",
  "COPILOT_API_TOKEN_MISSING",
  "COPILOT_API_FAILED",
]);

export function providerHealthText(health: ProviderHealthSnapshot | undefined): string {
  if (health?.errorCode === "CLAUDE_PATH_MISSING") {
    return "no history found; check the Claude Code path in Augmeter settings";
  }
  if (health?.errorCode === "CODEX_PATH_MISSING") {
    return "no history found; check the Codex path in Augmeter settings";
  }
  if (health?.errorCode && COPILOT_MESSAGE_CODES.has(health.errorCode) && health.message) {
    return health.message;
  }
  if (health?.errorCode === "CLAUDE_NO_LOGS" || health?.errorCode === "CODEX_NO_LOGS") {
    return "no activity recorded yet";
  }
  if (health?.errorCode === "PROVIDER_COLLECTION_FAILED") {
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
