/**
 * ABOUTME: This file manages the VS Code status bar item for displaying usage data,
 * handling user interactions, and updating the UI based on authentication and usage state.
 */
import * as vscode from "vscode";
import { type UsageTracker } from "../features/usage/usage-tracker";
import { type ConfigManager } from "../core/config/config-manager";
import { type AugmentApiClient } from "../services/augment-api-client";
import { type AuggieCliSource } from "../services/auggie-cli-source";
import { SecureLogger } from "../core/logging/secure-logger";
import {
  buildProviderUsageLines,
  formatCompact as sbFormatCompact,
  formatStatusValue,
  formatStatusText,
  buildMarkdownTooltip,
  computeStatusColors,
  computeAccessibilityLabel,
  type ClickAction,
} from "./status-bar-logic";

/**
 * Manages the VS Code status bar item for displaying Augmeter usage data.
 *
 * This class handles:
 * - Status bar text and color updates based on usage and authentication state
 * - User interactions (clicks) with configurable actions
 * - Periodic refresh of usage data
 * - Native VS Code theme colors for warning states
 * - Accessibility support with ARIA labels
 *
 * @example
 * ```typescript
 * const statusBar = new StatusBarManager(usageTracker, configManager, apiClient);
 * await statusBar.updateDisplay();
 * statusBar.show();
 * ```
 */
export class StatusBarManager implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;
  private usageTracker: UsageTracker;
  private configManager: ConfigManager;
  private apiClient: AugmentApiClient | null = null;
  private auggieCliSource: AuggieCliSource | null = null;
  private trackerSubscription?: vscode.Disposable;
  private displayRevision = 0;

  constructor(
    usageTracker: UsageTracker,
    configManager: ConfigManager,
    apiClient?: AugmentApiClient,
    auggieCliSource?: AuggieCliSource
  ) {
    this.usageTracker = usageTracker;
    this.configManager = configManager;
    this.apiClient = apiClient || null;
    this.auggieCliSource = auggieCliSource || null;

    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);

    this.setupStatusBarItem();
    // Subscribe to usage changes for immediate updates
    this.trackerSubscription = this.usageTracker.onChanged(() => {
      this.updateDisplay().catch(err =>
        SecureLogger.error("Status bar update on usage change failed", err)
      );
    });
  }

  private setupStatusBarItem() {
    this.statusBarItem.tooltip = "Augmeter";
    this.updateDisplay().catch(err => SecureLogger.error("Status bar initial update failed", err));

    // Set click command based on configuration
    this.updateClickCommand();
  }

  private updateClickCommand() {
    const clickAction = this.configManager.getClickAction();

    switch (clickAction) {
      case "openWebsite":
        this.statusBarItem.command = {
          command: "vscode.open",
          arguments: [vscode.Uri.parse("https://www.augmentcode.com")],
          title: "Open Augment website",
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

  private setDisplayTextAndA11y(
    used: number,
    limit: number,
    remaining: number,
    percentage: number
  ): void {
    const valueText = formatStatusValue(used, limit, remaining, sbFormatCompact);
    this.statusBarItem.text = formatStatusText(valueText);
    this.statusBarItem.accessibilityInformation = {
      label: computeAccessibilityLabel(used, limit, remaining, percentage),
      role: "status",
    };
  }

  private async applyTooltip(
    used: number,
    limit: number,
    remaining: number,
    percentage: number,
    hasRealData: boolean,
    usageKnown: boolean,
    revision: number
  ): Promise<boolean> {
    const clickAction = this.configManager.getClickAction() as ClickAction;

    // Fetch rate, projection, and session activity data (non-blocking on errors)
    let usageRatePerHour: number | null = null;
    let projectedDaysRemaining: number | null = null;
    let projectedDepletionDate: Date | null = null;
    let targetDelta: number | null = null;
    let targetProgressPercent: number | null = null;
    let monthlyTarget: number | null = null;
    let providerUsageLines: string[] = [];
    if (hasRealData && usageKnown) {
      try {
        usageRatePerHour = await this.usageTracker.getUsageRate();
        projectedDaysRemaining = await this.usageTracker.getProjectedDaysRemaining();
        projectedDepletionDate = await this.usageTracker.getProjectedDepletionDate();
      } catch {
        // Silently degrade because rate data is optional.
      }
      try {
        monthlyTarget = this.usageTracker.getMonthlyTarget();
        targetDelta = this.usageTracker.getTargetDelta();
        targetProgressPercent = this.usageTracker.getTargetProgressPercent();
      } catch {
        // Silently degrade because target tracking is optional.
      }
    }
    providerUsageLines = await this.getProviderUsageLines();

    const tooltipContent = buildMarkdownTooltip({
      used,
      limit,
      remaining,
      percentage,
      hasRealData,
      usageKnown,
      monthlyAllowance: this.usageTracker.getMonthlyAllowance(),
      clickAction,
      lastUpdated: this.usageTracker.getLastFetchedAt(),
      subscriptionType: this.usageTracker.getSubscriptionType(),
      renewalDate: this.usageTracker.getRenewalDate(),
      usageRatePerHour,
      projectedDaysRemaining,
      monthlyTarget,
      targetDelta,
      targetProgressPercent,
      projectedDepletionDate,
      providerUsageLines,
    });
    if (revision !== this.displayRevision) {
      return false;
    }
    const md = new vscode.MarkdownString(tooltipContent);
    md.isTrusted = true;
    this.statusBarItem.tooltip = md;
    return true;
  }

  private async getProviderUsageLines(): Promise<string[]> {
    try {
      const [providerSnapshots, providerHealth] = await Promise.all([
        this.usageTracker.getProviderUsageSnapshots(),
        this.usageTracker.getProviderHealthSnapshots(),
      ]);
      return buildProviderUsageLines(providerSnapshots, providerHealth);
    } catch {
      return [];
    }
  }

  private applyColors(percentage: number, hasRealData: boolean): void {
    const colors = computeStatusColors(percentage, hasRealData);
    this.statusBarItem.color = colors.foreground
      ? new vscode.ThemeColor(colors.foreground)
      : undefined;
    this.statusBarItem.backgroundColor = undefined;
  }

  private createTooltipMarkdown(lines: string[]): vscode.MarkdownString {
    const markdown = new vscode.MarkdownString(lines.join("\n\n"));
    markdown.isTrusted = true;
    return markdown;
  }

  async updateDisplay(): Promise<void> {
    const revision = ++this.displayRevision;
    if (!this.configManager.isEnabled() || !this.configManager.shouldShowInStatusBar()) {
      this.statusBarItem.hide();
      return;
    }

    const usage = this.usageTracker.getCurrentUsage();
    const limit = this.usageTracker.getCurrentLimit();
    const percentage = limit > 0 ? Math.round((usage / limit) * 100) : 0;
    const hasRealData = this.usageTracker.hasRealUsageData();
    const usageKnown = this.usageTracker.isCurrentUsageKnown();

    // Check if we have authentication (even without usage data)
    const isAuthenticated = await this.checkAuthenticationStatus();
    if (revision !== this.displayRevision) {
      return;
    }

    SecureLogger.info("StatusBar: updateDisplay called", {
      usage,
      limit,
      percentage,
      hasRealData,
      isAuthenticated,
      dataSource: this.usageTracker.getDataSource(),
    });

    // If no Augment credit data exists yet, show the connection state.
    if (!hasRealData) {
      SecureLogger.info("StatusBar: No Augment credit data, showing connection state", {
        isAuthenticated,
        willShow: isAuthenticated ? "Loading credits" : "Assistant usage",
      });
      if (isAuthenticated) {
        await this.updateConnectedStatus(revision);
      } else {
        await this.updateLogoutStatus(revision);
      }
      return;
    }

    const used = usage;
    const remaining = this.usageTracker.getRemainingCredits();

    if (usageKnown) {
      this.setDisplayTextAndA11y(used, limit, remaining, percentage);
    } else {
      this.statusBarItem.text = formatStatusText(`${sbFormatCompact(remaining)} left`);
      this.statusBarItem.accessibilityInformation = {
        label: `Augment credits: ${remaining.toLocaleString()} remaining; cycle usage unavailable`,
        role: "status",
      };
    }

    const tooltipApplied = await this.applyTooltip(
      used,
      limit,
      remaining,
      percentage,
      hasRealData,
      usageKnown,
      revision
    );
    if (!tooltipApplied || revision !== this.displayRevision) {
      return;
    }

    this.applyColors(percentage, hasRealData && usageKnown);

    this.updateClickCommand();
    this.statusBarItem.show();
  }

  showLoading(): void {
    try {
      this.displayRevision++;
      this.statusBarItem.text = `$(sync~spin) Augmeter`;
      this.statusBarItem.tooltip = `Augmeter\n\nRefreshing assistant activity and credits...`;
      this.statusBarItem.backgroundColor = undefined;
      this.statusBarItem.color = new vscode.ThemeColor("statusBarItem.prominentForeground");
      this.statusBarItem.show();
    } catch {
      // Fallback to normal update if anything goes wrong
      this.updateDisplay().catch(() => {});
    }
  }

  show(): void {
    this.updateDisplay().catch(err => SecureLogger.error("Status bar show() update failed", err));
  }

  hide(): void {
    this.displayRevision++;
    this.statusBarItem.hide();
  }

  private async checkAuthenticationStatus(): Promise<boolean> {
    // Signed in when the Auggie CLI source is active or a session cookie exists
    try {
      if (this.auggieCliSource?.isAuthenticatedCached()) {
        return true;
      }
      if (this.apiClient) {
        return this.apiClient.hasCookie();
      }
      // Fallback: assume authentication is available if we have usage data
      return this.usageTracker.hasRealUsageData();
    } catch {
      return false;
    }
  }

  async updateConnectedStatus(revision: number = ++this.displayRevision): Promise<void> {
    if (!this.configManager.shouldShowInStatusBar()) {
      this.statusBarItem.hide();
      return;
    }

    const providerUsageLines = await this.getProviderUsageLines();
    if (revision !== this.displayRevision) {
      return;
    }

    // Always show spinner + "Augmeter" in connected state for clear branding and loading feedback
    this.statusBarItem.text = `$(sync~spin) Augmeter`;
    const lines = ["**Assistant usage**"];
    if (providerUsageLines.length > 0) {
      lines.push(
        ["**Assistant activity:**", ...providerUsageLines.map(line => `- ${line}`)].join("\n")
      );
    }
    lines.push("**Augment credits**", "Loading Augment credits...");
    lines.push("Click to refresh · [Open assistant usage](command:augmeter.openUsageDashboard)");
    this.statusBarItem.tooltip = this.createTooltipMarkdown(lines);
    this.statusBarItem.command = "augmeter.manualRefresh";
    this.statusBarItem.backgroundColor = undefined;
    this.statusBarItem.color = new vscode.ThemeColor("statusBarItem.prominentForeground");
    this.statusBarItem.accessibilityInformation = {
      label: "Augmeter: Loading Augment credits",
      role: "status",
    };
    this.statusBarItem.show();
  }

  async updateLogoutStatus(revision: number = ++this.displayRevision): Promise<void> {
    if (!this.configManager.shouldShowInStatusBar()) {
      this.statusBarItem.hide();
      return;
    }

    // Always show icon + "Augmeter" in non-data states for clear branding
    const providerUsageLines = await this.getProviderUsageLines();
    if (revision !== this.displayRevision) {
      return;
    }
    this.statusBarItem.text = "$(dashboard) Augmeter";
    const tooltip = buildMarkdownTooltip({
      used: 0,
      limit: 0,
      remaining: 0,
      percentage: 0,
      hasRealData: false,
      clickAction: "refresh",
      providerUsageLines,
    });
    const markdown = new vscode.MarkdownString(tooltip);
    markdown.isTrusted = true;
    this.statusBarItem.tooltip = markdown;
    this.statusBarItem.command = "augmeter.openUsageDashboard";
    this.statusBarItem.backgroundColor = undefined;
    this.statusBarItem.color = new vscode.ThemeColor("statusBarItem.prominentForeground");
    this.statusBarItem.accessibilityInformation = {
      label: "Augmeter: Assistant usage; Augment credits not connected",
      role: "status",
    };
    this.statusBarItem.show();
  }

  dispose(): void {
    this.displayRevision++;
    this.trackerSubscription?.dispose();
    this.statusBarItem.dispose();
  }
}
