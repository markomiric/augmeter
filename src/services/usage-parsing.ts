import { type AugmentApiResponse, type AugmentUsageData } from "../core/types/augment";

// Pure parser for usage responses. No vscode/logging imports.
export function parseUsageResponsePure(response: AugmentApiResponse): AugmentUsageData | null {
  if (!response?.success || !response.data) return null;
  const data = response.data;

  // 1) Community-style fields
  if (data.usageUnitsUsedThisBillingCycle !== undefined) {
    return {
      totalUsage: data.usageUnitsUsedThisBillingCycle,
      usageLimit: (data.usageUnitsAvailable ?? 0) + data.usageUnitsUsedThisBillingCycle,
      dailyUsage: data.usageUnitsUsedThisBillingCycle,
      monthlyUsage: data.usageUnitsUsedThisBillingCycle,
      lastUpdate: new Date().toISOString(),
      subscriptionType: "community",
    };
  }

  // 2) Credits-style flat fields
  if (
    data.creditsRenewingEachBillingCycle !== undefined &&
    data.creditsIncludedThisBillingCycle !== undefined
  ) {
    return {
      totalUsage: data.creditsIncludedThisBillingCycle - data.creditsRenewingEachBillingCycle,
      usageLimit: data.creditsIncludedThisBillingCycle,
      monthlyUsage: data.creditsIncludedThisBillingCycle - data.creditsRenewingEachBillingCycle,
      lastUpdate: new Date().toISOString(),
      subscriptionType: data.augmentPlanType || data.planName,
      renewalDate: data.billingPeriodEnd,
    };
  }

  // 3) Nested credits object variants
  const credits = data.credits || data.Credits || undefined;
  if (credits) {
    // Pattern A
    if (
      credits.includedThisBillingCycle !== undefined &&
      credits.renewingEachBillingCycle !== undefined
    ) {
      return {
        totalUsage: credits.includedThisBillingCycle - credits.renewingEachBillingCycle,
        usageLimit: credits.includedThisBillingCycle,
        lastUpdate: new Date().toISOString(),
        subscriptionType: data.augmentPlanType || data.planName || credits.planName,
        renewalDate: credits.billingPeriodEnd || data.billingPeriodEnd,
      };
    }
    // Pattern B
    if (credits.used !== undefined && credits.available !== undefined) {
      return {
        totalUsage: credits.used,
        usageLimit: credits.used + credits.available,
        lastUpdate: new Date().toISOString(),
        subscriptionType: data.augmentPlanType || data.planName || credits.planName,
        renewalDate: credits.billingPeriodEnd || data.billingPeriodEnd,
      };
    }
  }

  // 4) Generic nested usage object variants
  const usageObj = data.usage || data.Usage || undefined;
  if (
    usageObj &&
    usageObj.used !== undefined &&
    (usageObj.limit !== undefined || usageObj.total !== undefined)
  ) {
    return {
      totalUsage: usageObj.used,
      usageLimit: (usageObj.limit ?? usageObj.total) as number,
      dailyUsage: usageObj.dailyUsage,
      monthlyUsage: usageObj.monthlyUsage,
      lastUpdate: usageObj.updatedAt || new Date().toISOString(),
      subscriptionType: data.plan || data.tier || data.subscriptionType,
      renewalDate: data.renewalDate || data.nextBilling,
    };
  }

  // 5) Fallback: infer from common root field names
  const used = data.used ?? data.totalUsage ?? data.usage ?? data.count ?? 0;
  const limit =
    data.limit ??
    data.quota ??
    data.maxUsage ??
    (data.available !== undefined && used !== undefined ? used + data.available : undefined) ??
    1000;

  return {
    totalUsage: Number(used) || 0,
    usageLimit: Number(limit) || 0,
    dailyUsage: data.dailyUsage || data.today,
    monthlyUsage: data.monthlyUsage || data.thisMonth,
    lastUpdate: data.lastUpdate || data.updatedAt || new Date().toISOString(),
    subscriptionType: data.plan || data.tier || data.subscriptionType,
    renewalDate: data.renewalDate || data.nextBilling,
  };
}
