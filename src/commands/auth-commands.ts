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

export class AuthCommands {
  private signInInProgress = false;

  constructor(
    private augmentDetector: AugmentDetector,
    private usageTracker: UsageTracker,
    private statusBarManager: StatusBarManager,
    private configManager: ConfigManager
  ) {}

  private async withSignInLock<T>(fn: () => Promise<T>): Promise<T | void> {
    if (this.signInInProgress) {
      await UserNotificationService.showInfo("Sign-in is already in progress");
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
    if (!apiClient) {
      throw AugmeterError.configuration(
        "API client not found",
        "Extension initialization error. Please restart VS Code."
      );
    }

    try {
      const normalized = SecureCookieUtils.normalizeCookieInput(cookie);
      apiClient.setSessionCookie(normalized);
    } catch (error) {
      throw AugmeterError.validation(
        `Cookie validation failed: ${error}`,
        "Invalid cookie format. Please copy the complete session cookie value from your browser."
      );
    }

    await UserNotificationService.withProgress("Augmeter", async progress => {
      progress.report({ message: "Signing in…" });
      const result = await apiClient.testConnection();
      if (!result.success) {
        await apiClient.clearSessionCookie();
        this.augmentDetector.clearAuthCache();
        throw AugmeterError.authentication(
          result.error || "Authentication failed",
          "Authentication failed. Please check your cookie and try again."
        );
      }

      progress.report({ message: "Loading your usage…" });
      this.statusBarManager.showLoading();
      await this.usageTracker.refreshNow?.();
      await this.statusBarManager.updateDisplay();
      UserNotificationService.showSuccess("Signed in to Augment");
    });
  }

  private async finalizeAuthenticatedSession(): Promise<void> {
    this.statusBarManager.showLoading();
    await this.usageTracker.refreshNow?.();
    await this.statusBarManager.updateDisplay();
    UserNotificationService.showSuccess("Signed in to Augment");
  }

  private async tryExistingCookieAndFinalize(apiClient: any): Promise<boolean> {
    return await UserNotificationService.withProgress("Augmeter", async progress => {
      progress.report({ message: "Signing in…" });
      const result = await apiClient.testConnection();
      if (result.success) {
        progress.report({ message: "Loading your usage…" });
        await this.finalizeAuthenticatedSession();
        return true;
      }
      await apiClient.clearSessionCookie();
      this.augmentDetector.clearAuthCache();
      return false;
    });
  }

  /**
   * Consistent sign-in flow: Open website, show manual input, and watch clipboard in parallel
   * Returns the first valid cookie from either manual input or clipboard detection
   */
  private async runConsistentSignInFlow(apiClient: any): Promise<string | null> {
    // Clear any existing authentication state before signing in
    await apiClient.clearSessionCookie?.();
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
            if (!apiClient) {
              throw AugmeterError.configuration(
                "API client not found",
                "Extension initialization error. Please restart VS Code."
              );
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
        }, "Sign in");
      })
    );

    // Open Augment website and then show cookie sign-in prompt
    disposables.push(
      vscode.commands.registerCommand("augmeter.openWebsiteAndSignIn", async () => {
        try {
          await this.withSignInLock(async () => {
            const apiClient = this.augmentDetector.getApiClient();
            if (!apiClient) {
              return;
            }

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
            if (!apiClient) {
              throw AugmeterError.configuration(
                "API client not found",
                "Extension initialization error. Please restart VS Code."
              );
            }

            // Step 1: Check stored cookie first
            if (apiClient.hasCookie()) {
              const ok = await this.tryExistingCookieAndFinalize(apiClient);
              if (ok) return;
            }

            // Step 2: Quick clipboard fast-path before opening website
            try {
              const clip = (await vscode.env.clipboard.readText())?.trim() || "";
              if (clip) {
                const normalized = SecureCookieUtils.normalizeCookieInput(clip);
                const sessionValue = SecureCookieUtils.extractSessionValue(normalized);
                const validation = SecureCookieUtils.validateCookieValue(sessionValue);
                if (validation.valid) {
                  await this.runSignInWithCookie(clip);
                  return;
                }
              }
            } catch {
              // ignore and proceed to full flow
            }

            // Step 3: If no valid clipboard cookie, run consistent flow
            // (Open website, show manual input, watch clipboard - all in parallel)
            const cookie = await this.runConsistentSignInFlow(apiClient);
            if (cookie) {
              await this.runSignInWithCookie(cookie);
            }
          });
        }, "Smart sign in");
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
      const apiClient = this.augmentDetector.getApiClient();
      if (apiClient) {
        await apiClient.clearSessionCookie?.();
      }

      // Clear any cached authentication status
      this.augmentDetector.clearAuthCache();

      // Properly await async operations to avoid race conditions
      await this.usageTracker.resetUsage();
      // Do NOT stop data fetching; keep the realDataFetcher attached
      this.usageTracker.clearRealDataFlag();

      // Ensure status bar updates after all state is cleared
      await this.statusBarManager.updateDisplay();
      // No success popup - status bar shows signed out state
    } catch (error) {
      SecureLogger.error("Sign out failed", error);
      // No error popup - fail silently
    }
  }
}
