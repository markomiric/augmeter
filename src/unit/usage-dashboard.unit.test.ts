import { describe, expect, it } from "vitest";
import { renderUsageDashboard } from "../ui/usage-dashboard";

describe("Usage dashboard renderer", () => {
  it("shows an explicit banner when Augment credit data is unavailable", () => {
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

    expect(html).toContain("Augment credit data unavailable");
    expect(html).toContain("Local provider activity may still appear below.");
    expect(html).toContain("Codex (local prompts)");
    expect(html).toContain("Scanned 74 Codex session file(s) for local prompt counts.");
    expect(html).toContain("Target risk:");
    expect(html).toContain("7d: 291 prompts");
  });

  it("does not show the unavailable banner once real Augment data exists", () => {
    const html = renderUsageDashboard({
      generatedAt: new Date("2026-03-18T01:56:39.000Z"),
      hasRealData: true,
      usage: 2400,
      limit: 4000,
      remaining: 1600,
      percentage: 60,
      subscriptionType: "Pro",
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

    expect(html).not.toContain("Augment credit data unavailable");
    expect(html).toContain("2,400 / 4,000");
  });
});
