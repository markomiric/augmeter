/**
 * ABOUTME: This file manages extension configuration settings from VS Code workspace configuration,
 * providing type-safe access to all Augmeter settings with defaults.
 */
import * as vscode from "vscode";
import { type KnownProviderId } from "../types/provider-usage";
import { toRoundedNumber } from "./config-value-utils";

export interface AlertThresholdConfig {
  warning: number;
  high: number;
  critical: number;
}

export interface CopilotApiConfig {
  enabled: boolean;
  username: string;
}

/**
 * Manages extension configuration settings.
 *
 * This class provides type-safe access to all Augmeter settings
 * from VS Code workspace configuration, with sensible defaults.
 *
 * @example
 * ```typescript
 * const config = new ConfigManager();
 * if (config.isEnabled()) {
 *   const interval = config.getRefreshInterval();
 * }
 * ```
 */
export class ConfigManager {
  private config!: vscode.WorkspaceConfiguration;

  constructor() {
    this.reloadConfig();
  }

  reloadConfig(): void {
    this.config = vscode.workspace.getConfiguration("augmeter");
  }

  isEnabled(): boolean {
    return this.config.get<boolean>("enabled", true);
  }

  // Clamp to [1, 300] and coerce non-numbers to default (60)
  getRefreshInterval(): number {
    const raw = this.config.get<number>("refreshInterval", 60);
    const n = toRoundedNumber(raw, 60);
    if (n < 1) return 1;
    if (n > 300) return 300;
    return n;
  }

  // Multiplier applied to the polling interval while the editor window is
  // unfocused, so a backgrounded editor polls less aggressively.
  // Clamp to [1, 20]; coerce non-numbers to default (5). A value of 1 disables
  // background slowdown.
  getBackgroundMultiplier(): number {
    const raw = this.config.get<number>("backgroundMultiplier", 5);
    const n = toRoundedNumber(raw, 5);
    if (n < 1) return 1;
    if (n > 20) return 20;
    return n;
  }

  shouldShowInStatusBar(): boolean {
    return this.config.get<boolean>("showInStatusBar", true);
  }

  getClickAction(): "refresh" | "openWebsite" | "openSettings" {
    const v = this.config.get<string>("clickAction", "refresh") ?? "refresh";
    switch (v) {
      case "refresh":
      case "openWebsite":
      case "openSettings":
        return v;
      default:
        return "refresh";
    }
  }

  getLogLevel(): "error" | "warn" | "info" {
    const v = this.config.get<string>("logLevel", "info") ?? "info";
    if (v === "error" || v === "warn" || v === "info") return v;
    return "info";
  }

  getHistoryRetentionDays(): number {
    const value = toRoundedNumber(this.config.get<number>("history.retentionDays", 35), 35);
    return Math.max(7, Math.min(90, value));
  }

  getAlertThresholds(): AlertThresholdConfig {
    const warning = Math.max(
      50,
      Math.min(98, toRoundedNumber(this.config.get<number>("alerts.warningPercent", 75), 75))
    );
    const high = Math.max(
      warning + 1,
      Math.min(99, toRoundedNumber(this.config.get<number>("alerts.highPercent", 90), 90))
    );
    const critical = Math.max(
      high + 1,
      Math.min(100, toRoundedNumber(this.config.get<number>("alerts.criticalPercent", 95), 95))
    );
    return { warning, high, critical };
  }

  getRunOutAlertDays(): number {
    const value = toRoundedNumber(this.config.get<number>("alerts.runOutDays", 3), 3);
    return Math.max(0, Math.min(30, value));
  }

  getMonthlyTarget(): number {
    const inspected = this.config.inspect?.<number>("budget.cycleTarget");
    const configured = Boolean(
      inspected &&
        [
          inspected.globalValue,
          inspected.workspaceValue,
          inspected.workspaceFolderValue,
          inspected.globalLanguageValue,
          inspected.workspaceLanguageValue,
          inspected.workspaceFolderLanguageValue,
        ].some(value => value !== undefined)
    );
    const raw = configured
      ? this.config.get<number>("budget.cycleTarget", 0)
      : this.config.get<number>("budget.monthlyTarget", 0);
    return Math.max(0, toRoundedNumber(raw, 0));
  }

  isProviderTrackingEnabled(): boolean {
    return this.config.get<boolean>("providers.enabled", true);
  }

  getEnabledProviderIds(): KnownProviderId[] {
    const defaults: KnownProviderId[] = ["claude", "codex", "copilot"];
    const raw = this.config.get<string[]>("providers.enabledIds", defaults) ?? defaults;
    if (!Array.isArray(raw)) return defaults;
    const values = Array.from(
      new Set(
        raw
          .filter((value): value is string => typeof value === "string")
          .map(value => value.trim().toLowerCase())
      )
    ).filter((value): value is KnownProviderId =>
      ["augment", "claude", "codex", "copilot"].includes(value)
    );
    return raw.length === 0 ? [] : values.length > 0 ? values : defaults;
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
    return {
      enabled: this.config.get<boolean>("providers.copilot.api.enabled", false) === true,
      username: (this.config.get<string>("providers.copilot.api.username", "") ?? "").trim(),
    };
  }

  getSmartSignInQuickWatchMs(): number {
    const value = toRoundedNumber(this.config.get<number>("smartSignIn.quickWatchMs", 2000), 2000);
    return Math.max(0, Math.min(5000, value));
  }

  getSmartSignInWebsiteWatchMs(): number {
    const value = toRoundedNumber(
      this.config.get<number>("smartSignIn.websiteWatchMs", 300000),
      300000
    );
    return Math.max(1000, Math.min(300000, value));
  }

  getDataSource(): "auto" | "auggie-cli" | "cookie" {
    const v = this.config.get<string>("dataSource", "auto") ?? "auto";
    switch (v) {
      case "auto":
      case "auggie-cli":
      case "cookie":
        return v;
      default:
        return "auto";
    }
  }

  getAuggieCliPath(): string {
    const v = this.config.get<string>("auggieCli.path", "") ?? "";
    return v.trim();
  }

  getApiBaseUrl(): string {
    const v =
      this.config.get<string>("apiBaseUrl", "https://app.augmentcode.com/api") ??
      "https://app.augmentcode.com/api";
    try {
      new URL(v);
      return v;
    } catch {
      return "https://app.augmentcode.com/api";
    }
  }

  async updateConfig(key: string, value: unknown): Promise<void> {
    await this.config.update(key, value, vscode.ConfigurationTarget.Global);
    this.reloadConfig();
  }
}
