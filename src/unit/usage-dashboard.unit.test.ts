import { describe, expect, it } from "vitest";
import { renderUsageDashboard } from "../ui/usage-dashboard";

describe("Usage dashboard renderer", () => {
  it("keeps assistant activity primary when Augment credit data is unavailable", () => {
    const html = renderUsageDashboard({
      generatedAt: new Date("2026-03-18T01:56:39.000Z"),
      hasRealData: false,
      usage: 0,
      limit: 0,
      remaining: 0,
      percentage: 0,
      snapshots: [],
      providerSnapshots: [
        {
          providerId: "codex",
          timestamp: "2026-03-18T01:56:29.000Z",
          windowType: "weekly_7d",
          metricType: "messages",
          sourceKind: "file",
          used: 291,
          freshnessAt: "2026-03-18T01:56:29.000Z",
        },
      ],
      providerHealth: [
        {
          providerId: "codex",
          status: "connected",
          checkedAt: "2026-03-18T01:56:29.000Z",
          canCollectInCurrentWorkspace: true,
          message: "Scanned 74 Codex session file(s) for local prompt counts.",
        },
      ],
    });

    expect(html).toContain("Assistant usage");
    expect(html).toContain("Local activity and provider-reported usage, separated by source.");
    expect(html).toContain("Assistant activity");
    expect(html).toContain("From local session history");
    expect(html).toContain("Codex");
    expect(html).toContain("Last 7 days: 291 turns");
    expect(html).not.toContain("monthly turn target");
    expect(html).toContain("How these counts are calculated");
    expect(html).toContain("Tool results, metadata, and agent sessions are excluded");
    expect(html).toContain(
      "grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr))"
    );
    expect(html).toContain("@media (max-width: 520px)");
    expect(html).toContain(`Updated ${new Date("2026-03-18T01:56:29.000Z").toLocaleString()}`);
    expect(html).toContain("Augment credits aren&#39;t connected");
    expect(html).toContain('data-command="augmeter.signIn"');
    expect(html).toMatch(/\.notice-card\s*\{[^}]*margin: 16px 0;/s);
    expect(html.indexOf("Assistant activity")).toBeLessThan(
      html.indexOf("Augment credits aren&#39;t connected")
    );
    expect(html).not.toContain("Scanned 74 Codex session file(s)");
    expect(html).not.toContain("Target risk:");
    expect(html).not.toContain("No target signal");
    expect(html).toContain("Content-Security-Policy");
    expect(html).toMatch(/style-src 'nonce-[^']+'/);
    expect(html).toMatch(/<style nonce="[^"]+">/);
  });

  it("shows connected Augment usage after assistant activity", () => {
    const html = renderUsageDashboard({
      generatedAt: new Date("2026-03-18T01:56:39.000Z"),
      hasRealData: true,
      usage: 2400,
      limit: 4000,
      remaining: 1600,
      percentage: 60,
      subscriptionType: "Pro",
      usageRatePerHour: 0,
      snapshots: [
        {
          timestamp: "2026-03-17T01:56:39.000Z",
          consumed: 2000,
        },
        {
          timestamp: "2026-03-18T01:56:39.000Z",
          consumed: 2400,
        },
      ],
    });

    expect(html).not.toContain("Augment credits aren&#39;t connected");
    expect(html).toContain("Assistant usage");
    expect(html).toContain("Augment credits");
    expect(html).toContain("Current cycle");
    expect(html).toContain("Augment credits");
    expect(html).toContain(
      '<p class="metric-subtle section-description">Official balance and cycle data from Augment.</p>'
    );
    expect(html).toMatch(/\.section-description\s*\{[^}]*margin-bottom: 12px;/s);
    expect(html).toContain("1,600 credits left");
    expect(html).toContain("2,400 used this cycle · 60% used");
    expect(html).toContain("Augment credit trends");
    expect(html).not.toContain("About 0 credits per hour");
    expect(html).not.toContain("Credit pace");
    expect(html.indexOf("Assistant activity")).toBeLessThan(html.indexOf("Current cycle"));
    expect(html).not.toContain("Recent Snapshot History");
    expect(html).not.toContain(">Unknown<");
  });

  it("does not compare cumulative local Copilot counts with a monthly target", () => {
    const html = renderUsageDashboard({
      generatedAt: new Date("2026-03-18T01:56:39.000Z"),
      hasRealData: false,
      usage: 0,
      limit: 0,
      remaining: 0,
      percentage: 0,
      snapshots: [],
      providerSnapshots: [
        {
          providerId: "copilot",
          timestamp: "2026-03-18T01:56:29.000Z",
          windowType: "custom",
          metricType: "messages",
          sourceKind: "file",
          used: 291,
        },
      ],
    });

    expect(html).toContain("291 requests recorded");
    expect(html).toContain("VS Code doesn&#39;t provide a time range for this count");
    expect(html).not.toContain("Projected at");
  });

  it("does not present a balance-only Auggie response as zero cycle usage", () => {
    const freshnessAt = new Date("2026-03-18T01:56:29.000Z");
    const html = renderUsageDashboard({
      generatedAt: new Date("2026-03-18T01:56:39.000Z"),
      hasRealData: true,
      usageKnown: false,
      usage: 0,
      limit: 57306,
      remaining: 57306,
      monthlyAllowance: 40000,
      creditFreshnessAt: freshnessAt,
      percentage: 0,
      subscriptionType: "Indie Plan",
      snapshots: [
        { timestamp: "2026-03-17T01:56:39.000Z", consumed: 0 },
        { timestamp: "2026-03-18T01:56:39.000Z", consumed: 0 },
      ],
    });

    expect(html).toContain("Credit balance");
    expect(html).toContain("57,306 credits left");
    expect(html).toContain("Monthly allowance: 40,000 credits");
    expect(html).toContain("Auggie reports your balance but not what you&#39;ve used this cycle");
    expect(html).toContain(`Updated ${freshnessAt.toLocaleString()}`);
    expect(html).not.toContain("0 used this cycle");
    expect(html).not.toContain("<meter");
    expect(html).not.toContain("Augment credit trends");
  });

  it("does not derive a day countdown from a renewal date without an exact time", () => {
    const html = renderUsageDashboard({
      generatedAt: new Date("2026-03-18T01:56:39.000Z"),
      hasRealData: true,
      usageKnown: false,
      usage: 0,
      limit: 0,
      remaining: 57306,
      percentage: 0,
      renewalDate: "2099-07-24T00:00:00.000Z",
      snapshots: [],
    });

    expect(html).toContain("Jul 24, 2099");
    expect(html).not.toContain("days remaining");
  });

  it("does not invent a zero credit limit when the cycle limit is unavailable", () => {
    const html = renderUsageDashboard({
      generatedAt: new Date("2026-03-18T01:56:39.000Z"),
      hasRealData: true,
      usage: 120,
      limit: 0,
      remaining: 0,
      percentage: 0,
      snapshots: [],
    });

    expect(html).toContain("120 credits used");
    expect(html).toContain("Augment didn&#39;t provide a cycle limit");
    expect(html).not.toContain("120 of 0 credits");
    expect(html).not.toContain("<meter");
  });

  it("labels current monthly activity as used rather than projected", () => {
    const html = renderUsageDashboard({
      generatedAt: new Date("2026-03-18T01:56:39.000Z"),
      hasRealData: false,
      usage: 0,
      limit: 0,
      remaining: 0,
      percentage: 0,
      snapshots: [],
      providerSnapshots: [
        {
          providerId: "copilot",
          timestamp: "2026-03-18T01:56:29.000Z",
          windowType: "monthly",
          metricType: "messages",
          sourceKind: "api",
          used: 42,
          percentUsed: 42,
        },
      ],
    });

    expect(html).toContain("Reported by GitHub");
    expect(html).toContain("42% of the reported limit used");
    expect(html).not.toContain("At this pace: 42%");
  });

  it("uses correct singular copy for a one-day projection", () => {
    const html = renderUsageDashboard({
      generatedAt: new Date("2026-03-18T01:56:39.000Z"),
      hasRealData: true,
      usage: 500,
      limit: 2000,
      remaining: 1500,
      percentage: 25,
      usageRatePerHour: 10,
      projectedDaysRemaining: 1.2,
      snapshots: [],
    });

    expect(html).toContain("At this pace: ~1 day left");
    expect(html).not.toContain("~1 days");
  });
  it("keeps source failures visible beside cached values and escapes provider text", () => {
    const html = renderUsageDashboard({
      generatedAt: new Date(),
      hasRealData: true,
      usage: 420,
      limit: 1000,
      remaining: 580,
      percentage: 42,
      snapshots: [],
      providerSnapshots: [
        {
          providerId: "codex",
          timestamp: new Date().toISOString(),
          windowType: "weekly_7d",
          metricType: "messages",
          sourceKind: "file",
          used: 12,
        },
      ],
      providerHealth: [
        {
          providerId: "codex",
          status: "unavailable",
          checkedAt: new Date().toISOString(),
          canCollectInCurrentWorkspace: true,
          errorCode: "CODEX_PATH_MISSING",
        },
        {
          providerId: "augment",
          status: "degraded",
          checkedAt: new Date().toISOString(),
          canCollectInCurrentWorkspace: true,
          message: '<img src=x onerror="alert(1)">',
        },
      ],
    });
    expect(html).toContain("Last 7 days: 12 turns");
    expect(html).toContain("No history found; check the Codex path");
    expect(html).toContain("Last recorded values shown.");
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");
    expect(html).toContain('id="refresh"');
    expect(html).toContain('aria-label="Usage actions"');
    expect(html).toContain("script-src 'nonce-");
  });

  it("removes unsupported weekly comparisons and distinguishes paused and waiting states", () => {
    const html = renderUsageDashboard({
      generatedAt: new Date(),
      hasRealData: false,
      enabled: false,
      augmentConnected: true,
      usage: 0,
      limit: 0,
      remaining: 0,
      percentage: 0,
      snapshots: [],
      providerSnapshots: [1, 2].map(used => ({
        providerId: "codex",
        timestamp: new Date(used).toISOString(),
        windowType: "weekly_7d",
        metricType: "messages",
        sourceKind: "file",
        used,
      })),
    });
    expect(html).toContain("Augmeter is paused");
    expect(html).toContain("Waiting for Augment credits");
    expect(html).toContain('data-command="augmeter.manualRefresh" disabled');
    expect(html).not.toContain("from the previous 7 days");
  });
});
