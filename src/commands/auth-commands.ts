import * as vscode from "vscode";
import { type AugmentDetector } from "../services/augment-detector";
import { type UsageTracker } from "../features/usage/usage-tracker";
import { type StatusBarManager } from "../ui/status-bar";
import { SecureLogger } from "../core/logging/secure-logger";

import { UserNotificationService } from "../core/notifications/user-notification-service";
import { ErrorHandler, AugmeterError } from "../core/errors/augmeter-error";
import { CookiePrompt } from "../core/auth/cookie-prompt";
import { SecureCookieUtils } from "../core/auth/cookie";
import { watchClipboardForCookie } from "../core/auth/clipboard-cookie-watcher";
import { type ConfigManager } from "../core/config/config-manager";
import { type StorageManager } from "../core/storage/storage-manager";
import { type AuggieCliSource } from "../services/auggie-cli-source";
import { type AugmentApiClient } from "../services/augment-api-client";

export class AuthCommands {
  private signInInProgress = false;

  constructor(
    private augmentDetector: AugmentDetector,
    private usageTracker: UsageTracker,
    private statusBarManager: StatusBarManager,
    private configManager: ConfigManager,
    private auggieCliSource: AuggieCliSource,
    private storageManager: StorageManager
  ) {}

  private async withSignInLock<T>(fn: () => Promise<T>): Promise<T | void> {
    if (this.signInInProgress) {
      await UserNotificationService.showInfo("An Augment connection is already in progress.");
      return;
    }
    this.signInInProgress = true;
    try {
      return await fn();
    } finally {
      this.signInInProgress = false;
    }
  }

  private async runSignInWithCookie(cookie: string): Promise<void> {
    const apiClient = this.augmentDetector.getApiClient();

    try {
      const normalized = SecureCookieUtils.normalizeCookieInput(cookie);
      apiClient.setSessionCookie(normalized);
    } catch (error) {
      throw AugmeterError.validation(
        `Cookie validation failed: ${error}`,
        "That cookie value isn't valid. Copy the complete _session value and try again."
      );
    }

    await UserNotificationService.withProgress("Connecting Augment", async progress => {
      progress.report({ message: "Checking your Augment connection..." });
      const result = await apiClient.testConnection();
      if (!result.success) {
        await apiClient.clearSessionCookie();
        this.augmentDetector.clearAuthCache();
        void vscode.commands.executeCommand("setContext", "augmeter.isSignedIn", false);
        throw AugmeterError.authentication(
          result.error || "Authentication failed",
          "Augment couldn't verify that cookie. Copy a fresh _session value and try again."
        );
      }

      void vscode.commands.executeCommand("setContext", "augmeter.isSignedIn", true);
      progress.report({ message: "Loading Augment credits..." });
      this.statusBarManager.showLoading();
      await this.usageTracker.refreshNow();
      await this.statusBarManager.updateDisplay();
      UserNotificationService.showSuccess("Augment connected");
    });
  }

  private async finalizeAuthenticatedSession(successMessage = "Augment connected"): Promise<void> {
    void vscode.commands.executeCommand("setContext", "augmeter.isSignedIn", true);
    this.statusBarManager.showLoading();
    await this.usageTracker.refreshNow();
    await this.statusBarManager.updateDisplay();
    UserNotificationService.showSuccess(successMessage);
  }

  /**
   * Try the Auggie CLI sign-in path. Returns true when sign-in was fully
   * handled (success, terminal login flow, or user cancellation); false to
   * continue with the cookie flow.
   */
  private async trySignInViaCli(): Promise<boolean> {
    const mode = this.configManager.getDataSource();
    if (mode === "cookie") {
      return false;
    }

    const binary = await this.auggieCliSource.detectBinary();
    if (!binary) {
      if (mode === "auggie-cli") {
        void UserNotificationService.showWarning(
          "Augmeter couldn't find Auggie CLI. Install it with npm i -g @augmentcode/auggie or set augmeter.auggieCli.path."
        );
        return true;
      }
      return false;
    }

    await this.storageManager.setCliAuthDisabled(false);
    const result = await this.auggieCliSource.fetchUsage();

    if (result.status === "ok") {
      await this.finalizeAuthenticatedSession("Augment connected through Auggie CLI");
      return true;
    }

    if (result.status === "unauthenticated") {
      const cliItem = {
        label: "$(terminal) Use Auggie CLI (recommended)",
        description: "Opens Auggie sign-in. Augmeter does not read CLI credentials.",
      };
      const cookieItem = {
        label: "$(key) Paste a session cookie",
        description: "Stored in VS Code SecretStorage and used only for Augment requests.",
      };
      const items = mode === "auggie-cli" ? [cliItem] : [cliItem, cookieItem];
      const choice = await vscode.window.showQuickPick(items, {
        title: "Connect Augment",
        placeHolder: "Choose how Augmeter should read your Augment credits",
        ignoreFocusOut: true,
      });

      if (choice === cookieItem) {
        return false;
      }
      if (choice !== cliItem) {
        return true; // user cancelled
      }

      const signedIn = await this.runAuggieLoginFlow(binary);
      if (signedIn) {
        await this.finalizeAuthenticatedSession("Augment connected through Auggie CLI");
      } else if (mode !== "auggie-cli") {
        void UserNotificationService.showInfo(
          "Augmeter couldn't detect an Auggie sign-in. Try again or use a session cookie."
        );
      }
      return true;
    }

    // Transient CLI error: fall back to the cookie flow in auto mode,
    // but stop here when the CLI is the only allowed source.
    return mode === "auggie-cli";
  }

  /** Open a terminal running `auggie login` and poll until the CLI is signed in. */
  private async runAuggieLoginFlow(binary: string): Promise<boolean> {
    const command = binary.includes(" ") ? `"${binary}" login` : `${binary} login`;
    const terminal = vscode.window.createTerminal({ name: "Auggie Login" });
    terminal.show();
    terminal.sendText(command);

    try {
      return await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Augmeter: Waiting for Auggie sign-in",
          cancellable: true,
        },
        async (_progress, token) => {
          const deadline = Date.now() + 180_000;
          // Poll slower than the source's result cache so each check is fresh.
          const pollMs = 5_500;
          while (Date.now() < deadline && !token.isCancellationRequested) {
            const result = await this.auggieCliSource.fetchUsage();
            if (result.status === "ok") {
              return true;
            }
            await new Promise(resolve => setTimeout(resolve, pollMs));
          }
          return false;
        }
      );
    } finally {
      terminal.dispose();
    }
  }

  private async tryExistingCookieAndFinalize(apiClient: AugmentApiClient): Promise<boolean> {
    return await UserNotificationService.withProgress("Connecting Augment", async progress => {
      progress.report({ message: "Checking your Augment connection..." });
      const result = await apiClient.testConnection();
      if (result.success) {
        progress.report({ message: "Loading Augment credits..." });
        await this.finalizeAuthenticatedSession();
        return true;
      }
      await apiClient.clearSessionCookie();
      this.augmentDetector.clearAuthCache();
      return false;
    });
  }

  private async tryClipboardCookie(): Promise<string | null> {
    try {
      const clipboardText = (await vscode.env.clipboard.readText())?.trim() || "";
      if (!clipboardText) {
        return null;
      }

      const normalized = SecureCookieUtils.normalizeCookieInput(clipboardText);
      const sessionValue = SecureCookieUtils.extractSessionValue(normalized);
      const validation = SecureCookieUtils.validateCookieValue(sessionValue);
      return validation.valid ? clipboardText : null;
    } catch {
      return null;
    }
  }

  private async watchClipboardBeforeWebsite(): Promise<string | null> {
    const quickWatchMs = this.configManager.getSmartSignInQuickWatchMs();
    if (quickWatchMs <= 0) {
      return null;
    }

    const immediateCookie = await this.tryClipboardCookie();
    if (immediateCookie) {
      return immediateCookie;
    }

    const pollIntervalMs = Math.max(50, Math.min(100, quickWatchMs));
    const result = await watchClipboardForCookie(quickWatchMs, pollIntervalMs);
    return result.cookie;
  }

  /**
   * Consistent sign-in flow: Open website, show manual input, and watch clipboard in parallel
   * Returns the first valid cookie from either manual input or clipboard detection
   */
  private async runConsistentSignInFlow(apiClient: AugmentApiClient): Promise<string | null> {
    // Clear any existing authentication state before signing in
    await apiClient.clearSessionCookie();
    this.augmentDetector.clearAuthCache();

    // Step 1: Open the website immediately
    try {
      await vscode.commands.executeCommand(
        "vscode.open",
        vscode.Uri.parse("https://app.augmentcode.com")
      );
    } catch {
      // best-effort open
    }

    // Step 2: Run manual input and clipboard detection in parallel with proper cancellation and a 5-minute default timeout
    return new Promise<string | null>(resolve => {
      const overallTimeoutMs = this.configManager?.getSmartSignInWebsiteWatchMs?.() ?? 300_000;
      let resolved = false;

      const inputCts = new vscode.CancellationTokenSource();
      const watcherCts = new vscode.CancellationTokenSource();

      const cleanup = () => {
        inputCts.dispose();
        watcherCts.dispose();
      };

      const resolveOnce = (cookie: string | null) => {
        if (resolved) return;
        resolved = true;
        try {
          // Cancel both paths
          inputCts.cancel();
          watcherCts.cancel();
        } finally {
          cleanup();
          resolve(cookie);
        }
      };

      // Start manual input dialog immediately with cancellation token
      CookiePrompt.promptForSessionCookie(inputCts.token)
        .then(cookie => {
          if (cookie) {
            // Got manual input: succeed and cancel clipboard watcher
            resolveOnce(cookie);
          } else {
            // User cancelled input: abort entire sign-in flow
            resolveOnce(null);
          }
        })
        .catch(() => {
          // Treat any error as cancellation to keep flow predictable
          resolveOnce(null);
        });

      // Start clipboard watching simultaneously with progress UI
      const timeoutMs = overallTimeoutMs;
      watchClipboardForCookie(timeoutMs, 1_000, watcherCts.token)
        .then(result => {
          const cookie = result.cookie;
          if (cookie) {
            // Cancel the input prompt and resolve with cookie
            resolveOnce(cookie);
          }
        })
        .catch(() => {
          // Ignore watcher errors; resolution handled by manual input or overall timeout
        });

      // Overall timeout: abort and close everything if no cookie within the timebox
      const timer = setTimeout(() => {
        if (!resolved) {
          resolveOnce(null);
        }
      }, overallTimeoutMs);

      // Ensure timer cleared upon resolution
      const originalResolve = resolve;
      resolve = value => {
        clearTimeout(timer);
        originalResolve(value);
      };
    });
  }

  registerCommands(): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    // Sign in using cookie input
    disposables.push(
      vscode.commands.registerCommand("augmeter.signIn", async () => {
        await ErrorHandler.withErrorHandling(async () => {
          await this.withSignInLock(async () => {
            const apiClient = this.augmentDetector.getApiClient();

            // 0) Prefer the Auggie CLI (no cookie required)
            if (await this.trySignInViaCli()) {
              return;
            }

            // 1) Try existing cookie first
            if (apiClient.hasCookie()) {
              const ok = await this.tryExistingCookieAndFinalize(apiClient);
              if (ok) return;
            }

            // 3) Run consistent sign-in flow
            const cookie = await this.runConsistentSignInFlow(apiClient);
            if (cookie) {
              await this.runSignInWithCookie(cookie);
            }
          });
        }, "connect to Augment");
      })
    );

    // Open Augment website and then show cookie sign-in prompt
    disposables.push(
      vscode.commands.registerCommand("augmeter.openWebsiteAndSignIn", async () => {
        try {
          await this.withSignInLock(async () => {
            const apiClient = this.augmentDetector.getApiClient();

            // 1) Try existing cookie first
            if (apiClient.hasCookie()) {
              const ok = await this.tryExistingCookieAndFinalize(apiClient);
              if (ok) return;
            }

            const cookie = await this.runConsistentSignInFlow(apiClient);
            if (cookie) {
              await this.runSignInWithCookie(cookie);
            }
          });
        } catch (error) {
          SecureLogger.error("Open website and sign-in flow failed", error);
        }
      })
    );

    // Consistent sign-in flow: check stored cookie, then run deterministic flow
    disposables.push(
      vscode.commands.registerCommand("augmeter.smartSignIn", async () => {
        await ErrorHandler.withErrorHandling(async () => {
          await this.withSignInLock(async () => {
            const apiClient = this.augmentDetector.getApiClient();

            // Step 0: Prefer the Auggie CLI (no cookie required)
            if (await this.trySignInViaCli()) {
              return;
            }

            // Step 1: Check stored cookie first
            if (apiClient.hasCookie()) {
              const ok = await this.tryExistingCookieAndFinalize(apiClient);
              if (ok) return;
            }

            // Step 2: Watch the clipboard briefly before opening the website.
            const quickClipboardCookie = await this.watchClipboardBeforeWebsite();
            if (quickClipboardCookie) {
              await this.runSignInWithCookie(quickClipboardCookie);
              return;
            }

            // Step 3: If no valid clipboard cookie, run consistent flow
            // (Open website, show manual input, watch clipboard - all in parallel)
            const cookie = await this.runConsistentSignInFlow(apiClient);
            if (cookie) {
              await this.runSignInWithCookie(cookie);
            }
          });
        }, "connect to Augment");
      })
    );

    // Sign out (clear cookie)
    disposables.push(
      vscode.commands.registerCommand("augmeter.signOut", async () => {
        await this.handleSignOut();
      })
    );

    return disposables;
  }

  private async handleSignOut(): Promise<void> {
    try {
      // Stop using the Auggie CLI source until the next explicit sign-in;
      // otherwise the next poll would silently re-authenticate.
      const wasCliAuthenticated = this.auggieCliSource.isAuthenticatedCached();
      await this.storageManager.setCliAuthDisabled(true);
      this.auggieCliSource.reset();
      if (wasCliAuthenticated) {
        void UserNotificationService.showInfo("Augment disconnected. Auggie remains signed in.");
      }

      const apiClient = this.augmentDetector.getApiClient();
      await apiClient.clearSessionCookie();

      // Clear any cached authentication status
      this.augmentDetector.clearAuthCache();

      // Properly await async operations to avoid race conditions
      await this.usageTracker.resetUsage();
      // Do NOT stop data fetching; keep the realDataFetcher attached
      this.usageTracker.clearRealDataFlag();
      void vscode.commands.executeCommand("setContext", "augmeter.isSignedIn", false);

      // Ensure status bar updates after all state is cleared
      await this.statusBarManager.updateDisplay();
      // No success popup - status bar shows signed out state
    } catch (error) {
      SecureLogger.error("Disconnect Augment failed", error);
      // No error popup - fail silently
    }
  }
}
