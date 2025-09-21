import { describe, it, expect } from "vitest";
import { HttpClient } from "../core/http/http-client";

// Minimal fake Headers-like helper for Node unit tests
class FakeHeaders {
  private map = new Map<string, string>();
  constructor(init?: Record<string, string>) {
    if (init) for (const [k, v] of Object.entries(init)) this.map.set(k.toLowerCase(), v);
  }
  get(key: string) {
    return this.map.get(key.toLowerCase()) || null;
  }
  forEach(cb: (value: string, key: string) => void) {
    for (const [k, v] of this.map.entries()) cb(v, k);
  }
}

type FakeResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  headers: FakeHeaders;
  json?: () => Promise<any>;
  text?: () => Promise<string>;
};

describe("HttpClient (unit) Test Suite", () => {
  it("Parses JSON response on success", async () => {
    const resp: FakeResponse = {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new FakeHeaders({ "content-type": "application/json" }),
      json: async () => ({ hello: "world" }),
    };
    const fakeFetch = async () => resp as any;
    const client = new HttpClient(fakeFetch as any);

    const res = await client.get("/test", { baseUrl: "https://example.com" });
    expect(res.success).toBe(true);
    expect(res.data).toEqual({ hello: "world" });
  });

  it("Parses text response when not JSON", async () => {
    const resp: FakeResponse = {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new FakeHeaders({ "content-type": "text/plain" }),
      text: async () => "plain text",
    };
    const fakeFetch = async () => resp as any;
    const client = new HttpClient(fakeFetch as any);

    const res = await client.get("/test", { baseUrl: "https://example.com" });
    expect(res.success).toBe(true);
    expect(res.data).toBe("plain text");
  });

  it("Maps network errors to AugmeterError.network (ECONNREFUSED)", async () => {
    const err = new Error("ECONNREFUSED: connection refused");
    const fakeFetch = async () => {
      throw err;
    };
    const client = new HttpClient(fakeFetch as any);

    await expect(client.get("/x", { baseUrl: "https://example.com" })).rejects.toMatchObject({
      type: "network",
    });
  });

  it("Returns error details on non-2xx with JSON payload", async () => {
    const resp: FakeResponse = {
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      headers: new FakeHeaders({ "content-type": "application/json" }),
      json: async () => ({ error: "rate limited" }),
    };
    const fakeFetch = async () => resp as any;
    const client = new HttpClient(fakeFetch as any);

    const res = await client.get("/rate", { baseUrl: "https://example.com" });
    expect(res.success).toBe(false);
    expect(res.status).toBe(429);
    expect(String(res.error)).toMatch(/rate limited/);
  });

  it("Timeout maps to AugmeterError.network with AbortError", async () => {
    const fakeFetch = (_url: string, init: any) => {
      return new Promise((_resolve, reject) => {
        const err: any = new Error("aborted");
        err.name = "AbortError";
        if (init && init.signal) {
          init.signal.addEventListener("abort", () => reject(err));
        }
      });
    };
    const client = new HttpClient(fakeFetch as any);
    await expect(
      client.get("/timeout", { baseUrl: "https://example.com", timeout: 5 })
    ).rejects.toMatchObject({
      type: "network",
    });
  });

  it("Non-JSON error body retains text and builds default error message", async () => {
    const resp: FakeResponse = {
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      headers: new FakeHeaders({ "content-type": "text/plain" }),
      text: async () => "oops",
    };
    const fakeFetch = async () => resp as any;
    const client = new HttpClient(fakeFetch as any);

    const res = await client.get("/err", { baseUrl: "https://example.com" });
    expect(res.success).toBe(false);
    expect(res.data).toBe("oops");
    expect(String(res.error)).toMatch(/HTTP 500: Internal Server Error/);
  });

  it("Headers are merged and passed to fetch", async () => {
    let capturedHeaders: any;
    const resp: FakeResponse = {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new FakeHeaders({ "content-type": "application/json" }),
      json: async () => ({ ok: true }),
    };
    const fakeFetch = async (_url: string, init: any) => {
      capturedHeaders = init.headers;
      return resp as any;
    };
    const client = new HttpClient(fakeFetch as any);
    const res = await client.get("/hdr", {
      baseUrl: "https://example.com",
      headers: { "X-Test": "1" },
    });
    expect(res.success).toBe(true);
    // Normalize header shapes
    const h = new Map<string, string>(
      Object.entries(capturedHeaders).map(([k, v]: any) => [String(k).toLowerCase(), String(v)])
    );
    expect(h.get("content-type")).toBe("application/json");
    expect(h.get("x-test")).toBe("1");
  });
});
