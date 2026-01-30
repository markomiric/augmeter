import * as vscode from "vscode";
import { type UsageTracker } from "../features/usage/usage-tracker";
import { type StatusBarManager } from "../ui/status-bar";
import { SecureLogger } from "../core/logging/secure-logger";

import { UserNotificationService } from "../core/notifications/user-notification-service";
import { ErrorHandler } from "../core/errors/augmeter-error";

export class UsageCommands {
  constructor(
    private usageTracker: UsageTracker,
    private statusBarManager: StatusBarManager
  ) {}

  registerCommands(): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    // Manual refresh command
    disposables.push(
      vscode.commands.registerCommand("augmeter.manualRefresh", async () => {
        await this.handleManualRefresh();
      })
    );

    // Open settings command
    disposables.push(
      vscode.commands.registerCommand("augmeter.openSettings", () => {
        this.handleOpenSettings();
      })
    );

    // Copy usage summary command
    disposables.push(
      vscode.commands.registerCommand("augmeter.copyUsageSummary", async () => {
        await this.handleCopyUsageSummary();
      })
    );

    return disposables;
  }

  private async handleManualRefresh(): Promise<void> {
    await ErrorHandler.withErrorHandling(async () => {
      SecureLogger.info("Manual refresh requested");

      await UserNotificationService.withProgress("Augmeter", async progress => {
        progress.report({ message: "Refreshing your usage…" });

        // Trigger data refresh and then update status bar
        await this.usageTracker.refreshNow?.();
        await this.statusBarManager.updateDisplay();
      });

      UserNotificationService.showSuccess("Usage refreshed");
      SecureLogger.info("Manual refresh completed");
    }, "Manual refresh");
  }

  private async handleCopyUsageSummary(): Promise<void> {
    try {
      const usage = this.usageTracker.getCurrentUsage();
      const limit = this.usageTracker.getCurrentLimit();
      const hasRealData = this.usageTracker.hasRealUsageData();

      if (!hasRealData) {
        UserNotificationService.showSuccess("No usage data yet — sign in first");
        return;
      }

      const remaining = limit > 0 ? Math.max(limit - usage, 0) : 0;
      const percentage = limit > 0 ? Math.round((usage / limit) * 100) : 0;
      const subscriptionType = this.usageTracker.getSubscriptionType();
      const renewalDate = this.usageTracker.getRenewalDate();

      const lines: string[] = ["Augment Usage Summary"];
      if (subscriptionType) {
        lines.push(`Plan: ${subscriptionType}`);
      }
      lines.push(`Used: ${usage.toLocaleString()} / ${limit.toLocaleString()} (${percentage}%)`);
      lines.push(`Remaining: ${remaining.toLocaleString()}`);
      if (renewalDate) {
        try {
          const date = new Date(renewalDate);
          if (!isNaN(date.getTime())) {
            lines.push(`Renews: ${date.toLocaleDateString()}`);
          }
        } catch {
          // Skip invalid dates
        }
      }
      lines.push(`As of: ${new Date().toLocaleString()}`);

      await vscode.env.clipboard.writeText(lines.join("\n"));
      UserNotificationService.showSuccess("Usage summary copied");
      SecureLogger.info("Usage summary copied to clipboard");
    } catch (error) {
      SecureLogger.error("Copy usage summary failed", error);
      vscode.window.showErrorMessage("Failed to copy usage summary.");
    }
  }

  private handleOpenSettings(): void {
    try {
      SecureLogger.info("Opening settings");
      vscode.commands.executeCommand("workbench.action.openSettings", "augmeter");
    } catch (error) {
      SecureLogger.error("Open settings failed", error);
      vscode.window.showErrorMessage("Failed to open settings.");
    }
  }
}
