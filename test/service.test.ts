import { test } from "node:test";
import assert from "node:assert/strict";
import { ZephyrClient } from "../src/client.ts";
import { ReviewService } from "../src/service.ts";
import { normalizeStatus } from "../src/digest.ts";

const config = { token: "tok", baseUrl: "https://api.example.com/v2" };

/** Build a routing fetch mock from a path→body map (query string ignored). */
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

const STATUSES = [
  { id: 10, name: "Approved" },
  { id: 5, name: "Pass" },
  { id: 6, name: "Fail" },
];
const PRIORITIES = [{ id: 1, name: "High" }];

test("review_story_coverage assembles a digested bundle with summary", async () => {
  const routes: Record<string, unknown> = {
    "/issuelinks/LOYAL-1/testcases": [
      { key: "LOYAL-T1", version: 1 },
      { key: "LOYAL-T2", version: 2 },
    ],
    "/issuelinks/LOYAL-1/executions": [{ id: 100 }, { id: 101 }],
    "/testcases/LOYAL-T1": {
      key: "LOYAL-T1",
      name: "Login works",
      objective: "Ensure login",
      priority: { id: 1 },
      status: { id: 10 },
      labels: ["Regression"],
    },
    "/testcases/LOYAL-T2": {
      key: "LOYAL-T2",
      name: "Logout works",
      objective: null,
      priority: { id: 1 },
      status: { id: 10 },
    },
    "/testcases/LOYAL-T1/teststeps": {
      startAt: 0,
      maxResults: 50,
      next: null,
      values: [
        { inline: { description: "Enter creds", expectedResult: "Dashboard shows", testData: "u/p" } },
        { inline: { description: "Click submit", expectedResult: null } }, // missing expected
      ],
    },
    "/testcases/LOYAL-T2/teststeps": {
      startAt: 0,
      maxResults: 50,
      next: null,
      values: [{ inline: { description: "Click logout", expectedResult: "Back to login" } }],
    },
    "/testexecutions/100": {
      id: 100,
      key: "LOYAL-E1",
      testCase: { self: "https://api.example.com/v2/testcases/LOYAL-T1/versions/1" },
      testExecutionStatus: { id: 5 },
      actualEndDate: "2026-06-01T10:00:00Z",
      testCycle: { id: 900 },
    },
    "/testexecutions/101": {
      id: 101,
      key: "LOYAL-E2",
      testCase: { self: "https://api.example.com/v2/testcases/LOYAL-T2/versions/2" },
      testExecutionStatus: { id: 6 },
      actualEndDate: "2026-06-02T10:00:00Z",
      testCycle: { id: 900 },
    },
    "/statuses": { startAt: 0, maxResults: 50, next: null, values: STATUSES },
    "/priorities": { startAt: 0, maxResults: 50, next: null, values: PRIORITIES },
  };

  const client = new ZephyrClient(config, { fetchImpl: routingFetch(routes) });
  const service = new ReviewService(client);
  const bundle = await service.reviewStoryCoverage("LOYAL-1");

  assert.equal(bundle.summary.totalTestCases, 2);
  assert.equal(bundle.summary.passed, 1);
  assert.equal(bundle.summary.failed, 1);
  assert.equal(bundle.summary.stepsMissingExpected, 1);
  assert.equal(bundle.summary.totalSteps, 3);

  const t1 = bundle.testCases.find((t) => t.key === "LOYAL-T1")!;
  assert.equal(t1.priority, "High");
  assert.equal(t1.status, "Approved");
  assert.equal(t1.lastExecution?.normalizedStatus, "passed");
  assert.equal(t1.quality.stepsMissingExpected, 1);
  assert.equal(t1.steps[0].action, "Enter creds");
  assert.equal(t1.steps[0].expected, "Dashboard shows");

  // Test cycle 900 referenced once.
  assert.deepEqual(bundle.cycles, [{ id: 900 }]);
});

test("review_story_coverage returns empty coverage (not an error) when nothing is linked", async () => {
  const routes: Record<string, unknown> = {
    "/issuelinks/LOYAL-9/testcases": [],
    "/issuelinks/LOYAL-9/executions": [],
    "/statuses": { values: [] },
    "/priorities": { values: [] },
  };
  const client = new ZephyrClient(config, { fetchImpl: routingFetch(routes) });
  const service = new ReviewService(client);
  const bundle = await service.reviewStoryCoverage("LOYAL-9");

  assert.equal(bundle.summary.totalTestCases, 0);
  assert.equal(bundle.testCases.length, 0);
  assert.match(bundle.notes.join(" "), /No test cases are linked/);
});

test("listTestCaseExecutions returns full history newest-first with status names", async () => {
  const routes: Record<string, unknown> = {
    "/testexecutions": {
      startAt: 0,
      maxResults: 50,
      next: null,
      values: [
        { id: 1, key: "LOYAL-E1", testExecutionStatus: { id: 5 }, actualEndDate: "2026-06-01T10:00:00Z", testCycle: { id: 900 } },
        { id: 2, key: "LOYAL-E2", testExecutionStatus: { id: 6 }, actualEndDate: "2026-06-05T10:00:00Z", testCycle: { id: 901 } },
      ],
    },
    "/statuses": { values: STATUSES },
  };
  const client = new ZephyrClient(config, { fetchImpl: routingFetch(routes) });
  const service = new ReviewService(client);
  const execs = await service.listTestCaseExecutions("LOYAL-T1");

  assert.equal(execs.length, 2);
  // Newest-first: LOYAL-E2 (2026-06-05) before LOYAL-E1 (2026-06-01).
  assert.deepEqual(execs.map((e) => e.key), ["LOYAL-E2", "LOYAL-E1"]);
  assert.equal(execs[0].normalizedStatus, "failed");
  assert.equal(execs[1].normalizedStatus, "passed");
  assert.equal(execs[1].cycleId, 900);
});

test("listTestCaseExecutions returns an empty list when the case has never run", async () => {
  const routes: Record<string, unknown> = {
    "/testexecutions": { startAt: 0, maxResults: 50, next: null, values: [] },
    "/statuses": { values: STATUSES },
  };
  const client = new ZephyrClient(config, { fetchImpl: routingFetch(routes) });
  const service = new ReviewService(client);
  const execs = await service.listTestCaseExecutions("LOYAL-T9");
  assert.deepEqual(execs, []);
});

test("listTestCaseExecutions surfaces richer per-execution fields when present", async () => {
  const routes: Record<string, unknown> = {
    "/testexecutions": {
      startAt: 0,
      maxResults: 50,
      next: null,
      values: [
        {
          id: 1,
          key: "LOYAL-E1",
          testExecutionStatus: { id: 6 },
          actualEndDate: "2026-06-01T10:00:00Z",
          testCycle: { id: 900 },
          executionTime: 120000,
          estimatedTime: 138000,
          executedById: "acc-1",
          assignedToId: "acc-2",
          environment: { id: 42 },
          customFields: { "Build Number": 20 },
          comment: "Login failed",
          links: { issues: [{ issueId: 10100, target: "https://jira/issue/10100", type: "BLOCKS" }] },
        },
      ],
    },
    "/statuses": { values: STATUSES },
  };
  const client = new ZephyrClient(config, { fetchImpl: routingFetch(routes) });
  const service = new ReviewService(client);
  const [e] = await service.listTestCaseExecutions("LOYAL-T1");

  assert.equal(e.executionTime, 120000);
  assert.equal(e.estimatedTime, 138000);
  assert.equal(e.executedById, "acc-1");
  assert.equal(e.assignedToId, "acc-2");
  assert.equal(e.environmentId, 42);
  assert.equal((e.customFields as Record<string, unknown>)["Build Number"], 20);
  assert.equal(e.linkedIssues?.[0]?.issueId, 10100);
  assert.equal(e.linkedIssues?.[0]?.type, "BLOCKS");
});

test("search_test_cases filters client-side by query", async () => {
  const routes: Record<string, unknown> = {
    "/testcases": {
      startAt: 0,
      maxResults: 50,
      next: null,
      values: [
        { key: "LOYAL-T1", name: "Login", objective: "auth" },
        { key: "LOYAL-T2", name: "Logout", objective: "session" },
        { key: "LOYAL-T3", name: "Points balance", objective: "loyalty" },
      ],
    },
  };
  const client = new ZephyrClient(config, { fetchImpl: routingFetch(routes) });
  const service = new ReviewService(client);
  const res = await service.searchTestCases("LOYAL", "log");
  assert.equal(res.scanned, 3);
  assert.deepEqual(res.matches.map((m) => m.key), ["LOYAL-T1", "LOYAL-T2"]);
});

test("normalizeStatus maps common labels (incl. Spanish)", () => {
  assert.equal(normalizeStatus("Pass"), "passed");
  assert.equal(normalizeStatus("Fail"), "failed");
  assert.equal(normalizeStatus("Blocked"), "blocked");
  assert.equal(normalizeStatus("Not Executed"), "not-run");
  assert.equal(normalizeStatus("No Ejecutado"), "not-run");
  assert.equal(normalizeStatus("In Progress"), "in-progress");
  assert.equal(normalizeStatus(undefined), "not-run");
  assert.equal(normalizeStatus("Deferred"), "other");
});

/** Routing fetch that also records every requested path. */
function trackingFetch(routes: Record<string, unknown>, seen: string[]): typeof fetch {
  return (async (url: string) => {
    const path = new URL(url).pathname.replace(/^\/v2/, "");
    seen.push(path);
    if (!(path in routes)) {
      return new Response(JSON.stringify({ message: "not mocked" }), { status: 404 });
    }
    return new Response(JSON.stringify(routes[path]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

test("listStoryTestCases returns key/name/priority/status and skips steps + executions", async () => {
  const routes: Record<string, unknown> = {
    "/issuelinks/LOYAL-1/testcases": [{ key: "LOYAL-T1", version: 3 }],
    "/testcases/LOYAL-T1": {
      key: "LOYAL-T1",
      name: "Login works",
      priority: { id: 1 },
      status: { id: 10 },
    },
    "/statuses": { values: STATUSES },
    "/priorities": { values: PRIORITIES },
    // Intentionally NOT mocking teststeps or executions — a call would 404 and throw.
  };
  const seen: string[] = [];
  const client = new ZephyrClient(config, { fetchImpl: trackingFetch(routes, seen) });
  const service = new ReviewService(client);

  const listing = await service.listStoryTestCases("LOYAL-1");
  assert.deepEqual(listing, [
    { key: "LOYAL-T1", name: "Login works", priority: "High", status: "Approved", version: 3 },
  ]);

  // Prove the lightweight path never touched steps or executions endpoints.
  assert.ok(!seen.some((p) => p.includes("/teststeps")), "should not fetch teststeps");
  assert.ok(!seen.some((p) => p.includes("/executions")), "should not fetch executions");
});

test("listStoryTestCases returns an empty list when no test cases are linked", async () => {
  const routes: Record<string, unknown> = {
    "/issuelinks/LOYAL-9/testcases": [],
    "/statuses": { values: [] },
    "/priorities": { values: [] },
  };
  const client = new ZephyrClient(config, { fetchImpl: routingFetch(routes) });
  const service = new ReviewService(client);
  const listing = await service.listStoryTestCases("LOYAL-9");
  assert.deepEqual(listing, []);
});
