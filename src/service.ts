/**
 * Review service: orchestrates the read-only Zephyr calls behind each tool.
 * This is where the fan-out chaining lives, keeping the tool handlers thin.
 */

import { ZephyrClient } from "./client.js";
import {
  buildTestCaseQuality,
  flattenSteps,
  keyFromSelf,
  NameResolver,
  normalizeStatus,
  pickLatest,
  toDigestExecution,
  type CoverageBundle,
  type CoverageSummary,
  type DigestExecution,
  type DigestStep,
  type DigestTestCase,
} from "./digest.js";
import type { TestCase } from "./types.js";

/** Lightweight entry returned by `listStoryTestCases` — no steps or executions. */
export interface StoryTestCaseListing {
  key: string;
  name: string;
  priority: string | null;
  status: string | null;
  version?: number;
}

export class ReviewService {
  constructor(private readonly client: ZephyrClient) {}

  /**
   * Headline tool logic. Chains:
   *   issuelinks/testcases -> testcases/{key} (+teststeps) -> issuelinks/executions
   * and returns one digested bundle with a coverage summary.
   */
  async reviewStoryCoverage(issueKey: string): Promise<CoverageBundle> {
    const resolver = new NameResolver(this.client);
    const notes: string[] = [];

    const linked = await this.client.getIssueLinkTestCases(issueKey);
    const keys = dedupe(
      linked.map((l) => l.key ?? keyFromSelf(l.self)).filter((k): k is string => Boolean(k)),
    );
    const versionByKey = new Map(linked.map((l) => [l.key, l.version] as const));

    // Fetch linked executions once and index them by test case key.
    const execByCaseKey = await this.loadExecutionsByCaseKey(issueKey, resolver, notes);

    const testCases: DigestTestCase[] = await this.client.mapLimited(keys, async (key) => {
      const [tc, rawSteps] = await Promise.all([
        this.client.getTestCase(key),
        this.client.getTestSteps(key),
      ]);
      const steps = flattenSteps(rawSteps);
      const [priority, status] = await Promise.all([
        resolver.resolvePriority(tc.priority),
        resolver.resolveStatus(tc.status),
      ]);
      return this.shapeTestCase(tc, key, steps, priority, status, versionByKey.get(key), pickLatest(execByCaseKey.get(key) ?? []));
    });

    const cycles = collectCycles(execByCaseKey);
    const summary = summarize(testCases);

    if (keys.length === 0) {
      notes.push(
        `No test cases are linked to ${issueKey} in Zephyr. Either this story has no coverage, ` +
          `or the tests are not linked to the issue.`,
      );
    }

    return { issueKey, summary, testCases, cycles, notes };
  }

  /** get_test_case: full detail of one test case, steps preserved. */
  async getTestCaseDetail(testCaseKey: string): Promise<DigestTestCase> {
    const resolver = new NameResolver(this.client);
    const [tc, rawSteps] = await Promise.all([
      this.client.getTestCase(testCaseKey),
      this.client.getTestSteps(testCaseKey),
    ]);
    const steps = flattenSteps(rawSteps);
    const [priority, status] = await Promise.all([
      resolver.resolvePriority(tc.priority),
      resolver.resolveStatus(tc.status),
    ]);
    return this.shapeTestCase(tc, testCaseKey, steps, priority, status, undefined, null);
  }

  /**
   * list_story_test_cases: lightweight, story-scoped listing. Chains
   *   issuelinks/testcases -> testcases/{key}
   * and returns key/name/priority/status only. Deliberately skips teststeps
   * and executions, so it is much cheaper than reviewStoryCoverage.
   */
  async listStoryTestCases(issueKey: string): Promise<StoryTestCaseListing[]> {
    const resolver = new NameResolver(this.client);
    const linked = await this.client.getIssueLinkTestCases(issueKey);
    const keys = dedupe(
      linked.map((l) => l.key ?? keyFromSelf(l.self)).filter((k): k is string => Boolean(k)),
    );
    const versionByKey = new Map(linked.map((l) => [l.key, l.version] as const));

    return this.client.mapLimited(keys, async (key) => {
      const tc = await this.client.getTestCase(key);
      const [priority, status] = await Promise.all([
        resolver.resolvePriority(tc.priority),
        resolver.resolveStatus(tc.status),
      ]);
      return {
        key: tc.key ?? key,
        name: tc.name ?? "",
        priority,
        status,
        version: versionByKey.get(key),
      };
    });
  }

  /** list_story_executions: per-execution status/cycle/date view for a story. */
  async listStoryExecutions(issueKey: string): Promise<DigestExecution[]> {
    const resolver = new NameResolver(this.client);
    const refs = await this.client.getIssueLinkExecutions(issueKey);
    const ids = refs.map((r) => r.id).filter((id): id is number => id != null);
    const execs = await this.client.mapLimited(ids, (id) => this.client.getTestExecution(id));
    const out: DigestExecution[] = [];
    for (const exec of execs) {
      const statusName = await resolver.resolveStatus(exec.testExecutionStatus);
      out.push(toDigestExecution(exec, statusName));
    }
    return out.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  }

  /**
   * list_test_case_executions: full execution history for one test case,
   * newest-first. Fetches directly via the `testCase` filter (no story needed) and
   * resolves status names. Returns an empty list when the case has never run.
   */
  async listTestCaseExecutions(testCaseKey: string): Promise<DigestExecution[]> {
    const resolver = new NameResolver(this.client);
    const execs = await this.client.getTestExecutionsByCase(testCaseKey);
    const out: DigestExecution[] = [];
    for (const exec of execs) {
      const statusName = await resolver.resolveStatus(exec.testExecutionStatus);
      out.push(toDigestExecution(exec, statusName));
    }
    return out.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  }

  /**
   * search_test_cases: client-side filter over a project's test cases.
   * The Zephyr API has no full-text search, so we page the project's cases and
   * match `query` against key/name/objective (case-insensitive).
   */
  async searchTestCases(
    projectKey: string,
    query: string,
  ): Promise<{ matches: { key?: string; name?: string; objective?: string | null }[]; scanned: number; truncated: boolean }> {
    const all = await this.client.getProjectTestCases(projectKey);
    const q = query.trim().toLowerCase();
    const matches = all
      .filter((tc) => {
        if (!q) return true;
        return (
          (tc.key ?? "").toLowerCase().includes(q) ||
          (tc.name ?? "").toLowerCase().includes(q) ||
          (tc.objective ?? "").toLowerCase().includes(q)
        );
      })
      .map((tc) => ({ key: tc.key, name: tc.name, objective: tc.objective ?? null }));
    return { matches, scanned: all.length, truncated: false };
  }

  /** get_project: project identifier and metadata. */
  async getProject(projectKey: string) {
    return this.client.getProject(projectKey);
  }

  // ---- internals ----------------------------------------------------------

  private async loadExecutionsByCaseKey(
    issueKey: string,
    resolver: NameResolver,
    notes: string[],
  ): Promise<Map<string, DigestExecution[]>> {
    const map = new Map<string, DigestExecution[]>();
    let refs;
    try {
      refs = await this.client.getIssueLinkExecutions(issueKey);
    } catch {
      notes.push(`Could not load executions for ${issueKey}; execution status omitted.`);
      return map;
    }
    const ids = refs.map((r) => r.id).filter((id): id is number => id != null);
    const execs = await this.client.mapLimited(ids, (id) => this.client.getTestExecution(id));
    for (const exec of execs) {
      const caseKey = keyFromSelf(exec.testCase?.self);
      if (!caseKey) continue;
      const statusName = await resolver.resolveStatus(exec.testExecutionStatus);
      const digest = toDigestExecution(exec, statusName);
      const list = map.get(caseKey) ?? [];
      list.push(digest);
      map.set(caseKey, list);
    }
    return map;
  }

  private shapeTestCase(
    tc: TestCase,
    key: string,
    steps: DigestStep[],
    priority: string | null,
    status: string | null,
    version: number | undefined,
    lastExecution: DigestExecution | null,
  ): DigestTestCase {
    return {
      key: tc.key ?? key,
      name: tc.name ?? "",
      objective: tc.objective ?? null,
      precondition: tc.precondition ?? null,
      priority,
      status,
      folderId: tc.folder?.id,
      labels: tc.labels ?? [],
      version,
      steps,
      quality: buildTestCaseQuality(steps, tc),
      lastExecution,
    };
  }
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}

function collectCycles(map: Map<string, DigestExecution[]>): { id?: number; name?: string }[] {
  const seen = new Set<number>();
  const cycles: { id?: number }[] = [];
  for (const list of map.values()) {
    for (const exec of list) {
      if (exec.cycleId != null && !seen.has(exec.cycleId)) {
        seen.add(exec.cycleId);
        cycles.push({ id: exec.cycleId });
      }
    }
  }
  return cycles;
}

function summarize(testCases: DigestTestCase[]): CoverageSummary {
  const summary: CoverageSummary = {
    totalTestCases: testCases.length,
    passed: 0,
    failed: 0,
    notRun: 0,
    blocked: 0,
    inProgress: 0,
    other: 0,
    testCasesWithoutExecution: 0,
    totalSteps: 0,
    stepsMissingExpected: 0,
  };
  for (const tc of testCases) {
    summary.totalSteps += tc.quality.stepCount;
    summary.stepsMissingExpected += tc.quality.stepsMissingExpected;
    const status = tc.lastExecution?.normalizedStatus;
    if (!tc.lastExecution) {
      summary.testCasesWithoutExecution += 1;
      summary.notRun += 1;
      continue;
    }
    switch (status) {
      case "passed":
        summary.passed += 1;
        break;
      case "failed":
        summary.failed += 1;
        break;
      case "blocked":
        summary.blocked += 1;
        break;
      case "in-progress":
        summary.inProgress += 1;
        break;
      case "not-run":
        summary.notRun += 1;
        break;
      default:
        summary.other += 1;
    }
  }
  return summary;
}
