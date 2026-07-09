/**
 * ABOUTME: This file manages extension configuration settings from VS Code workspace configuration,
 * providing type-safe access to all Augmeter settings with defaults.
 */
import * as vscode from "vscode";
import { type KnownProviderId, type ProviderId } from "../types/provider-usage";
import { AlertConfigSection, type AlertThresholdConfig } from "./alert-config";
import { toRoundedNumber } from "./config-value-utils";
import {
  ProviderConfigSection,
  type CopilotApiConfig,
  type ProviderAlertThresholdConfig,
} from "./provider-config";
import { SmartSignInConfigSection } from "./smart-sign-in-config";
import {
  StatusBarConfigSection,
  type StatusBarColorScheme,
  type StatusBarColorThresholds,
  type StatusBarConfig,
  type StatusBarDensity,
  type StatusBarDisplayMode,
} from "./status-bar-config";

export type { CopilotApiConfig, ProviderAlertThresholdConfig, StatusBarConfig };

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

  getDisplayMode(): StatusBarDisplayMode {
    return this.getStatusBarSection().getDisplayMode();
  }

  getStatusBarDensity(): StatusBarDensity {
    return this.getStatusBarSection().getDensity();
  }

  shouldShowPercentInStatusBar(): boolean {
    return this.getStatusBarSection().shouldShowPercent();
  }

  getColorScheme(): StatusBarColorScheme {
    return this.getStatusBarSection().getColorScheme();
  }

  getColorThresholds(): StatusBarColorThresholds {
    return this.getStatusBarSection().getColorThresholds();
  }

  isEnhancedReadabilityEnabled(): boolean {
    return this.getStatusBarSection().isEnhancedReadabilityEnabled();
  }

  shouldAutoDetectHighContrast(): boolean {
    return this.getStatusBarSection().shouldAutoDetectHighContrast();
  }

  getStatusBarIconName(): string {
    return this.getStatusBarSection().getIconName();
  }

  getStatusBarConfig(): StatusBarConfig {
    return this.getStatusBarSection().getConfig();
  }

  getLogLevel(): "error" | "warn" | "info" {
    const v = this.config.get<string>("logLevel", "info") ?? "info";
    if (v === "error" || v === "warn" || v === "info") return v;
    return "info";
  }

  getHistoryRetentionDays(): number {
    return this.getAlertSection().getHistoryRetentionDays();
  }

  getAlertThresholds(): AlertThresholdConfig {
    return this.getAlertSection().getAlertThresholds();
  }

  getRunOutAlertDays(): number {
    return this.getAlertSection().getRunOutAlertDays();
  }

  getMonthlyTarget(): number {
    return this.getAlertSection().getMonthlyTarget();
  }

  getProviderMonthlyTargets(): Record<string, number> {
    return this.getProviderSection().getMonthlyTargets();
  }

  getProviderMonthlyTarget(providerId: ProviderId): number {
    return this.getProviderSection().getMonthlyTarget(providerId);
  }

  getProviderAlertThresholds(providerId: ProviderId): ProviderAlertThresholdConfig {
    return this.getProviderSection().getAlertThresholds(providerId);
  }

  getAllProviderAlertThresholds(): Record<string, ProviderAlertThresholdConfig> {
    return this.getProviderSection().getAllAlertThresholds();
  }

  isProviderTrackingEnabled(): boolean {
    return this.getProviderSection().isTrackingEnabled();
  }

  getEnabledProviderIds(): KnownProviderId[] {
    return this.getProviderSection().getEnabledProviderIds();
  }

  getClaudeProjectsPath(): string {
    return this.getProviderSection().getClaudeProjectsPath();
  }

  getCodexSessionsPath(): string {
    return this.getProviderSection().getCodexSessionsPath();
  }

  getCopilotStateDbPath(): string {
    return this.getProviderSection().getCopilotStateDbPath();
  }

  getCopilotApiConfig(): CopilotApiConfig {
    return this.getProviderSection().getCopilotApiConfig();
  }

  getSmartSignInQuickWatchMs(): number {
    return this.getSmartSignInSection().getQuickWatchMs();
  }

  getSmartSignInWebsiteWatchMs(): number {
    return this.getSmartSignInSection().getWebsiteWatchMs();
  }

  isSessionTrackingEnabled(): boolean {
    if (!vscode.workspace.isTrusted) return false;
    return this.config.get<boolean>("sessionTracking.enabled", false);
  }

  getSessionTrackingPath(): string {
    const v = this.config.get<string>("sessionTracking.path", "") ?? "";
    return v.trim();
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

  private getAlertSection(): AlertConfigSection {
    return new AlertConfigSection(this.config);
  }

  private getStatusBarSection(): StatusBarConfigSection {
    return new StatusBarConfigSection(this.config);
  }

  private getProviderSection(): ProviderConfigSection {
    const alerts = this.getAlertSection();
    return new ProviderConfigSection(
      this.config,
      alerts.getAlertThresholds(),
      alerts.getRunOutAlertDays(),
      alerts.getMonthlyTarget()
    );
  }

  private getSmartSignInSection(): SmartSignInConfigSection {
    return new SmartSignInConfigSection(this.config);
  }
}
