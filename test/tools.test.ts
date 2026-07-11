import { test } from "node:test";
import assert from "node:assert/strict";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ZephyrClient } from "../src/client.ts";
import { ReviewService } from "../src/service.ts";
import { registerTools } from "../src/tools.ts";

const config = { token: "tok", baseUrl: "https://api.example.com/v2" };

function routingFetch(routes: Record<string, unknown>): typeof fetch {
  return (async (url: string) => {
    const path = new URL(url).pathname.replace(/^\/v2/, "");
    if (!(path in routes)) {
      return new Response(JSON.stringify({ message: "not mocked" }), { status: 404 });
    }
    return new Response(JSON.stringify(routes[path]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

const ROUTES: Record<string, unknown> = {
  "/issuelinks/LOYAL-1/testcases": [{ key: "LOYAL-T1", version: 1 }],
  "/issuelinks/LOYAL-1/executions": [],
  "/testcases/LOYAL-T1": {
    key: "LOYAL-T1",
    name: "Login works",
    objective: "Ensure login",
    priority: { id: 1 },
    status: { id: 10 },
  },
  "/testcases/LOYAL-T1/teststeps": {
    startAt: 0,
    maxResults: 50,
    next: null,
    values: [{ inline: { description: "Enter creds", expectedResult: "Dashboard shows" } }],
  },
  "/statuses": { values: [{ id: 10, name: "Approved" }] },
  "/priorities": { values: [{ id: 1, name: "High" }] },
};

/** Spin up an in-memory MCP client wired to the tools with a mocked Zephyr API. */
async function connectClient(routes: Record<string, unknown> = ROUTES): Promise<Client> {
  const zephyr = new ZephyrClient(config, { fetchImpl: routingFetch(routes) });
  const service = new ReviewService(zephyr);
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerTools(server, service);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

test("review_story_coverage text block contains the detailed breakdown, not just the summary", async () => {
  const client = await connectClient();
  const res = (await client.callTool({
    name: "review_story_coverage",
    arguments: { issueKey: "LOYAL-1" },
  })) as { content: { type: string; text: string }[]; structuredContent?: Record<string, unknown> };

  const text = res.content[0].text;
  // Summary still present as the leading line.
  assert.match(text, /Story LOYAL-1: 1 linked test case/);
  // The detail — a test case key and its step — must be in the TEXT block too.
  assert.match(text, /LOYAL-T1/);
  assert.match(text, /Enter creds/);
  assert.match(text, /Dashboard shows/);

  await client.close();
});

test("structuredContent is still populated with the full payload", async () => {
  const client = await connectClient();
  const res = (await client.callTool({
    name: "review_story_coverage",
    arguments: { issueKey: "LOYAL-1" },
  })) as { structuredContent?: { testCases?: { key?: string }[] } };

  assert.ok(res.structuredContent, "structuredContent should be present");
  assert.equal(res.structuredContent.testCases?.[0]?.key, "LOYAL-T1");

  await client.close();
});

test("get_test_case text block includes step detail", async () => {
  const client = await connectClient();
  const res = (await client.callTool({
    name: "get_test_case",
    arguments: { testCaseKey: "LOYAL-T1" },
  })) as { content: { text: string }[] };

  const text = res.content[0].text;
  assert.match(text, /LOYAL-T1/);
  assert.match(text, /Enter creds/);

  await client.close();
});

test("list_test_case_executions returns full history with richer detail in the text block", async () => {
  const routes: Record<string, unknown> = {
    "/testexecutions": {
      startAt: 0,
      maxResults: 50,
      next: null,
      values: [
        { id: 1, key: "LOYAL-E1", testExecutionStatus: { id: 5 }, actualEndDate: "2026-06-01T10:00:00Z", testCycle: { id: 900 } },
        {
          id: 2,
          key: "LOYAL-E2",
          testExecutionStatus: { id: 5 },
          actualEndDate: "2026-06-05T10:00:00Z",
          testCycle: { id: 901 },
          executionTime: 120000,
          executedById: "acc-1",
          links: { issues: [{ issueId: 10100, type: "BLOCKS" }] },
        },
      ],
    },
    "/statuses": { values: [{ id: 5, name: "Pass" }] },
  };
  const client = await connectClient(routes);
  const res = (await client.callTool({
    name: "list_test_case_executions",
    arguments: { testCaseKey: "LOYAL-T1" },
  })) as { content: { text: string }[]; structuredContent?: { executions?: { key?: string }[] } };

  const text = res.content[0].text;
  assert.match(text, /Test case LOYAL-T1: 2 execution\(s\)/);
  // Full detail present in the text block, newest-first.
  assert.match(text, /LOYAL-E2/);
  assert.match(text, /LOYAL-E1/);
  assert.match(text, /120000/); // richer field: executionTime
  assert.match(text, /10100/); // richer field: linked Jira issue
  assert.equal(res.structuredContent?.executions?.[0]?.key, "LOYAL-E2");

  await client.close();
});

test("list_test_case_executions returns an empty history (not an error) with a clear message", async () => {
  const routes: Record<string, unknown> = {
    "/testexecutions": { startAt: 0, maxResults: 50, next: null, values: [] },
    "/statuses": { values: [{ id: 5, name: "Pass" }] },
  };
  const client = await connectClient(routes);
  const res = (await client.callTool({
    name: "list_test_case_executions",
    arguments: { testCaseKey: "LOYAL-T9" },
  })) as { content: { text: string }[]; structuredContent?: { executions?: unknown[] } };

  const text = res.content[0].text;
  assert.match(text, /Test case LOYAL-T9: no executions/);
  assert.deepEqual(res.structuredContent?.executions, []);

  await client.close();
});

test("list_story_test_cases surfaces titles in the text block without step detail", async () => {
  const client = await connectClient();
  const res = (await client.callTool({
    name: "list_story_test_cases",
    arguments: { issueKey: "LOYAL-1" },
  })) as { content: { text: string }[] };

  const text = res.content[0].text;
  assert.match(text, /Story LOYAL-1: 1 linked test case/);
  assert.match(text, /LOYAL-T1/);
  assert.match(text, /Login works/); // the title/name is present
  assert.ok(!text.includes("Enter creds"), "listing must not include step detail");

  await client.close();
});
