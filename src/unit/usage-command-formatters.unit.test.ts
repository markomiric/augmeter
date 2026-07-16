import { describe, expect, it } from "vitest";
import {
  buildDiagnosticsPayload,
  buildLatestProviderSnapshots,
  buildUsageBundle,
  buildUsageHistoryCsv,
  buildUsageSummaryText,
} from "../commands/usage-command-formatters";

describe("usage-command-formatters", () => {
  it("buildUsageSummaryText includes projection and renewal details", () => {
    const text = buildUsageSummaryText({
      usage: 1200,
      limit: 2000,
      subscriptionType: "Pro",
      renewalDate: "2026-03-20T00:00:00.000Z",
      cycleTarget: 1500,
      targetDelta: 300,
      projectedDays: 2.4,
      projectedDate: new Date("2026-03-19T00:00:00.000Z"),
      now: new Date("2026-03-17T10:00:00.000Z"),
    });

    expect(text).toContain("Augment credit summary");
    expect(text).toContain("Plan: Pro");
    expect(text).toContain("At this pace: about 2 days left");
    expect(text).toContain("Estimated run-out date:");
    expect(text).toContain("Cycle target:");
    expect(text).toContain("Renews:");
  });

  it("buildUsageSummaryText labels balance-only CLI data without inventing cycle usage", () => {
    const text = buildUsageSummaryText({
      usage: 0,
      limit: 0,
      usageKnown: false,
      remainingCredits: 57306,
      monthlyAllowance: 40000,
      subscriptionType: "Indie Plan",
      cycleTarget: 0,
      targetDelta: null,
      projectedDays: null,
      projectedDate: null,
      now: new Date("2026-03-17T10:00:00.000Z"),
    });

    expect(text).toContain("Remaining: 57,306 credits");
    expect(text).toContain("Monthly allowance: 40,000 credits");
    expect(text).toContain("Cycle usage: unavailable from Auggie CLI balance data");
    expect(text).not.toContain("Used: 0");
  });

  it("buildUsageHistoryCsv escapes fields and keeps headers", () => {
    const csv = buildUsageHistoryCsv([
      {
        timestamp: "2026-03-17T10:00:00.000Z",
        consumed: 50,
        limit: 100,
        source: 'augment,"api"',
      },
    ]);

    expect(csv).toContain("timestamp,consumed,limit,remaining,source");
    expect(csv).toContain('"augment,""api"""');
  });

  it("buildUsageBundle includes provider and config sections", () => {
    const bundle = buildUsageBundle({
      generatedAt: new Date("2026-03-17T10:00:00.000Z"),
      extensionVersion: "1.2.3",
      currentUsage: 12,
      currentLimit: 100,
      remainingCredits: 88,
      renewalDate: "2026-03-31",
      subscriptionType: "Pro",
      usageSnapshots: [],
      providerSnapshots: [],
      providerHealth: [],
      providerTargets: { claude: 1000 },
      providerAlertThresholds: {
        claude: { warning: 70, high: 85, critical: 95, runOutDays: 2 },
      },
      retentionDays: 35,
      alertThresholds: { warning: 75, high: 90, critical: 95 },
      runOutDays: 3,
      cycleTarget: 0,
      enabledProviders: ["claude"],
      copilotApiConfig: {
        enabled: true,
        username: "octocat",
        tokenEnvVar: "GITHUB_TOKEN",
        baseUrl: "https://api.github.com",
        timeoutMs: 6000,
      },
      copilotTokenPresent: true,
    });

    expect(bundle.extensionVersion).toBe("1.2.3");
    expect(bundle.providers.targets).toEqual({ claude: 1000 });
    expect(bundle.config.cycleTarget).toBe(0);
    expect(bundle.config.enabledProviders).toEqual(["claude"]);
    expect(bundle.config.copilotApi.tokenPresent).toBe(true);
  });

  it("buildUsageBundle preserves balance-only Auggie semantics", () => {
    const bundle = buildUsageBundle({
      generatedAt: new Date("2026-03-17T10:00:00.000Z"),
      extensionVersion: "1.2.3",
      currentUsage: 0,
      currentLimit: 0,
      remainingCredits: 57306,
      usageKnown: false,
      monthlyAllowance: 40000,
      usageSnapshots: [],
      providerSnapshots: [],
      providerHealth: [],
      providerTargets: {},
      providerAlertThresholds: {},
      retentionDays: 35,
      alertThresholds: { warning: 75, high: 90, critical: 95 },
      runOutDays: 3,
      cycleTarget: 0,
      enabledProviders: [],
      copilotApiConfig: {
        enabled: false,
        username: "",
        tokenEnvVar: "GITHUB_TOKEN",
        baseUrl: "https://api.github.com",
        timeoutMs: 6000,
      },
      copilotTokenPresent: false,
    });

    expect(bundle.usage.current).toMatchObject({
      used: 0,
      limit: 0,
      remaining: 57306,
      usageKnown: false,
      monthlyAllowance: 40000,
    });
  });

  it("buildLatestProviderSnapshots keeps the newest snapshot per key", () => {
    const latest = buildLatestProviderSnapshots([
      {
        providerId: "claude",
        timestamp: "2026-03-17T09:00:00.000Z",
        windowType: "weekly_7d",
        metricType: "messages",
        sourceKind: "file",
        used: 10,
      },
      {
        providerId: "claude",
        timestamp: "2026-03-17T10:00:00.000Z",
        windowType: "weekly_7d",
        metricType: "messages",
        sourceKind: "file",
        used: 12,
      },
    ]);

    expect(latest["claude:weekly_7d:messages"]?.used).toBe(12);
  });

  it("buildDiagnosticsPayload summarizes latest provider usage", () => {
    const diagnostics = buildDiagnosticsPayload({
      generatedAt: new Date("2026-03-17T10:00:00.000Z"),
      extensionId: "kamacode.augmeter",
      extensionVersion: "1.2.3",
      vscodeVersion: "1.99.0",
      nodeVersion: "v22.0.0",
      platform: "darwin",
      workspaceTrusted: true,
      hasCookie: true,
      hasRealData: true,
      dataSource: "augment_api",
      usage: {
        used: 12,
        limit: 100,
        remaining: 88,
        subscriptionType: "Pro",
        renewalDate: "2026-03-31",
        lastFetchedAt: new Date("2026-03-17T10:00:00.000Z"),
      },
      config: {
        refreshInterval: 60,
        clickAction: "refresh",
        displayMode: "both",
        density: "auto",
        showInStatusBar: true,
        colorScheme: "standard",
        colorThresholds: { critical: 95, highWarning: 85, warning: 75, caution: 50 },
        alertThresholds: { warning: 75, high: 90, critical: 95 },
        runOutDays: 3,
        cycleTarget: 0,
        retentionDays: 35,
        sessionTrackingEnabled: false,
        sessionTrackingPath: "(default)",
        providerTrackingEnabled: true,
        enabledProviders: ["claude"],
        providerTargets: {},
        providerAlertThresholds: {},
        claudeProjectsPath: "(default)",
        codexSessionsPath: "(default)",
        copilotStateDbPath: "(default)",
        copilotApi: {
          enabled: false,
          username: "",
          tokenEnvVar: "GITHUB_TOKEN",
          tokenPresent: false,
          baseUrl: "https://api.github.com",
          timeoutMs: 6000,
        },
        logLevel: "info",
      },
      providerHealth: [],
      providerSnapshots: [
        {
          providerId: "claude",
          timestamp: "2026-03-17T10:00:00.000Z",
          windowType: "weekly_7d",
          metricType: "messages",
          sourceKind: "file",
          used: 12,
        },
      ],
      supportIssueUrl: "https://example.com/issues/new",
    });

    expect(diagnostics.providers.latestUsage["claude:weekly_7d:messages"]?.used).toBe(12);
    expect(diagnostics.support.issueUrl).toBe("https://example.com/issues/new");
  });
});
