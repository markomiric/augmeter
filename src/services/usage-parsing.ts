import { type AugmentApiResponse, type AugmentUsageData } from "../core/types/augment";

// Pure parser for usage responses. No vscode/logging imports.
export function parseUsageResponsePure(response: AugmentApiResponse): AugmentUsageData | null {
  if (!response?.success || !response.data) return null;
  const data = asRecord(response.data);
  if (!data) {
    return null;
  }

  // 1) Usage-units style fields (community / standard billing cycle)
  const usageUnitsConsumed =
    data.usageUnitsConsumedThisBillingCycle ?? data.usageUnitsUsedThisBillingCycle;
  if (usageUnitsConsumed !== undefined) {
    const available = data.usageUnitsAvailable ?? data.usageUnitsRemaining ?? 0;
    return {
      totalUsage: toNumber(usageUnitsConsumed),
      usageLimit: toNumber(available) + toNumber(usageUnitsConsumed),
      dailyUsage: toNumber(usageUnitsConsumed),
      monthlyUsage: toNumber(usageUnitsConsumed),
      lastUpdate: new Date().toISOString(),
      subscriptionType: firstString(data.augmentPlanType, data.planName),
    };
  }

  // 2) Credits-style flat fields
  if (
    data.creditsRenewingEachBillingCycle !== undefined &&
    data.creditsIncludedThisBillingCycle !== undefined
  ) {
    return {
      totalUsage:
        toNumber(data.creditsIncludedThisBillingCycle) -
        toNumber(data.creditsRenewingEachBillingCycle),
      usageLimit: toNumber(data.creditsIncludedThisBillingCycle),
      monthlyUsage:
        toNumber(data.creditsIncludedThisBillingCycle) -
        toNumber(data.creditsRenewingEachBillingCycle),
      lastUpdate: new Date().toISOString(),
      subscriptionType: firstString(data.augmentPlanType, data.planName),
      renewalDate: asString(data.billingPeriodEnd),
    };
  }

  // 3) Nested credits object variants
  const credits = asRecord(data.credits) ?? asRecord(data.Credits);
  if (credits) {
    // Pattern A
    if (
      credits.includedThisBillingCycle !== undefined &&
      credits.renewingEachBillingCycle !== undefined
    ) {
      return {
        totalUsage:
          toNumber(credits.includedThisBillingCycle) - toNumber(credits.renewingEachBillingCycle),
        usageLimit: toNumber(credits.includedThisBillingCycle),
        lastUpdate: new Date().toISOString(),
        subscriptionType: firstString(data.augmentPlanType, data.planName, credits.planName),
        renewalDate: firstString(credits.billingPeriodEnd, data.billingPeriodEnd),
      };
    }
    // Pattern B
    if (credits.used !== undefined && credits.available !== undefined) {
      return {
        totalUsage: toNumber(credits.used),
        usageLimit: toNumber(credits.used) + toNumber(credits.available),
        lastUpdate: new Date().toISOString(),
        subscriptionType: firstString(data.augmentPlanType, data.planName, credits.planName),
        renewalDate: firstString(credits.billingPeriodEnd, data.billingPeriodEnd),
      };
    }
  }

  // 4) Generic nested usage object variants
  const usageObj = asRecord(data.usage) ?? asRecord(data.Usage);
  if (
    usageObj &&
    usageObj.used !== undefined &&
    (usageObj.limit !== undefined || usageObj.total !== undefined)
  ) {
    return {
      totalUsage: toNumber(usageObj.used),
      usageLimit: toNumber(usageObj.limit ?? usageObj.total),
      dailyUsage: maybeNumber(usageObj.dailyUsage),
      monthlyUsage: maybeNumber(usageObj.monthlyUsage),
      lastUpdate: asString(usageObj.updatedAt) || new Date().toISOString(),
      subscriptionType: firstString(data.plan, data.tier, data.subscriptionType),
      renewalDate: firstString(data.renewalDate, data.nextBilling),
    };
  }

  // 5) Fallback: infer from common root field names
  const used = data.used ?? data.totalUsage ?? data.usage ?? data.count ?? 0;
  const limit =
    data.limit ??
    data.quota ??
    data.maxUsage ??
    (data.available !== undefined ? toNumber(used) + toNumber(data.available) : undefined) ??
    1000;

  return {
    totalUsage: Number(used) || 0,
    usageLimit: Number(limit) || 0,
    dailyUsage: maybeNumber(data.dailyUsage ?? data.today),
    monthlyUsage: maybeNumber(data.monthlyUsage ?? data.thisMonth),
    lastUpdate: firstString(data.lastUpdate, data.updatedAt) || new Date().toISOString(),
    subscriptionType: firstString(data.plan, data.tier, data.subscriptionType),
    renewalDate: firstString(data.renewalDate, data.nextBilling),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function maybeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toNumber(value: unknown): number {
  return maybeNumber(value) ?? (Number(value) || 0);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const stringValue = asString(value);
    if (stringValue) {
      return stringValue;
    }
  }
  return undefined;
}
