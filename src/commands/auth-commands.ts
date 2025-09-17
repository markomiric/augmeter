import * as vscode from "vscode";
import { AugmentDetector } from "../services/augment-detector";
import { UsageTracker } from "../features/usage/usage-tracker";
import { StatusBarManager } from "../ui/status-bar";
import { SecureLogger } from "../core/logging/secure-logger";

import { UserNotificationService } from "../core/notifications/user-notification-service";
import { ErrorHandler, AugmeterError } from "../core/errors/augmeter-error";

export class AuthCommands {
  private signInInProgress = false;

  constructor(
    private augmentDetector: AugmentDetector,
    private usageTracker: UsageTracker,
    private statusBarManager: StatusBarManager,
    private configManager: import("../core/config/config-manager").ConfigManager
  ) {}

  registerCommands(): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    // Sign in using cookie input
    disposables.push(
      vscode.commands.registerCommand("augmeter.signIn", async () => {
        await ErrorHandler.withErrorHandling(async () => {
          if (this.signInInProgress) {
            UserNotificationService.showInfo("Sign-in already in progress");
            return;
          }
          this.signInInProgress = true;

          const apiClient = this.augmentDetector.getApiClient();
          if (!apiClient) {
            this.signInInProgress = false;
            throw AugmeterError.configuration(
              "API client not found",
              "Extension initialization error. Please restart VS Code."
            );
          }

          // Clear any existing authentication state before signing in
          await apiClient.clearSessionCookie();
          this.augmentDetector.clearAuthCache();

          await vscode.commands.executeCommand(
            "vscode.open",
            vscode.Uri.parse("https://app.augmentcode.com")
          );

          const { watchClipboardForCookie } = await import("../core/auth/clipboard-cookie-watcher");
          const detected = await watchClipboardForCookie();
          const cookieInput: string | null = detected.cookie;
          if (!cookieInput) {
            // Auto-detect timed out or was cancelled
            return;
          }

          try {
            apiClient.setSessionCookie(cookieInput);
          } catch (error) {
            throw AugmeterError.validation(
              `Cookie validation failed: ${error}`,
              "Invalid cookie format. Please copy the complete session cookie value from your browser."
            );
          }

          // Validate cookie with user feedback
          await UserNotificationService.withProgress("Signing in...", async progress => {
            progress.report({ message: "Validating authentication..." });

            const result = await apiClient.testConnection();
            if (result.success) {
              progress.report({ message: "Fetching usage data..." });

              // Show loading while we fetch real usage data immediately
              this.statusBarManager.showLoading();
              // Trigger immediate fetch (do not wait for interval)
              await this.usageTracker.refreshNow?.();
              // Update status bar after fetch
              this.statusBarManager.updateDisplay();

              UserNotificationService.showSuccess("Successfully signed in to Augment");
            } else {
              throw AugmeterError.authentication(
                `Cookie validation failed: ${result.error || "Unknown error"}`,
                "Authentication failed. Please check your cookie and try again."
              );
            }
          }).finally(() => {
            this.signInInProgress = false;
          });
        }, "Sign in");
      })
    );

    // Open Augment website and then show cookie sign-in prompt
    disposables.push(
      vscode.commands.registerCommand("augmeter.openWebsiteAndSignIn", async () => {
        try {
          if (this.signInInProgress) {
            UserNotificationService.showInfo("Sign-in already in progress");
            return;
          }
          this.signInInProgress = true;

          const apiClient = this.augmentDetector.getApiClient();
          if (!apiClient) {
            this.signInInProgress = false;
            return;
          }

          // Clear any existing authentication state before signing in
          await apiClient.clearSessionCookie();
          this.augmentDetector.clearAuthCache();

          await vscode.commands.executeCommand(
            "vscode.open",
            vscode.Uri.parse("https://app.augmentcode.com")
          );

          const { watchClipboardForCookie } = await import("../core/auth/clipboard-cookie-watcher");
          const detected = await watchClipboardForCookie();

          const cookieInput: string | null = detected.cookie;
          if (!cookieInput) return;

          // Proceed same as main sign-in
          try {
            apiClient.setSessionCookie(cookieInput);
          } catch (error) {
            throw AugmeterError.validation(
              `Cookie validation failed: ${error}`,
              "Invalid cookie format. Please copy the complete session cookie value from your browser."
            );
          }

          await UserNotificationService.withProgress("Signing in...", async progress => {
            progress.report({ message: "Validating authentication..." });
            const result = await apiClient.testConnection();
            if (result.success) {
              progress.report({ message: "Fetching usage data..." });
              this.statusBarManager.showLoading();
              await this.usageTracker.refreshNow?.();
              this.statusBarManager.updateDisplay();
              UserNotificationService.showSuccess("Successfully signed in to Augment");
            } else {
              throw AugmeterError.authentication(
                `Cookie validation failed: ${result.error || "Unknown error"}`,
                "Authentication failed. Please check your cookie and try again."
              );
            }
          });
        } catch (error) {
          SecureLogger.error("Open website and sign-in flow failed", error);
        }
      })
    );

    // Smart sign-in: try clipboard first, quick-watch, then fall back to website
    disposables.push(
      vscode.commands.registerCommand("augmeter.smartSignIn", async () => {
        await ErrorHandler.withErrorHandling(async () => {
          if (this.signInInProgress) {
            UserNotificationService.showInfo("Sign-in already in progress");
            return;
          }
          this.signInInProgress = true;

          const apiClient = this.augmentDetector.getApiClient();
          if (!apiClient) {
            this.signInInProgress = false;
            throw AugmeterError.configuration(
              "API client not found",
              "Extension initialization error. Please restart VS Code."
            );
          }

          // 1) Quick clipboard check (no long watch)
          let cookieInput: string | null = null;
          try {
            const text = (await vscode.env.clipboard.readText())?.trim();
            if (text) {
              const { SecureCookieUtils } = await import("../core/auth/cookie");
              const normalized = SecureCookieUtils.normalizeCookieInput(text);
              const sessionValue = SecureCookieUtils.extractSessionValue(normalized);
              const validation = SecureCookieUtils.validateCookieValue(sessionValue);
              if (validation.valid) {
                cookieInput = text;
              }
            }
          } catch {
            // ignore clipboard errors and fall back
          }

          // Helper to attempt automatic sign-in given a cookie string
          const tryAutomaticSignIn = async (cookie: string): Promise<boolean> => {
            try {
              apiClient.setSessionCookie(cookie);
              await UserNotificationService.withProgress("Signing in...", async progress => {
                progress.report({ message: "Validating authentication..." });
                const result = await apiClient.testConnection();
                if (!result.success) {
                  await apiClient.clearSessionCookie();
                  this.augmentDetector.clearAuthCache();
                  throw AugmeterError.authentication(
                    result.error || "Authentication failed",
                    "Automatic sign-in failed. We'll open the website to finish signing in."
                  );
                }

                progress.report({ message: "Fetching usage data..." });
                this.statusBarManager.showLoading();
                await this.usageTracker.refreshNow?.();
                await this.statusBarManager.updateDisplay();
                UserNotificationService.showSuccess("Successfully signed in to Augment");
              });
              return true;
            } catch {
              return false;
            }
          };

          // 2) If valid cookie in clipboard, try automatic sign-in
          if (cookieInput) {
            const ok = await tryAutomaticSignIn(cookieInput);
            if (ok) return;
          } else {
            // 2b) Quick clipboard watch (short) before falling back to website
            try {
              const { watchClipboardForCookie } = await import(
                "../core/auth/clipboard-cookie-watcher"
              );
              const quickMs = this.configManager?.getSmartSignInQuickWatchMs?.() ?? 2000;
              const quick = await watchClipboardForCookie(quickMs, 300);
              if (quick.cookie) {
                const ok = await tryAutomaticSignIn(quick.cookie);
                if (ok) return;
              }
            } catch {
              // ignore and fall back
            }
          }

          // 3) Fallback: delegate to existing website + clipboard watch flow
          await vscode.commands.executeCommand("augmeter.openWebsiteAndSignIn");
          return;
        }, "Smart sign in").finally(() => {
          this.signInInProgress = false;
        });
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
