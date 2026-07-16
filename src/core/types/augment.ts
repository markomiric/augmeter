export interface AugmentApiResponse {
  success: boolean;
  data?: unknown;
  error?: string | undefined;
  code?: "UNAUTHENTICATED" | "RETRIABLE" | string | undefined;
  status?: number | undefined;
}

export interface AugmentUsageData {
  totalUsage?: number | undefined;
  usageLimit?: number | undefined;
  remainingCredits?: number | undefined;
  monthlyAllowance?: number | undefined;
  usageKnown?: boolean | undefined;
  dailyUsage?: number | undefined;
  monthlyUsage?: number | undefined;
  lastUpdate?: string | undefined;
  subscriptionType?: string | undefined;
  renewalDate?: string | undefined;
}
