import * as vscode from "vscode";
import { UsageTracker } from "../features/usage/usage-tracker";
import { ConfigManager } from "../core/config/config-manager";
import { AugmentDetector } from "../services/augment-detector";
import { SecureLogger } from "../core/logging/secure-logger";
import {
  formatCompact as sbFormatCompact,
  computeValueText,
  computeDisplayText,
  buildTooltip,
  computeStatusColorWithAccessibility,
  computeAccessibilityLabel,
  type DisplayMode,
  type ClickAction,
} from "./status-bar-logic";

export class StatusBarManager implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;
  private usageTracker: UsageTracker;
  private configManager: ConfigManager;
  private augmentDetector: AugmentDetector | null = null;
  private refreshTimer: NodeJS.Timeout | undefined;

  constructor(
    usageTracker: UsageTracker,
    configManager: ConfigManager,
    augmentDetector?: AugmentDetector
  ) {
    this.usageTracker = usageTracker;
    this.configManager = configManager;
    this.augmentDetector = augmentDetector || null;

    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);

    this.setupStatusBarItem();
    this.startRefreshTimer();
  }

  private setupStatusBarItem() {
    this.statusBarItem.tooltip = "Augmeter - Click for more options";
    this.updateDisplay().catch(err => SecureLogger.error("Status bar initial update failed", err));

    // Set click command based on configuration
    this.updateClickCommand();

    // React to configuration changes (display, timers, and enable)
    vscode.workspace.onDidChangeConfiguration(e => {
      const affectsDisplay =
        e.affectsConfiguration("augmeter.displayMode") ||
        e.affectsConfiguration("augmeter.clickAction");

      const affectsTimers =
        e.affectsConfiguration("augmeter.refreshInterval") ||
        e.affectsConfiguration("augmeter.enabled");

      if (affectsDisplay) {
        this.updateClickCommand();
        this.updateDisplay().catch(err =>
          SecureLogger.error("Status bar update failed after display config change", err)
        );
      }

      if (affectsTimers) {
        if (!this.configManager.isEnabled()) {
          this.stopRefreshTimer();
          this.statusBarItem.hide();
        } else {
          this.startRefreshTimer();
          this.updateDisplay().catch(err =>
            SecureLogger.error("Status bar update failed after config change", err)
          );
        }
      }
    });
  }

  private updateClickCommand() {
    const clickAction = this.configManager.getClickAction();

    switch (clickAction) {
      case "openWebsite":
        this.statusBarItem.command = {
          command: "vscode.open",
          arguments: [vscode.Uri.parse("https://www.augmentcode.com")],
          title: "Open Augment Website",
        };
        break;
      case "refresh":
        this.statusBarItem.command = "augmeter.manualRefresh";
        break;
      case "openSettings":
        this.statusBarItem.command = "augmeter.openSettings";
        break;
      default:
        this.statusBarItem.command = "augmeter.manualRefresh";
    }
  }

  private formatCompact(n: number): string {
    return sbFormatCompact(n);
  }

  async updateDisplay() {
    if (!this.configManager.isEnabled()) {
      this.statusBarItem.hide();
      return;
    }

    const usage = this.usageTracker.getCurrentUsage();
    const limit = this.usageTracker.getCurrentLimit();
    const percentage = limit > 0 ? Math.round((usage / limit) * 100) : 0;
    const hasRealData = this.usageTracker.hasRealUsageData();

    // Check if we have authentication (even without usage data)
    const isAuthenticated = await this.checkAuthenticationStatus();

    // If no real data yet, show connected or sign-in states
    if (!hasRealData) {
      if (isAuthenticated) {
        this.updateConnectedStatus();
      } else {
        this.updateLogoutStatus();
      }
      return;
    }

    // Display according to configuration (compact, readable status bar text)
    const displayMode = this.configManager.getDisplayMode() as DisplayMode;

    const used = usage;
    const remaining = limit > 0 ? Math.max(limit - usage, 0) : 0;

    // Compute value text using pure helpers
    const valueText = computeValueText(displayMode, used, limit, remaining, sbFormatCompact);

    const { density, iconName } = this.configManager.getStatusBarConfig();
    this.statusBarItem.text = computeDisplayText(density, valueText, iconName);
    this.statusBarItem.accessibilityInformation = {
      label: computeAccessibilityLabel(used, limit, remaining, percentage),
      role: "status",
    };

    // Build concise, user-focused tooltip
    const clickAction = this.configManager.getClickAction() as ClickAction;
    const tooltip = buildTooltip({
      used,
      limit,
      remaining,
      percentage,
      showPercent: false,
      hasRealData,
      clickAction,
      lastUpdated: new Date(),
    });
    this.statusBarItem.tooltip = tooltip;

    // Apply colors based on usage percentage and accessibility
    const fg = computeStatusColorWithAccessibility(
      percentage,
      hasRealData,
      "standard",
      { critical: 95, highWarning: 85, warning: 75, caution: 50 },
      this.isHighContrastTheme()
    );

    this.statusBarItem.color = fg ? new vscode.ThemeColor(fg) : undefined;
    this.statusBarItem.backgroundColor = undefined;

    this.updateClickCommand();
    this.statusBarItem.show();
  }

  private startRefreshTimer() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    if (!this.configManager.isEnabled()) {
      return;
    }
    const interval = this.configManager.getRefreshInterval() * 1000;
    this.refreshTimer = setInterval(() => {
      this.updateDisplay().catch(err =>
        SecureLogger.error("Status bar periodic update failed", err)
      );
    }, interval);
  }

  private stopRefreshTimer() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }
  showLoading() {
    try {
      const loadingText = `$(sync~spin) Loading...`;
      this.statusBarItem.text = loadingText;
      this.statusBarItem.tooltip = `Loading usage data...\nClick to refresh`;
      this.statusBarItem.backgroundColor = undefined;
      this.statusBarItem.color = new vscode.ThemeColor("statusBarItem.prominentForeground");
      this.statusBarItem.show();
    } catch {
      // Fallback to normal update if anything goes wrong
      this.updateDisplay().catch(() => {});
    }
  }

  show() {
    this.updateDisplay().catch(err => SecureLogger.error("Status bar show() update failed", err));
  }

  hide() {
    this.statusBarItem.hide();
  }

  private isHighContrastTheme(): boolean {
    try {
      // Check if VS Code is in high contrast mode
      const colorTheme = vscode.window.activeColorTheme;
      return (
        colorTheme.kind === vscode.ColorThemeKind.HighContrast ||
        colorTheme.kind === vscode.ColorThemeKind.HighContrastLight
      );
    } catch {
      // If we can't detect high contrast mode, default to false
      return false;
    }
  }

  private async checkAuthenticationStatus(): Promise<boolean> {
    // Check if we have a valid session cookie via the detector
    try {
      if (this.augmentDetector) {
        return this.augmentDetector.hasApiCookie();
      }
      // Fallback: assume authentication is available if we have usage data
      return this.usageTracker.hasRealUsageData();
    } catch {
      return false;
    }
  }

  updateConnectedStatus() {
    if (!this.configManager.shouldShowInStatusBar()) {
      this.statusBarItem.hide();
      return;
    }

    // Show connected status when authenticated but no usage data available (compact text)
    const config = this.configManager.getStatusBarConfig();
    let connectedText: string;
    if (config.density === "detailed") {
      connectedText = `$(${config.iconName}) Connected`;
    } else {
      connectedText = "Connected";
    }
    this.statusBarItem.text = connectedText;
    this.statusBarItem.tooltip = `Connected - usage data loading\nClick to refresh connection`;
    this.statusBarItem.command = "augmeter.manualRefresh";
    this.statusBarItem.backgroundColor = undefined;
    this.statusBarItem.color = new vscode.ThemeColor("statusBarItem.prominentForeground");
    this.statusBarItem.accessibilityInformation = {
      label: "Augmeter connected. Usage data not available.",
      role: "status",
    };
    this.statusBarItem.show();
  }

  updateLogoutStatus() {
    if (!this.configManager.shouldShowInStatusBar()) {
      this.statusBarItem.hide();
      return;
    }

    this.statusBarItem.text = "Sign in";
    this.statusBarItem.tooltip = `Sign in for real usage data\nClick to open Augment website`;
    this.statusBarItem.command = "augmeter.openWebsiteAndSignIn";
    this.statusBarItem.backgroundColor = undefined;
    this.statusBarItem.color = new vscode.ThemeColor("statusBarItem.warningForeground");
    this.statusBarItem.accessibilityInformation = {
      label: "Augmeter not signed in. Run Augment: Sign In.",
      role: "status",
    };
    this.statusBarItem.show();
  }

  dispose() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    this.statusBarItem.dispose();
  }
}
