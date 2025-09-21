/**
 * ABOUTME: This file manages the VS Code status bar item for displaying usage data,
 * handling user interactions, and updating the UI based on authentication and usage state.
 */
import * as vscode from "vscode";
import { type UsageTracker } from "../features/usage/usage-tracker";
import { type ConfigManager } from "../core/config/config-manager";
import { type AugmentDetector } from "../services/augment-detector";
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

/**
 * Manages the VS Code status bar item for displaying Augmeter usage data.
 *
 * This class handles:
 * - Status bar text and color updates based on usage and authentication state
 * - User interactions (clicks) with configurable actions
 * - Periodic refresh of usage data
 * - Theme-aware color schemes (standard, conservative, aggressive, custom)
 * - Accessibility support with ARIA labels
 *
 * @example
 * ```typescript
 * const statusBar = new StatusBarManager(usageTracker, configManager, augmentDetector);
 * await statusBar.updateDisplay();
 * statusBar.show();
 * ```
 */
export class StatusBarManager implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;
  private usageTracker: UsageTracker;
  private configManager: ConfigManager;
  private augmentDetector: AugmentDetector | null = null;
  private refreshTimer: NodeJS.Timeout | undefined;
  private trackerSubscription?: vscode.Disposable;

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
    // Subscribe to usage changes for immediate updates
    this.trackerSubscription = this.usageTracker.onChanged(() => {
      this.updateDisplay().catch(err =>
        SecureLogger.error("Status bar update on usage change failed", err)
      );
    });
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

  private setDisplayTextAndA11y(
    displayMode: DisplayMode,
    used: number,
    limit: number,
    remaining: number,
    percentage: number
  ): void {
    const valueText = computeValueText(displayMode, used, limit, remaining, sbFormatCompact);
    const { density, iconName } = this.configManager.getStatusBarConfig();
    this.statusBarItem.text = computeDisplayText(density, valueText, iconName);
    this.statusBarItem.accessibilityInformation = {
      label: computeAccessibilityLabel(used, limit, remaining, percentage),
      role: "status",
    };
  }

  private applyTooltip(
    used: number,
    limit: number,
    remaining: number,
    percentage: number,
    hasRealData: boolean
  ): void {
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
  }

  private applyColors(percentage: number, hasRealData: boolean): void {
    const fg = computeStatusColorWithAccessibility(
      percentage,
      hasRealData,
      "standard",
      { critical: 95, highWarning: 95, warning: 85, caution: 101 },
      this.isHighContrastTheme()
    );
    this.statusBarItem.color = fg ? new vscode.ThemeColor(fg) : undefined;
    this.statusBarItem.backgroundColor = undefined;
  }

  async updateDisplay() {
    if (!this.configManager.isEnabled() || !this.configManager.shouldShowInStatusBar()) {
      this.statusBarItem.hide();
      return;
    }

    const usage = this.usageTracker.getCurrentUsage();
    const limit = this.usageTracker.getCurrentLimit();
    const percentage = limit > 0 ? Math.round((usage / limit) * 100) : 0;
    const hasRealData = this.usageTracker.hasRealUsageData();

    // Check if we have authentication (even without usage data)
    const isAuthenticated = await this.checkAuthenticationStatus();

    SecureLogger.info("StatusBar: updateDisplay called", {
      usage,
      limit,
      percentage,
      hasRealData,
      isAuthenticated,
      dataSource: this.usageTracker.getDataSource(),
    });

    // If no real data yet, show connected or sign-in states
    if (!hasRealData) {
      SecureLogger.info("StatusBar: No real data, showing connection state", {
        isAuthenticated,
        willShow: isAuthenticated ? "Connected" : "Sign in",
      });
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

    this.setDisplayTextAndA11y(displayMode, used, limit, remaining, percentage);

    this.applyTooltip(used, limit, remaining, percentage, hasRealData);

    this.applyColors(percentage, hasRealData);

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

    // Show sign in status with icon when density is detailed (consistent with Connected state)
    const config = this.configManager.getStatusBarConfig();
    let signInText: string;
    if (config.density === "detailed") {
      signInText = `$(${config.iconName}) Sign in`;
    } else {
      signInText = "Sign in";
    }

    this.statusBarItem.text = signInText;
    this.statusBarItem.tooltip = `Sign in for real usage data\nClick to auto-detect cookie or open website`;
    this.statusBarItem.command = "augmeter.smartSignIn";
    this.statusBarItem.backgroundColor = undefined;
    this.statusBarItem.color = new vscode.ThemeColor("statusBarItem.prominentForeground");
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
    this.trackerSubscription?.dispose();
    this.statusBarItem.dispose();
  }
}
