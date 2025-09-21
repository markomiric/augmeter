/**
 * ABOUTME: This file contains the bootstrap logic for initializing the extension,
 * wiring up dependencies, registering commands, and starting background services.
 */
import * as vscode from "vscode";
import { AugmentDetector } from "../services/augment-detector";
import { UsageTracker } from "../features/usage/usage-tracker";
import { StatusBarManager } from "../ui/status-bar";
import { StorageManager } from "../core/storage/storage-manager";
import { ConfigManager } from "../core/config/config-manager";
import { SecureLogger } from "../core/logging/secure-logger";
import { AuthCommands } from "../commands/auth-commands";
import { UsageCommands } from "../commands/usage-commands";

import { ErrorHandler } from "../core/errors/augmeter-error";

/**
 * Bootstraps the extension by initializing all services and registering commands.
 *
 * This class follows a dependency injection pattern, manually wiring up all
 * services and passing them to command handlers and UI components.
 *
 * Initialization sequence:
 * 1. Initialize core managers (storage, config, detector)
 * 2. Register authentication provider
 * 3. Register commands
 * 4. Initialize authentication state
 * 5. Setup status bar click handler
 * 6. Start data fetching
 *
 * @example
 * ```typescript
 * const bootstrap = new ExtensionBootstrap();
 * await bootstrap.initialize(context);
 * const disposables = bootstrap.getDisposables();
 * disposables.forEach(d => context.subscriptions.push(d));
 * ```
 */
export class ExtensionBootstrap {
  private storageManager!: StorageManager;
  private configManager!: ConfigManager;
  private augmentDetector!: AugmentDetector;
  private usageTracker!: UsageTracker;
  private statusBarManager!: StatusBarManager;
  private authCommands!: AuthCommands;
  private usageCommands!: UsageCommands;

  private disposables: vscode.Disposable[] = [];
  private lastFocusRefreshTs: number = 0;
  private context!: vscode.ExtensionContext;

  private realDataFetcher?: () => Promise<void>;

  /**
   * Initialize the extension with all services and commands.
   *
   * This method orchestrates the entire initialization sequence,
   * setting up all managers, registering commands, and starting
   * background data fetching.
   *
   * @param context - The VS Code extension context
   * @throws {Error} When initialization fails
   */
  async initialize(context: vscode.ExtensionContext): Promise<void> {
    try {
      SecureLogger.info("Extension initialization started");

      // Initialize core managers
      this.initializeManagers(context);

      // Register authentication provider
      this.registerAuthProvider();

      // Register commands
      this.registerCommands();

      // Initialize authentication state
      await this.initializeAuthState();

      // Setup status bar click handler
      this.setupStatusBarClickHandler();

      // Start data fetching
      this.startDataFetching();

      SecureLogger.info("Extension initialization completed successfully");
    } catch (error) {
      SecureLogger.error("Extension initialization failed", error);
      vscode.window.showErrorMessage("Extension initialization failed. Please restart VS Code.");
      throw error;
    }
  }

  private initializeManagers(context: vscode.ExtensionContext): void {
    this.context = context;
    this.storageManager = new StorageManager(context);
    this.configManager = new ConfigManager();
    this.augmentDetector = new AugmentDetector(context);
    this.usageTracker = new UsageTracker(this.storageManager, this.configManager);
    this.statusBarManager = new StatusBarManager(
      this.usageTracker,
      this.configManager,
      this.augmentDetector
    );

    // Initialize command handlers
    this.authCommands = new AuthCommands(
      this.augmentDetector,
      this.usageTracker,
      this.statusBarManager,
      this.configManager
    );

    // Initialize usage command handlers
    this.usageCommands = new UsageCommands(this.usageTracker, this.statusBarManager);
  }

  private registerAuthProvider(): void {
    try {
      const apiClient = this.augmentDetector.getApiClient();
      if (!apiClient) {
        SecureLogger.warn("API client not available for auth-related setup");
        return;
      }

      // No authentication provider; we use cookie-based auth via Secrets API
    } catch (error) {
      SecureLogger.error("Failed during auth setup", error);
    }
  }

  private registerCommands(): void {
    // Register authentication commands
    const authDisposables = this.authCommands.registerCommands();
    this.disposables.push(...authDisposables);

    // Register usage commands
    const usageDisposables = this.usageCommands.registerCommands();
    this.disposables.push(...usageDisposables);

    SecureLogger.info(`Registered ${this.disposables.length} commands`);
  }

  private async initializeAuthState(): Promise<void> {
    try {
      const apiClient = this.augmentDetector.getApiClient();
      if (!apiClient) {
        SecureLogger.warn("API client not available during auth state initialization");
        return;
      }

      // Initialize from secure storage (includes migration)
      await apiClient.initializeFromSecrets?.();

      // If no cookie, silently show logged out state in status bar
      if (!apiClient.hasCookie()) {
        SecureLogger.info("No session cookie found - showing logged out state");
        // Status bar will show logged out state automatically
      }

      // Test connection (optional, non-blocking)
      apiClient
        .testConnection()
        .then(response => {
          if (!response.success) {
            SecureLogger.warn("Initial connection test failed", response.error);
          }
        })
        .catch(error => {
          SecureLogger.warn("Initial connection test error", error);
        });
    } catch (error) {
      SecureLogger.error("Auth state initialization failed", error);
    }
  }

  private setupStatusBarClickHandler(): void {
    try {
      // Status bar click handler is already set up in StatusBarManager
      // Just trigger an update to ensure it's displayed
      void this.statusBarManager.updateDisplay();
      SecureLogger.info("Status bar click handler setup completed");
    } catch (error) {
      SecureLogger.error("Status bar click handler setup failed", error);
    }
  }

  private startDataFetching(): void {
    try {
      if (!this.configManager.isEnabled()) {
        SecureLogger.info("Extension is disabled, skipping data fetching");
        return;
      }

      // Set up real data fetcher
      const realFetcher = async () => {
        const source = (this.usageTracker as any).getFetchSource?.() || "poller";
        try {
          const apiClient = this.augmentDetector.getApiClient();
          if (!apiClient) {
            SecureLogger.warn(`API client not available for data fetching (source=${source})`);
            return;
          }

          // Skip network calls when not authenticated
          if (!apiClient.hasCookie()) {
            this.usageTracker.clearRealDataFlag();
            void this.statusBarManager.updateDisplay();
            SecureLogger.info(`Skipped fetch while signed out (source=${source})`);
            return;
          }

          SecureLogger.info(`Fetching real usage data (source=${source})`);
          const response = await apiClient.getUsageData();
          if (response.success) {
            SecureLogger.info(`API response received (source=${source})`, {
              hasData: !!response.data,
              dataKeys: response.data ? Object.keys(response.data) : [],
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
              });

              void this.statusBarManager.updateDisplay();
              SecureLogger.info(`Real usage data updated successfully (source=${source})`);
            } else {
              SecureLogger.warn(`Failed to parse usage data response (source=${source})`);
            }
          } else {
            // If unauthenticated, clear real data and update status without retrying
            if ((response as any).code === "UNAUTHENTICATED") {
              this.usageTracker.clearRealDataFlag();
              void this.statusBarManager.updateDisplay();
              SecureLogger.info(`Cleared data due to unauthenticated response (source=${source})`);
              return;
            }
            SecureLogger.warn(`Failed to fetch real usage data (source=${source})`, response.error);
          }
        } catch (error) {
          // Use silent error handling for background operations to avoid interrupting user workflow
          ErrorHandler.handleSilently(error, `Real data fetching (source=${source})`);
        }
      };
      this.usageTracker.setRealDataFetcher(realFetcher);
      this.realDataFetcher = realFetcher;

      // React to configuration changes for live behavior
      const cfgDisposable = vscode.workspace.onDidChangeConfiguration(e => {
        try {
          if (e.affectsConfiguration("augmeter.enabled")) {
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

          if (e.affectsConfiguration("augmeter.refreshInterval")) {
            // Reschedule polling quickly to apply new interval
            this.usageTracker.triggerRefreshSoon(0, "config-change");
          }

          if (
            e.affectsConfiguration("augmeter.displayMode") ||
            e.affectsConfiguration("augmeter.clickAction")
          ) {
            void this.statusBarManager.updateDisplay();
          }
        } catch (err) {
          SecureLogger.warn("Failed to apply configuration change", err);
        }
      });
      this.disposables.push(cfgDisposable);

      // Start periodic data fetching
      this.usageTracker.startTracking();

      // Trigger a refresh when the VS Code window regains focus (throttled)
      const focusDisposable = vscode.window.onDidChangeWindowState(e => {
        if (e.focused) {
          const now = Date.now();
          const cooldownMs = 30_000; // 30s throttle
          if (now - this.lastFocusRefreshTs > cooldownMs) {
            try {
              this.usageTracker.triggerRefreshSoon(0, "focus");
              this.lastFocusRefreshTs = now;
              SecureLogger.info("Triggered focus-based refresh");
            } catch (err) {
              SecureLogger.warn("Failed to trigger focus-based refresh", err);
            }
          }
        }
      });

      // Resume/pause polling on secret changes (cookie added/removed)
      const secretsDisposable = this.context.secrets.onDidChange(async e => {
        if (e.key === "augment.sessionCookie") {
          try {
            const apiClient = this.augmentDetector.getApiClient();
            // Trigger a refresh to reflect new auth state and fetch if signed in
            this.usageTracker.triggerRefreshSoon(0, "auth-change");
            SecureLogger.info(
              apiClient.hasCookie()
                ? "Triggered auth-change refresh (cookie added)"
                : "Triggered auth-change refresh (cookie removed)"
            );
          } catch (err) {
            SecureLogger.warn("Failed to handle secrets change", err);
          }
        }
      });
      this.disposables.push(secretsDisposable);

      this.disposables.push(focusDisposable);

      SecureLogger.info("Data fetching started");
    } catch (error) {
      SecureLogger.error("Data fetching startup failed", error);
    }
  }

  getDisposables(): vscode.Disposable[] {
    return [...this.disposables, this.statusBarManager, this.usageTracker];
  }

  dispose(): void {
    SecureLogger.info("Extension bootstrap disposal started");

    this.disposables.forEach(d => d.dispose());
    this.disposables = [];

    if (this.statusBarManager) {
      this.statusBarManager.dispose();
    }

    if (this.usageTracker) {
      this.usageTracker.dispose();
    }

    SecureLogger.info("Extension bootstrap disposal completed");
  }
}
