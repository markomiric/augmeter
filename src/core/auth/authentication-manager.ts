import * as vscode from "vscode";
import { SecureSecretsManager } from "./secure-secrets-manager";
import { SecureCookieUtils } from "./cookie";
import { SecureLogger } from "../logging/secure-logger";
import { AugmeterError } from "../errors/augmeter-error";

/**
 * Manages authentication state and provides authentication headers
 * Handles cookie validation, storage, and retrieval
 */
export class AuthenticationManager {
  private sessionCookie: string | null = null;
  private secretsManager: SecureSecretsManager | null = null;

  constructor(context?: vscode.ExtensionContext) {
    if (context) {
      this.secretsManager = new SecureSecretsManager(context);
    }
  }

  /**
   * Initialize authentication from secure storage
   */
  async initializeFromSecrets(): Promise<void> {
    if (!this.secretsManager) {
      SecureLogger.warn("No secrets manager available for authentication initialization");
      return;
    }

    try {
      const storedCookie = await this.secretsManager.getSessionCookie();
      if (storedCookie) {
        this.sessionCookie = storedCookie;
        SecureLogger.info("Authentication initialized from secure storage");
      } else {
        SecureLogger.info("No stored authentication found");
      }
    } catch (error) {
      SecureLogger.error("Failed to initialize authentication from secure storage:", error);
      throw AugmeterError.storage(
        `Failed to load authentication: ${error}`,
        "Failed to load saved authentication. Please sign in again."
      );
    }
  }

  /**
   * Set session cookie with validation
   */
  setSessionCookie(input: string): void {
    const normalized = SecureCookieUtils.normalizeCookieInput(input);
    const sessionValue = SecureCookieUtils.extractSessionValue(normalized);
    const validation = SecureCookieUtils.validateCookieValue(sessionValue);

    if (!validation.valid) {
      throw AugmeterError.validation(
        `Cookie validation failed: ${validation.error}`,
        validation.error ||
          "Invalid session cookie format. Please copy the complete cookie value from your browser."
      );
    }

    this.sessionCookie = normalized;

    // Persist securely if available
    if (this.secretsManager) {
      this.secretsManager.setSessionCookie(normalized).catch(err => {
        // Log storage errors but don't throw - cookie is still set in memory
        SecureLogger.warn("Failed to save session cookie to secure storage:", err);
      });
    }

    SecureLogger.info("Session cookie set successfully");
  }

  /**
   * Clear session cookie
   */
  async clearSessionCookie(): Promise<void> {
    this.sessionCookie = null;

    if (this.secretsManager) {
      try {
        await this.secretsManager.clearSessionCookie();
        SecureLogger.info("Session cookie cleared from secure storage");
      } catch (error) {
        SecureLogger.warn("Failed to clear session cookie from secure storage:", error);
        // Don't throw - cookie is cleared from memory regardless
      }
    }

    SecureLogger.info("Session cookie cleared");
  }

  /**
   * Check if authenticated (has valid cookie)
   */
  isAuthenticated(): boolean {
    return this.sessionCookie !== null && this.sessionCookie.length > 0;
  }

  /**
   * Get authentication headers for HTTP requests
   */
  getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};

    if (this.sessionCookie) {
      headers["Cookie"] = this.sessionCookie;
    }

    return headers;
  }

  /**
   * Get session cookie (for debugging/testing)
   */
  getSessionCookie(): string | null {
    return this.sessionCookie;
  }

  /**
   * Validate current authentication
   * Returns true if we have a cookie that looks valid
   */
  validateCurrentAuth(): { valid: boolean; error?: string } {
    if (!this.sessionCookie) {
      return { valid: false, error: "No session cookie available" };
    }

    try {
      const sessionValue = SecureCookieUtils.extractSessionValue(this.sessionCookie);
      return SecureCookieUtils.validateCookieValue(sessionValue);
    } catch (error) {
      return { valid: false, error: `Cookie validation failed: ${error}` };
    }
  }

  /**
   * Get authentication status for display
   */
  getAuthStatus(): {
    authenticated: boolean;
    hasStoredAuth: boolean;
    cookieLength?: number;
    lastValidated?: Date;
  } {
    return {
      authenticated: this.isAuthenticated(),
      hasStoredAuth: this.secretsManager !== null,
      cookieLength: this.sessionCookie?.length,
      lastValidated: new Date(), // Could be enhanced to track actual validation time
    };
  }

  /**
   * Update API base URL for tenant-specific authentication
   */
  private apiBaseUrl: string = vscode.workspace
    .getConfiguration("augmeter")
    .get<string>("apiBaseUrl", "https://app.augmentcode.com/api");

  setApiBaseUrl(url: string): void {
    this.apiBaseUrl = url;
    SecureLogger.info(`API base URL updated to: ${url}`);
  }

  getApiBaseUrl(): string {
    return this.apiBaseUrl;
  }

  /**
   * Create authentication error with context
   */
  createAuthError(message: string, userMessage?: string): AugmeterError {
    return AugmeterError.authentication(
      `Authentication error: ${message}`,
      userMessage || "Authentication failed. Please sign in again."
    );
  }

  /**
   * Handle authentication errors consistently
   */
  handleAuthError(error: any, context: string): never {
    if (error instanceof AugmeterError) {
      throw error;
    }

    throw this.createAuthError(
      `${context}: ${error}`,
      "Authentication error occurred. Please try signing in again."
    );
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.sessionCookie = null;
    // Note: SecureSecretsManager doesn't need explicit disposal
    SecureLogger.info("Authentication manager disposed");
  }
}
