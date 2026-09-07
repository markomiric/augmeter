import { describe, expect, it, vi } from "vitest";
import { AugmentApiClient } from "../services/augment-api-client";

describe("AugmentApiClient", () => {
  it("discards an in-flight response after the session is cleared", async () => {
    let release!: (response: Response) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>(resolve => {
          release = resolve;
        })
    ) as typeof fetch;
    const client = new AugmentApiClient(undefined, undefined, fetcher);
    client.setSessionCookie("_session=augmeter-test-session-0123456789");

    const pending = client.getUsageData();
    await client.clearSessionCookie();
    release(
      new Response(JSON.stringify({ used: 10, limit: 100 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    await expect(pending).resolves.toMatchObject({ success: false, code: "STALE" });
    expect(client.hasCookie()).toBe(false);
  });

  it("resolves the API base URL at request time", async () => {
    let currentBaseUrl = "https://tenant-one.example/api";
    const urls: string[] = [];
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      urls.push(String(input));
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    const client = new AugmentApiClient(undefined, () => currentBaseUrl, fetcher);

    await client.getCreditsInfo();
    currentBaseUrl = "https://tenant-two.example/api";
    await client.getCreditsInfo();

    expect(urls).toEqual([
      "https://tenant-one.example/api/credits",
      "https://tenant-two.example/api/credits",
    ]);
  });

  it("falls back to the default base URL when the resolver throws", async () => {
    const urls: string[] = [];
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      urls.push(String(input));
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    const client = new AugmentApiClient(
      undefined,
      () => {
        throw new Error("boom");
      },
      fetcher
    );

    await client.getCreditsInfo();

    expect(urls).toEqual(["https://app.augmentcode.com/api/credits"]);
  });
});
