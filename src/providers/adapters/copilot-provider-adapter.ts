import { SecureLogger } from "../../core/logging/secure-logger";
import { type ProviderAdapter, type ProviderAdapterResult } from "../provider-adapter";

const DEFAULT_GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_API_VERSION = "2026-03-10";
const TOKEN_ENV_VAR = "GITHUB_TOKEN";

export type CopilotApiFetcher = (
  input: string | URL | globalThis.Request,
  init?: RequestInit
) => Promise<Response>;

export interface CopilotApiSettings {
  enabled: boolean;
  username: string;
}

type CopilotUsageMode = "ai_credits" | "premium_requests";

interface ParsedUsage {
  used: number;
  itemCount: number;
  year: number | null;
  month: number | null;
}

/** Outcome of one billing-usage request. */
type EndpointResult =
  | { kind: "usage"; usage: ParsedUsage }
  | { kind: "http"; status: number }
  | { kind: "error"; message: string };

const BILLING_PATHS: Record<CopilotUsageMode, string> = {
  ai_credits: "ai_credit",
  premium_requests: "premium_request",
};

export class CopilotProviderAdapter implements ProviderAdapter {
  readonly id = "copilot";
  readonly displayName = "GitHub Copilot";

  private readonly minRefreshMs = 5 * 60 * 1000;
  private lastCollectedAt = 0;
  private lastResult: ProviderAdapterResult | null = null;
  /** The API settings that produced `lastResult`. */
  private lastSettingsKey = "";

  constructor(
    private readonly resolveApiSettings: () => CopilotApiSettings = () => ({
      enabled: false,
      username: "",
    }),
    private readonly fetcher: CopilotApiFetcher = (...args) => fetch(...args)
  ) {}

  async collectUsage(context: {
    now: Date;
    workspaceTrusted: boolean;
    forceRefresh?: boolean;
  }): Promise<ProviderAdapterResult> {
    if (!context.workspaceTrusted) {
      return {
        snapshots: [],
        health: {
          providerId: this.id,
          status: "restricted",
          checkedAt: context.now.toISOString(),
          canCollectInCurrentWorkspace: false,
          sourceKind: "api",
          message: "GitHub Copilot activity is not read in untrusted workspaces.",
        },
      };
    }

    const nowMs = context.now.getTime();
    const settings = this.resolveApiSettings();
    const settingsKey = this.settingsKey(settings);
    if (
      !context.forceRefresh &&
      this.lastResult &&
      this.lastSettingsKey === settingsKey &&
      nowMs - this.lastCollectedAt < this.minRefreshMs
    ) {
      return this.lastResult;
    }

    const result = await this.collectFromApi(settings, context.now);
    // A collection that started before the settings changed must not become the cache.
    if (this.settingsKey(this.resolveApiSettings()) === settingsKey) {
      this.cache(result, nowMs, settingsKey);
    }
    return result;
  }

  private settingsKey(settings: CopilotApiSettings): string {
    return `${settings.enabled}:${settings.username.trim()}`;
  }

  private async collectFromApi(
    settings: CopilotApiSettings,
    now: Date
  ): Promise<ProviderAdapterResult> {
    if (!settings.enabled) {
      return this.healthOnly(
        now,
        "unavailable",
        "VS Code no longer records local Copilot request counts. Turn on augmeter.providers.copilot.api.enabled to read your AI Credits from GitHub.",
        "COPILOT_API_NOT_CONFIGURED"
      );
    }

    const username = settings.username.trim();
    if (!username) {
      return this.healthOnly(
        now,
        "unavailable",
        "GitHub Copilot API tracking needs a username in augmeter.providers.copilot.api.username.",
        "COPILOT_API_USERNAME_MISSING"
      );
    }

    const token = process.env[TOKEN_ENV_VAR]?.trim();
    if (!token) {
      return this.healthOnly(
        now,
        "unavailable",
        `GitHub Copilot API tracking can't find the ${TOKEN_ENV_VAR} environment variable.`,
        "COPILOT_API_TOKEN_MISSING"
      );
    }

    const aiCredits = await this.requestUsage("ai_credits", username, token);
    if (aiCredits.kind === "usage" && aiCredits.usage.itemCount > 0) {
      return this.usageResult(now, "ai_credits", aiCredits.usage);
    }
    const aiCreditsEmpty = aiCredits.kind === "usage";
    if (!aiCreditsEmpty && !(aiCredits.kind === "http" && aiCredits.status === 404)) {
      return this.failureResult(now, aiCredits);
    }

    // DECISION: annual-plan holdouts still bill premium requests, so query them when
    // AI Credits returned nothing (404 or an empty usageItems list).
    const premium = await this.requestUsage("premium_requests", username, token);
    if (premium.kind === "usage" && (premium.usage.itemCount > 0 || !aiCreditsEmpty)) {
      return this.usageResult(now, "premium_requests", premium.usage);
    }
    // DECISION: empty AI Credits are a real zero only when premium requests are empty too or
    // GitHub answers that the account has no premium-request billing (404/403). A timeout,
    // 5xx, or unreadable payload is a failure, so a previous reading is kept, not zeroed.
    if (
      aiCreditsEmpty &&
      aiCredits.kind === "usage" &&
      (premium.kind === "usage" ||
        (premium.kind === "http" && (premium.status === 404 || premium.status === 403)))
    ) {
      return this.usageResult(now, "ai_credits", aiCredits.usage);
    }
    return this.failureResult(now, premium);
  }

  private async requestUsage(
    mode: CopilotUsageMode,
    username: string,
    token: string
  ): Promise<EndpointResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const endpoint = `${DEFAULT_GITHUB_API_BASE_URL}/users/${encodeURIComponent(username)}/settings/billing/${BILLING_PATHS[mode]}/usage`;
      const response = await this.fetcher(endpoint, {
        method: "GET",
        signal: controller.signal,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
      });
      if (!response.ok) {
        return { kind: "http", status: response.status };
      }
      const usage = this.parseUsagePayload(await response.json());
      if (!usage) {
        return {
          kind: "error",
          message: "GitHub Copilot returned billing data Augmeter couldn't read.",
        };
      }
      return { kind: "usage", usage };
    } catch (error) {
      SecureLogger.warn(`GitHub Copilot ${mode} usage request failed`, error);
      return {
        kind: "error",
        message: `GitHub Copilot API is unavailable (${this.getErrorMessage(error)}).`,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Parses the documented `{ timePeriod, user, usageItems[] }` billing response.
   * Every field is untrusted; `used` is the sum of finite, non-negative `grossQuantity`.
   */
  private parseUsagePayload(raw: unknown): ParsedUsage | null {
    const data = this.asRecord(raw);
    if (!data || !Array.isArray(data.usageItems)) {
      return null;
    }

    let used = 0;
    let itemCount = 0;
    for (const entry of data.usageItems) {
      const quantity = this.toFiniteNumberOrNull(this.asRecord(entry)?.grossQuantity);
      if (quantity !== null && quantity >= 0) {
        used += quantity;
        itemCount += 1;
      }
    }
    if (data.usageItems.length > 0 && itemCount === 0) {
      return null;
    }

    const timePeriod = this.asRecord(data.timePeriod);
    return {
      used,
      itemCount,
      year: this.toFiniteNumberOrNull(timePeriod?.year),
      month: this.toFiniteNumberOrNull(timePeriod?.month),
    };
  }

  private usageResult(
    now: Date,
    mode: CopilotUsageMode,
    usage: ParsedUsage
  ): ProviderAdapterResult {
    const nowIso = now.toISOString();
    const details: Record<string, string | number | boolean | null> = { mode };
    if (usage.year !== null) {
      details.year = usage.year;
    }
    if (usage.month !== null) {
      details.month = usage.month;
    }
    return {
      snapshots: [
        {
          providerId: this.id,
          timestamp: nowIso,
          windowType: "monthly",
          metricType: "messages",
          sourceKind: "api",
          source: "github-rest",
          used: usage.used,
          confidence: 0.95,
          freshnessAt: nowIso,
          details,
        },
      ],
      health: {
        providerId: this.id,
        status: "connected",
        checkedAt: nowIso,
        canCollectInCurrentWorkspace: true,
        sourceKind: "api",
        message:
          mode === "ai_credits"
            ? "Read GitHub Copilot AI Credits from GitHub."
            : "Read GitHub Copilot premium requests from GitHub.",
      },
    };
  }

  private failureResult(now: Date, failure: EndpointResult): ProviderAdapterResult {
    if (failure.kind === "http" && failure.status === 403) {
      return this.healthOnly(
        now,
        "degraded",
        "GitHub denied access to Copilot billing data (HTTP 403). Check that GITHUB_TOKEN can read billing usage (a fine-grained token needs the Plan user permission); this API covers only Copilot plans you pay for yourself.",
        "COPILOT_API_FORBIDDEN"
      );
    }
    if (failure.kind === "http" && failure.status === 404) {
      return this.healthOnly(
        now,
        "degraded",
        "GitHub returned no personal Copilot billing data (HTTP 404); this API covers Copilot plans you pay for yourself.",
        "COPILOT_API_NO_BILLING_DATA"
      );
    }
    const message =
      failure.kind === "http"
        ? `GitHub Copilot returned HTTP ${failure.status}.`
        : failure.kind === "error"
          ? failure.message
          : "GitHub Copilot returned billing data Augmeter couldn't read.";
    return this.healthOnly(now, "degraded", message, "COPILOT_API_FAILED");
  }

  private healthOnly(
    now: Date,
    status: "unavailable" | "degraded",
    message: string,
    errorCode: string
  ): ProviderAdapterResult {
    return {
      snapshots: [],
      health: {
        providerId: this.id,
        status,
        checkedAt: now.toISOString(),
        canCollectInCurrentWorkspace: true,
        sourceKind: "api",
        message,
        errorCode,
      },
    };
  }

  private cache(result: ProviderAdapterResult, nowMs: number, settingsKey: string): void {
    this.lastCollectedAt = nowMs;
    this.lastResult = result;
    this.lastSettingsKey = settingsKey;
  }

  private toFiniteNumberOrNull(value: unknown): number | null {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return null;
    }
    return value;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  /** Fixed wording only: health messages are shown in trusted tooltip markdown. */
  private getErrorMessage(error: unknown): string {
    const errorRecord = this.asRecord(error);
    if (errorRecord?.code === "ABORT_ERR" || errorRecord?.name === "AbortError") {
      return "the request timed out";
    }
    return "the request failed; check Output > Augmeter";
  }
}
