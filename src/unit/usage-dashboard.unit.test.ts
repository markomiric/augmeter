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
      providerTargets: {
        codex: 250,
      },
    });

    expect(html).toContain("Assistant usage");
    expect(html).toContain(
      "Local activity and connected provider usage across your coding assistants."
    );
    expect(html).toContain("Assistant activity");
    expect(html).toContain("Local user turns");
    expect(html).toContain("Codex");
    expect(html).toContain("Last 7 days: 291 turns");
    expect(html).toContain("At this pace: 499% of your monthly turn target");
    expect(html).toContain("How these counts are calculated");
    expect(html).toContain(
      "Tool results, metadata, and Claude Code/Codex agent/subagent sessions are excluded"
    );
    expect(html).toContain(`Updated ${new Date("2026-03-18T01:56:29.000Z").toLocaleString()}`);
    expect(html).toContain("Augment credits aren&#39;t connected");
    expect(html).toContain("Augmeter: Connect Augment");
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
      providerTargets: { copilot: 250 },
    });

    expect(html).toContain("291 cumulative requests");
    expect(html).toContain("Time window unavailable · VS Code counter");
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
    expect(html).toContain("Cycle usage unavailable from Auggie CLI");
    expect(html).toContain(`Updated ${freshnessAt.toLocaleString()}`);
    expect(html).not.toContain("0 used this cycle");
    expect(html).not.toContain('role="progressbar"');
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
    expect(html).toContain("Cycle limit unavailable");
    expect(html).not.toContain("120 of 0 credits");
    expect(html).not.toContain('role="progressbar"');
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
        },
      ],
      providerTargets: { copilot: 100 },
    });

    expect(html).toContain("42% of your monthly request target used");
    expect(html).not.toContain("At this pace: 42%");
  });
});
