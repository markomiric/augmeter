import * as vscode from "vscode";
import { SecureCookieUtils } from "./cookie";

/**
 * Guided sign-in flow with a short QuickPick entry step and resilient input handling.
 * - Optimizes for clipboard paste
 * - Minimal choices to reduce friction
 * - Provides a manual input path with inline validation
 */
export class SignInFlow {
  static async start(): Promise<string | null> {
    // Fast path: attempt to use clipboard immediately if it looks valid
    try {
      const clip = (await vscode.env.clipboard.readText())?.trim();
      if (clip) {
        const normalized = SecureCookieUtils.normalizeCookieInput(clip);
        const sessionValue = SecureCookieUtils.extractSessionValue(normalized);
        const validation = SecureCookieUtils.validateCookieValue(sessionValue);
        if (validation.valid) {
          return clip;
        }
      }
    } catch {
      // Ignore clipboard errors and fall back to picker
    }

    // Allow a couple of retries to switch between clipboard and manual
    for (let i = 0; i < 3; i++) {
      const choice = await vscode.window.showQuickPick(
        [
          { label: "Use Cookie from Clipboard", id: "clipboard" },
          { label: "Enter Cookie Manually", id: "manual" },
          { label: "Open Augment Website (auto-detect from clipboard)", id: "openAndDetect" },
        ],
        {
          title: "Sign in to Augment",
          placeHolder: "We can auto-detect your _session cookie from the clipboard",
          ignoreFocusOut: true,
        }
      );

      if (!choice) return null; // user cancelled

      if (choice.id === "openAndDetect") {
        try {
          await vscode.commands.executeCommand(
            "vscode.open",
            vscode.Uri.parse("https://app.augmentcode.com")
          );
        } catch {
          // best-effort open
        }
        const { watchClipboardForCookie } = await import("./clipboard-cookie-watcher");
        const result = await watchClipboardForCookie();
        if (result.cookie) return result.cookie;
        const retry = await vscode.window.showInformationMessage(
          "We couldn't detect the cookie automatically. Paste from clipboard or enter manually.",
          "Use Clipboard",
          "Enter Manually"
        );
        if (retry === "Use Clipboard") {
          // fall through to clipboard path after this block
        } else if (retry === "Enter Manually") {
          // fall through to manual path after this block
        }
      }

      if (choice.id === "clipboard") {
        const text = (await vscode.env.clipboard.readText())?.trim();
        if (!text) {
          await vscode.window.showWarningMessage(
            "Clipboard is empty. Try copying the _session value, or use manual entry."
          );
          continue;
        }
        const normalized = SecureCookieUtils.normalizeCookieInput(text);
        const sessionValue = SecureCookieUtils.extractSessionValue(normalized);
        const validation = SecureCookieUtils.validateCookieValue(sessionValue);
        if (validation.valid) {
          return text; // apiClient will normalize again; returning raw is fine
        }
        await vscode.window.showWarningMessage(
          validation.error || "Clipboard content doesn't look like a valid _session value."
        );
        // fall through to manual input after warning
      }

      // Manual input path
      const input = await vscode.window.showInputBox({
        title: "Enter _session cookie value",
        placeHolder: "Paste the _session value (e.g., eyJ...)",
        password: true,
        ignoreFocusOut: true,
        validateInput: value => {
          if (!value || value.trim().length === 0) {
            return "Cookie value cannot be empty";
          }
          const normalized = SecureCookieUtils.normalizeCookieInput(value);
          const sessionValue = SecureCookieUtils.extractSessionValue(normalized);
          const validation = SecureCookieUtils.validateCookieValue(sessionValue);
          return validation.valid ? null : validation.error || "Invalid cookie value";
        },
      });

      if (input) {
        return input.trim();
      }

      // User dismissed manual input; go back to picker for convenience
    }

    return null;
  }
}
