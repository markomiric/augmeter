import * as vscode from "vscode";
import { type ConfigManager } from "../core/config/config-manager";
import { ErrorHandler } from "../core/errors/augmeter-error";
import { SecureLogger } from "../core/logging/secure-logger";
import { type StorageManager } from "../core/storage/storage-manager";
import { type UsageTracker } from "../features/usage/usage-tracker";
import { type ProviderUsageService } from "../providers/provider-usage-service";
import { type AugmentDetector } from "../services/augment-detector";
import { type StatusBarManager } from "../ui/status-bar";

export class RuntimeCoordinator implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private lastFocusRefreshTs = 0;
  private realDataFetcher?: () => Promise<void>;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly storageManager: StorageManager,
    private readonly configManager: ConfigManager,
    private readonly augmentDetector: AugmentDetector,
    private readonly usageTracker: UsageTracker,
    private readonly statusBarManager: StatusBarManager,
    private readonly providerUsageService: ProviderUsageService
  ) {}

  async initialize(): Promise<void> {
    await this.initializeAuthState();
    this.attachRealDataFetcher();
    this.registerConfigurationListener();
    this.registerFocusListener();
    this.registerSecretsListener();
    this.startTracking();
  }

  private async initializeAuthState(): Promise<void> {
    try {
      const apiClient = this.augmentDetector.getApiClient();
      await apiClient.initializeFromSecrets();

      const isSignedIn = apiClient.hasCookie();
      void vscode.commands.executeCommand("setContext", "augmeter.isSignedIn", isSignedIn);

      if (!isSignedIn) {
        SecureLogger.info("No session cookie found - showing logged out state");
      }
    } catch (error) {
      SecureLogger.error("Auth state initialization failed", error);
    }
  }

  private attachRealDataFetcher(): void {
    const realFetcher = async () => {
      const source = this.usageTracker.getFetchSource();
      try {
        const apiClient = this.augmentDetector.getApiClient();

        if (!apiClient.hasCookie()) {
          this.usageTracker.clearRealDataFlag();
          await this.storageManager.setProviderHealth({
            providerId: "augment",
            status: "disabled",
            checkedAt: new Date().toISOString(),
            canCollectInCurrentWorkspace: true,
            sourceKind: "api",
            message: "Not signed in to Augment.",
            errorCode: "AUGMENT_SIGNED_OUT",
          });
          void this.statusBarManager.updateDisplay();
          SecureLogger.info(`Skipped fetch while signed out (source=${source})`);
          return;
        }

        SecureLogger.info(`Fetching real usage data (source=${source})`);
        const response = await apiClient.getUsageData();
        if (response.success) {
          const responseData =
            typeof response.data === "object" && response.data !== null ? response.data : null;
          SecureLogger.info(`API response received (source=${source})`, {
            hasData: responseData !== null,
            dataKeys: responseData ? Object.keys(responseData) : [],
          });
          const parsed = await apiClient.parseUsageResponse(response);
          if (parsed) {
            SecureLogger.info(`Parsed usage data (source=${source})`, {
              totalUsage: parsed.totalUsage,
              usageLimit: parsed.usageLimit,
              hasTotal: parsed.totalUsage !== undefined,
              hasLimit: parsed.usageLimit !== undefined,
            });
            await this.usageTracker.updateWithRealData({
              totalUsage: parsed.totalUsage ?? 0,
              usageLimit: parsed.usageLimit ?? 0,
              dailyUsage: parsed.dailyUsage,
              lastUpdate: parsed.lastUpdate ?? new Date().toISOString(),
              subscriptionType: parsed.subscriptionType,
              renewalDate: parsed.renewalDate,
            });

            void this.statusBarManager.updateDisplay();
            SecureLogger.info(`Real usage data updated successfully (source=${source})`);
          } else {
            SecureLogger.warn(`Failed to parse usage data response (source=${source})`);
          }
        } else if (response.code === "UNAUTHENTICATED") {
          this.usageTracker.clearRealDataFlag();
          await this.storageManager.setProviderHealth({
            providerId: "augment",
            status: "unavailable",
            checkedAt: new Date().toISOString(),
            canCollectInCurrentWorkspace: true,
            sourceKind: "api",
            message: "Augment authentication expired or invalid.",
            errorCode: "AUGMENT_UNAUTHENTICATED",
          });
          void this.statusBarManager.updateDisplay();
          SecureLogger.info(`Cleared data due to unauthenticated response (source=${source})`);
          return;
        } else {
          SecureLogger.warn(`Failed to fetch real usage data (source=${source})`, response.error);
        }
      } catch (error) {
        ErrorHandler.handleSilently(error, `Real data fetching (source=${source})`);
      } finally {
        try {
          await this.providerUsageService.collectUsage({
            now: new Date(),
            workspaceTrusted: vscode.workspace.isTrusted,
            source,
            forceRefresh: source !== "poller",
          });
        } catch (providerError) {
          SecureLogger.warn(`Provider collection failed (source=${source})`, providerError);
        }
      }
    };

    this.realDataFetcher = realFetcher;
    this.usageTracker.setRealDataFetcher(realFetcher);
  }

  private registerConfigurationListener(): void {
    const disposable = vscode.workspace.onDidChangeConfiguration(event => {
      try {
        if (!event.affectsConfiguration("augmeter")) {
          return;
        }

        this.configManager.reloadConfig();

        if (event.affectsConfiguration("augmeter.enabled")) {
          if (!this.configManager.isEnabled()) {
            this.usageTracker.stopDataFetching();
            this.statusBarManager.hide();
            SecureLogger.info("Extension disabled via settings; paused data fetching");
          } else {
            if (this.realDataFetcher) {
              this.usageTracker.setRealDataFetcher(this.realDataFetcher);
            }
            this.usageTracker.startTracking();
            this.statusBarManager.show();
            SecureLogger.info("Extension enabled via settings; resumed data fetching");
          }
        }

        if (
          event.affectsConfiguration("augmeter.refreshInterval") ||
          event.affectsConfiguration("augmeter.alerts.warningPercent") ||
          event.affectsConfiguration("augmeter.alerts.highPercent") ||
          event.affectsConfiguration("augmeter.alerts.criticalPercent") ||
          event.affectsConfiguration("augmeter.alerts.runOutDays") ||
          event.affectsConfiguration("augmeter.history.retentionDays") ||
          event.affectsConfiguration("augmeter.providers")
        ) {
          this.usageTracker.triggerRefreshSoon(0, "config-change");
        }

        void this.statusBarManager.updateDisplay();
      } catch (error) {
        SecureLogger.warn("Failed to apply configuration change", error);
      }
    });

    this.disposables.push(disposable);
  }

  private registerFocusListener(): void {
    const disposable = vscode.window.onDidChangeWindowState(event => {
      if (!event.focused) {
        return;
      }

      const now = Date.now();
      const cooldownMs = 30_000;
      if (now - this.lastFocusRefreshTs <= cooldownMs) {
        return;
      }

      try {
        this.usageTracker.triggerRefreshSoon(0, "focus");
        this.lastFocusRefreshTs = now;
        SecureLogger.info("Triggered focus-based refresh");
      } catch (error) {
        SecureLogger.warn("Failed to trigger focus-based refresh", error);
      }
    });

    this.disposables.push(disposable);
  }

  private registerSecretsListener(): void {
    const disposable = this.context.secrets.onDidChange(async event => {
      if (event.key !== "augment.sessionCookie") {
        return;
      }

      try {
        const apiClient = this.augmentDetector.getApiClient();
        await apiClient.refreshSessionFromSecrets();
        const hasCookie = apiClient.hasCookie();
        void vscode.commands.executeCommand("setContext", "augmeter.isSignedIn", hasCookie);
        this.usageTracker.triggerRefreshSoon(0, "auth-change");
        SecureLogger.info(
          hasCookie
            ? "Triggered auth-change refresh (cookie added)"
            : "Triggered auth-change refresh (cookie removed)"
        );
      } catch (error) {
        SecureLogger.warn("Failed to handle secrets change", error);
      }
    });

    this.disposables.push(disposable);
  }

  private startTracking(): void {
    try {
      if (!this.configManager.isEnabled()) {
        SecureLogger.info("Extension is disabled, skipping data fetching");
        return;
      }

      this.usageTracker.startTracking();
      SecureLogger.info("Data fetching started");
    } catch (error) {
      SecureLogger.error("Data fetching startup failed", error);
    }
  }

  dispose(): void {
    this.disposables.forEach(disposable => disposable.dispose());
  }
}
