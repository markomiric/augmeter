import { describe, it, expect } from "vitest";
import { SecureCookieUtils } from "../core/auth/cookie";

describe("SecureCookieUtils", () => {
  describe("validateCookieValue", () => {
    it("accepts valid long token", () => {
      const token = "A".repeat(100);
      const result = SecureCookieUtils.validateCookieValue(token);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("accepts token with base64 characters", () => {
      const token = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
      const result = SecureCookieUtils.validateCookieValue(token);
      expect(result.valid).toBe(true);
    });

    it("accepts token with percent-encoded characters", () => {
      const token = "token%20with%2Fencoded%3Dcharacters%7Eand~more-stuff_here.test";
      const result = SecureCookieUtils.validateCookieValue(token);
      expect(result.valid).toBe(true);
    });

    it("rejects empty string", () => {
      const result = SecureCookieUtils.validateCookieValue("");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("cannot be empty");
    });

    it("rejects whitespace-only string", () => {
      const result = SecureCookieUtils.validateCookieValue("   ");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("cannot be empty");
    });

    it("rejects literal '_session' string", () => {
      const result = SecureCookieUtils.validateCookieValue("_session");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("actual token value");
    });

    it("rejects '_session=' string", () => {
      const result = SecureCookieUtils.validateCookieValue("_session=");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("actual token value");
    });

    it("rejects placeholder text with 'your'", () => {
      const result = SecureCookieUtils.validateCookieValue("your-token-here");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("placeholder text");
    });

    it("rejects placeholder text with 'cookie'", () => {
      const result = SecureCookieUtils.validateCookieValue("paste-cookie-value-here");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("placeholder text");
    });

    it("rejects placeholder text with 'value'", () => {
      const result = SecureCookieUtils.validateCookieValue("enter-value-here");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("placeholder text");
    });

    it("rejects placeholder text case-insensitive", () => {
      const result = SecureCookieUtils.validateCookieValue("YOUR-COOKIE-VALUE");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("placeholder text");
    });

    it("rejects token shorter than 16 characters", () => {
      const result = SecureCookieUtils.validateCookieValue("short");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("too short");
    });

    it("rejects token with exactly 15 characters", () => {
      const result = SecureCookieUtils.validateCookieValue("A".repeat(15));
      expect(result.valid).toBe(false);
      expect(result.error).toContain("too short");
    });

    it("accepts token with exactly 16 characters", () => {
      const result = SecureCookieUtils.validateCookieValue("A".repeat(16));
      expect(result.valid).toBe(true);
    });

    it("rejects token with invalid characters (spaces)", () => {
      const token = "A".repeat(20) + " " + "B".repeat(20);
      const result = SecureCookieUtils.validateCookieValue(token);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("unexpected characters");
    });

    it("rejects token with invalid characters (special chars)", () => {
      const token = "A".repeat(20) + "@#$" + "B".repeat(20);
      const result = SecureCookieUtils.validateCookieValue(token);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("unexpected characters");
    });

    it("rejects token with newlines", () => {
      const token = "A".repeat(20) + "\n" + "B".repeat(20);
      const result = SecureCookieUtils.validateCookieValue(token);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("unexpected characters");
    });
  });

  describe("normalizeCookieInput", () => {
    it("wraps bare token value with _session=", () => {
      const token = "A".repeat(100);
      const result = SecureCookieUtils.normalizeCookieInput(token);
      expect(result).toBe(`_session=${token}`);
    });

    it("preserves existing _session= format", () => {
      const input = "_session=mytoken123";
      const result = SecureCookieUtils.normalizeCookieInput(input);
      expect(result).toBe("_session=mytoken123");
    });

    it("extracts _session from full cookie header", () => {
      const input = "other=value; _session=mytoken456; another=thing";
      const result = SecureCookieUtils.normalizeCookieInput(input);
      expect(result).toBe("_session=mytoken456");
    });

    it("extracts _session from cookie header with spaces", () => {
      const input = "other=value;  _session=mytoken789  ; another=thing";
      const result = SecureCookieUtils.normalizeCookieInput(input);
      expect(result).toBe("_session=mytoken789");
    });

    it("extracts _session from start of cookie string", () => {
      const input = "_session=firsttoken; other=value";
      const result = SecureCookieUtils.normalizeCookieInput(input);
      expect(result).toBe("_session=firsttoken");
    });

    it("extracts Cookie header from curl command with double quotes", () => {
      const input = 'curl -H "Cookie: _session=curltoken123" https://example.com';
      const result = SecureCookieUtils.normalizeCookieInput(input);
      expect(result).toBe("_session=curltoken123");
    });

    it("extracts Cookie header from curl command without quotes", () => {
      const input = "curl -H Cookie:_session=curltoken456 https://example.com";
      const result = SecureCookieUtils.normalizeCookieInput(input);
      expect(result).toBe("_session=curltoken456");
    });

    it("extracts Cookie header from curl command with multiple cookies", () => {
      const input =
        'curl -H "Cookie: other=val; _session=curltoken789; more=stuff" https://example.com';
      const result = SecureCookieUtils.normalizeCookieInput(input);
      expect(result).toBe("_session=curltoken789");
    });

    it("handles curl command with case-insensitive Cookie header", () => {
      const input = 'curl -H "cookie: _session=casetoken" https://example.com';
      const result = SecureCookieUtils.normalizeCookieInput(input);
      expect(result).toBe("_session=casetoken");
    });

    it("trims whitespace from input", () => {
      const token = "A".repeat(50);
      const input = `  ${token}  `;
      const result = SecureCookieUtils.normalizeCookieInput(input);
      expect(result).toBe(`_session=${token}`);
    });

    it("handles token with percent-encoded characters", () => {
      const token = "token%20with%2Fencoded";
      const result = SecureCookieUtils.normalizeCookieInput(token);
      expect(result).toBe(`_session=${token}`);
    });
  });

  describe("extractSessionValue", () => {
    it("extracts value from _session= format", () => {
      const input = "_session=mytoken123";
      const result = SecureCookieUtils.extractSessionValue(input);
      expect(result).toBe("mytoken123");
    });

    it("extracts value from full cookie string", () => {
      const input = "other=value; _session=extractedtoken; more=stuff";
      const result = SecureCookieUtils.extractSessionValue(input);
      expect(result).toBe("extractedtoken");
    });

    it("returns bare token if no _session= prefix", () => {
      const input = "baretoken456";
      const result = SecureCookieUtils.extractSessionValue(input);
      expect(result).toBe("baretoken456");
    });

    it("handles token with special characters", () => {
      const input = "_session=token+with/special=chars";
      const result = SecureCookieUtils.extractSessionValue(input);
      expect(result).toBe("token+with/special=chars");
    });

    it("stops at semicolon boundary", () => {
      const input = "_session=firsttoken; other=value";
      const result = SecureCookieUtils.extractSessionValue(input);
      expect(result).toBe("firsttoken");
    });

    it("stops at whitespace boundary", () => {
      const input = "_session=tokenvalue other=stuff";
      const result = SecureCookieUtils.extractSessionValue(input);
      expect(result).toBe("tokenvalue");
    });

    it("handles empty string", () => {
      const result = SecureCookieUtils.extractSessionValue("");
      expect(result).toBe("");
    });

    it("handles _session= with no value", () => {
      const result = SecureCookieUtils.extractSessionValue("_session=");
      expect(result).toBe("");
    });
  });

  describe("integration: normalize + extract + validate", () => {
    it("full workflow with bare token", () => {
      const bareToken = "A".repeat(100);
      const normalized = SecureCookieUtils.normalizeCookieInput(bareToken);
      const extracted = SecureCookieUtils.extractSessionValue(normalized);
      const validation = SecureCookieUtils.validateCookieValue(extracted);

      expect(normalized).toBe(`_session=${bareToken}`);
      expect(extracted).toBe(bareToken);
      expect(validation.valid).toBe(true);
    });

    it("full workflow with curl command", () => {
      const token = "B".repeat(80);
      const curlCmd = `curl -H "Cookie: _session=${token}" https://example.com`;
      const normalized = SecureCookieUtils.normalizeCookieInput(curlCmd);
      const extracted = SecureCookieUtils.extractSessionValue(normalized);
      const validation = SecureCookieUtils.validateCookieValue(extracted);

      expect(normalized).toBe(`_session=${token}`);
      expect(extracted).toBe(token);
      expect(validation.valid).toBe(true);
    });

    it("full workflow with invalid token", () => {
      const invalidToken = "short";
      const normalized = SecureCookieUtils.normalizeCookieInput(invalidToken);
      const extracted = SecureCookieUtils.extractSessionValue(normalized);
      const validation = SecureCookieUtils.validateCookieValue(extracted);

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain("too short");
    });
  });
});
