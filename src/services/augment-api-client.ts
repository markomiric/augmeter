/**
 * ABOUTME: This file contains the API client for communicating with Augment's backend services,
 * handling authentication, request retries, response parsing, caching, and secure cookie storage.
 */
import type * as vscode from "vscode";
import type { AugmentApiResponse, AugmentUsageData } from "../core/types/augment";
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
  private secretsInit: Promise<void> | null = null;
  private inFlightRequests: Map<string, Promise<AugmentApiResponse>> = new Map();
  private requestGeneration = 0;
  private readonly resolveApiBaseUrl: () => string;
  private readonly fetchImpl: typeof fetch;

  constructor(
    context?: vscode.ExtensionContext,
    resolveApiBaseUrl?: () => string,
    fetchImpl: typeof fetch = fetch
  ) {
    this.resolveApiBaseUrl = resolveApiBaseUrl ?? (() => this.DEFAULT_API_BASE_URL);
    this.fetchImpl = fetchImpl;
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
   * Memoized: the migration + cookie read runs at most once per client. The
   * constructor kicks this off eagerly and the bootstrap awaits it again; both
   * share the same in-flight promise so SecretStorage I/O is not duplicated and
   * the two callers cannot race.
   *
   * @throws {AugmeterError} When cookie validation fails
   */
  async initializeFromSecrets(): Promise<void> {
    if (!this.secretsManager) return;
    this.secretsInit ??= this.loadFromSecrets();
    return this.secretsInit;
  }

  private async loadFromSecrets(): Promise<void> {
    if (!this.secretsManager) return;

    try {
      // Perform migration first if needed
      await this.secretsManager.migrateFromWorkspaceConfig();

      await this.refreshSessionFromSecrets();
    } catch (error) {
      SecureLogger.error("Failed to initialize from secure storage:", error);
    }
  }

  async refreshSessionFromSecrets(): Promise<void> {
    if (!this.secretsManager) return;

    const stored = await this.secretsManager.getSessionCookie();
    if (!stored || !stored.trim()) {
      if (this.sessionCookie !== null) {
        this.invalidateInFlightRequests();
        this.sessionCookie = null;
      }
      return;
    }

    const normalized = SecureCookieUtils.normalizeCookieInput(stored.trim());
    const sessionValue = SecureCookieUtils.extractSessionValue(normalized);
    const validation = SecureCookieUtils.validateCookieValue(sessionValue);
    if (validation.valid) {
      if (this.sessionCookie !== normalized) {
        this.invalidateInFlightRequests();
      }
      this.sessionCookie = normalized;
      return;
    }

    SecureLogger.warn("Ignoring invalid stored _session cookie:", validation.error);
    await this.clearSessionCookie();
  }

  setSessionCookie(input: string): void {
    const normalized = SecureCookieUtils.normalizeCookieInput(input);
    const sessionValue = SecureCookieUtils.extractSessionValue(normalized);
    const validation = SecureCookieUtils.validateCookieValue(sessionValue);
    if (!validation.valid) {
      throw AugmeterError.validation(
        `Cookie validation failed: ${validation.error}`,
        validation.error ||
          "That cookie value isn't valid. Copy the complete _session value and try again."
      );
    }

    if (this.sessionCookie !== normalized) {
      this.invalidateInFlightRequests();
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
    const requestGeneration = this.requestGeneration;
    const method = typeof options.method === "string" ? options.method : "GET";
    const headers = this.normalizeHeaders(options.headers);
    if (this.sessionCookie) {
      headers["Cookie"] = this.sessionCookie;
    }

    const requestOptions: RequestInit = { method, headers };
    if (options.body !== undefined) {
      requestOptions.body = options.body;
    }
    const response = await this.requestWithRetry(`${baseUrl}${endpoint}`, requestOptions);

    if (requestGeneration !== this.requestGeneration) {
      return {
        success: false,
        error: "Request discarded after the Augment connection changed.",
        code: "STALE",
      };
    }

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

  private async requestWithRetry(
    url: string,
    options: RequestInit
  ): Promise<{ success: boolean; status?: number; data?: unknown; error?: string }> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await this.fetchImpl(url, {
          ...options,
          signal: AbortSignal.timeout(30000),
        });
        const data = await this.parseResponseBody(response);
        const error = response.ok ? undefined : this.responseError(data, response);
        const result = {
          success: response.ok,
          status: response.status,
          data,
          ...(error ? { error } : {}),
        };

        const retriable = response.status === 429 || response.status >= 500;
        if (!response.ok && retriable && attempt < maxAttempts) {
          await this.waitBeforeRetry(attempt);
          continue;
        }
        return result;
      } catch (error) {
        if (
          error instanceof Error &&
          (error.name === "TimeoutError" || error.name === "AbortError")
        ) {
          throw AugmeterError.timeout(
            `Request timeout after 30000ms: ${url}`,
            "Augment took too long to respond. Check your connection and try again."
          );
        }
        if (attempt < maxAttempts) {
          await this.waitBeforeRetry(attempt);
          continue;
        }
        throw AugmeterError.network(
          `HTTP request failed: ${error}`,
          "Couldn't reach Augment. Check your connection and try again."
        );
      }
    }
    return { success: false, error: "Request failed" };
  }

  private async parseResponseBody(response: Response): Promise<unknown> {
    const contentType = response.headers.get("content-type") ?? "";
    try {
      return contentType.includes("application/json")
        ? await response.json()
        : await response.text();
    } catch {
      return undefined;
    }
  }

  private responseError(data: unknown, response: Response): string {
    if (typeof data === "object" && data !== null) {
      const record = data as Record<string, unknown>;
      if (typeof record.error === "string") return record.error;
      if (typeof record.message === "string") return record.message;
    }
    return `HTTP ${response.status}: ${response.statusText}`;
  }

  private async waitBeforeRetry(attempt: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
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
      if (this.inFlightRequests.get(key) === promise) {
        this.inFlightRequests.delete(key);
      }
    });

    this.inFlightRequests.set(key, promise);
    return promise;
  }

  private async makeRequest(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<AugmentApiResponse> {
    return this.makeRequestWithBase(this.getApiBaseUrl(), endpoint, options);
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

    const apiBaseUrl = this.getApiBaseUrl();

    // Try tenant base first (single-flight)
    const tenantResp = await this.fetchWithSingleFlight("/credits", apiBaseUrl);
    if (!this.hasCookie() && tenantResp.code !== "UNAUTHENTICATED") {
      return {
        success: false,
        error: "Request discarded after the Augment connection changed.",
        code: "STALE",
      };
    }
    if (tenantResp.success) return tenantResp;

    // If unauthenticated, do not attempt fallback
    if (tenantResp.code === "UNAUTHENTICATED" || tenantResp.code === "STALE") {
      return tenantResp;
    }

    // Only fall back to the shared app base when the tenant base looks like a
    // routing miss (it does not serve /credits) rather than an upstream outage.
    // A 5xx means the same backend is down, so a second retry cycle would
    // just double the worst-case
    // stall without a better chance of success. Likewise skip the fallback when
    // the tenant base already IS the shared base (no different base to try).
    const status = tenantResp.status;
    const isUpstreamOutage = typeof status === "number" && status >= 500 && status <= 599;
    if (isUpstreamOutage || apiBaseUrl === this.DEFAULT_API_BASE_URL) {
      return tenantResp;
    }

    // If not available on tenant (routing miss), try shared app base with the
    // same cookie (single-flight).
    const fallbackResp = await this.fetchWithSingleFlight("/credits", this.DEFAULT_API_BASE_URL);
    if (!this.hasCookie() && fallbackResp.code !== "UNAUTHENTICATED") {
      return {
        success: false,
        error: "Request discarded after the Augment connection changed.",
        code: "STALE",
      };
    }
    return fallbackResp;
  }

  async getCreditsInfo(): Promise<AugmentApiResponse> {
    return await this.fetchWithSingleFlight("/credits", this.getApiBaseUrl());
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

  getRequestGeneration(): number {
    return this.requestGeneration;
  }

  isRequestGenerationCurrent(generation: number): boolean {
    return generation === this.requestGeneration;
  }

  /** Invalidate requests started before a data-source or auth transition. */
  invalidateInFlightRequests(): void {
    this.requestGeneration += 1;
    this.inFlightRequests.clear();
  }

  async clearSessionCookie(): Promise<void> {
    this.invalidateInFlightRequests();
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
    // Allow a subsequent initializeFromSecrets() to re-read after a full reset.
    this.secretsInit = null;
    this.invalidateInFlightRequests();
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

  private normalizeHeaders(headersInit: RequestInit["headers"]): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (!headersInit) {
      return headers;
    }

    const normalizedHeaders = new Headers(headersInit);
    normalizedHeaders.forEach((value, key) => {
      headers[key] = value;
    });

    return headers;
  }

  private getApiBaseUrl(): string {
    try {
      const resolved = this.resolveApiBaseUrl();
      return resolved.trim().length > 0 ? resolved : this.DEFAULT_API_BASE_URL;
    } catch {
      return this.DEFAULT_API_BASE_URL;
    }
  }
}
