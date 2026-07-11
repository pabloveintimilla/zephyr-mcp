/**
 * Assembly of the digested story coverage bundle and the shared shaping helpers
 * (status normalization, id→name resolution, step flattening) used by tools.
 */

import type { ZephyrClient } from "./client.js";
import type {
  NamedOption,
  ResourceLink,
  TestCase,
  TestCycle,
  TestExecution,
  TestStepOutput,
} from "./types.js";

export type NormalizedStatus = "passed" | "failed" | "not-run" | "blocked" | "in-progress" | "other";

export interface DigestStep {
  index: number;
  action: string;
  expected: string;
  data: string;
  /** True when this step delegates to another test case instead of inline text. */
  delegatesTo?: string;
}

/** A Jira issue linked to an execution, surfaced in the digest. */
export interface DigestLinkedIssue {
  issueId?: number;
  target?: string;
  type?: string;
}

export interface DigestExecution {
  key?: string;
  status: string;
  normalizedStatus: NormalizedStatus;
  cycle?: string;
  cycleKey?: string;
  cycleId?: number;
  date?: string;
  comment?: string;
  automated?: boolean;
  /** Actual execution duration in milliseconds. */
  executionTime?: number;
  /** Estimated duration in milliseconds. */
  estimatedTime?: number;
  /** Atlassian account id of who executed the run. */
  executedById?: string;
  /** Atlassian account id of who the run is assigned to. */
  assignedToId?: string;
  environmentId?: number;
  customFields?: Record<string, unknown>;
  linkedIssues?: DigestLinkedIssue[];
}

/** A test cycle linked to a story, surfaced in the digest. */
export interface DigestTestCycle {
  id?: number;
  key?: string;
  name?: string;
  status?: string;
}

export interface DigestTestCase {
  key: string;
  name: string;
  objective: string | null;
  precondition: string | null;
  priority: string | null;
  status: string | null;
  folderId?: number;
  labels: string[];
  version?: number;
  steps: DigestStep[];
  /** Quality flags surfaced for review convenience. */
  quality: {
    stepCount: number;
    stepsMissingExpected: number;
    hasObjective: boolean;
  };
  lastExecution: DigestExecution | null;
}

export interface CoverageSummary {
  totalTestCases: number;
  passed: number;
  failed: number;
  notRun: number;
  blocked: number;
  inProgress: number;
  other: number;
  testCasesWithoutExecution: number;
  totalSteps: number;
  stepsMissingExpected: number;
}

export interface CoverageBundle {
  issueKey: string;
  summary: CoverageSummary;
  testCases: DigestTestCase[];
  /** Distinct test cycles referenced by the executions of this story. */
  cycles: { id?: number; name?: string }[];
  notes: string[];
}

// ---- Status normalization -------------------------------------------------

export function normalizeStatus(raw: string | null | undefined): NormalizedStatus {
  if (!raw) return "not-run";
  const s = raw.trim().toLowerCase();
  if (/(^|\b)(pass|passed|success|successful)\b/.test(s)) return "passed";
  if (/(^|\b)(fail|failed|error)\b/.test(s)) return "failed";
  if (/block/.test(s)) return "blocked";
  if (/(in progress|in-progress|wip|executing)/.test(s)) return "in-progress";
  if (/(not executed|unexecuted|not run|no ejecutado|pendiente|to do|not started)/.test(s))
    return "not-run";
  return "other";
}

// ---- id→name resolver -----------------------------------------------------

/**
 * Resolves priority/status ids to human-readable names, caching the (small)
 * `/statuses` and `/priorities` lookups for the lifetime of the resolver.
 * Falls back gracefully to `#<id>` if a lookup fails or an id is unknown.
 */
export class NameResolver {
  private statuses?: Map<number, string>;
  private priorities?: Map<number, string>;

  constructor(private readonly client: ZephyrClient) {}

  async resolveStatus(link?: ResourceLink): Promise<string | null> {
    if (!link?.id) return null;
    if (!this.statuses) this.statuses = await this.load(() => this.client.getStatuses());
    return this.statuses.get(link.id) ?? `#${link.id}`;
  }

  async resolvePriority(link?: ResourceLink): Promise<string | null> {
    if (!link?.id) return null;
    if (!this.priorities) this.priorities = await this.load(() => this.client.getPriorities());
    return this.priorities.get(link.id) ?? `#${link.id}`;
  }

  private async load(fetcher: () => Promise<NamedOption[]>): Promise<Map<number, string>> {
    const map = new Map<number, string>();
    try {
      for (const item of await fetcher()) {
        if (item.id != null && item.name) map.set(item.id, item.name);
      }
    } catch {
      // Name resolution is best-effort; leave the map empty on failure.
    }
    return map;
  }
}

// ---- Shaping helpers ------------------------------------------------------

export function flattenSteps(steps: TestStepOutput[]): DigestStep[] {
  return steps.map((step, i) => {
    const inline = step.inline ?? undefined;
    const delegate = step.testCase?.testCaseKey ?? keyFromSelf(step.testCase?.self);
    return {
      index: i + 1,
      action: inline?.description?.trim() ?? "",
      expected: inline?.expectedResult?.trim() ?? "",
      data: inline?.testData?.trim() ?? "",
      ...(delegate ? { delegatesTo: delegate } : {}),
    };
  });
}

/** Extract a test case key from a `.../testcases/{KEY}/versions/{n}` URL. */
export function keyFromSelf(self?: string): string | undefined {
  if (!self) return undefined;
  const m = self.match(/testcases\/([^/]+-T\d+)/i);
  return m ? m[1] : undefined;
}

export function toDigestExecution(
  exec: TestExecution,
  statusName: string | null,
): DigestExecution {
  const status = statusName ?? "";
  const linkedIssues = (exec.links?.issues ?? [])
    .map((i) => ({ issueId: i.issueId, target: i.target, type: i.type }))
    .filter((i) => i.issueId != null || i.target != null);
  return {
    key: exec.key,
    status,
    normalizedStatus: normalizeStatus(status),
    cycleId: exec.testCycle?.id,
    date: exec.actualEndDate ?? undefined,
    comment: exec.comment ?? undefined,
    automated: exec.automated,
    executionTime: exec.executionTime ?? undefined,
    estimatedTime: exec.estimatedTime ?? undefined,
    executedById: exec.executedById ?? undefined,
    assignedToId: exec.assignedToId ?? undefined,
    environmentId: exec.environment?.id ?? undefined,
    customFields: exec.customFields ?? undefined,
    ...(linkedIssues.length ? { linkedIssues } : {}),
  };
}

/** Shape a test cycle for the digest; `statusName` is best-effort. */
export function toDigestTestCycle(
  cycle: TestCycle,
  statusName: string | null,
): DigestTestCycle {
  return {
    id: cycle.id,
    key: cycle.key,
    name: cycle.name,
    ...(statusName ? { status: statusName } : {}),
  };
}

/** Pick the most recent execution by actualEndDate (undated sorts last). */
export function pickLatest(execs: DigestExecution[]): DigestExecution | null {
  if (execs.length === 0) return null;
  return [...execs].sort((a, b) => dateVal(b.date) - dateVal(a.date))[0];
}

function dateVal(d?: string): number {
  if (!d) return -Infinity;
  const t = Date.parse(d);
  return Number.isNaN(t) ? -Infinity : t;
}

export function buildTestCaseQuality(steps: DigestStep[], tc: TestCase): DigestTestCase["quality"] {
  const inlineSteps = steps.filter((s) => !s.delegatesTo);
  return {
    stepCount: steps.length,
    stepsMissingExpected: inlineSteps.filter((s) => s.expected === "").length,
    hasObjective: Boolean(tc.objective && tc.objective.trim()),
  };
}
