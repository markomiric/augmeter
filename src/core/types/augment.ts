export interface AugmentApiResponse {
  success: boolean;
  data?: any;
  error?: string;
  code?: "UNAUTHENTICATED" | "RETRIABLE" | string;
  status?: number;
}

export interface AugmentUsageData {
  totalUsage?: number;
  usageLimit?: number;
  dailyUsage?: number;
  monthlyUsage?: number;
  lastUpdate?: string;
  subscriptionType?: string;
  renewalDate?: string;
}

export interface AugmentUserInfo {
  email?: string;
  name?: string;
  id?: string;
  plan?: string;
  avatar?: string;
  verified?: boolean;
}
