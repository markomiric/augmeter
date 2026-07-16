import * as vscode from "vscode";
import { writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { type UsageTracker } from "../features/usage/usage-tracker";
import { type StatusBarManager } from "../ui/status-bar";
import { SecureLogger } from "../core/logging/secure-logger";
import { UserNotificationService } from "../core/notifications/user-notification-service";
import { ErrorHandler } from "../core/errors/augmeter-error";
import { type ConfigManager } from "../core/config/config-manager";
import { type AuggieCliSource } from "../services/auggie-cli-source";
import { type AugmentApiClient } from "../services/augment-api-client";
import {
  buildDiagnosticsText,
  buildUsageBundle,
  buildUsageHistoryCsv,
  buildUsageSummaryText,
} from "./usage-command-formatters";

export class UsageCommands {
  private dashboardPanel: vscode.WebviewPanel | null = null;

  constructor(
    private usageTracker: UsageTracker,
    private statusBarManager: StatusBarManager,
    private configManager: ConfigManager,
    private apiClient: AugmentApiClient,
    private auggieCliSource?: AuggieCliSource
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

    // Open usage dashboard command
    disposables.push(
      vscode.commands.registerCommand("augmeter.openUsageDashboard", async () => {
        await this.handleOpenUsageDashboard();
      })
    );

    // Export usage history CSV command
    disposables.push(
      vscode.commands.registerCommand("augmeter.exportUsageHistoryCsv", async () => {
        await this.handleExportUsageHistoryCsv();
      })
    );

    // Export unified usage bundle command
    disposables.push(
      vscode.commands.registerCommand("augmeter.exportUsageBundleJson", async () => {
        await this.handleExportUsageBundleJson();
      })
    );

    // Diagnostics command
    disposables.push(
      vscode.commands.registerCommand("augmeter.runDiagnostics", async () => {
        await this.handleRunDiagnostics();
      })
    );

    return disposables;
  }

  private async handleManualRefresh(): Promise<void> {
    await ErrorHandler.withErrorHandling(async () => {
      SecureLogger.info("Manual refresh requested");

      await UserNotificationService.withProgress("Augmeter", async progress => {
        progress.report({ message: "Refreshing assistant activity and credits..." });

        // Trigger data refresh and then update status bar
        await this.usageTracker.refreshNow?.();
        await this.statusBarManager.updateDisplay();
      });

      if (this.dashboardPanel) {
        await this.renderDashboard(this.dashboardPanel);
      }

      UserNotificationService.showSuccess("Assistant activity and credits refreshed");
      SecureLogger.info("Manual refresh completed");
    }, "refresh assistant activity and credits");
  }

  private async handleCopyUsageSummary(): Promise<void> {
    try {
      const usage = this.usageTracker.getCurrentUsage();
      const limit = this.usageTracker.getCurrentLimit();
      const hasRealData = this.usageTracker.hasRealUsageData();

      if (!hasRealData) {
        await UserNotificationService.showInfo("Connect Augment before copying a credit summary.", {
          text: "Connect Augment",
          action: async () => await vscode.commands.executeCommand("augmeter.smartSignIn"),
        });
        return;
      }

      await vscode.env.clipboard.writeText(
        buildUsageSummaryText({
          usage,
          limit,
          usageKnown: this.usageTracker.isCurrentUsageKnown(),
          remainingCredits: this.usageTracker.getRemainingCredits(),
          monthlyAllowance: this.usageTracker.getMonthlyAllowance(),
          subscriptionType: this.usageTracker.getSubscriptionType(),
          renewalDate: this.usageTracker.getRenewalDate(),
          cycleTarget: this.usageTracker.getMonthlyTarget(),
          targetDelta: this.usageTracker.getTargetDelta(),
          projectedDays: await this.usageTracker.getProjectedDaysRemaining(),
          projectedDate: await this.usageTracker.getProjectedDepletionDate(),
          now: new Date(),
        })
      );
      UserNotificationService.showSuccess("Augment credit summary copied");
      SecureLogger.info("Usage summary copied to clipboard");
    } catch (error) {
      SecureLogger.error("Copy usage summary failed", error);
      vscode.window.showErrorMessage("Couldn't copy the Augment credit summary. Try again.");
    }
  }

  private async handleOpenUsageDashboard(): Promise<void> {
    try {
      if (this.dashboardPanel) {
        this.dashboardPanel.reveal(vscode.ViewColumn.Active);
        await this.renderDashboard(this.dashboardPanel);
        return;
      }

      this.dashboardPanel = vscode.window.createWebviewPanel(
        "augmeter.usageDashboard",
        "Augmeter: Assistant usage",
        vscode.ViewColumn.Active,
        {
          enableScripts: false,
          retainContextWhenHidden: true,
        }
      );

      this.dashboardPanel.onDidDispose(() => {
        this.dashboardPanel = null;
      });

      await this.renderDashboard(this.dashboardPanel);
    } catch (error) {
      SecureLogger.error("Open usage dashboard failed", error);
      vscode.window.showErrorMessage("Couldn't open assistant usage. Try again.");
    }
  }

  private async renderDashboard(panel: vscode.WebviewPanel): Promise<void> {
    const { renderUsageDashboard } = await import("../ui/usage-dashboard.js");
    const snapshots = await this.usageTracker.getUsageSnapshots();
    const providerSnapshots = await this.usageTracker.getProviderUsageSnapshots();
    const providerHealth = await this.usageTracker.getProviderHealthSnapshots();
    const hasRealData = this.usageTracker.hasRealUsageData();
    const usage = this.usageTracker.getCurrentUsage();
    const limit = this.usageTracker.getCurrentLimit();
    const remaining = this.usageTracker.getRemainingCredits();
    const percentage = limit > 0 ? Math.round((usage / limit) * 100) : 0;
    const usageRate = await this.usageTracker.getUsageRate();
    const projectedDays = await this.usageTracker.getProjectedDaysRemaining();
    const projectedDate = await this.usageTracker.getProjectedDepletionDate();

    panel.webview.html = renderUsageDashboard({
      generatedAt: new Date(),
      hasRealData,
      usage,
      limit,
      remaining,
      percentage,
      usageKnown: this.usageTracker.isCurrentUsageKnown(),
      monthlyAllowance: this.usageTracker.getMonthlyAllowance(),
      creditFreshnessAt: this.usageTracker.getLastFetchedAt(),
      renewalDate: this.usageTracker.getRenewalDate(),
      subscriptionType: this.usageTracker.getSubscriptionType(),
      usageRatePerHour: usageRate,
      projectedDaysRemaining: projectedDays,
      projectedDepletionDate: projectedDate,
      monthlyTarget: this.usageTracker.getMonthlyTarget(),
      targetDelta: this.usageTracker.getTargetDelta(),
      targetProgressPercent: this.usageTracker.getTargetProgressPercent(),
      snapshots,
      providerSnapshots,
      providerHealth,
    });
  }

  private async handleExportUsageHistoryCsv(): Promise<void> {
    try {
      const snapshots = await this.usageTracker.getUsageSnapshots();
      if (snapshots.length === 0) {
        void UserNotificationService.showInfo("No Augment credit history to export yet.");
        return;
      }

      const dateSuffix = new Date().toISOString().slice(0, 10);
      const defaultUri = vscode.Uri.file(
        path.join(os.homedir(), `augmeter-usage-history-${dateSuffix}.csv`)
      );

      const destination = await vscode.window.showSaveDialog({
        defaultUri,
        filters: {
          CSV: ["csv"],
        },
        saveLabel: "Export Augment credit history",
      });

      if (!destination) {
        return;
      }

      await writeFile(destination.fsPath, buildUsageHistoryCsv(snapshots), "utf8");
      UserNotificationService.showSuccess(
        `Exported ${snapshots.length} credit rows to ${path.basename(destination.fsPath)}`
      );
      SecureLogger.info("Usage history exported", {
        rows: snapshots.length,
        filePath: destination.fsPath,
      });
    } catch (error) {
      SecureLogger.error("Export usage history failed", error);
      vscode.window.showErrorMessage("Couldn't export Augment credit history. Try again.");
    }
  }

  private async handleExportUsageBundleJson(): Promise<void> {
    try {
      const usageSnapshots = await this.usageTracker.getUsageSnapshots();
      const providerSnapshots = await this.usageTracker.getProviderUsageSnapshots();
      const providerHealth = await this.usageTracker.getProviderHealthSnapshots();

      if (
        usageSnapshots.length === 0 &&
        providerSnapshots.length === 0 &&
        providerHealth.length === 0
      ) {
        void UserNotificationService.showInfo("No credits or assistant activity to export yet.");
        return;
      }

      const dateSuffix = new Date().toISOString().slice(0, 10);
      const defaultUri = vscode.Uri.file(
        path.join(os.homedir(), `augmeter-usage-bundle-${dateSuffix}.json`)
      );

      const destination = await vscode.window.showSaveDialog({
        defaultUri,
        filters: {
          JSON: ["json"],
        },
        saveLabel: "Export all usage data",
      });

      if (!destination) {
        return;
      }

      const copilotApiConfig = this.configManager.getCopilotApiConfig();
      await writeFile(
        destination.fsPath,
        JSON.stringify(
          buildUsageBundle({
            generatedAt: new Date(),
            extensionVersion:
              vscode.extensions.getExtension("kamacode.augmeter")?.packageJSON?.version ||
              "unknown",
            currentUsage: this.usageTracker.getCurrentUsage(),
            currentLimit: this.usageTracker.getCurrentLimit(),
            remainingCredits: this.usageTracker.getRemainingCredits(),
            usageKnown: this.usageTracker.isCurrentUsageKnown(),
            monthlyAllowance: this.usageTracker.getMonthlyAllowance(),
            renewalDate: this.usageTracker.getRenewalDate(),
            subscriptionType: this.usageTracker.getSubscriptionType(),
            usageSnapshots,
            providerSnapshots,
            providerHealth,
            retentionDays: this.configManager.getHistoryRetentionDays(),
            alertThresholds: this.configManager.getAlertThresholds(),
            runOutDays: this.configManager.getRunOutAlertDays(),
            cycleTarget: this.configManager.getMonthlyTarget(),
            enabledProviders: this.configManager.getEnabledProviderIds(),
            copilotApiConfig,
            copilotTokenPresent: Boolean(process.env.GITHUB_TOKEN),
          }),
          null,
          2
        ),
        "utf8"
      );
      UserNotificationService.showSuccess(
        `Exported all usage data to ${path.basename(destination.fsPath)}`
      );
      SecureLogger.info("Usage bundle exported", {
        usageRows: usageSnapshots.length,
        providerRows: providerSnapshots.length,
        healthRows: providerHealth.length,
        filePath: destination.fsPath,
      });
    } catch (error) {
      SecureLogger.error("Export usage bundle failed", error);
      vscode.window.showErrorMessage("Couldn't export usage data. Try again.");
    }
  }

  private async handleRunDiagnostics(): Promise<void> {
    try {
      const extension = vscode.extensions.getExtension("kamacode.augmeter");
      const providerSnapshots = await this.usageTracker.getProviderUsageSnapshots();
      const providerHealth = await this.usageTracker.getProviderHealthSnapshots();

      const copilotApiSettings = this.configManager.getCopilotApiConfig();
      await vscode.env.clipboard.writeText(
        buildDiagnosticsText({
          generatedAt: new Date(),
          extensionId: extension?.id,
          extensionVersion: extension?.packageJSON?.version,
          vscodeVersion: vscode.version,
          nodeVersion: process.version,
          platform: process.platform,
          workspaceTrusted: vscode.workspace.isTrusted,
          hasCookie: this.apiClient.hasCookie(),
          hasRealData: this.usageTracker.hasRealUsageData(),
          dataSource: this.usageTracker.getDataSource(),
          dataSourceMode: this.configManager.getDataSource(),
          cliDetected: this.auggieCliSource?.isCliDetectedCached() ?? false,
          cliAuthenticated: this.auggieCliSource?.isAuthenticatedCached() ?? false,
          usage: {
            used: this.usageTracker.getCurrentUsage(),
            limit: this.usageTracker.getCurrentLimit(),
            remaining: this.usageTracker.getRemainingCredits(),
            subscriptionType: this.usageTracker.getSubscriptionType(),
            renewalDate: this.usageTracker.getRenewalDate(),
            lastFetchedAt: this.usageTracker.getLastFetchedAt(),
          },
          config: {
            refreshInterval: this.configManager.getRefreshInterval(),
            clickAction: this.configManager.getClickAction(),
            showInStatusBar: this.configManager.shouldShowInStatusBar(),
            alertThresholds: this.configManager.getAlertThresholds(),
            runOutDays: this.configManager.getRunOutAlertDays(),
            cycleTarget: this.configManager.getMonthlyTarget(),
            retentionDays: this.configManager.getHistoryRetentionDays(),
            providerTrackingEnabled: this.configManager.isProviderTrackingEnabled(),
            enabledProviders: this.configManager.getEnabledProviderIds(),
            claudeProjectsPath: this.configManager.getClaudeProjectsPath() || "(default)",
            codexSessionsPath: this.configManager.getCodexSessionsPath() || "(default)",
            copilotStateDbPath: this.configManager.getCopilotStateDbPath() || "(default)",
            copilotApi: {
              ...copilotApiSettings,
              tokenPresent: Boolean(process.env.GITHUB_TOKEN),
            },
            logLevel: this.configManager.getLogLevel(),
          },
          providerHealth,
          providerSnapshots,
          supportIssueUrl: "https://github.com/markomiric/augmeter/issues/new",
        })
      );

      const selection = await vscode.window.showInformationMessage(
        "Diagnostics copied. Paste them into a GitHub issue.",
        "Report issue"
      );
      if (selection === "Report issue") {
        await vscode.commands.executeCommand(
          "vscode.open",
          vscode.Uri.parse("https://github.com/markomiric/augmeter/issues/new")
        );
      }

      SecureLogger.info("Diagnostics collected");
    } catch (error) {
      SecureLogger.error("Run diagnostics failed", error);
      vscode.window.showErrorMessage("Couldn't copy diagnostics. Try again.");
    }
  }

  private handleOpenSettings(): void {
    try {
      SecureLogger.info("Opening settings");
      void vscode.commands.executeCommand("workbench.action.openSettings", "augmeter");
    } catch (error) {
      SecureLogger.error("Open settings failed", error);
      vscode.window.showErrorMessage("Couldn't open Augmeter settings. Try again.");
    }
  }
}
