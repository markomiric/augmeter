import { describe, expect, it } from "vitest";
import {
  buildDiagnosticsPayload,
  buildDiagnosticsText,
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
    expect(text).toContain("Cycle usage: Auggie reports the balance only");
    expect(text).not.toContain("Used: 0");
  });

  it("buildUsageSummaryText labels usage-only data without a fabricated quota", () => {
    const text = buildUsageSummaryText({
      usage: 1200,
      limit: 0,
      usageKnown: true,
      remainingCredits: 0,
      monthlyAllowance: null,
      cycleTarget: 0,
      targetDelta: null,
      projectedDays: null,
      projectedDate: null,
      now: new Date("2026-03-17T10:00:00.000Z"),
    });

    expect(text).toContain("Used: 1,200 credits");
    expect(text).toContain("Cycle limit: unavailable");
    expect(text).not.toContain("of 0 credits");
    expect(text).not.toContain("Remaining: 0 credits");
    expect(text).not.toContain("(0%)");
  });

  it("buildUsageSummaryText reports sub-day projections in hours", () => {
    const text = buildUsageSummaryText({
      usage: 1200,
      limit: 2000,
      usageKnown: true,
      remainingCredits: 800,
      cycleTarget: 0,
      targetDelta: null,
      projectedDays: 0.5,
      projectedDate: null,
      now: new Date("2026-03-17T10:00:00.000Z"),
    });

    expect(text).toContain("At this pace: about 12 hours left");
    expect(text).not.toContain("about 1 day left");
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
      retentionDays: 35,
      alertThresholds: { warning: 75, high: 90, critical: 95 },
      runOutDays: 3,
      cycleTarget: 0,
      enabledProviders: ["claude"],
      copilotApiConfig: {
        enabled: true,
        username: "octocat",
      },
      copilotTokenPresent: true,
    });

    expect(bundle.extensionVersion).toBe("1.2.3");
    expect(bundle.providers.snapshots).toEqual([]);
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
      retentionDays: 35,
      alertThresholds: { warning: 75, high: 90, critical: 95 },
      runOutDays: 3,
      cycleTarget: 0,
      enabledProviders: [],
      copilotApiConfig: {
        enabled: false,
        username: "",
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
        showInStatusBar: true,
        alertThresholds: { warning: 75, high: 90, critical: 95 },
        runOutDays: 3,
        cycleTarget: 0,
        retentionDays: 35,
        providerTrackingEnabled: true,
        enabledProviders: ["claude"],
        claudeProjectsPath: "(default)",
        codexSessionsPath: "(default)",
        copilotStateDbPath: "(default)",
        copilotApi: {
          enabled: false,
          username: "",
          tokenPresent: false,
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

  it("redacts paths, usernames, and provider details from copied diagnostics", () => {
    const text = buildDiagnosticsText({
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
      usage: { used: 12, limit: 100, remaining: 88 },
      config: {
        refreshInterval: 60,
        clickAction: "refresh",
        showInStatusBar: true,
        alertThresholds: { warning: 75, high: 90, critical: 95 },
        runOutDays: 3,
        cycleTarget: 0,
        retentionDays: 35,
        providerTrackingEnabled: true,
        enabledProviders: ["claude"],
        claudeProjectsPath: "/Users/marko/.claude/projects",
        codexSessionsPath: "/private/custom/marko/codex-sessions",
        copilotStateDbPath: "/Users/marko/Library/Application Support/Code/state.vscdb",
        copilotApi: {
          enabled: true,
          username: "marko-private-user",
          tokenPresent: true,
        },
        logLevel: "info",
      },
      providerHealth: [
        {
          providerId: "claude",
          status: "degraded",
          checkedAt: "2026-03-17T10:00:00.000Z",
          sourceKind: "file",
          message: "failed at /Users/marko/.claude token=super-secret",
          errorCode: "CLAUDE_NO_LOGS",
          canCollectInCurrentWorkspace: true,
        },
      ],
      providerSnapshots: [
        {
          providerId: "claude",
          timestamp: "2026-03-17T10:00:00.000Z",
          windowType: "weekly_7d",
          metricType: "messages",
          sourceKind: "file",
          source: "/Users/marko/.claude/projects",
          used: 12,
          details: { error: "Bearer super-secret" },
        },
      ],
      supportIssueUrl: "https://example.com/issues/new",
    });

    expect(text).toContain('"claudeProjectsPath": "[REDACTED]"');
    expect(text).toContain('"codexSessionsPath": "[REDACTED]"');
    expect(text).toContain('"copilotStateDbPath": "[REDACTED]"');
    expect(text).toContain('"username": "[REDACTED]"');
    expect(text).toContain('"status": "degraded"');
    expect(text).toContain('"used": 12');
    expect(text).not.toContain("/Users/marko");
    expect(text).not.toContain("super-secret");
    expect(text).not.toContain('"message"');
    expect(text).not.toContain('"details"');
    expect(text).not.toContain('"source":');
  });
});
