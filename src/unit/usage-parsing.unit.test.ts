import { describe, it, expect } from "vitest";
import { parseUsageResponsePure } from "../services/usage-parsing";
import { type AugmentApiResponse } from "../core/types/augment";

describe("Usage parsing (unit) Test Suite", () => {
  it("Community fields parsed", () => {
    const resp: AugmentApiResponse = {
      success: true,
      data: { usageUnitsUsedThisBillingCycle: 100, usageUnitsAvailable: 50 },
    };
    const out = parseUsageResponsePure(resp)!;
    expect(out.totalUsage).toBe(100);
    expect(out.usageLimit).toBe(150);
    expect(out.subscriptionType).toBe("community");
  });

  it("Flat credits fields parsed", () => {
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
    expect(out.totalUsage).toBe(100);
    expect(out.usageLimit).toBe(140);
    expect(out.subscriptionType).toBe("Pro");
    expect(out.renewalDate).toBe("2025-01-01");
  });

  it("Nested credits variant A parsed", () => {
    const resp: AugmentApiResponse = {
      success: true,
      data: {
        credits: { includedThisBillingCycle: 200, renewingEachBillingCycle: 80, planName: "Team" },
      },
    };
    const out = parseUsageResponsePure(resp)!;
    expect(out.totalUsage).toBe(120);
    expect(out.usageLimit).toBe(200);
    expect(out.subscriptionType).toBe("Team");
  });

  it("Nested credits variant B parsed", () => {
    const resp: AugmentApiResponse = {
      success: true,
      data: { credits: { used: 75, available: 25, billingPeriodEnd: "2025-02-01" } },
    };
    const out = parseUsageResponsePure(resp)!;
    expect(out.totalUsage).toBe(75);
    expect(out.usageLimit).toBe(100);
    expect(out.renewalDate).toBe("2025-02-01");
  });

  it("Generic usage object parsed", () => {
    const resp: AugmentApiResponse = {
      success: true,
      data: {
        usage: { used: 30, limit: 120, dailyUsage: 5, monthlyUsage: 30, updatedAt: "2025-01-10" },
        plan: "Starter",
      },
    };
    const out = parseUsageResponsePure(resp)!;
    expect(out.totalUsage).toBe(30);
    expect(out.usageLimit).toBe(120);
    expect(out.monthlyUsage).toBe(30);
    expect(out.subscriptionType).toBe("Starter");
  });

  it("Fallback root fields parsed", () => {
    const resp: AugmentApiResponse = {
      success: true,
      data: { used: 10, available: 90, tier: "Free", nextBilling: "2025-03-01" },
    };
    const out = parseUsageResponsePure(resp)!;
    expect(out.totalUsage).toBe(10);
    expect(out.usageLimit).toBe(100);
    expect(out.subscriptionType).toBe("Free");
    expect(out.renewalDate).toBe("2025-03-01");
  });

  it("Unsuccessful response -> null", () => {
    const out = parseUsageResponsePure({ success: false, error: "nope" });
    expect(out).toBe(null);
  });

  it("Missing data -> null", () => {
    const out = parseUsageResponsePure({ success: true });
    expect(out).toBe(null);
  });

  it("Fallback to default limit when all limit fields undefined", () => {
    const resp: AugmentApiResponse = {
      success: true,
      data: { used: 500 }, // Only used field, no limit fields
    };
    const out = parseUsageResponsePure(resp)!;
    expect(out.totalUsage).toBe(500);
    expect(out.usageLimit).toBe(1000); // Default fallback value
  });
});
