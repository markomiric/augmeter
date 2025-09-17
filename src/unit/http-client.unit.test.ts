import * as assert from "assert";
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

suite("HttpClient (unit) Test Suite", () => {
  test("Parses JSON response on success", async () => {
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
    assert.strictEqual(res.success, true);
    assert.deepStrictEqual(res.data, { hello: "world" });
  });

  test("Parses text response when not JSON", async () => {
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
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data, "plain text");
  });

  test("Maps network errors to AugmeterError.network (ECONNREFUSED)", async () => {
    const err = new Error("ECONNREFUSED: connection refused");
    const fakeFetch = async () => {
      throw err;
    };
    const client = new HttpClient(fakeFetch as any);

    await assert.rejects(
      client.get("/x", { baseUrl: "https://example.com" }),
      (e: any) =>
        e &&
        (e.name === "AugmeterError" || e.constructor?.name === "AugmeterError") &&
        e.type === "network"
    );
  });

  test("Returns error details on non-2xx with JSON payload", async () => {
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
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 429);
    assert.match(String(res.error), /rate limited/);
  });

  test("Timeout maps to AugmeterError.network with AbortError", async () => {
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
    await assert.rejects(
      client.get("/timeout", { baseUrl: "https://example.com", timeout: 5 }),
      (e: any) =>
        e &&
        (e.name === "AugmeterError" || e.constructor?.name === "AugmeterError") &&
        e.type === "network"
    );
  });

  test("Non-JSON error body retains text and builds default error message", async () => {
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
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.data, "oops");
    assert.match(String(res.error), /HTTP 500: Internal Server Error/);
  });

  test("Headers are merged and passed to fetch", async () => {
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
    assert.strictEqual(res.success, true);
    // Normalize header shapes
    const h = new Map<string, string>(
      Object.entries(capturedHeaders).map(([k, v]: any) => [String(k).toLowerCase(), String(v)])
    );
    assert.strictEqual(h.get("content-type"), "application/json");
    assert.strictEqual(h.get("x-test"), "1");
  });
});
