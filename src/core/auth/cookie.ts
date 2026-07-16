/**
 * ABOUTME: This file contains utilities for validating, normalizing, and extracting session cookies
 * from various input formats (raw cookies, curl commands, browser DevTools).
 */

/**
 * Utilities for secure cookie validation and normalization.
 *
 * This class provides methods to:
 * - Validate cookie values for security and format
 * - Normalize cookies from various input formats
 * - Extract session values from cookie strings
 * - Handle curl commands and browser DevTools output
 *
 * @example
 * ```typescript
 * const normalized = SecureCookieUtils.normalizeCookieInput(rawInput);
 * const sessionValue = SecureCookieUtils.extractSessionValue(normalized);
 * const validation = SecureCookieUtils.validateCookieValue(sessionValue);
 * ```
 */
export class SecureCookieUtils {
  // Validates that a cookie value looks like a real session token
  static validateCookieValue(value: string): { valid: boolean; error?: string } {
    if (!value || value.trim().length === 0) {
      return { valid: false, error: "Paste the _session cookie value." };
    }

    const trimmed = value.trim();

    // Check if user entered just "_session" instead of the actual token
    if (trimmed === "_session" || trimmed === "_session=") {
      return {
        valid: false,
        error: "Paste the cookie value, not _session.",
      };
    }

    // Check if it looks like a placeholder or instruction
    if (
      trimmed.toLowerCase().includes("your") ||
      trimmed.toLowerCase().includes("cookie") ||
      trimmed.toLowerCase().includes("value")
    ) {
      return {
        valid: false,
        error: "This looks like an example, not your cookie value.",
      };
    }

    // Session tokens should be reasonably long (some encoded values may be shorter)
    if (trimmed.length < 16) {
      return {
        valid: false,
        error: "The cookie value looks incomplete. Copy the full value and try again.",
      };
    }

    // Basic format check - allow base64/base64url and percent-encoded characters
    // Accept letters, numbers, dot, underscore, hyphen, percent, plus, equals, slash, and tilde
    if (!/^[A-Za-z0-9._%+=\/~-]+$/.test(trimmed)) {
      return {
        valid: false,
        error:
          "The cookie value contains unsupported characters. Copy it again without editing it.",
      };
    }

    return { valid: true };
  }

  // Accepts either full Cookie header or just _session value and returns normalized Cookie header value
  static normalizeCookieInput(input: string): string {
    const raw = input.trim();
    // If the user pasted a curl command, try to extract the Cookie header portion
    const curlCookieMatch = raw.match(/-H\s+"?Cookie:([^"\n]+)"?/i);
    const candidate = curlCookieMatch?.[1]?.trim() ?? raw;

    // If it already contains _session=, extract that pair
    const sessionMatch = candidate.match(/(?:^|[;\s])_session=([^;\s]+)/);
    if (sessionMatch?.[1]) {
      const value = sessionMatch[1];
      return `_session=${value}`;
    }

    // Otherwise assume the entire input is the _session value
    return `_session=${candidate}`;
  }

  // Extract just the session token value for validation
  static extractSessionValue(cookieString: string): string {
    const match = cookieString.match(/_session=([^;\s]+)/);
    return match?.[1] ?? cookieString.replace(/^_session=/, "");
  }
}
