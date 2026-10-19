import * as vscode from "vscode";
import { SecureSecretsManager } from "../core/auth/secure-secrets-manager";
import { type ConfigManager } from "../core/config/config-manager";
import { ErrorHandler } from "../core/errors/augmeter-error";
import { SecureLogger } from "../core/logging/secure-logger";
import { type StorageManager } from "../core/storage/storage-manager";
import { type UsageTracker } from "../features/usage/usage-tracker";
import { type ProviderUsageService } from "../providers/provider-usage-service";
import { type AuggieCliSource } from "../services/auggie-cli-source";
import { type AugmentApiClient } from "../services/augment-api-client";
import { type StatusBarManager } from "../ui/status-bar";

const NON_FAILURE_PROVIDER_CODES = new Set([
  "CLAUDE_PATH_MISSING",
  "CLAUDE_NO_LOGS",
  "CODEX_PATH_MISSING",
  "CODEX_NO_LOGS",
  // DECISION: Copilot setup and permission states need user action, not a retry, so a
  // manual refresh does not report them as failures. COPILOT_API_FAILED still does.
  "COPILOT_API_NOT_CONFIGURED",
  "COPILOT_API_USERNAME_MISSING",
  "COPILOT_API_TOKEN_MISSING",
  "COPILOT_API_NO_BILLING_DATA",
  "COPILOT_API_FORBIDDEN",
]);

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
    await this.migrateAugmentLegacyOptIn();
    this.attachRealDataFetcher();
    this.registerConfigurationListener();
    this.registerFocusListener();
    this.registerSecretsListener();
    this.registerWorkspaceTrustListener();
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
   * One-time migration: Augment became an opt-in legacy option, so existing Augment
   * users (stored credit data or a stored session cookie) are switched on. Explicit
   * values are never overwritten. The done flag is written only after every read and
   * any required write succeeded, so a failure is retried on the next activation.
   */
  private async migrateAugmentLegacyOptIn(): Promise<void> {
    try {
      if (this.storageManager.isAugmentLegacyMigrationDone()) {
        return;
      }
      if (!this.configManager.hasExplicitAugmentEnabled() && (await this.isExistingAugmentUser())) {
        await this.configManager.setAugmentEnabled(true);
        SecureLogger.info("Kept Augment credit tracking (legacy) on for an existing user");
      }
      await this.storageManager.setAugmentLegacyMigrationDone();
    } catch (error) {
      SecureLogger.warn(
        "Augment legacy opt-in migration failed; will retry next activation",
        error
      );
    }
  }

  /**
   * Local evidence (stored credit data, or the cookie initializeAuthState already loaded)
   * is checked first, so a failing SecretStorage read cannot hide it. The secret is read
   * only when nothing else answers; a failure there is retried on the next activation.
   */
  private async isExistingAugmentUser(): Promise<boolean> {
    const [creditSnapshots, augmentSnapshots] = await Promise.all([
      this.storageManager.getUsageSnapshots(),
      this.storageManager.getProviderUsageSnapshots("augment"),
    ]);
    if (creditSnapshots.length > 0 || augmentSnapshots.length > 0 || this.apiClient.hasCookie()) {
      return true;
    }
    const cookie = await new SecureSecretsManager(this.context).getSessionCookie();
    return Boolean(cookie?.trim());
  }

  /** Records the Augment-off state: no credit data, no connected state. */
  private async applyAugmentDisabledState(source: string): Promise<void> {
    this.usageTracker.clearRealDataFlag();
    await this.storageManager.setProviderHealth({
      providerId: "augment",
      status: "disabled",
      checkedAt: new Date().toISOString(),
      canCollectInCurrentWorkspace: true,
      message: "Augment credit tracking (legacy) is off.",
      errorCode: "AUGMENT_LEGACY_OFF",
    });
    // DECISION: leave augmeter.isSignedIn alone. Every Augment command's when-clause
    // already requires the option, and the cookie path never sets the key back to true,
    // so clearing it here would leave the palette wrong after the option is turned on.
    SecureLogger.info(`Skipped Augment credit fetch; legacy option is off (source=${source})`);
  }

  /** Drops the stored "legacy option is off" health once the option is on again. */
  private async clearAugmentOffHealth(): Promise<void> {
    const health = await this.storageManager.getProviderHealth("augment");
    if (health?.errorCode === "AUGMENT_LEGACY_OFF") {
      await this.storageManager.removeProviderHealth("augment");
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

    const fetchGeneration = this.auggieCliSource.getFetchGeneration();
    const result = await this.auggieCliSource.fetchUsage();
    if (!this.configManager.isAugmentEnabled()) {
      // Turned off while the request was pending: discard the obsolete result.
      await this.applyAugmentDisabledState(source);
      return { handled: true, succeeded: true };
    }

    if (!this.auggieCliSource.isFetchGenerationCurrent(fetchGeneration)) {
      if (this.configManager.getDataSource() !== "auggie-cli") {
        return { handled: false, succeeded: true };
      }
      SecureLogger.info(`Discarded stale Auggie CLI refresh (source=${source})`);
      return { handled: true, succeeded: false };
    }

    if (!this.configManager.isEnabled()) {
      return { handled: true, succeeded: false };
    }

    if (result.status === "ok") {
      await this.usageTracker.updateWithRealData({
        totalUsage: result.data.totalUsage ?? 0,
        usageLimit: result.data.usageLimit,
        remainingCredits: result.data.remainingCredits,
        monthlyAllowance: result.data.monthlyAllowance,
        usageKnown: result.data.usageKnown,
        sourceKind: "cli",
        dailyUsage: result.data.dailyUsage,
        lastUpdate: result.data.lastUpdate ?? new Date().toISOString(),
        subscriptionType: result.data.subscriptionType,
        renewalDate: result.data.renewalDate,
      });
      if (!this.configManager.isAugmentEnabled()) {
        await this.applyAugmentDisabledState(source);
        return { handled: true, succeeded: true };
      }
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
      await this.markAugmentRefreshFailure("cli");
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

  /**
   * Refreshes Augment credits, or records the off state. Resolves false when the refresh
   * did not produce current data. It runs outside the fetcher's try/finally so these
   * early returns cannot hide a provider-collection failure reported by that finally.
   */
  private async refreshAugmentCredits(source: string): Promise<boolean> {
    let refreshSucceeded = true;
    if (!this.configManager.isAugmentEnabled()) {
      await this.applyAugmentDisabledState(source);
      return refreshSucceeded;
    }
    await this.clearAugmentOffHealth();

    const cliFetch = await this.tryCliFetch(source);
    if (!this.configManager.isEnabled()) {
      SecureLogger.info(`Skipped refresh while extension is disabled (source=${source})`);
      return false;
    }
    if (cliFetch.handled) {
      refreshSucceeded = cliFetch.succeeded;
    } else if (!this.apiClient.hasCookie()) {
      // Augment is optional; a signed-out refresh can still succeed for
      // enabled local assistant providers.
      refreshSucceeded =
        this.configManager.isProviderTrackingEnabled() &&
        this.configManager.getEnabledProviderIds().length > 0;
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
      const requestGeneration = this.apiClient.getRequestGeneration();
      const response = await this.apiClient.getUsageData(() =>
        this.configManager.isAugmentEnabled()
      );
      if (!this.configManager.isAugmentEnabled()) {
        await this.applyAugmentDisabledState(source);
        return refreshSucceeded;
      }
      if (!this.apiClient.isRequestGenerationCurrent(requestGeneration)) {
        refreshSucceeded = false;
        SecureLogger.info(`Discarded stale Augment refresh (source=${source})`);
      } else if (response.success) {
        const responseData =
          typeof response.data === "object" && response.data !== null ? response.data : null;
        SecureLogger.info(`API response received (source=${source})`, {
          hasData: responseData !== null,
          dataKeys: responseData ? Object.keys(responseData) : [],
        });
        const parsed = await this.apiClient.parseUsageResponse(response);
        if (!this.configManager.isAugmentEnabled()) {
          await this.applyAugmentDisabledState(source);
          return refreshSucceeded;
        }
        if (
          !this.configManager.isEnabled() ||
          !this.apiClient.isRequestGenerationCurrent(requestGeneration)
        ) {
          refreshSucceeded = false;
          SecureLogger.info(`Discarded stale Augment refresh (source=${source})`);
        } else if (parsed) {
          SecureLogger.info(`Parsed usage data (source=${source})`, {
            totalUsage: parsed.totalUsage,
            usageLimit: parsed.usageLimit,
            hasTotal: parsed.totalUsage !== undefined,
            hasLimit: parsed.usageLimit !== undefined,
          });
          await this.usageTracker.updateWithRealData({
            totalUsage: parsed.totalUsage ?? 0,
            usageLimit: parsed.usageLimit,
            remainingCredits: parsed.remainingCredits,
            monthlyAllowance: parsed.monthlyAllowance,
            usageKnown: parsed.usageKnown,
            sourceKind: "api",
            dailyUsage: parsed.dailyUsage,
            lastUpdate: parsed.lastUpdate ?? new Date().toISOString(),
            subscriptionType: parsed.subscriptionType,
            renewalDate: parsed.renewalDate,
          });
          if (!this.configManager.isAugmentEnabled()) {
            await this.applyAugmentDisabledState(source);
            return refreshSucceeded;
          }

          SecureLogger.info(`Augment credit data updated successfully (source=${source})`);
        } else {
          refreshSucceeded = false;
          await this.markAugmentRefreshFailure("api");
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
        await this.markAugmentRefreshFailure("api");
        SecureLogger.warn(`Failed to fetch Augment credit data (source=${source})`, response.error);
      }
    }
    return refreshSucceeded;
  }

  private attachRealDataFetcher(): void {
    const realFetcher = async (): Promise<boolean> => {
      const source = this.usageTracker.getFetchSource();
      const failureSourceKind = this.configManager.getDataSource() === "auggie-cli" ? "cli" : "api";
      const apiGeneration = this.apiClient.getRequestGeneration();
      const cliGeneration = this.auggieCliSource.getFetchGeneration();
      let refreshSucceeded = true;
      try {
        refreshSucceeded = await this.refreshAugmentCredits(source);
      } catch (error) {
        refreshSucceeded = false;
        if (
          this.configManager.isEnabled() &&
          this.apiClient.isRequestGenerationCurrent(apiGeneration) &&
          this.auggieCliSource.isFetchGenerationCurrent(cliGeneration)
        ) {
          await this.markAugmentRefreshFailure(failureSourceKind);
        }
        ErrorHandler.handleSilently(error, `Augment credit fetch (source=${source})`);
      } finally {
        try {
          if (!this.configManager.isEnabled()) {
            SecureLogger.info(
              `Skipped provider collection while extension is disabled (source=${source})`
            );
          } else {
            await this.providerUsageService.collectUsage({
              now: new Date(),
              workspaceTrusted: vscode.workspace.isTrusted,
              source,
              forceRefresh: source !== "poller",
            });
            if (await this.hasEnabledProviderRefreshFailure()) {
              refreshSucceeded = false;
            }
          }
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

  private async markAugmentRefreshFailure(sourceKind: "api" | "cli"): Promise<void> {
    try {
      await this.storageManager.setProviderHealth({
        providerId: "augment",
        status: "degraded",
        checkedAt: new Date().toISOString(),
        canCollectInCurrentWorkspace: true,
        sourceKind,
        message: "Augment credits couldn't be refreshed. Showing the last known data.",
        errorCode: "AUGMENT_REFRESH_FAILED",
      });
    } catch (error) {
      SecureLogger.warn("Failed to record Augment refresh health", error);
    }
  }

  private async hasEnabledProviderRefreshFailure(): Promise<boolean> {
    if (!this.configManager.isProviderTrackingEnabled()) {
      return false;
    }

    const enabledIds = new Set<string>(this.configManager.getEnabledProviderIds());
    const healthSnapshots = await this.storageManager.getAllProviderHealth();
    return healthSnapshots.some(
      health =>
        enabledIds.has(health.providerId) &&
        health.canCollectInCurrentWorkspace &&
        (health.status === "degraded" || health.status === "unavailable") &&
        !NON_FAILURE_PROVIDER_CODES.has(health.errorCode ?? "")
    );
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
          event.affectsConfiguration("augmeter.enabled") ||
          event.affectsConfiguration("augmeter.dataSource") ||
          event.affectsConfiguration("augmeter.apiBaseUrl") ||
          event.affectsConfiguration("augmeter.auggieCli.path")
        ) {
          this.apiClient.invalidateInFlightRequests();
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
          event.affectsConfiguration("augmeter.augment") ||
          event.affectsConfiguration("augmeter.dataSource") ||
          event.affectsConfiguration("augmeter.apiBaseUrl") ||
          event.affectsConfiguration("augmeter.auggieCli.path")
        ) {
          this.usageTracker.triggerRefreshSoon(0, "config-change");
        }

        this.usageTracker.notifyChanged();
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

  private registerWorkspaceTrustListener(): void {
    const disposable = vscode.workspace.onDidGrantWorkspaceTrust(() => {
      try {
        this.usageTracker.triggerRefreshSoon(0, "trust-granted");
        SecureLogger.info("Triggered workspace-trust refresh");
      } catch (error) {
        SecureLogger.warn("Failed to trigger workspace-trust refresh", error);
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
    this.apiClient.invalidateInFlightRequests();
    this.auggieCliSource.reset();
    this.disposables.forEach(disposable => disposable.dispose());
  }
}
