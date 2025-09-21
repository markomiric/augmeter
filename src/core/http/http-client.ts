/**
 * ABOUTME: This file contains the HTTP client for making requests to external APIs,
 * with built-in timeout handling, error normalization, and comprehensive logging.
 */
import { fetch as undiciFetch, type RequestInit } from "undici";
import { SecureLogger } from "../logging/secure-logger";
import { AugmeterError } from "../errors/augmeter-error";

/**
 * HTTP response structure returned by the client.
 */
export interface HttpResponse {
  success: boolean;
  status?: number | undefined;
  data?: any;
  error?: string | undefined;
  headers?: Record<string, string> | undefined;
}

export interface HttpRequestOptions extends RequestInit {
  timeout?: number | undefined;
  retries?: number | undefined;
  baseUrl?: string | undefined;
}

/**
 * Pure HTTP client for making requests without business logic
 * Handles only HTTP concerns: requests, responses, timeouts, basic error handling
 */
export class HttpClient {
  private readonly defaultTimeout = 30000; // 30 seconds
  private readonly defaultHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Allow dependency injection for fetch to improve testability
  constructor(private readonly fetchImpl: typeof undiciFetch = undiciFetch) {}

  /**
   * Make an HTTP request
   */
  async makeRequest(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse> {
    const { timeout = this.defaultTimeout, baseUrl, headers = {}, ...fetchOptions } = options;

    const fullUrl = baseUrl ? `${baseUrl}${url}` : url;
    const requestHeaders = {
      ...this.defaultHeaders,
      ...headers,
    };

    SecureLogger.info(`HTTP Request: ${options.method || "GET"} ${fullUrl}`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const startTime = Date.now();
      const response = await this.fetchImpl(fullUrl, {
        ...fetchOptions,
        headers: requestHeaders,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      SecureLogger.info(`HTTP Response: ${response.status} ${response.statusText} (${duration}ms)`);

      return await this.parseResponse(response as any);
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw AugmeterError.network(
            `Request timeout after ${timeout}ms: ${fullUrl}`,
            "Request timed out. Please check your connection and try again."
          );
        }

        if (error.message.includes("ENOTFOUND") || error.message.includes("ECONNREFUSED")) {
          throw AugmeterError.network(
            `Network error: ${error.message}`,
            "Unable to connect to the server. Please check your internet connection."
          );
        }
      }

      throw AugmeterError.network(
        `HTTP request failed: ${error}`,
        "Network request failed. Please try again."
      );
    }
  }

  /**
   * Parse HTTP response into standardized format
   */
  private async parseResponse(response: Response): Promise<HttpResponse> {
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    let data: any;
    let error: string | undefined;

    try {
      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        data = await response.json();
      } else {
        data = await response.text();
      }
    } catch (parseError) {
      SecureLogger.warn("Failed to parse response body", parseError);
      error = "Failed to parse response";
    }

    const success = response.ok;

    if (!success) {
      // Extract error message from response data if available
      if (data && typeof data === "object") {
        error = data.error || data.message || `HTTP ${response.status}: ${response.statusText}`;
      } else {
        error = `HTTP ${response.status}: ${response.statusText}`;
      }
    }

    return {
      success,
      status: response.status,
      data,
      error,
      headers,
    };
  }

  /**
   * GET request
   */
  async get(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse> {
    return this.makeRequest(url, { ...options, method: "GET" });
  }

  /**
   * POST request
   */
  async post(url: string, body?: any, options: HttpRequestOptions = {}): Promise<HttpResponse> {
    const requestOptions: HttpRequestOptions = {
      ...options,
      method: "POST",
    };

    if (body !== undefined) {
      if (typeof body === "object") {
        requestOptions.body = JSON.stringify(body);
      } else {
        requestOptions.body = body;
      }
    }

    return this.makeRequest(url, requestOptions);
  }

  /**
   * PUT request
   */
  async put(url: string, body?: any, options: HttpRequestOptions = {}): Promise<HttpResponse> {
    const requestOptions: HttpRequestOptions = {
      ...options,
      method: "PUT",
    };

    if (body !== undefined) {
      if (typeof body === "object") {
        requestOptions.body = JSON.stringify(body);
      } else {
        requestOptions.body = body;
      }
    }

    return this.makeRequest(url, requestOptions);
  }

  /**
   * DELETE request
   */
  async delete(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse> {
    return this.makeRequest(url, { ...options, method: "DELETE" });
  }

  /**
   * PATCH request
   */
  async patch(url: string, body?: any, options: HttpRequestOptions = {}): Promise<HttpResponse> {
    const requestOptions: HttpRequestOptions = {
      ...options,
      method: "PATCH",
    };

    if (body !== undefined) {
      if (typeof body === "object") {
        requestOptions.body = JSON.stringify(body);
      } else {
        requestOptions.body = body;
      }
    }

    return this.makeRequest(url, requestOptions);
  }

  /**
   * HEAD request
   */
  async head(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse> {
    return this.makeRequest(url, { ...options, method: "HEAD" });
  }
}
