import type * as vscode from "vscode";
import { type KnownProviderId, type ProviderId } from "../types/provider-usage";
import type { AlertThresholdConfig } from "./alert-config";

export interface ProviderAlertThresholdConfig {
  warning: number;
  high: number;
  critical: number;
  runOutDays: number;
}

export interface CopilotApiConfig {
  enabled: boolean;
  username: string;
  tokenEnvVar: string;
  baseUrl: string;
  timeoutMs: number;
}

export class ProviderConfigSection {
  constructor(
    private readonly config: vscode.WorkspaceConfiguration,
    private readonly globalAlerts: AlertThresholdConfig,
    private readonly runOutDays: number,
    private readonly monthlyTarget: number
  ) {}

  getMonthlyTargets(): Record<string, number> {
    const raw = this.config.get<unknown>("providers.targets", {});
    const targets: Record<string, number> = {};

    if (this.isRecord(raw)) {
      for (const [key, value] of Object.entries(raw)) {
        const normalizedKey = this.normalizeProviderKey(key);
        if (!normalizedKey) {
          continue;
        }
        const target = this.toRoundedNumber(value, 0);
        if (target > 0) {
          targets[normalizedKey] = target;
        }
      }
    }

    if (this.monthlyTarget > 0 && targets.augment === undefined) {
      targets.augment = this.monthlyTarget;
    }

    return targets;
  }

  getMonthlyTarget(providerId: ProviderId): number {
    const key = this.normalizeProviderKey(providerId);
    if (!key) return 0;
    return this.getMonthlyTargets()[key] ?? 0;
  }

  getAlertThresholds(providerId: ProviderId): ProviderAlertThresholdConfig {
    const fallback: ProviderAlertThresholdConfig = {
      warning: this.globalAlerts.warning,
      high: this.globalAlerts.high,
      critical: this.globalAlerts.critical,
      runOutDays: this.runOutDays,
    };

    const providerKey = this.normalizeProviderKey(providerId);
    if (!providerKey) {
      return fallback;
    }

    const raw = this.config.get<unknown>("providers.alerts", {});
    if (!this.isRecord(raw)) {
      return fallback;
    }

    const entry = raw[providerKey];
    if (!this.isRecord(entry)) {
      return fallback;
    }

    const warning = Math.max(
      50,
      Math.min(99, this.toRoundedNumber(entry.warningPercent, fallback.warning))
    );
    const high = Math.max(
      warning + 1,
      Math.min(99, this.toRoundedNumber(entry.highPercent, fallback.high))
    );
    const critical = Math.max(
      high + 1,
      Math.min(100, this.toRoundedNumber(entry.criticalPercent, fallback.critical))
    );
    const runOutDays = Math.max(
      0,
      Math.min(30, this.toRoundedNumber(entry.runOutDays, fallback.runOutDays))
    );

    return { warning, high, critical, runOutDays };
  }

  getAllAlertThresholds(): Record<string, ProviderAlertThresholdConfig> {
    const raw = this.config.get<unknown>("providers.alerts", {});
    const result: Record<string, ProviderAlertThresholdConfig> = {};

    if (!this.isRecord(raw)) {
      return result;
    }

    for (const providerId of Object.keys(raw)) {
      const key = this.normalizeProviderKey(providerId);
      if (!key) {
        continue;
      }
      result[key] = this.getAlertThresholds(key);
    }

    return result;
  }

  isTrackingEnabled(): boolean {
    return this.config.get<boolean>("providers.enabled", true);
  }

  getEnabledProviderIds(): KnownProviderId[] {
    const defaults: KnownProviderId[] = ["augment", "claude", "codex", "copilot"];
    const raw = this.config.get<string[]>("providers.enabledIds", defaults) ?? defaults;
    if (!Array.isArray(raw)) {
      return defaults;
    }

    const normalized = Array.from(
      new Set(
        raw
          .filter((value): value is string => typeof value === "string")
          .map(value => value.trim().toLowerCase())
      )
    );

    const valid = normalized.filter((value): value is KnownProviderId => {
      return value === "augment" || value === "claude" || value === "codex" || value === "copilot";
    });

    return valid.length > 0 ? valid : defaults;
  }

  getClaudeProjectsPath(): string {
    return (this.config.get<string>("providers.claude.path", "") ?? "").trim();
  }

  getCodexSessionsPath(): string {
    return (this.config.get<string>("providers.codex.path", "") ?? "").trim();
  }

  getCopilotStateDbPath(): string {
    return (this.config.get<string>("providers.copilot.stateDbPath", "") ?? "").trim();
  }

  getCopilotApiConfig(): CopilotApiConfig {
    const enabled = this.config.get<boolean>("providers.copilot.api.enabled", false) === true;
    const username = (this.config.get<string>("providers.copilot.api.username", "") ?? "").trim();
    const tokenEnvVarRaw = (
      this.config.get<string>("providers.copilot.api.tokenEnvVar", "GITHUB_TOKEN") ?? "GITHUB_TOKEN"
    ).trim();
    const tokenEnvVar =
      tokenEnvVarRaw.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*$/.test(tokenEnvVarRaw)
        ? tokenEnvVarRaw
        : "GITHUB_TOKEN";

    const baseUrlRaw =
      this.config.get<string>("providers.copilot.api.baseUrl", "https://api.github.com") ??
      "https://api.github.com";
    let baseUrl = "https://api.github.com";
    try {
      const parsed = new URL(baseUrlRaw);
      const pathname = parsed.pathname.replace(/\/+$/, "");
      baseUrl = pathname && pathname !== "/" ? `${parsed.origin}${pathname}` : parsed.origin;
    } catch {
      // Keep default base URL.
    }

    const timeoutMsRaw = this.config.get<number>("providers.copilot.api.timeoutMs", 6000);
    const timeoutMs = Math.max(1000, Math.min(30000, this.toRoundedNumber(timeoutMsRaw, 6000)));

    return {
      enabled,
      username,
      tokenEnvVar,
      baseUrl,
      timeoutMs,
    };
  }

  private normalizeProviderKey(value: unknown): string {
    if (typeof value !== "string") {
      return "";
    }
    return value.trim().toLowerCase();
  }

  private toRoundedNumber(value: unknown, fallback: number): number {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.round(value);
    }
    return fallback;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}
