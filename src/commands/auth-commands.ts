import * as vscode from "vscode";
import { AugmentDetector } from "../services/augment-detector";
import { UsageTracker } from "../features/usage/usage-tracker";
import { StatusBarManager } from "../ui/status-bar";
import { SecureLogger } from "../core/logging/secure-logger";

import { UserNotificationService } from "../core/notifications/user-notification-service";
import { ErrorHandler, AugmeterError } from "../core/errors/augmeter-error";

export class AuthCommands {
  constructor(
    private augmentDetector: AugmentDetector,
    private usageTracker: UsageTracker,
    private statusBarManager: StatusBarManager
  ) {}

  registerCommands(): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    // Sign in using cookie input
    disposables.push(
      vscode.commands.registerCommand("augmeter.signIn", async () => {
        await ErrorHandler.withErrorHandling(async () => {
          const apiClient = this.augmentDetector.getApiClient();
          if (!apiClient) {
            throw AugmeterError.configuration(
              "API client not found",
              "Extension initialization error. Please restart VS Code."
            );
          }

          await apiClient.initializeFromSecrets?.();

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
          });
        }, "Sign in");
      })
    );

    // Open Augment website and then show cookie sign-in prompt
    disposables.push(
      vscode.commands.registerCommand("augmeter.openWebsiteAndSignIn", async () => {
        try {
          const apiClient = this.augmentDetector.getApiClient();
          await vscode.commands.executeCommand(
            "vscode.open",
            vscode.Uri.parse("https://app.augmentcode.com")
          );

          const { watchClipboardForCookie } = await import("../core/auth/clipboard-cookie-watcher");
          const detected = await watchClipboardForCookie();

          const cookieInput: string | null = detected.cookie;
          if (!cookieInput || !apiClient) return;

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
      this.usageTracker.resetUsage();
      this.usageTracker.stopDataFetching();
      this.statusBarManager.updateDisplay();
      // No success popup - status bar shows signed out state
    } catch (error) {
      SecureLogger.error("Sign out failed", error);
      // No error popup - fail silently
    }
  }
}
