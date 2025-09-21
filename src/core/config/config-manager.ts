/**
 * ABOUTME: This file manages extension configuration settings from VS Code workspace configuration,
 * providing type-safe access to all Augmeter settings with defaults.
 */
import * as vscode from "vscode";

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

  reloadConfig() {
    this.config = vscode.workspace.getConfiguration("augmeter");
  }

  isEnabled(): boolean {
    return this.config.get<boolean>("enabled", true);
  }

  // Clamp to [1, 300] and coerce non-numbers to default (60)
  getRefreshInterval(): number {
    const raw = this.config.get<number>("refreshInterval", 60);
    const n = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : 60;
    if (n < 1) return 1;
    if (n > 300) return 300;
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

  isAnalyticsEnabled(): boolean {
    return this.config.get<boolean>("analyticsEnabled", true);
  }

  getDisplayMode(): "used" | "remaining" | "remainingOnly" | "both" {
    const v = this.config.get<string>("displayMode", "both") ?? "both";
    return v === "used" || v === "remaining" || v === "remainingOnly" || v === "both" ? v : "both";
  }

  getStatusBarDensity(): "auto" | "compact" | "detailed" {
    const v = this.config.get<string>("statusBarDensity", "auto") ?? "auto";
    return v === "auto" || v === "compact" || v === "detailed" ? v : "auto";
  }

  shouldShowPercentInStatusBar(): boolean {
    return this.config.get<boolean>("showPercentInStatusBar", false);
  }

  getColorScheme(): "standard" | "conservative" | "aggressive" {
    const v = this.config.get<string>("colorScheme", "standard") ?? "standard";
    return v === "conservative" || v === "aggressive" ? v : "standard";
  }

  getColorThresholds(): {
    critical: number;
    highWarning: number;
    warning: number;
    caution: number;
  } {
    const defaults = {
      critical: 95,
      highWarning: 85,
      warning: 75,
      caution: 50,
    };

    const config = this.config.get<any>("colorThresholds", defaults) ?? defaults;

    // Validate and clamp values to ensure they make sense
    const critical = Math.max(80, Math.min(100, config.critical ?? defaults.critical));
    const highWarning = Math.max(
      70,
      Math.min(critical - 1, config.highWarning ?? defaults.highWarning)
    );
    const warning = Math.max(50, Math.min(highWarning - 1, config.warning ?? defaults.warning));
    const caution = Math.max(25, Math.min(warning - 1, config.caution ?? defaults.caution));

    return { critical, highWarning, warning, caution };
  }

  isEnhancedReadabilityEnabled(): boolean {
    return this.config.get<boolean>("enhancedReadability", false);
  }

  shouldAutoDetectHighContrast(): boolean {
    return this.config.get<boolean>("autoDetectHighContrast", true);
  }

  getStatusBarIconName(): string {
    const allowed = new Set([
      "graph-line",
      "graph",
      "dashboard",
      "pie-chart",
      "pulse",
      "percentage",
    ]);
    const v = this.config.get<string>("statusBarIcon", "dashboard") ?? "dashboard";
    return allowed.has(v) ? v : "dashboard";
  }

  getStatusBarConfig(): {
    density: "auto" | "compact" | "detailed";
    iconName: string;
    showPercent: boolean;
    displayMode: "used" | "remaining" | "remainingOnly" | "both";
    colorScheme: "standard" | "conservative" | "aggressive";
    colorThresholds: {
      critical: number;
      highWarning: number;
      warning: number;
      caution: number;
    };
    enhancedReadability: boolean;
    autoDetectHighContrast: boolean;
  } {
    return {
      density: this.getStatusBarDensity(),
      iconName: this.getStatusBarIconName(),
      showPercent: this.shouldShowPercentInStatusBar(),
      displayMode: this.getDisplayMode(),
      colorScheme: this.getColorScheme(),
      colorThresholds: this.getColorThresholds(),
      enhancedReadability: this.isEnhancedReadabilityEnabled(),
      autoDetectHighContrast: this.shouldAutoDetectHighContrast(),
    };
  }

  getLogLevel(): "error" | "warn" | "info" {
    const v = this.config.get<string>("logLevel", "info") ?? "info";
    if (v === "error" || v === "warn" || v === "info") return v;
    return "info";
  }

  // Smart Sign-In: Quick clipboard watch duration (ms), clamp to [0, 5000]
  getSmartSignInQuickWatchMs(): number {
    const raw = this.config.get<number>("smartSignIn.quickWatchMs", 2000);
    const n = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : 2000;
    if (n < 0) return 0;
    if (n > 5000) return 5000;
    return n;
  }

  // Smart Sign-In: Website clipboard watch duration (ms), clamp to [1000, 300000] (default 5 minutes)
  getSmartSignInWebsiteWatchMs(): number {
    const raw = this.config.get<number>("smartSignIn.websiteWatchMs", 300000);
    const n = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : 300000;
    if (n < 1000) return 1000;
    if (n > 300000) return 300000;
    return n;
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

  async updateConfig(key: string, value: any) {
    await this.config.update(key, value, vscode.ConfigurationTarget.Global);
    this.reloadConfig();
  }
}
