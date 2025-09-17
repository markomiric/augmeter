import * as vscode from "vscode";
import { SecureCookieUtils } from "./cookie";
import { SecureLogger } from "../logging/secure-logger";

export interface ClipboardWatchResult {
  cookie: string | null;
}

/**
 * Polls the clipboard for a valid _session cookie value.
 * - Accepts raw value, Cookie header, or curl snippets; normalization is applied.
 * - Shows cancellable progress with a friendly message.
 */
export async function watchClipboardForCookie(
  timeoutMs: number = 120_000,
  pollIntervalMs: number = 1_000
): Promise<ClipboardWatchResult> {
  const started = Date.now();
  let lastText = "";

  return await vscode.window.withProgress<ClipboardWatchResult>(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Waiting for _session cookie...",
      cancellable: true,
    },
    async (progress, token) => {
      progress.report({
        message: "Copy the _session cookie from Augment (we'll detect it automatically)",
      });

      while (Date.now() - started < timeoutMs) {
        if (token.isCancellationRequested) {
          SecureLogger.info("Clipboard cookie watch cancelled by user");
          return { cookie: null };
        }

        try {
          const text = (await vscode.env.clipboard.readText())?.trim() || "";
          if (text && text !== lastText) {
            lastText = text;
            const normalized = SecureCookieUtils.normalizeCookieInput(text);
            const sessionValue = SecureCookieUtils.extractSessionValue(normalized);
            const validation = SecureCookieUtils.validateCookieValue(sessionValue);
            if (validation.valid) {
              const masked = sessionValue.slice(0, 4) + "…" + sessionValue.slice(-4);
              SecureLogger.info("Detected _session cookie from clipboard (masked)", { masked });
              return { cookie: text };
            }
          }
        } catch (err) {
          SecureLogger.warn("Clipboard read failed while watching for cookie", err);
        }

        await new Promise(res => setTimeout(res, pollIntervalMs));
      }

      return { cookie: null };
    }
  );
}
