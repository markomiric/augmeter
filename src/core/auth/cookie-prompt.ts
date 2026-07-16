import * as vscode from "vscode";
import { SecureCookieUtils } from "./cookie";

export class CookiePrompt {
  static async promptForSessionCookie(
    cancellationToken?: vscode.CancellationToken
  ): Promise<string | null> {
    // Directly show a single input box with the minimum guidance needed.
    const input = await vscode.window.showInputBox(
      {
        title: "Paste your Augment session cookie",
        prompt:
          "In app.augmentcode.com, copy the value of the _session cookie. Augmeter stores it in VS Code SecretStorage.",
        placeHolder: "Paste the _session value",
        password: true,
        ignoreFocusOut: true,
        validateInput: value => {
          if (!value || value.trim().length === 0) {
            return "Paste the _session cookie value.";
          }
          const normalized = SecureCookieUtils.normalizeCookieInput(value);
          const sessionValue = SecureCookieUtils.extractSessionValue(normalized);
          const validation = SecureCookieUtils.validateCookieValue(sessionValue);
          if (!validation.valid) {
            return validation.error || "That cookie value isn't valid.";
          }
          return null;
        },
      },
      cancellationToken
    );

    return input ? input.trim() : null;
  }
}
