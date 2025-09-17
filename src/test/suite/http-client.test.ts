import * as assert from "assert";
import { HttpClient } from "../../core/http/http-client";
import { AugmeterError } from "../../core/errors/augmeter-error";

// Minimal fake Headers-like helper
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

suite("HttpClient Test Suite", () => {
  let client: HttpClient;

  test("Parses JSON response on success", async () => {
    const resp: FakeResponse = {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new FakeHeaders({ "content-type": "application/json" }),
      json: async () => ({ hello: "world" }),
    };
    const fakeFetch = async () => resp as any;
    client = new HttpClient(fakeFetch as any);

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
    client = new HttpClient(fakeFetch as any);

    const res = await client.get("/test", { baseUrl: "https://example.com" });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data, "plain text");
  });

  test("Maps network errors to AugmeterError.network (ECONNREFUSED)", async () => {
    const err = new Error("ECONNREFUSED: connection refused");
    const fakeFetch = async () => {
      throw err;
    };
    client = new HttpClient(fakeFetch as any);

    await assert.rejects(
      client.get("/x", { baseUrl: "https://example.com" }),
      (e: any) => e instanceof AugmeterError && e.type === "network"
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
    client = new HttpClient(fakeFetch as any);

    const res = await client.get("/rate", { baseUrl: "https://example.com" });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 429);
    assert.match(String(res.error), /rate limited/);
  });
});
