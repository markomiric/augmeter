import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type CopilotApiFetcher,
  CopilotProviderAdapter,
} from "../../providers/adapters/copilot-provider-adapter";

const TOKEN = "ghp_synthetic_test_token";
const now = new Date("2026-06-16T12:00:00.000Z");

// Shape of GitHub's documented billing usage response (synthetic values).
function usagePayload(grossQuantities: unknown[]): unknown {
  return {
    timePeriod: { year: 2026, month: 6 },
    user: "octocat",
    usageItems: grossQuantities.map(grossQuantity => ({
      product: "copilot",
      sku: "copilot_ai_credit",
      model: "example-model",
      unitType: "ai-credits",
      pricePerUnit: 0.01,
      grossQuantity,
      grossAmount: 1,
      discountQuantity: 0,
      discountAmount: 0,
      netQuantity: grossQuantity,
      netAmount: 1,
    })),
  };
}

type Reply = { status: number; body?: unknown } | Error;

/** Routes the AI Credits and premium-request endpoints to canned replies. */
function mockFetcher(replies: { aiCredits: Reply; premium?: Reply }) {
  return vi.fn<CopilotApiFetcher>(async input => {
    const url = String(input);
    const reply = url.includes("/ai_credit/usage") ? replies.aiCredits : replies.premium;
    if (!reply) {
      throw new Error(`unexpected request to ${url}`);
    }
    if (reply instanceof Error) {
      throw reply;
    }
    return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status });
  });
}

function enabledAdapter(fetcher: CopilotApiFetcher, username = "octocat") {
  return new CopilotProviderAdapter(() => ({ enabled: true, username }), fetcher);
}

async function collect(adapter: CopilotProviderAdapter, forceRefresh = true) {
  return await adapter.collectUsage({ now, workspaceTrusted: true, forceRefresh });
}

describe("CopilotProviderAdapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GITHUB_TOKEN;
  });

  it("reports not configured, with no snapshots and no request, when the API is off", async () => {
    const fetcher = mockFetcher({ aiCredits: { status: 200, body: usagePayload([1]) } });
    const adapter = new CopilotProviderAdapter(
      () => ({ enabled: false, username: "octocat" }),
      fetcher
    );

    const result = await collect(adapter);

    expect(fetcher).not.toHaveBeenCalled();
    expect(result.snapshots).toHaveLength(0);
    expect(result.health.status).toBe("unavailable");
    expect(result.health.errorCode).toBe("COPILOT_API_NOT_CONFIGURED");
    expect(result.health.message).toContain("augmeter.providers.copilot.api.enabled");
  });

  it("returns restricted health in untrusted workspaces without a request", async () => {
    process.env.GITHUB_TOKEN = TOKEN;
    const fetcher = mockFetcher({ aiCredits: { status: 200, body: usagePayload([1]) } });
    const result = await enabledAdapter(fetcher).collectUsage({
      now,
      workspaceTrusted: false,
      forceRefresh: true,
    });

    expect(fetcher).not.toHaveBeenCalled();
    expect(result.snapshots).toHaveLength(0);
    expect(result.health.status).toBe("restricted");
  });

  it("reads AI Credits from the documented billing response", async () => {
    process.env.GITHUB_TOKEN = TOKEN;
    const fetcher = mockFetcher({ aiCredits: { status: 200, body: usagePayload([120, 30.5]) } });

    const result = await collect(enabledAdapter(fetcher));

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://api.github.com/users/octocat/settings/billing/ai_credit/usage"
    );
    expect(init?.headers).toMatchObject({
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${TOKEN}`,
      "X-GitHub-Api-Version": "2026-03-10",
    });

    expect(result.health.status).toBe("connected");
    expect(result.health.sourceKind).toBe("api");
    expect(result.snapshots).toHaveLength(1);
    const snapshot = result.snapshots[0];
    expect(snapshot).toMatchObject({
      providerId: "copilot",
      sourceKind: "api",
      source: "github-rest",
      windowType: "monthly",
      metricType: "messages",
      used: 150.5,
      details: { mode: "ai_credits", year: 2026, month: 6 },
    });
    expect(snapshot?.limit).toBeUndefined();
    expect(snapshot?.remaining).toBeUndefined();
    expect(snapshot?.percentUsed).toBeUndefined();
    expect(snapshot?.resetAt).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it.each<[string, Reply]>([
    ["404", { status: 404, body: { message: "Not Found" } }],
    ["empty usageItems", { status: 200, body: usagePayload([]) }],
  ])("falls back to premium requests when AI Credits returns %s", async (_name, aiCredits) => {
    process.env.GITHUB_TOKEN = TOKEN;
    const fetcher = mockFetcher({ aiCredits, premium: { status: 200, body: usagePayload([42]) } });

    const result = await collect(enabledAdapter(fetcher));

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1]?.[0])).toContain("/settings/billing/premium_request/usage");
    expect(result.health.status).toBe("connected");
    expect(result.snapshots[0]).toMatchObject({
      used: 42,
      windowType: "monthly",
      details: { mode: "premium_requests" },
    });
  });

  it.each<[string, Reply]>([
    ["empty", { status: 200, body: usagePayload([]) }],
    ["an error", { status: 500 }],
  ])("shows 0 AI Credits when both endpoints are empty or premium is %s", async (_n, premium) => {
    process.env.GITHUB_TOKEN = TOKEN;
    const fetcher = mockFetcher({ aiCredits: { status: 200, body: usagePayload([]) }, premium });

    const result = await collect(enabledAdapter(fetcher));

    expect(result.health.status).toBe("connected");
    expect(result.snapshots[0]).toMatchObject({ used: 0, details: { mode: "ai_credits" } });
  });

  it("explains personal-plan coverage when both endpoints return 404", async () => {
    process.env.GITHUB_TOKEN = TOKEN;
    const fetcher = mockFetcher({ aiCredits: { status: 404 }, premium: { status: 404 } });

    const result = await collect(enabledAdapter(fetcher));

    expect(result.snapshots).toHaveLength(0);
    expect(result.health.status).toBe("degraded");
    expect(result.health.errorCode).toBe("COPILOT_API_NO_BILLING_DATA");
    expect(result.health.message).toBe(
      "GitHub returned no personal Copilot billing data (HTTP 404); this API covers Copilot plans you pay for yourself."
    );
  });

  it("points to the token permission when the premium-request fallback returns 403", async () => {
    process.env.GITHUB_TOKEN = TOKEN;
    const fetcher = mockFetcher({ aiCredits: { status: 404 }, premium: { status: 403 } });

    const result = await collect(enabledAdapter(fetcher));

    expect(result.health.errorCode).toBe("COPILOT_API_FORBIDDEN");
    expect(result.health.message).toBe(
      "GitHub denied access to Copilot billing data (HTTP 403). Check that GITHUB_TOKEN can read billing usage (a fine-grained token needs the Plan user permission); this API covers only Copilot plans you pay for yourself."
    );
  });

  it("points to the token permission on AI Credits 403 without querying premium requests", async () => {
    process.env.GITHUB_TOKEN = TOKEN;
    const fetcher = mockFetcher({ aiCredits: { status: 403 } });

    const result = await collect(enabledAdapter(fetcher));

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.health.status).toBe("degraded");
    expect(result.health.errorCode).toBe("COPILOT_API_FORBIDDEN");
    expect(result.health.message).toContain("(HTTP 403)");
  });

  it("reports other HTTP failures without querying premium requests", async () => {
    process.env.GITHUB_TOKEN = TOKEN;
    const fetcher = mockFetcher({ aiCredits: { status: 500 } });

    const result = await collect(enabledAdapter(fetcher));

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.health.status).toBe("degraded");
    expect(result.health.errorCode).toBe("COPILOT_API_FAILED");
    expect(result.health.message).toBe("GitHub Copilot returned HTTP 500.");
  });

  it("keeps raw network error text out of the health message", async () => {
    process.env.GITHUB_TOKEN = TOKEN;
    const fetcher = mockFetcher({ aiCredits: new Error("connect ECONNREFUSED [secret-host]") });

    const result = await collect(enabledAdapter(fetcher));

    expect(result.health.status).toBe("degraded");
    expect(result.health.errorCode).toBe("COPILOT_API_FAILED");
    expect(result.health.message).toBe(
      "GitHub Copilot API is unavailable (the request failed; check Output > Augmeter)."
    );
  });

  it("reports a timeout as a timeout", async () => {
    process.env.GITHUB_TOKEN = TOKEN;
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    const result = await collect(enabledAdapter(mockFetcher({ aiCredits: abort })));

    expect(result.health.message).toBe(
      "GitHub Copilot API is unavailable (the request timed out)."
    );
  });

  it.each<[string, unknown]>([
    ["a non-object body", ["not", "an", "object"]],
    ["missing usageItems", { timePeriod: { year: 2026 } }],
    ["items without a numeric grossQuantity", usagePayload(["12", null])],
  ])("treats %s as malformed", async (_name, body) => {
    process.env.GITHUB_TOKEN = TOKEN;
    const fetcher = mockFetcher({ aiCredits: { status: 200, body } });

    const result = await collect(enabledAdapter(fetcher));

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.snapshots).toHaveLength(0);
    expect(result.health.status).toBe("degraded");
    expect(result.health.message).toBe(
      "GitHub Copilot returned billing data Augmeter couldn't read."
    );
  });

  it("asks for the GITHUB_TOKEN environment variable when it is missing", async () => {
    const fetcher = mockFetcher({ aiCredits: { status: 200, body: usagePayload([1]) } });

    const result = await collect(enabledAdapter(fetcher));

    expect(fetcher).not.toHaveBeenCalled();
    expect(result.health.status).toBe("unavailable");
    expect(result.health.errorCode).toBe("COPILOT_API_TOKEN_MISSING");
    expect(result.health.message).toContain("GITHUB_TOKEN");
  });

  it("asks for a username when it is missing", async () => {
    process.env.GITHUB_TOKEN = TOKEN;
    const fetcher = mockFetcher({ aiCredits: { status: 200, body: usagePayload([1]) } });

    const result = await collect(enabledAdapter(fetcher, "  "));

    expect(fetcher).not.toHaveBeenCalled();
    expect(result.health.errorCode).toBe("COPILOT_API_USERNAME_MISSING");
    expect(result.health.message).toContain("augmeter.providers.copilot.api.username");
  });

  it("reuses the last result for five minutes unless refresh is forced", async () => {
    process.env.GITHUB_TOKEN = TOKEN;
    const fetcher = mockFetcher({ aiCredits: { status: 200, body: usagePayload([5]) } });
    const adapter = enabledAdapter(fetcher);

    await collect(adapter);
    await collect(adapter, false);
    expect(fetcher).toHaveBeenCalledTimes(1);

    await collect(adapter, true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not cache a result for settings that changed during the request", async () => {
    process.env.GITHUB_TOKEN = TOKEN;
    let settings = { enabled: true, username: "alice" };
    const pending: Array<() => void> = [];
    const fetcher = vi.fn<CopilotApiFetcher>(async () => {
      await new Promise<void>(resolve => pending.push(resolve));
      return new Response(JSON.stringify(usagePayload([1])), { status: 200 });
    });
    const adapter = new CopilotProviderAdapter(() => settings, fetcher);

    const stalePoll = collect(adapter, false);
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    settings = { enabled: false, username: "alice" };
    const configChange = await collect(adapter, true);
    pending[0]!();
    await stalePoll;
    const nextPoll = await collect(adapter, false);

    expect(configChange.health.errorCode).toBe("COPILOT_API_NOT_CONFIGURED");
    expect(nextPoll.health.errorCode).toBe("COPILOT_API_NOT_CONFIGURED");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not import a subprocess module", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../../providers/adapters/copilot-provider-adapter.ts"),
      "utf8"
    );
    expect(source).not.toMatch(/child_process|execFile|spawn/);
  });
});
