import type * as vscode from "vscode";
import { toRoundedNumber } from "./config-value-utils";

export type StatusBarDisplayMode = "used" | "remaining" | "remainingOnly" | "both" | "percentage";
export type StatusBarDensity = "auto" | "compact" | "detailed";
export type StatusBarColorScheme = "standard" | "conservative" | "aggressive";

export interface StatusBarColorThresholds {
  critical: number;
  highWarning: number;
  warning: number;
  caution: number;
}

export interface StatusBarConfig {
  density: StatusBarDensity;
  iconName: string;
  showPercent: boolean;
  displayMode: StatusBarDisplayMode;
  colorScheme: StatusBarColorScheme;
  colorThresholds: StatusBarColorThresholds;
  enhancedReadability: boolean;
  autoDetectHighContrast: boolean;
}

const STATUS_BAR_ICONS = new Set([
  "graph-line",
  "graph",
  "dashboard",
  "pie-chart",
  "pulse",
  "percentage",
]);

export class StatusBarConfigSection {
  constructor(private readonly config: vscode.WorkspaceConfiguration) {}

  getDisplayMode(): StatusBarDisplayMode {
    const value = this.config.get<string>("displayMode", "both") ?? "both";
    return value === "used" ||
      value === "remaining" ||
      value === "remainingOnly" ||
      value === "both" ||
      value === "percentage"
      ? value
      : "both";
  }

  getDensity(): StatusBarDensity {
    const value = this.config.get<string>("statusBarDensity", "auto") ?? "auto";
    return value === "auto" || value === "compact" || value === "detailed" ? value : "auto";
  }

  shouldShowPercent(): boolean {
    return this.config.get<boolean>("showPercentInStatusBar", false);
  }

  getColorScheme(): StatusBarColorScheme {
    const value = this.config.get<string>("colorScheme", "standard") ?? "standard";
    return value === "conservative" || value === "aggressive" ? value : "standard";
  }

  getColorThresholds(): StatusBarColorThresholds {
    const defaults: StatusBarColorThresholds = {
      critical: 95,
      highWarning: 85,
      warning: 75,
      caution: 50,
    };
    const raw = this.config.get<unknown>("colorThresholds", defaults) ?? defaults;
    const value = this.isRecord(raw) ? raw : defaults;

    const critical = Math.max(
      80,
      Math.min(100, toRoundedNumber(value.critical, defaults.critical))
    );
    const highWarning = Math.max(
      70,
      Math.min(critical - 1, toRoundedNumber(value.highWarning, defaults.highWarning))
    );
    const warning = Math.max(
      50,
      Math.min(highWarning - 1, toRoundedNumber(value.warning, defaults.warning))
    );
    const caution = Math.max(
      25,
      Math.min(warning - 1, toRoundedNumber(value.caution, defaults.caution))
    );

    return { critical, highWarning, warning, caution };
  }

  isEnhancedReadabilityEnabled(): boolean {
    return this.config.get<boolean>("enhancedReadability", false);
  }

  shouldAutoDetectHighContrast(): boolean {
    return this.config.get<boolean>("autoDetectHighContrast", true);
  }

  getIconName(): string {
    const value = this.config.get<string>("statusBarIcon", "dashboard") ?? "dashboard";
    return STATUS_BAR_ICONS.has(value) ? value : "dashboard";
  }

  getConfig(): StatusBarConfig {
    return {
      density: this.getDensity(),
      iconName: this.getIconName(),
      showPercent: this.shouldShowPercent(),
      displayMode: this.getDisplayMode(),
      colorScheme: this.getColorScheme(),
      colorThresholds: this.getColorThresholds(),
      enhancedReadability: this.isEnhancedReadabilityEnabled(),
      autoDetectHighContrast: this.shouldAutoDetectHighContrast(),
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}
