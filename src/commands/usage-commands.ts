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

    return disposables;
  }

  private async handleManualRefresh(): Promise<void> {
    await ErrorHandler.withErrorHandling(async () => {
      SecureLogger.info("Manual refresh requested");

      await UserNotificationService.withProgress("Refreshing usage data...", async progress => {
        progress.report({ message: "Fetching latest data..." });

        // Trigger data refresh and then update status bar
        await this.usageTracker.refreshNow?.();

        progress.report({ message: "Updating display..." });
        await this.statusBarManager.updateDisplay();
      });

      UserNotificationService.showSuccess("Usage data refreshed");
      SecureLogger.info("Manual refresh completed");
    }, "Manual refresh");
  }

  // handleShowDetails method removed - no longer needed since we eliminated popup dialogs

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
