import { describe, it, expect } from "vitest";
import { RetryHandler } from "../core/http/retry-handler";
import { AugmeterError } from "../core/errors/augmeter-error";

describe("RetryHandler (unit) Test Suite", () => {
  it("executeHttpWithRetry retries on 5xx and eventually succeeds", async () => {
    const rh = new RetryHandler({ maxAttempts: 3, baseDelayMs: 1, jitter: false });

    let attempts = 0;
    const op = async () => {
      attempts++;
      if (attempts < 2) {
        return { success: false, status: 500, error: "server error" };
      }
      return { success: true, status: 200, data: { ok: true } };
    };

    const res = await rh.executeHttpWithRetry(op, "test http");
    expect(res.success).toBe(true);
    expect(attempts).toBeGreaterThanOrEqual(2);
  });

  it("executeHttpWithRetry does not retry on 401 (client error)", async () => {
    const rh = new RetryHandler({ maxAttempts: 5, baseDelayMs: 1, jitter: false });

    let attempts = 0;
    const res = await rh.executeHttpWithRetry(async () => {
      attempts++;
      return { success: false, status: 401, error: "unauthorized" };
    }, "401 test");

    expect(res.success).toBe(false);
    expect(res.status).toBe(401);
    expect(attempts).toBe(1);
  });

  it("executeHttpWithRetry retries on thrown network error and then succeeds", async () => {
    const rh = new RetryHandler({ maxAttempts: 3, baseDelayMs: 1, jitter: false });

    let attempts = 0;
    const res = await rh.executeHttpWithRetry(async () => {
      attempts++;
      if (attempts < 2) {
        throw AugmeterError.network("net down");
      }
      return { success: true, status: 200, data: { ok: true } };
    }, "network op");

    expect(res.success).toBe(true);
    expect(attempts).toBeGreaterThanOrEqual(2);
  });

  it("executeHttpWithRetry does not retry on thrown validation error", async () => {
    const rh = new RetryHandler({ maxAttempts: 3, baseDelayMs: 1, jitter: false });

    let attempts = 0;
    await expect(
      rh.executeHttpWithRetry(async () => {
        attempts++;
        throw AugmeterError.validation("bad input");
      }, "validation op")
    ).rejects.toThrow(/bad input/);

    expect(attempts).toBe(1);
  });

  it("executeHttpWithRetry does not retry on AugmeterError.timeout thrown by op", async () => {
    const rh = new RetryHandler({ maxAttempts: 3, baseDelayMs: 1, jitter: false });

    let attempts = 0;
    await expect(
      rh.executeHttpWithRetry(async () => {
        attempts++;
        throw AugmeterError.timeout("Request timeout after 30000ms");
      }, "http timeout op")
    ).rejects.toThrow(/Request timeout/);

    expect(attempts).toBe(1);
  });
});
