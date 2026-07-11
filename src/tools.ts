/**
 * Tool registration. All tools are read-only and delegate to {@link ReviewService}.
 * Handlers return both a human-readable text summary and the structured JSON so
 * the model can reason over either.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ZephyrApiError } from "./client.js";
import type { ReviewService } from "./service.js";

const ISSUE_KEY = z
  .string()
  .regex(/.+-[0-9]+/, "Expected a Jira issue key like PROJ-123")
  .describe("The Jira issue key of the story, e.g. LOYAL-1234");

const TEST_CASE_KEY = z
  .string()
  .regex(/.+-T[0-9]+/, "Expected a Zephyr test case key like PROJ-T45")
  .describe("The Zephyr test case key, e.g. LOYAL-T45");

const PROJECT_KEY = z.string().min(1).describe("The Jira/Zephyr project key, e.g. LOYAL");

/**
 * Build a successful tool result. The `content` text block is self-contained:
 * a one-line `summary` for quick scanning, followed by the full payload as
 * pretty-printed JSON — so clients that read only the text block (and ignore
 * `structuredContent`) still receive the complete result. `structuredContent`
 * is kept populated for clients that support it.
 */
function result(payload: unknown, summary: string) {
  const text = `${summary}\n\n${JSON.stringify(payload, null, 2)}`;
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: payload as Record<string, unknown>,
  };
}

function errorResult(err: unknown) {
  const message =
    err instanceof ZephyrApiError
      ? `Zephyr error [${err.kind}]: ${err.message}`
      : `Unexpected error: ${(err as Error).message}`;
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

export function registerTools(server: McpServer, service: ReviewService): void {
  server.registerTool(
    "review_story_coverage",
    {
      title: "Review story test coverage",
      description:
        "FULL coverage for one story (Jira issue key), including every step and execution. Use when " +
        "assessing whether a story is well covered, well-formed, or passing. Returns a digested " +
        "bundle: linked test cases with objective, priority, status, steps (action / expected " +
        "result / data), each case's most recent execution, referenced test cycles, and a " +
        "coverage summary (passed / failed / not-run counts and step-quality flags). Heavier than " +
        "`list_story_test_cases` — if you only need the list/titles of a story's tests, use that " +
        "instead. Read-only; returns empty coverage (not an error) when no tests are linked.",
      inputSchema: { issueKey: ISSUE_KEY },
    },
    async ({ issueKey }) => {
      try {
        const bundle = await service.reviewStoryCoverage(issueKey);
        const s = bundle.summary;
        const text =
          `Story ${issueKey}: ${s.totalTestCases} linked test case(s) — ` +
          `${s.passed} passed, ${s.failed} failed, ${s.notRun} not-run, ` +
          `${s.blocked} blocked, ${s.inProgress} in-progress, ${s.other} other. ` +
          `${s.stepsMissingExpected}/${s.totalSteps} steps missing an expected result.` +
          (bundle.notes.length ? `\nNotes: ${bundle.notes.join(" ")}` : "");
        return result(bundle, text);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "list_story_test_cases",
    {
      title: "List story test cases (titles only)",
      description:
        "LIGHTWEIGHT list of the test cases linked to one story (Jira issue key) — each with key, " +
        "name/title, priority, and status. No steps, no executions. Use this when asked for the " +
        "test cases or titles of a specific story. Prefer this over `search_test_cases` (which is " +
        "project-wide, not story-scoped) and over `review_story_coverage` (which is heavier) when you " +
        "only need the list. Read-only; returns an empty list (not an error) when no tests are " +
        "linked.",
      inputSchema: { issueKey: ISSUE_KEY },
    },
    async ({ issueKey }) => {
      try {
        const testCases = await service.listStoryTestCases(issueKey);
        const text =
          testCases.length === 0
            ? `Story ${issueKey}: no linked test cases.`
            : `Story ${issueKey}: ${testCases.length} linked test case(s).`;
        return result({ issueKey, testCases }, text);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "get_test_case",
    {
      title: "Get test case detail",
      description:
        "Returns the full detail of a single Zephyr test case, including ordered steps with " +
        "expected results. Steps with an empty expected-result field are preserved so quality " +
        "gaps stay visible. Read-only.",
      inputSchema: { testCaseKey: TEST_CASE_KEY },
    },
    async ({ testCaseKey }) => {
      try {
        const tc = await service.getTestCaseDetail(testCaseKey);
        const text =
          `${tc.key} "${tc.name}" — priority ${tc.priority ?? "?"}, status ${tc.status ?? "?"}, ` +
          `${tc.quality.stepCount} step(s), ${tc.quality.stepsMissingExpected} missing expected result.`;
        return result(tc, text);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "list_story_executions",
    {
      title: "List story executions",
      description:
        "Returns the test executions linked to a Jira issue (story) with their status, cycle, and " +
        "date — a focused pass/fail view. Returns an empty list when the story's tests have not been " +
        "run. Read-only.",
      inputSchema: { issueKey: ISSUE_KEY },
    },
    async ({ issueKey }) => {
      try {
        const executions = await service.listStoryExecutions(issueKey);
        const counts = executions.reduce<Record<string, number>>((acc, e) => {
          acc[e.normalizedStatus] = (acc[e.normalizedStatus] ?? 0) + 1;
          return acc;
        }, {});
        const text =
          executions.length === 0
            ? `Story ${issueKey}: no linked executions — its tests have not been run.`
            : `Story ${issueKey}: ${executions.length} execution(s) — ${JSON.stringify(counts)}.`;
        return result({ issueKey, executions }, text);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "list_test_case_executions",
    {
      title: "List test case executions (full history)",
      description:
        "FULL execution history of ONE test case (Zephyr test case key), newest-first — every run " +
        "across all cycles plus ad-hoc runs, not just the latest. Each execution includes status, " +
        "cycle, date, comment, automated flag, timing (execution/estimated ms), who ran it, " +
        "environment, custom fields, and linked Jira issues. Use this when asked about a specific " +
        "test case's runs, history, or flakiness. This is TEST-CASE scoped — for the executions of " +
        "a whole story (Jira issue key) use `list_story_executions` instead. Read-only; returns an empty " +
        "list (not an error) when the test case has never been run.",
      inputSchema: { testCaseKey: TEST_CASE_KEY },
    },
    async ({ testCaseKey }) => {
      try {
        const executions = await service.listTestCaseExecutions(testCaseKey);
        const counts = executions.reduce<Record<string, number>>((acc, e) => {
          acc[e.normalizedStatus] = (acc[e.normalizedStatus] ?? 0) + 1;
          return acc;
        }, {});
        const text =
          executions.length === 0
            ? `Test case ${testCaseKey}: no executions — it has not been run.`
            : `Test case ${testCaseKey}: ${executions.length} execution(s) — ${JSON.stringify(counts)}.`;
        return result({ testCaseKey, executions }, text);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "search_test_cases",
    {
      title: "Search test cases (project-wide)",
      description:
        "PROJECT-WIDE search across ALL test cases in a project, matching key/name/objective " +
        "(case-insensitive, client-side; the Zephyr API has no full-text search). This is NOT " +
        "scoped to a story — do not use it to get the tests of a specific issue. Use it only when " +
        "you do NOT have a Jira issue key, or to look beyond the tests linked to a single story. For " +
        "a story's tests, use `list_story_test_cases` (titles) or `review_story_coverage` (full). " +
        "Read-only.",
      inputSchema: {
        projectKey: PROJECT_KEY,
        query: z.string().describe("Text to match against key/name/objective. Empty returns all."),
      },
    },
    async ({ projectKey, query }) => {
      try {
        const res = await service.searchTestCases(projectKey, query);
        const text = `Project ${projectKey}: ${res.matches.length} match(es) of ${res.scanned} test case(s) scanned.`;
        return result(res, text);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "get_project",
    {
      title: "Get project",
      description:
        "Returns Zephyr project metadata (Zephyr id, Jira project id, key, enabled flag) for a " +
        "project key. Useful to resolve keys and scope during a review. Read-only.",
      inputSchema: { projectKey: PROJECT_KEY },
    },
    async ({ projectKey }) => {
      try {
        const project = await service.getProject(projectKey);
        const text = `Project ${project.key ?? projectKey}: Zephyr id ${project.id ?? "?"}, enabled ${project.enabled ?? "?"}.`;
        return result(project, text);
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
