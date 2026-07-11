import { test } from "node:test";
import assert from "node:assert/strict";
import { ZephyrApiError, ZephyrClient } from "../src/client.ts";

const config = { token: "tok", baseUrl: "https://api.example.com/v2" };

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

test("attaches bearer auth header and issues GET", async () => {
  let captured: RequestInit | undefined;
  let capturedUrl = "";
  const client = new ZephyrClient(config, {
    fetchImpl: (async (url: string, init?: RequestInit) => {
      captured = init;
      capturedUrl = url;
      return jsonResponse({ id: 1, key: "P", jiraProjectId: 2, enabled: true });
    }) as unknown as typeof fetch,
  });

  await client.getProject("LOYAL");
  assert.equal(captured?.method, "GET");
  assert.equal((captured?.headers as Record<string, string>).Authorization, "Bearer tok");
  assert.equal(capturedUrl, "https://api.example.com/v2/projects/LOYAL");
});

test("maps 401 to an unauthorized error", async () => {
  const client = new ZephyrClient(config, {
    fetchImpl: (async () => jsonResponse({ message: "bad token" }, 401)) as unknown as typeof fetch,
  });
  await assert.rejects(client.getProject("LOYAL"), (e: unknown) => {
    assert.ok(e instanceof ZephyrApiError);
    assert.equal((e as ZephyrApiError).kind, "unauthorized");
    return true;
  });
});

test("maps 404 to a not_found error", async () => {
  const client = new ZephyrClient(config, {
    fetchImpl: (async () => jsonResponse({ message: "nope" }, 404)) as unknown as typeof fetch,
  });
  await assert.rejects(client.getTestCase("LOYAL-T1"), (e: unknown) => {
    assert.equal((e as ZephyrApiError).kind, "not_found");
    return true;
  });
});

test("retries on 429 honoring Retry-After, then succeeds", async () => {
  let calls = 0;
  const slept: number[] = [];
  const client = new ZephyrClient(config, {
    maxRetries: 3,
    sleep: async (ms) => {
      slept.push(ms);
    },
    fetchImpl: (async () => {
      calls += 1;
      if (calls < 3) return jsonResponse({ message: "slow down" }, 429, { "Retry-After": "1" });
      return jsonResponse({ id: 1, key: "P", jiraProjectId: 2, enabled: true });
    }) as unknown as typeof fetch,
  });

  const project = await client.getProject("LOYAL");
  assert.equal(project.key, "P");
  assert.equal(calls, 3);
  assert.deepEqual(slept, [1000, 1000]); // two retries, Retry-After = 1s each
});

test("surfaces rate_limited after retries are exhausted", async () => {
  const client = new ZephyrClient(config, {
    maxRetries: 2,
    sleep: async () => {},
    fetchImpl: (async () => jsonResponse({}, 429, { "Retry-After": "0" })) as unknown as typeof fetch,
  });
  await assert.rejects(client.getProject("LOYAL"), (e: unknown) => {
    assert.equal((e as ZephyrApiError).kind, "rate_limited");
    return true;
  });
});

test("getAllPages follows startAt pagination until a short page", async () => {
  const pages: Record<number, unknown[]> = {
    0: [{ key: "A" }, { key: "B" }],
    2: [{ key: "C" }],
  };
  const client = new ZephyrClient(config, {
    fetchImpl: (async (url: string) => {
      const startAt = Number(new URL(url).searchParams.get("startAt"));
      const values = pages[startAt] ?? [];
      return jsonResponse({ startAt, maxResults: 2, next: values.length === 2 ? "x" : null, values });
    }) as unknown as typeof fetch,
  });
  const all = await client.getProjectTestCases("LOYAL");
  assert.deepEqual(all.map((t) => t.key), ["A", "B", "C"]);
});
