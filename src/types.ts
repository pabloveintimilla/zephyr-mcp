/**
 * Minimal typings for the subset of the Zephyr Scale Cloud API this server
 * reads. Every field is treated as optional/defensive where the API marks it
 * nullable or where drift is plausible — unknown extra fields are ignored.
 */

export interface ResourceLink {
  id?: number;
  self?: string;
}

export interface KeyAndVersion {
  key?: string;
  version?: number;
  self?: string;
}

/** Envelope shared by paginated (`startAt`/`maxResults`) list endpoints. */
export interface PagedList<T> {
  next?: string | null;
  startAt?: number;
  maxResults?: number;
  total?: number;
  isLast?: boolean;
  values?: T[];
}

export interface TestStepInline {
  description?: string | null;
  testData?: string | null;
  expectedResult?: string | null;
}

export interface TestStepOutput {
  id?: number | null;
  inline?: TestStepInline | null;
  testCase?: { testCaseKey?: string; self?: string } | null;
}

export interface TestCase {
  id?: number;
  key?: string;
  name?: string;
  project?: ResourceLink;
  objective?: string | null;
  precondition?: string | null;
  labels?: string[];
  priority?: ResourceLink;
  status?: ResourceLink;
  folder?: ResourceLink | null;
  owner?: { accountId?: string } | null;
  createdOn?: string;
}

/** A Jira issue linked to an execution (e.g. a defect). */
export interface LinkedIssue {
  issueId?: number;
  id?: number;
  self?: string;
  target?: string;
  type?: string;
}

export interface TestExecution {
  id?: number;
  key?: string;
  project?: ResourceLink;
  /** `self` points at `/testcases/{KEY}/versions/{n}` — the key is embedded. */
  testCase?: ResourceLink;
  testExecutionStatus?: ResourceLink;
  actualEndDate?: string | null;
  testCycle?: ResourceLink | null;
  comment?: string | null;
  automated?: boolean;
  /** Actual execution duration in milliseconds. */
  executionTime?: number | null;
  /** Estimated duration in milliseconds. */
  estimatedTime?: number | null;
  /** Atlassian account id of who executed the run. */
  executedById?: string | null;
  /** Atlassian account id of who the run is assigned to. */
  assignedToId?: string | null;
  environment?: ResourceLink | null;
  customFields?: Record<string, unknown> | null;
  links?: {
    self?: string;
    issues?: LinkedIssue[];
  } | null;
}

export interface Project {
  id?: number;
  jiraProjectId?: number;
  key?: string;
  enabled?: boolean;
}

/** A named lookup entity (statuses, priorities). */
export interface NamedOption {
  id?: number;
  name?: string;
  project?: ResourceLink;
}
