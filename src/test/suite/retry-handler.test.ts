import * as assert from "assert";
import { RetryHandler } from "../../core/http/retry-handler";
import { AugmeterError } from "../../core/errors/augmeter-error";

suite("RetryHandler Test Suite", () => {
  test("executeHttpWithRetry retries on 5xx and eventually succeeds", async () => {
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
    assert.strictEqual(res.success, true);
    assert.ok(attempts >= 2, `should retry at least once, attempts=${attempts}`);
  });

  test("executeHttpWithRetry does not retry on 401 (client error)", async () => {
    const rh = new RetryHandler({ maxAttempts: 5, baseDelayMs: 1, jitter: false });

    let attempts = 0;
    const res = await rh.executeHttpWithRetry(async () => {
      attempts++;
      return { success: false, status: 401, error: "unauthorized" };
    }, "401 test");

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 401);
    assert.strictEqual(attempts, 1);
  });

  test("executeWithRetry retries on network error and then succeeds", async () => {
    const rh = new RetryHandler({ maxAttempts: 3, baseDelayMs: 1, jitter: false });

    let attempts = 0;
    const result = await rh.executeWithRetry(async () => {
      attempts++;
      if (attempts < 2) {
        throw AugmeterError.network("net down");
      }
      return "ok";
    }, "network op");

    assert.strictEqual(result, "ok");
    assert.ok(attempts >= 2);
  });

  test("executeWithRetry does not retry on validation error", async () => {
    const rh = new RetryHandler({ maxAttempts: 3, baseDelayMs: 1, jitter: false });

    let attempts = 0;
    await assert.rejects(
      rh.executeWithRetry(async () => {
        attempts++;
        throw AugmeterError.validation("bad input");
      }, "validation op"),
      /bad input/
    );

    assert.strictEqual(attempts, 1);
  });
});
