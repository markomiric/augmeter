// Cookie utils kept internal to this module
export class SecureCookieUtils {
  // Validates that a cookie value looks like a real session token
  static validateCookieValue(value: string): { valid: boolean; error?: string } {
    if (!value || value.trim().length === 0) {
      return { valid: false, error: "Cookie value cannot be empty" };
    }

    const trimmed = value.trim();

    // Check if user entered just "_session" instead of the actual token
    if (trimmed === "_session" || trimmed === "_session=") {
      return {
        valid: false,
        error:
          "You entered '_session' but we need the actual token value. Please copy the VALUE from the DevTools cookie table, not the name.",
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
        error:
          "This looks like placeholder text. Please copy the actual cookie VALUE from DevTools.",
      };
    }

    // Session tokens should be reasonably long (some encoded values may be shorter)
    if (trimmed.length < 16) {
      return {
        valid: false,
        error:
          "Token seems too short. Please copy the complete VALUE from the cookie table (should be 100+ characters).",
      };
    }

    // Basic format check - allow base64/base64url and percent-encoded characters
    // Accept letters, numbers, dot, underscore, hyphen, percent, plus, equals, slash, and tilde
    if (!/^[A-Za-z0-9._%+=\/~-]+$/.test(trimmed)) {
      return {
        valid: false,
        error:
          "Session token contains unexpected characters. Paste the VALUE exactly as shown in DevTools (it may include % and =).",
      };
    }

    return { valid: true };
  }

  // Accepts either full Cookie header or just _session value and returns normalized Cookie header value
  static normalizeCookieInput(input: string): string {
    const raw = input.trim();
    // If the user pasted a curl command, try to extract the Cookie header portion
    const curlCookieMatch = raw.match(/-H\s+"?Cookie:([^"\n]+)"?/i);
    const candidate = curlCookieMatch ? curlCookieMatch[1].trim() : raw;

    // If it already contains _session=, extract that pair
    const sessionMatch = candidate.match(/(?:^|[;\s])_session=([^;\s]+)/);
    if (sessionMatch) {
      const value = sessionMatch[1];
      return `_session=${value}`;
    }

    // Otherwise assume the entire input is the _session value
    return `_session=${candidate}`;
  }

  // Extract just the session token value for validation
  static extractSessionValue(cookieString: string): string {
    const match = cookieString.match(/_session=([^;\s]+)/);
    return match ? match[1] : cookieString.replace(/^_session=/, "");
  }
}
