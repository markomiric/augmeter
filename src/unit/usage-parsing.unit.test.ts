import * as assert from "assert";
import { parseUsageResponsePure } from "../services/usage-parsing";
import { AugmentApiResponse } from "../core/types/augment";

suite("Usage parsing (unit) Test Suite", () => {
  test("Community fields parsed", () => {
    const resp: AugmentApiResponse = {
      success: true,
      data: { usageUnitsUsedThisBillingCycle: 100, usageUnitsAvailable: 50 },
    };
    const out = parseUsageResponsePure(resp)!;
    assert.strictEqual(out.totalUsage, 100);
    assert.strictEqual(out.usageLimit, 150);
    assert.strictEqual(out.subscriptionType, "community");
  });

  test("Flat credits fields parsed", () => {
    const resp: AugmentApiResponse = {
      success: true,
      data: {
        creditsRenewingEachBillingCycle: 40,
        creditsIncludedThisBillingCycle: 140,
        planName: "Pro",
        billingPeriodEnd: "2025-01-01",
      },
    };
    const out = parseUsageResponsePure(resp)!;
    assert.strictEqual(out.totalUsage, 100);
    assert.strictEqual(out.usageLimit, 140);
    assert.strictEqual(out.subscriptionType, "Pro");
    assert.strictEqual(out.renewalDate, "2025-01-01");
  });

  test("Nested credits variant A parsed", () => {
    const resp: AugmentApiResponse = {
      success: true,
      data: {
        credits: { includedThisBillingCycle: 200, renewingEachBillingCycle: 80, planName: "Team" },
      },
    };
    const out = parseUsageResponsePure(resp)!;
    assert.strictEqual(out.totalUsage, 120);
    assert.strictEqual(out.usageLimit, 200);
    assert.strictEqual(out.subscriptionType, "Team");
  });

  test("Nested credits variant B parsed", () => {
    const resp: AugmentApiResponse = {
      success: true,
      data: { credits: { used: 75, available: 25, billingPeriodEnd: "2025-02-01" } },
    };
    const out = parseUsageResponsePure(resp)!;
    assert.strictEqual(out.totalUsage, 75);
    assert.strictEqual(out.usageLimit, 100);
    assert.strictEqual(out.renewalDate, "2025-02-01");
  });

  test("Generic usage object parsed", () => {
    const resp: AugmentApiResponse = {
      success: true,
      data: {
        usage: { used: 30, limit: 120, dailyUsage: 5, monthlyUsage: 30, updatedAt: "2025-01-10" },
        plan: "Starter",
      },
    };
    const out = parseUsageResponsePure(resp)!;
    assert.strictEqual(out.totalUsage, 30);
    assert.strictEqual(out.usageLimit, 120);
    assert.strictEqual(out.monthlyUsage, 30);
    assert.strictEqual(out.subscriptionType, "Starter");
  });

  test("Fallback root fields parsed", () => {
    const resp: AugmentApiResponse = {
      success: true,
      data: { used: 10, available: 90, tier: "Free", nextBilling: "2025-03-01" },
    };
    const out = parseUsageResponsePure(resp)!;
    assert.strictEqual(out.totalUsage, 10);
    assert.strictEqual(out.usageLimit, 100);
    assert.strictEqual(out.subscriptionType, "Free");
    assert.strictEqual(out.renewalDate, "2025-03-01");
  });

  test("Unsuccessful response -> null", () => {
    const out = parseUsageResponsePure({ success: false, error: "nope" });
    assert.strictEqual(out, null);
  });

  test("Missing data -> null", () => {
    const out = parseUsageResponsePure({ success: true });
    assert.strictEqual(out, null);
  });
});
