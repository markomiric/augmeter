import { describe, expect, it, vi } from "vitest";
import { AugmentApiClient } from "../services/augment-api-client";
import type { HttpResponse } from "../core/http/http-client";

describe("AugmentApiClient (unit)", () => {
  it("resolves the API base URL at request time", async () => {
    let currentBaseUrl = "https://tenant-one.example/api";
    const client = new AugmentApiClient(undefined, () => currentBaseUrl);
    const capturedBaseUrls: string[] = [];

    (client as any).http = {
      makeRequest: vi.fn(async (_url: string, options?: { baseUrl?: string }) => {
        capturedBaseUrls.push(options?.baseUrl ?? "");
        return {
          success: true,
          status: 200,
          data: { ok: true },
        } satisfies HttpResponse;
      }),
    };
    (client as any).retry = {
      executeHttpWithRetry: vi.fn(
        async (operation: () => Promise<HttpResponse>) => await operation()
      ),
    };

    await client.getCreditsInfo();
    currentBaseUrl = "https://tenant-two.example/api";
    await client.getCreditsInfo();

    expect(capturedBaseUrls).toEqual([
      "https://tenant-one.example/api",
      "https://tenant-two.example/api",
    ]);
  });

  it("falls back to the default base URL when the resolver throws", async () => {
    const client = new AugmentApiClient(undefined, () => {
      throw new Error("boom");
    });
    const capturedBaseUrls: string[] = [];

    (client as any).http = {
      makeRequest: vi.fn(async (_url: string, options?: { baseUrl?: string }) => {
        capturedBaseUrls.push(options?.baseUrl ?? "");
        return {
          success: true,
          status: 200,
          data: { ok: true },
        } satisfies HttpResponse;
      }),
    };
    (client as any).retry = {
      executeHttpWithRetry: vi.fn(
        async (operation: () => Promise<HttpResponse>) => await operation()
      ),
    };

    await client.getCreditsInfo();

    expect(capturedBaseUrls).toEqual(["https://app.augmentcode.com/api"]);
  });
});
