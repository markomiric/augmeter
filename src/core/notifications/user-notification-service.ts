import * as vscode from "vscode";
import { SecureLogger } from "../logging/secure-logger";

/**
 * Centralized service for user notifications with consistent UX patterns
 * Replaces silent failures with actionable user feedback
 */
export class UserNotificationService {
  private static readonly NOTIFICATION_TIMEOUT = 5000; // 5 seconds

  /**
   * Show an error message with optional actionable button
   */
  static async showError(
    message: string,
    actionable?: { text: string; action: () => void | Promise<void> }
  ): Promise<void> {
    SecureLogger.warn(`User notification (error): ${message}`);

    if (actionable) {
      const selection = await vscode.window.showErrorMessage(message, actionable.text);
      if (selection === actionable.text) {
        try {
          await actionable.action();
        } catch (error) {
          SecureLogger.error("Error executing notification action", error);
          vscode.window.showErrorMessage("Failed to execute action. Please try again.");
        }
      }
    } else {
      vscode.window.showErrorMessage(message);
    }
  }

  /**
   * Show a warning message with optional actionable button
   */
  static async showWarning(
    message: string,
    actionable?: { text: string; action: () => void | Promise<void> }
  ): Promise<void> {
    SecureLogger.info(`User notification (warning): ${message}`);

    if (actionable) {
      const selection = await vscode.window.showWarningMessage(message, actionable.text);
      if (selection === actionable.text) {
        try {
          await actionable.action();
        } catch (error) {
          SecureLogger.error("Error executing notification action", error);
          vscode.window.showErrorMessage("Failed to execute action. Please try again.");
        }
      }
    } else {
      vscode.window.showWarningMessage(message);
    }
  }

  /**
   * Show an information message with optional actionable button
   */
  static async showInfo(
    message: string,
    actionable?: { text: string; action: () => void | Promise<void> }
  ): Promise<void> {
    SecureLogger.info(`User notification (info): ${message}`);

    if (actionable) {
      const selection = await vscode.window.showInformationMessage(message, actionable.text);
      if (selection === actionable.text) {
        try {
          await actionable.action();
        } catch (error) {
          SecureLogger.error("Error executing notification action", error);
          vscode.window.showErrorMessage("Failed to execute action. Please try again.");
        }
      }
    } else {
      vscode.window.showInformationMessage(message);
    }
  }

  /**
   * Show authentication-specific error with sign-in action
   */
  static async showAuthError(userMessage?: string): Promise<void> {
    const message = userMessage || "Authentication failed. Please sign in to continue.";

    await this.showError(message, {
      text: "Sign In",
      action: async () => await vscode.commands.executeCommand("augmeter.signIn"),
    });
  }

  /**
   * Show network error with retry action
   */
  static async showNetworkError(
    userMessage?: string,
    retryAction?: () => void | Promise<void>
  ): Promise<void> {
    const message =
      userMessage || "Network error occurred. Please check your connection and try again.";

    if (retryAction) {
      await this.showError(message, {
        text: "Retry",
        action: retryAction,
      });
    } else {
      await this.showError(message);
    }
  }

  /**
   * Show configuration error with settings action
   */
  static async showConfigError(userMessage?: string): Promise<void> {
    const message = userMessage || "Configuration error. Please check your settings.";

    await this.showError(message, {
      text: "Open Settings",
      action: async () => await vscode.commands.executeCommand("augmeter.openSettings"),
    });
  }

  /**
   * Show success message (brief, non-intrusive)
   */
  static showSuccess(message: string): void {
    SecureLogger.info(`User notification (success): ${message}`);

    // Use status bar message for success (less intrusive than popup)
    vscode.window.setStatusBarMessage(`✅ ${message}`, this.NOTIFICATION_TIMEOUT);
  }

  /**
   * Show progress notification for long-running operations
   */
  static async withProgress<T>(
    title: string,
    task: (progress: vscode.Progress<{ message?: string; increment?: number }>) => Promise<T>
  ): Promise<T> {
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title,
        cancellable: false,
      },
      task
    );
  }

  /**
   * Show cancellable progress notification
   */
  static async withCancellableProgress<T>(
    title: string,
    task: (
      progress: vscode.Progress<{ message?: string; increment?: number }>,
      token: vscode.CancellationToken
    ) => Promise<T>
  ): Promise<T> {
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title,
        cancellable: true,
      },
      task
    );
  }

  /**
   * Ask user for confirmation with custom buttons
   */
  static async askConfirmation(
    message: string,
    confirmText: string = "Yes",
    cancelText: string = "No"
  ): Promise<boolean> {
    const selection = await vscode.window.showWarningMessage(
      message,
      { modal: true },
      confirmText,
      cancelText
    );

    return selection === confirmText;
  }

  /**
   * Show input prompt with validation
   */
  static async promptInput(
    title: string,
    prompt: string,
    placeholder?: string,
    validator?: (value: string) => string | null
  ): Promise<string | null> {
    const input = await vscode.window.showInputBox({
      title,
      prompt,
      placeHolder: placeholder,
      ignoreFocusOut: true,
      validateInput: validator,
    });

    return input || null;
  }

  /**
   * Show quick pick selection
   */
  static async showQuickPick<T extends vscode.QuickPickItem>(
    items: T[],
    options: {
      title?: string;
      placeholder?: string;
      canPickMany?: boolean;
    } = {}
  ): Promise<T | T[] | undefined> {
    return vscode.window.showQuickPick(items, {
      title: options.title,
      placeHolder: options.placeholder,
      canPickMany: options.canPickMany,
      ignoreFocusOut: true,
    });
  }
}
