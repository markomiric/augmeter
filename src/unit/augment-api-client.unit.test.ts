import { describe, expect, it, vi } from "vitest";
import { AugmentApiClient } from "../services/augment-api-client";

describe("AugmentApiClient", () => {
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
