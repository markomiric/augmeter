import * as vscode from "vscode";
import { type ConfigManager } from "../core/config/config-manager";
import { ErrorHandler } from "../core/errors/augmeter-error";
import { SecureLogger } from "../core/logging/secure-logger";
import { type StorageManager } from "../core/storage/storage-manager";
import { type UsageTracker } from "../features/usage/usage-tracker";
import { type ProviderUsageService } from "../providers/provider-usage-service";
import { type AuggieCliSource } from "../services/auggie-cli-source";
import { type AugmentApiClient } from "../services/augment-api-client";
import { type StatusBarManager } from "../ui/status-bar";

export class RuntimeCoordinator implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private lastFocusRefreshTs = 0;
  private realDataFetcher?: () => Promise<boolean>;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly storageManager: StorageManager,
    private readonly configManager: ConfigManager,
    private readonly apiClient: AugmentApiClient,
    private readonly usageTracker: UsageTracker,
    private readonly statusBarManager: StatusBarManager,
    private readonly providerUsageService: ProviderUsageService,
    private readonly auggieCliSource: AuggieCliSource
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
      await this.apiClient.initializeFromSecrets();

      const isSignedIn = this.apiClient.hasCookie();
      void vscode.commands.executeCommand("setContext", "augmeter.isSignedIn", isSignedIn);

      if (!isSignedIn) {
        SecureLogger.info("No session cookie found - showing logged out state");
      }
    } catch (error) {
      SecureLogger.error("Auth state initialization failed", error);
    }
  }

  /**
   * Try the Auggie CLI usage source and report both whether it handled the
   * refresh and whether that handled refresh produced current data.
   */
  private async tryCliFetch(source: string): Promise<{ handled: boolean; succeeded: boolean }> {
    const mode = this.configManager.getDataSource();
    if (mode === "cookie") {
      return { handled: false, succeeded: true };
    }

    if (this.storageManager.isCliAuthDisabled()) {
      if (mode !== "auggie-cli") {
        return { handled: false, succeeded: true };
      }
      this.usageTracker.clearRealDataFlag();
      await this.storageManager.setProviderHealth({
        providerId: "augment",
        status: "disabled",
        checkedAt: new Date().toISOString(),
        canCollectInCurrentWorkspace: true,
        sourceKind: "cli",
        message: "Auggie CLI credit source disconnected in Augmeter.",
        errorCode: "AUGGIE_CLI_SIGNED_OUT",
      });
      void vscode.commands.executeCommand("setContext", "augmeter.isSignedIn", false);
      return { handled: true, succeeded: false };
    }

    const result = await this.auggieCliSource.fetchUsage();

    if (result.status === "ok") {
      await this.usageTracker.updateWithRealData({
        totalUsage: result.data.totalUsage ?? 0,
        usageLimit: result.data.usageLimit ?? 0,
        remainingCredits: result.data.remainingCredits,
        monthlyAllowance: result.data.monthlyAllowance,
        usageKnown: result.data.usageKnown,
        sourceKind: "cli",
        dailyUsage: result.data.dailyUsage,
        lastUpdate: result.data.lastUpdate ?? new Date().toISOString(),
        subscriptionType: result.data.subscriptionType,
        renewalDate: result.data.renewalDate,
      });
      await this.storageManager.setProviderHealth({
        providerId: "augment",
        status: "connected",
        checkedAt: new Date().toISOString(),
        canCollectInCurrentWorkspace: true,
        sourceKind: "cli",
        message:
          result.data.usageKnown === false
            ? "Connected through Auggie CLI. Auggie reports your balance but not what you've used this cycle."
            : "Connected through Auggie CLI.",
      });
      void vscode.commands.executeCommand("setContext", "augmeter.isSignedIn", true);
      SecureLogger.info(`Usage updated from Auggie CLI (source=${source})`);
      return { handled: true, succeeded: true };
    }

    if (mode !== "auggie-cli") {
      // Auto mode: fall back to the cookie path for any non-ok CLI result.
      return { handled: false, succeeded: true };
    }

    if (result.status === "error") {
      // Transient failure in CLI-only mode: keep last known data.
      SecureLogger.warn(`Auggie CLI fetch failed; keeping last data (source=${source})`);
      return { handled: true, succeeded: false };
    }

    this.usageTracker.clearRealDataFlag();
    await this.storageManager.setProviderHealth({
      providerId: "augment",
      status: "unavailable",
      checkedAt: new Date().toISOString(),
      canCollectInCurrentWorkspace: true,
      sourceKind: "cli",
      message:
        result.status === "cli-missing"
          ? "Auggie CLI not found. Install it or set augmeter.auggieCli.path."
          : "Auggie CLI is not signed in. Run `auggie login`.",
      errorCode:
        result.status === "cli-missing" ? "AUGGIE_CLI_MISSING" : "AUGGIE_CLI_UNAUTHENTICATED",
    });
    void vscode.commands.executeCommand("setContext", "augmeter.isSignedIn", false);
    return { handled: true, succeeded: false };
  }

  private attachRealDataFetcher(): void {
    const realFetcher = async (): Promise<boolean> => {
      const source = this.usageTracker.getFetchSource();
      let refreshSucceeded = true;
      try {
        const cliFetch = await this.tryCliFetch(source);
        if (cliFetch.handled) {
          refreshSucceeded = cliFetch.succeeded;
        } else if (!this.apiClient.hasCookie()) {
          refreshSucceeded = false;
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
          void vscode.commands.executeCommand("setContext", "augmeter.isSignedIn", false);
          SecureLogger.info(`Skipped fetch while signed out (source=${source})`);
        } else {
          SecureLogger.info(`Fetching Augment credit data (source=${source})`);
          const response = await this.apiClient.getUsageData();
          if (response.success) {
            const responseData =
              typeof response.data === "object" && response.data !== null ? response.data : null;
            SecureLogger.info(`API response received (source=${source})`, {
              hasData: responseData !== null,
              dataKeys: responseData ? Object.keys(responseData) : [],
            });
            const parsed = await this.apiClient.parseUsageResponse(response);
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
                remainingCredits: parsed.remainingCredits,
                monthlyAllowance: parsed.monthlyAllowance,
                usageKnown: parsed.usageKnown,
                sourceKind: "api",
                dailyUsage: parsed.dailyUsage,
                lastUpdate: parsed.lastUpdate ?? new Date().toISOString(),
                subscriptionType: parsed.subscriptionType,
                renewalDate: parsed.renewalDate,
              });

              SecureLogger.info(`Augment credit data updated successfully (source=${source})`);
            } else {
              refreshSucceeded = false;
              SecureLogger.warn(`Failed to parse Augment credit response (source=${source})`);
            }
          } else if (response.code === "UNAUTHENTICATED") {
            refreshSucceeded = false;
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
            SecureLogger.info(`Cleared data due to unauthenticated response (source=${source})`);
          } else {
            refreshSucceeded = false;
            SecureLogger.warn(
              `Failed to fetch Augment credit data (source=${source})`,
              response.error
            );
          }
        }
      } catch (error) {
        refreshSucceeded = false;
        ErrorHandler.handleSilently(error, `Augment credit fetch (source=${source})`);
      } finally {
        try {
          await this.providerUsageService.collectUsage({
            now: new Date(),
            workspaceTrusted: vscode.workspace.isTrusted,
            source,
            forceRefresh: source !== "poller",
          });
        } catch (providerError) {
          refreshSucceeded = false;
          SecureLogger.warn(`Provider collection failed (source=${source})`, providerError);
        }
        await this.statusBarManager.updateDisplay();
        this.usageTracker.notifyChanged();
      }
      return refreshSucceeded;
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
          event.affectsConfiguration("augmeter.dataSource") ||
          event.affectsConfiguration("augmeter.auggieCli.path")
        ) {
          this.auggieCliSource.reset();
        }

        if (
          event.affectsConfiguration("augmeter.refreshInterval") ||
          event.affectsConfiguration("augmeter.alerts.warningPercent") ||
          event.affectsConfiguration("augmeter.alerts.highPercent") ||
          event.affectsConfiguration("augmeter.alerts.criticalPercent") ||
          event.affectsConfiguration("augmeter.alerts.runOutDays") ||
          event.affectsConfiguration("augmeter.history.retentionDays") ||
          event.affectsConfiguration("augmeter.providers") ||
          event.affectsConfiguration("augmeter.dataSource") ||
          event.affectsConfiguration("augmeter.auggieCli.path")
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
      // Update the tracker's focus state first so any reschedule it triggers
      // uses the correct (background vs foreground) interval. Blurring lengthens
      // the poll cadence so an unfocused editor stops hammering the API.
      try {
        this.usageTracker.setWindowFocused(event.focused);
      } catch (error) {
        SecureLogger.warn("Failed to update window focus state", error);
      }

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
        await this.apiClient.refreshSessionFromSecrets();
        const hasCookie = this.apiClient.hasCookie();
        const isSignedIn = hasCookie || this.auggieCliSource.isAuthenticatedCached();
        void vscode.commands.executeCommand("setContext", "augmeter.isSignedIn", isSignedIn);
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
