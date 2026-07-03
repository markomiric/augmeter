import { SecureLogger } from "../logging/secure-logger";
import { AugmeterError } from "../errors/augmeter-error";
import { type HttpResponse } from "./http-client";

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  factor: number;
  jitter: boolean;
}

/**
 * Handles retry logic with exponential backoff and jitter
 * Separated from HTTP client to allow reuse for other operations
 */
export class RetryHandler {
  private readonly defaultConfig: RetryConfig = {
    maxAttempts: 3,
    baseDelayMs: 500,
    maxDelayMs: 30000,
    factor: 2,
    jitter: true,
  };

  constructor(private config: Partial<RetryConfig> = {}) {
    this.config = { ...this.defaultConfig, ...config };
  }

  /**
   * Execute HTTP operation with retry logic
   * Specialized for HTTP responses
   */
  async executeHttpWithRetry(
    operation: () => Promise<HttpResponse>,
    context: string = "HTTP request"
  ): Promise<HttpResponse> {
    const config = { ...this.defaultConfig, ...this.config };
    let lastResponse: HttpResponse | null = null;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        const response = await operation();

        // Success case
        if (response.success) {
          if (attempt > 1) {
            SecureLogger.info(`${context} succeeded on attempt ${attempt}`);
          }
          return response;
        }

        // Failed response - check if retriable
        lastResponse = response;

        if (!this.shouldRetryHttpResponse(response)) {
          SecureLogger.warn(
            `${context} failed with non-retriable status ${response.status} on attempt ${attempt}`,
            response.error
          );
          return response; // Return the failed response instead of throwing
        }

        if (attempt < config.maxAttempts) {
          const delay = this.calculateDelay(attempt, config);
          SecureLogger.warn(
            `${context} failed with status ${response.status} on attempt ${attempt}/${config.maxAttempts}, retrying in ${delay}ms`,
            response.error
          );
          await this.sleep(delay);
        } else {
          SecureLogger.error(
            `${context} failed after ${config.maxAttempts} attempts with status ${response.status}`,
            response.error
          );
        }
      } catch (error) {
        // Network or other errors
        if (!this.shouldRetry(error)) {
          throw error;
        }

        if (attempt < config.maxAttempts) {
          const delay = this.calculateDelay(attempt, config);
          SecureLogger.warn(
            `${context} threw error on attempt ${attempt}/${config.maxAttempts}, retrying in ${delay}ms`,
            error
          );
          await this.sleep(delay);
        } else {
          SecureLogger.error(`${context} threw error after ${config.maxAttempts} attempts`, error);
          throw error;
        }
      }
    }

    // Return the last failed response if we have one
    return (
      lastResponse || {
        success: false,
        error: `Failed after ${config.maxAttempts} attempts`,
        status: 0,
      }
    );
  }

  /**
   * Determine if an error should trigger a retry
   */
  private shouldRetry(error: unknown): boolean {
    if (error instanceof AugmeterError) {
      // Timeouts are explicitly non-retriable: retrying a 30s timeout up to
      // 3 attempts with backoff blocks the poller ~90s and masks a slow
      // upstream behind a retry storm. Let the caller see the timeout and
      // back off on its own schedule (next poll tick).
      if (error.type === "timeout") return false;

      // Don't retry validation or authentication errors
      return error.type === "network";
    }

    if (error instanceof Error) {
      // Retry on network errors
      if (error.name === "AbortError") return false; // Timeout - don't retry
      if (error.message.includes("ENOTFOUND")) return false; // DNS error - don't retry
      if (error.message.includes("ECONNREFUSED")) return true; // Connection refused - retry
      if (error.message.includes("timeout")) return false; // Timeout - don't retry
    }

    // Default to retry for unknown errors
    return true;
  }

  /**
   * Determine if an HTTP response should trigger a retry
   */
  private shouldRetryHttpResponse(response: HttpResponse): boolean {
    if (!response.status) return false;

    // Retry on server errors (5xx)
    if (response.status >= 500) return true;

    // Retry on rate limiting (429)
    if (response.status === 429) return true;

    // Retry on request timeout (408)
    if (response.status === 408) return true;

    // Don't retry on client errors (4xx) except 429 and 408
    if (response.status >= 400 && response.status < 500) return false;

    // Don't retry on success (2xx) or redirects (3xx)
    return false;
  }

  /**
   * Calculate delay with exponential backoff and optional jitter
   */
  private calculateDelay(attempt: number, config: RetryConfig): number {
    const exponentialDelay = config.baseDelayMs * Math.pow(config.factor, attempt - 1);
    const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);

    if (config.jitter) {
      // Add full jitter (0 to cappedDelay)
      return Math.floor(Math.random() * cappedDelay);
    }

    return cappedDelay;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current configuration
   */
  getConfig(): RetryConfig {
    return { ...this.defaultConfig, ...this.config };
  }
}
