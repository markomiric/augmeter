/**
 * ABOUTME: This file contains the bootstrap logic for initializing the extension,
 * wiring up dependencies, registering commands, and starting background services.
 */
import * as vscode from "vscode";
import { AuggieCliSource } from "../services/auggie-cli-source";
import { AugmentDetector } from "../services/augment-detector";
import { UsageTracker } from "../features/usage/usage-tracker";
import { StatusBarManager } from "../ui/status-bar";
import { StorageManager } from "../core/storage/storage-manager";
import { ConfigManager } from "../core/config/config-manager";
import { SecureLogger } from "../core/logging/secure-logger";
import { AuthCommands } from "../commands/auth-commands";
import { UsageCommands } from "../commands/usage-commands";
import { ProviderRegistry } from "../providers/provider-registry";
import { ProviderUsageService } from "../providers/provider-usage-service";
import { ClaudeProviderAdapter } from "../providers/adapters/claude-provider-adapter";
import { CodexProviderAdapter } from "../providers/adapters/codex-provider-adapter";
import { CopilotProviderAdapter } from "../providers/adapters/copilot-provider-adapter";
import { RuntimeCoordinator } from "./runtime-coordinator";

/**
 * Bootstraps the extension by initializing all services and registering commands.
 *
 * This class follows a dependency injection pattern, manually wiring up all
 * services and passing them to command handlers and UI components.
 *
 * Initialization sequence:
 * 1. Initialize shared managers and services
 * 2. Register commands
 * 3. Initialize runtime lifecycle coordination
 * 4. Render the initial status bar state
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
  private auggieCliSource!: AuggieCliSource;
  private usageTracker!: UsageTracker;
  private statusBarManager!: StatusBarManager;
  private authCommands!: AuthCommands;
  private usageCommands!: UsageCommands;
  private providerRegistry!: ProviderRegistry;
  private providerUsageService!: ProviderUsageService;
  private runtimeCoordinator!: RuntimeCoordinator;

  private disposables: vscode.Disposable[] = [];

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

      this.initializeManagers(context);
      this.registerCommands();
      this.initializeRuntimeCoordinator(context);
      await this.runtimeCoordinator.initialize();
      void this.statusBarManager.updateDisplay();

      SecureLogger.info("Extension initialization completed successfully");
    } catch (error) {
      SecureLogger.error("Extension initialization failed", error);
      vscode.window.showErrorMessage(
        "Augmeter couldn't start. Restart VS Code, then check Output > Augmeter if it happens again."
      );
      throw error;
    }
  }

  private initializeManagers(context: vscode.ExtensionContext): void {
    this.storageManager = new StorageManager(context);
    this.configManager = new ConfigManager();
    this.augmentDetector = new AugmentDetector(context, () => this.configManager.getApiBaseUrl());
    this.auggieCliSource = new AuggieCliSource(() => this.configManager.getAuggieCliPath());
    this.usageTracker = new UsageTracker(this.storageManager, this.configManager);
    this.statusBarManager = new StatusBarManager(
      this.usageTracker,
      this.configManager,
      this.augmentDetector,
      this.auggieCliSource
    );

    // Initialize command handlers
    this.authCommands = new AuthCommands(
      this.augmentDetector,
      this.usageTracker,
      this.statusBarManager,
      this.configManager,
      this.auggieCliSource,
      this.storageManager
    );

    // Initialize usage command handlers
    this.usageCommands = new UsageCommands(
      this.usageTracker,
      this.statusBarManager,
      this.configManager,
      this.augmentDetector,
      this.auggieCliSource
    );

    this.providerRegistry = new ProviderRegistry([
      new ClaudeProviderAdapter(() => this.configManager.getClaudeProjectsPath()),
      new CodexProviderAdapter(() => this.configManager.getCodexSessionsPath()),
      new CopilotProviderAdapter(
        () => this.configManager.getCopilotStateDbPath(),
        undefined,
        () => this.configManager.getCopilotApiConfig()
      ),
    ]);
    this.providerUsageService = new ProviderUsageService(
      this.storageManager,
      this.configManager,
      this.providerRegistry
    );
  }

  private registerCommands(): void {
    const authDisposables = this.authCommands.registerCommands();
    this.disposables.push(...authDisposables);

    const usageDisposables = this.usageCommands.registerCommands();
    this.disposables.push(...usageDisposables);

    SecureLogger.info(`Registered ${this.disposables.length} commands`);
  }

  private initializeRuntimeCoordinator(context: vscode.ExtensionContext): void {
    this.runtimeCoordinator = new RuntimeCoordinator(
      context,
      this.storageManager,
      this.configManager,
      this.augmentDetector,
      this.usageTracker,
      this.statusBarManager,
      this.providerUsageService,
      this.auggieCliSource
    );
  }

  getDisposables(): vscode.Disposable[] {
    return [...this.disposables, this.runtimeCoordinator, this.statusBarManager, this.usageTracker];
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

    if (this.runtimeCoordinator) {
      this.runtimeCoordinator.dispose();
    }

    SecureLogger.info("Extension bootstrap disposal completed");
  }
}
