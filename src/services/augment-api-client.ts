/**
 * ABOUTME: This file contains the API client for communicating with Augment's backend services,
 * handling authentication, request retries, response parsing, caching, and secure cookie storage.
 */
import * as vscode from "vscode";
import { HttpClient, type HttpResponse } from "../core/http/http-client";
import { RetryHandler } from "../core/http/retry-handler";
import { type AugmentApiResponse, type AugmentUsageData } from "../core/types/augment";
import { SecureSecretsManager } from "../core/auth/secure-secrets-manager";
import { SecureCookieUtils } from "../core/auth/cookie";
import { SecureLogger } from "../core/logging/secure-logger";
import { AugmeterError } from "../core/errors/augmeter-error";

/**
 * Client for interacting with Augment's API.
 *
 * This client provides:
 * - Cookie-based authentication with secure storage
 * - Automatic request retries with exponential backoff
 * - Response caching to reduce network traffic
 * - Request deduplication to prevent concurrent identical requests
 * - Comprehensive error handling and logging
 *
 * @example
 * ```typescript
 * const client = new AugmentApiClient(context);
 * await client.initializeFromSecrets();
 *
 * // Fetch usage data
 * const response = await client.getUsageData();
 * if (response.success) {
 *   const usage = await client.parseUsageResponse(response);
 * }
 * ```
 */
export class AugmentApiClient {
  private readonly DEFAULT_API_BASE_URL = "https://app.augmentcode.com/api";
  private sessionCookie: string | null = null; // normalized like `_session=abc...`
  private secretsManager: SecureSecretsManager | null = null;
  private apiBaseUrl: string = this.DEFAULT_API_BASE_URL;
  private inFlightRequests: Map<string, Promise<AugmentApiResponse>> = new Map();
  private http: HttpClient = new HttpClient();
  private retry: RetryHandler = new RetryHandler();

  constructor(context?: vscode.ExtensionContext) {
    // Load API base URL from configuration (centralized configuration)
    try {
      const cfg = vscode.workspace.getConfiguration("augmeter");
      const configured = cfg.get<string>("apiBaseUrl", this.DEFAULT_API_BASE_URL);
      this.apiBaseUrl = configured || this.DEFAULT_API_BASE_URL;
    } catch {
      this.apiBaseUrl = this.DEFAULT_API_BASE_URL;
    }

    if (context) {
      this.secretsManager = new SecureSecretsManager(context);
      void this.initializeFromSecrets();
    }
  }

  /**
   * Initialize the API client from secure storage.
   *
   * Loads the session cookie from VS Code Secrets API if available,
   * validates it, and sets up authentication for subsequent requests.
   * Also performs migration from old workspace storage if needed.
   *
   * @throws {AugmeterError} When cookie validation fails
   */
  async initializeFromSecrets(): Promise<void> {
    if (!this.secretsManager) return;

    try {
      // Perform migration first if needed
      await this.secretsManager.migrateFromWorkspaceConfig();

      // Load session cookie from secure storage
      const stored = await this.secretsManager.getSessionCookie();
      if (stored && stored.trim()) {
        const normalized = SecureCookieUtils.normalizeCookieInput(stored.trim());
        const sessionValue = SecureCookieUtils.extractSessionValue(normalized);
        const validation = SecureCookieUtils.validateCookieValue(sessionValue);
        if (validation.valid) {
          this.setSessionCookie(normalized);
        } else {
          SecureLogger.warn("Ignoring invalid stored _session cookie:", validation.error);
          await this.clearSessionCookie();
        }
      }
    } catch (error) {
      SecureLogger.error("Failed to initialize from secure storage:", error);
    }
  }

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
  }

  // Helper to make a request against an explicit base URL (without mutating apiBaseUrl)
  private async makeRequestWithBase(
    baseUrl: string,
    endpoint: string,
    options: RequestInit = {}
  ): Promise<AugmentApiResponse> {
    const method = (options.method || "GET").toString();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    };
    if (this.sessionCookie) {
      headers["Cookie"] = this.sessionCookie;
    }

    const op = async (): Promise<HttpResponse> => {
      return this.http.makeRequest(endpoint, {
        baseUrl,
        method: method as any,
        headers,
        body: options.body as any,
      });
    };

    const response = await this.retry.executeHttpWithRetry(
      op,
      `API ${method} ${baseUrl}${endpoint}`
    );

    // Handle 401: clear cookie and return UNAUTHENTICATED
    if (response.status === 401) {
      SecureLogger.warn("Authentication failed - cookie may be invalid or expired");
      await this.clearSessionCookie();
      this.sessionCookie = null;
      return {
        success: false,
        error: "Authentication failed - cookie expired or invalid",
        code: "UNAUTHENTICATED",
        status: 401,
      };
    }

    if (!response.success) {
      const status = response.status;
      const retriable = status === 429 || (!!status && status >= 500 && status <= 599);
      return {
        success: false,
        error: response.error || `API request failed: ${status}`,
        status,
        code: retriable ? "RETRIABLE" : undefined,
      };
    }

    return { success: true, data: response.data, status: response.status };
  }

  private getRequestKey(baseUrl: string, endpoint: string, method: string = "GET"): string {
    return `${baseUrl}|${method}|${endpoint}`;
  }

  private async fetchWithSingleFlight(
    endpoint: string,
    baseUrl: string,
    options: RequestInit = {}
  ): Promise<AugmentApiResponse> {
    const method = (options.method || "GET").toString();
    const key = this.getRequestKey(baseUrl, endpoint, method);
    const existing = this.inFlightRequests.get(key);
    if (existing) return existing;

    const promise = this.makeRequestWithBase(baseUrl, endpoint, options).finally(() => {
      this.inFlightRequests.delete(key);
    });

    this.inFlightRequests.set(key, promise);
    return promise;
  }

  private async makeRequest(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<AugmentApiResponse> {
    return this.makeRequestWithBase(this.apiBaseUrl, endpoint, options);
  }

  async checkHealth(): Promise<AugmentApiResponse> {
    try {
      // Use the credits endpoint for health check since /health doesn't exist
      const response = await this.makeRequest("/credits");

      if (response.success) {
        return {
          success: true,
          data: { status: "healthy", creditsEndpointWorking: true },
        };
      }
      return {
        success: false,
        error: "API health check failed",
      };
    } catch (error) {
      SecureLogger.error("Health check failed:", error);
      return {
        success: false,
        error: `Health check failed: ${error}`,
      };
    }
  }

  async getUserInfo(): Promise<AugmentApiResponse> {
    return await this.makeRequest("/user");
  }

  async getUsageData(): Promise<AugmentApiResponse> {
    if (!this.hasCookie()) {
      return { success: false, error: "Not authenticated", code: "UNAUTHENTICATED" };
    }

    // Try tenant base first (single-flight)
    const tenantResp = await this.fetchWithSingleFlight("/credits", this.apiBaseUrl);
    if (tenantResp.success) return tenantResp;

    // If unauthenticated, do not attempt fallback
    if (tenantResp.code === "UNAUTHENTICATED") {
      return tenantResp;
    }

    // If not available on tenant, try shared app base with the same cookie (single-flight)
    return await this.fetchWithSingleFlight("/credits", this.DEFAULT_API_BASE_URL);
  }

  async getCreditsInfo(): Promise<AugmentApiResponse> {
    return await this.fetchWithSingleFlight("/credits", this.apiBaseUrl);
  }

  async parseUsageResponse(response: AugmentApiResponse): Promise<AugmentUsageData | null> {
    try {
      const { parseUsageResponsePure } = await import("./usage-parsing.js");
      return parseUsageResponsePure(response);
    } catch (error) {
      SecureLogger.error("Error parsing usage response", error);
      return null;
    }
  }

  async testConnection(): Promise<AugmentApiResponse> {
    // Use health check as the primary connection test
    const healthCheck = await this.checkHealth();
    if (healthCheck.success) {
      return {
        success: true,
        data: {
          status: "connected",
          message: "Authentication and connection successful",
          healthCheck: healthCheck.data,
        },
      };
    }

    return healthCheck;
  }

  hasCookie(): boolean {
    return this.sessionCookie !== null && this.sessionCookie.length > 0;
  }

  hasAnyAuth(): boolean {
    return this.hasCookie();
  }

  async clearSessionCookie(): Promise<void> {
    this.sessionCookie = null;

    if (this.secretsManager) {
      try {
        await this.secretsManager.clearSessionCookie();
      } catch (error) {
        SecureLogger.warn("Failed to clear session cookie from secure storage:", error);
      }
    }
  }

  async clearAllAuth(): Promise<void> {
    if (this.secretsManager) {
      try {
        await this.secretsManager.clearAll();
        this.sessionCookie = null;
      } catch (error) {
        SecureLogger.warn("Failed to clear all auth from secure storage:", error);
        // Fallback to individual clear
        await this.clearSessionCookie();
      }
    } else {
      await this.clearSessionCookie();
    }
  }
}
