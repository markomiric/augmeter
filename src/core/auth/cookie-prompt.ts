import * as vscode from "vscode";
import { SecureCookieUtils } from "./cookie";

export class CookiePrompt {
  static async promptForSessionCookie(
    cancellationToken?: vscode.CancellationToken
  ): Promise<string | null> {
    // Directly show a single input box — no instructional modals
    const input = await vscode.window.showInputBox(
      {
        title: "Augmeter — Paste Session Cookie",
        prompt:
          "Tip: In your browser, open app.augmentcode.com and sign in. Then DevTools → Application/Storage → Cookies → app.augmentcode.com → copy VALUE of _session. Help: https://app.augmentcode.com",
        placeHolder: "Paste the session cookie value here",
        password: true,
        ignoreFocusOut: true,
        validateInput: value => {
          if (!value || value.trim().length === 0) {
            return "Cookie value cannot be empty";
          }
          const normalized = SecureCookieUtils.normalizeCookieInput(value);
          const sessionValue = SecureCookieUtils.extractSessionValue(normalized);
          const validation = SecureCookieUtils.validateCookieValue(sessionValue);
          if (!validation.valid) {
            return validation.error || "Invalid cookie value";
          }
          return null;
        },
      },
      cancellationToken
    );

    return input ? input.trim() : null;
  }
}
