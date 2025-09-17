import * as vscode from "vscode";
import { SecureCookieUtils } from "./cookie";

// Secure secrets manager for handling authentication data
export class SecureSecretsManager {
  private context: vscode.ExtensionContext;
  private readonly SESSION_COOKIE_KEY = "augment.sessionCookie"; // stores normalized _session cookie string or JSON with metadata

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  async getSessionCookie(): Promise<string | undefined> {
    return await this.context.secrets.get(this.SESSION_COOKIE_KEY);
  }

  async setSessionCookie(cookie: string): Promise<void> {
    await this.context.secrets.store(this.SESSION_COOKIE_KEY, cookie);
  }

  async clearSessionCookie(): Promise<void> {
    await this.context.secrets.delete(this.SESSION_COOKIE_KEY);
  }

  async clearAll(): Promise<void> {
    await this.clearSessionCookie();
  }

  // Migration helper: move data from workspace config to secrets
  async migrateFromWorkspaceConfig(): Promise<void> {
    const config = vscode.workspace.getConfiguration();

    // Clean up old token-based config if present
    if (config.get<string>("augment.authToken")) {
      await config.update("augment.authToken", undefined, vscode.ConfigurationTarget.Global);
    }

    // Migrate any legacy cookie config (augment.cookies)
    const existingCookies = config.get<string>("augment.cookies");
    if (existingCookies && existingCookies.trim()) {
      // Normalize and store
      const normalized = SecureCookieUtils.normalizeCookieInput(existingCookies.trim());
      await this.setSessionCookie(normalized);
      await config.update("augment.cookies", undefined, vscode.ConfigurationTarget.Global);
    }
  }
}
