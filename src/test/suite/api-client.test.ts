import * as assert from "assert";
import { AugmentApiClient } from "../../services/augment-api-client";
import { SecureCookieUtils } from "../../core/auth/cookie";

suite("API Client Test Suite", () => {
  test("Cookie validation should work correctly", () => {
    // Test valid cookie
    const validCookie = "eyJvYXV0aDI6c3RhdGUiOiJhYmMxMjM0NTY3ODkwYWJjZGVmZ2hpams";
    const validResult = SecureCookieUtils.validateCookieValue(validCookie);
    assert.ok(validResult.valid, "Valid cookie should pass validation");

    // Test invalid cookie (too short)
    const shortCookie = "abc123";
    const shortResult = SecureCookieUtils.validateCookieValue(shortCookie);
    assert.ok(!shortResult.valid, "Short cookie should fail validation");

    // Test empty cookie
    const emptyResult = SecureCookieUtils.validateCookieValue("");
    assert.ok(!emptyResult.valid, "Empty cookie should fail validation");
  });

  test("Cookie normalization should work correctly", () => {
    // Test with just the value
    const value = "eyJvYXV0aDI6c3RhdGUiOiJhYmMxMjM0NTY3ODkwYWJjZGVmZ2hpams";
    const normalized = SecureCookieUtils.normalizeCookieInput(value);
    assert.strictEqual(normalized, `_session=${value}`, "Should add _session= prefix");

    // Test with full cookie header
    const fullCookie = `_session=${value}; Path=/; HttpOnly`;
    const normalizedFull = SecureCookieUtils.normalizeCookieInput(fullCookie);
    assert.strictEqual(normalizedFull, `_session=${value}`, "Should extract _session value");
  });

  test("API client should initialize without context", () => {
    const client = new AugmentApiClient();
    assert.ok(client, "API client should initialize");
    assert.ok(!client.hasCookie(), "Should not have cookie initially");
  });
});
