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

/**
 * Routing fetch that serves `GET /testexecutions?testCase={key}` from a
 * per-case map (as a single paged list), and everything else from `routes`.
 * A key mapped to a thrown error responds 500 so the fan-out failure path runs.
 */
function routingFetchWithExecByCase(
  routes: Record<string, unknown>,
  execByCase: Record<string, unknown[] | "error">,
): typeof fetch {
  return (async (url: string) => {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/v2/, "");
    if (path === "/testexecutions") {
      const key = u.searchParams.get("testCase") ?? "";
      const entry = execByCase[key];
      if (entry === "error") {
        return new Response(JSON.stringify({ message: "boom" }), { status: 500 });
      }
      const values = entry ?? [];
      return new Response(
        JSON.stringify({ startAt: 0, maxResults: 50, next: null, isLast: true, values }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
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
    "/statuses": { startAt: 0, maxResults: 50, next: null, values: STATUSES },
    "/priorities": { startAt: 0, maxResults: 50, next: null, values: PRIORITIES },
  };

  // Executions come per-test-case from GET /testexecutions?testCase={key}.
  const execByCase: Record<string, unknown[] | "error"> = {
    "LOYAL-T1": [
      { id: 100, key: "LOYAL-E1", testExecutionStatus: { id: 5 }, actualEndDate: "2026-06-01T10:00:00Z", testCycle: { id: 900 } },
    ],
    "LOYAL-T2": [
      { id: 101, key: "LOYAL-E2", testExecutionStatus: { id: 6 }, actualEndDate: "2026-06-02T10:00:00Z", testCycle: { id: 900 } },
    ],
  };

  const client = new ZephyrClient(config, {
    fetchImpl: routingFetchWithExecByCase(routes, execByCase),
  });
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

test("review_story_coverage sources executions per test case (regression: empty issue-link array)", async () => {
  const routes: Record<string, unknown> = {
    "/issuelinks/LOYAL-2/testcases": [{ key: "LOYAL-T5", version: 1 }],
    // Issue-link executions is empty/unreliable — must NOT be relied upon.
    "/issuelinks/LOYAL-2/executions": [],
    "/testcases/LOYAL-T5": { key: "LOYAL-T5", name: "Redeem points", priority: { id: 1 }, status: { id: 10 } },
    "/testcases/LOYAL-T5/teststeps": { startAt: 0, maxResults: 50, next: null, values: [] },
    "/statuses": { values: STATUSES },
    "/priorities": { values: PRIORITIES },
  };
  const execByCase: Record<string, unknown[] | "error"> = {
    "LOYAL-T5": [
      { id: 200, key: "LOYAL-E5", testExecutionStatus: { id: 5 }, actualEndDate: "2026-06-10T10:00:00Z", testCycle: { id: 950 } },
    ],
  };

  const client = new ZephyrClient(config, {
    fetchImpl: routingFetchWithExecByCase(routes, execByCase),
  });
  const service = new ReviewService(client);
  const bundle = await service.reviewStoryCoverage("LOYAL-2");

  const t5 = bundle.testCases.find((t) => t.key === "LOYAL-T5")!;
  assert.equal(t5.lastExecution?.normalizedStatus, "passed");
  assert.equal(t5.lastExecution?.key, "LOYAL-E5");
  assert.equal(bundle.summary.passed, 1);
  assert.deepEqual(bundle.cycles, [{ id: 950 }]);
});

test("review_story_coverage is best-effort when a per-case execution fetch fails", async () => {
  const routes: Record<string, unknown> = {
    "/issuelinks/LOYAL-3/testcases": [
      { key: "LOYAL-T6", version: 1 },
      { key: "LOYAL-T7", version: 1 },
    ],
    "/testcases/LOYAL-T6": { key: "LOYAL-T6", name: "Case six", priority: { id: 1 }, status: { id: 10 } },
    "/testcases/LOYAL-T7": { key: "LOYAL-T7", name: "Case seven", priority: { id: 1 }, status: { id: 10 } },
    "/testcases/LOYAL-T6/teststeps": { startAt: 0, maxResults: 50, next: null, values: [] },
    "/testcases/LOYAL-T7/teststeps": { startAt: 0, maxResults: 50, next: null, values: [] },
    "/statuses": { values: STATUSES },
    "/priorities": { values: PRIORITIES },
  };
  const execByCase: Record<string, unknown[] | "error"> = {
    "LOYAL-T6": "error", // fetch fails for this key only
    "LOYAL-T7": [
      { id: 300, key: "LOYAL-E7", testExecutionStatus: { id: 5 }, actualEndDate: "2026-06-11T10:00:00Z", testCycle: { id: 960 } },
    ],
  };

  const client = new ZephyrClient(config, {
    fetchImpl: routingFetchWithExecByCase(routes, execByCase),
  });
  const service = new ReviewService(client);
  const bundle = await service.reviewStoryCoverage("LOYAL-3");

  // Bundle still returned; the healthy case keeps its execution, the failed one is omitted.
  assert.equal(bundle.testCases.length, 2);
  const t6 = bundle.testCases.find((t) => t.key === "LOYAL-T6")!;
  const t7 = bundle.testCases.find((t) => t.key === "LOYAL-T7")!;
  assert.equal(t6.lastExecution, null);
  assert.equal(t7.lastExecution?.normalizedStatus, "passed");
  assert.match(bundle.notes.join(" "), /Could not load executions for LOYAL-T6/);
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

const CYCLE_STATUSES = [...STATUSES, { id: 7, name: "Done" }];

test("listStoryExecutions enriches executions with cycle name/key and lists linked cycles", async () => {
  const routes: Record<string, unknown> = {
    // 901 is linked but has no execution — it must still appear in `cycles`.
    "/issuelinks/LOYAL-1/testcycles": [{ id: 900 }, { id: 901 }],
    "/testcycles/900": { id: 900, key: "LOYAL-R1", name: "Sprint 1", status: { id: 7 } },
    "/testcycles/901": { id: 901, key: "LOYAL-R2", name: "Sprint 2", status: { id: 7 } },
    "/issuelinks/LOYAL-1/executions": [{ id: 100 }],
    "/testexecutions/100": {
      id: 100,
      key: "LOYAL-E1",
      testExecutionStatus: { id: 5 },
      actualEndDate: "2026-06-01T10:00:00Z",
      testCycle: { id: 900 },
    },
    "/statuses": { values: CYCLE_STATUSES },
  };
  const client = new ZephyrClient(config, { fetchImpl: routingFetch(routes) });
  const service = new ReviewService(client);
  const { executions, cycles } = await service.listStoryExecutions("LOYAL-1");

  assert.equal(executions.length, 1);
  assert.equal(executions[0].cycleId, 900);
  assert.equal(executions[0].cycle, "Sprint 1");
  assert.equal(executions[0].cycleKey, "LOYAL-R1");
  assert.equal(executions[0].normalizedStatus, "passed");

  // Both linked cycles present, including the one with no execution.
  const byId = new Map(cycles.map((c) => [c.id, c]));
  assert.equal(cycles.length, 2);
  assert.deepEqual(byId.get(901), { id: 901, key: "LOYAL-R2", name: "Sprint 2", status: "Done" });
});

test("listStoryExecutions is best-effort when a cycle detail fails", async () => {
  const fetchImpl = (async (url: string) => {
    const path = new URL(url).pathname.replace(/^\/v2/, "");
    if (path === "/testcycles/900") {
      return new Response(JSON.stringify({ message: "boom" }), { status: 500 });
    }
    const routes: Record<string, unknown> = {
      "/issuelinks/LOYAL-1/testcycles": [{ id: 900 }],
      "/issuelinks/LOYAL-1/executions": [{ id: 100 }],
      "/testexecutions/100": {
        id: 100,
        key: "LOYAL-E1",
        testExecutionStatus: { id: 5 },
        actualEndDate: "2026-06-01T10:00:00Z",
        testCycle: { id: 900 },
      },
      "/statuses": { values: CYCLE_STATUSES },
    };
    if (!(path in routes)) {
      return new Response(JSON.stringify({ message: "not mocked" }), { status: 404 });
    }
    return new Response(JSON.stringify(routes[path]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;

  const client = new ZephyrClient(config, { fetchImpl });
  const service = new ReviewService(client);
  const { executions, cycles } = await service.listStoryExecutions("LOYAL-1");

  // Execution still returned; cycle name omitted; failed cycle dropped from list.
  assert.equal(executions.length, 1);
  assert.equal(executions[0].cycleId, 900);
  assert.equal(executions[0].cycle, undefined);
  assert.equal(executions[0].cycleKey, undefined);
  assert.deepEqual(cycles, []);
});
