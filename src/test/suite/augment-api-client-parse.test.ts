import * as assert from "assert";
import { AugmentApiClient } from "../../services/augment-api-client";

suite("AugmentApiClient.parseUsageResponse Test Suite", () => {
  let client: AugmentApiClient;

  setup(() => {
    client = new AugmentApiClient();
  });

  test("Parses community fields", async () => {
    const resp = {
      success: true,
      data: {
        usageUnitsUsedThisBillingCycle: 5,
        usageUnitsAvailable: 95,
      },
    } as const;

    const parsed = await client.parseUsageResponse(resp as any);
    assert.strictEqual(parsed?.totalUsage, 5);
    assert.strictEqual(parsed?.usageLimit, 100);
  });

  test("Parses flat credits fields", async () => {
    const resp = {
      success: true,
      data: {
        creditsRenewingEachBillingCycle: 20,
        creditsIncludedThisBillingCycle: 120,
      },
    } as const;

    const parsed = await client.parseUsageResponse(resp as any);
    assert.strictEqual(parsed?.totalUsage, 100);
    assert.strictEqual(parsed?.usageLimit, 120);
  });

  test("Parses nested credits variant A", async () => {
    const resp = {
      success: true,
      data: {
        credits: {
          includedThisBillingCycle: 200,
          renewingEachBillingCycle: 50,
        },
      },
    } as const;

    const parsed = await client.parseUsageResponse(resp as any);
    assert.strictEqual(parsed?.totalUsage, 150);
    assert.strictEqual(parsed?.usageLimit, 200);
  });

  test("Parses nested credits variant B", async () => {
    const resp = {
      success: true,
      data: {
        credits: {
          used: 30,
          available: 70,
        },
      },
    } as const;

    const parsed = await client.parseUsageResponse(resp as any);
    assert.strictEqual(parsed?.totalUsage, 30);
    assert.strictEqual(parsed?.usageLimit, 100);
  });

  test("Parses generic nested usage object", async () => {
    const resp = {
      success: true,
      data: {
        usage: {
          used: 10,
          limit: 40,
          dailyUsage: 2,
          monthlyUsage: 10,
          updatedAt: "2024-01-01T00:00:00Z",
        },
      },
    } as const;

    const parsed = await client.parseUsageResponse(resp as any);
    assert.strictEqual(parsed?.totalUsage, 10);
    assert.strictEqual(parsed?.usageLimit, 40);
    assert.strictEqual(parsed?.dailyUsage, 2);
  });

  test("Parses fallback fields at root", async () => {
    const resp = {
      success: true,
      data: {
        used: 7,
        available: 13,
      },
    } as const;

    const parsed = await client.parseUsageResponse(resp as any);
    assert.strictEqual(parsed?.totalUsage, 7);
    assert.strictEqual(parsed?.usageLimit, 20);
  });

  test("Returns null for unsuccessful response", async () => {
    const resp = { success: false, error: "nope" } as const;
    const parsed = await client.parseUsageResponse(resp as any);
    assert.strictEqual(parsed, null);
  });
});
