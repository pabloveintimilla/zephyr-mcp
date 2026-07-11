/**
 * Shared, read-only Zephyr Scale Cloud API client.
 *
 * Owns the base URL, bearer auth, JSON parsing, pagination, bounded-concurrency
 * fan-out, retry-on-429, and error mapping. Every request is a GET — this
 * client has no way to mutate Zephyr data by construction.
 */

import type { ZephyrConfig } from "./config.js";
import type {
  KeyAndVersion,
  NamedOption,
  PagedList,
  Project,
  ResourceLink,
  TestCase,
  TestExecution,
  TestStepOutput,
} from "./types.js";

/** Error carrying a stable `kind` so tools can render distinct messages. */
export class ZephyrApiError extends Error {
  constructor(
    message: string,
    readonly kind:
      | "unauthorized"
      | "not_found"
      | "rate_limited"
      | "server_error"
      | "network"
      | "unexpected",
    readonly status?: number,
  ) {
    super(message);
    this.name = "ZephyrApiError";
  }
}

export interface ClientOptions {
  /** Injected for tests; defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Max retries on 429 before surfacing a rate-limit error. */
  maxRetries?: number;
  /** Cap on how many pages a paginated fetch will follow (safety valve). */
  maxPages?: number;
  /** Max concurrent requests for fan-out helpers. */
  concurrency?: number;
  /** Sleep function; injected for tests. */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_PAGE_SIZE = 50;

export class ZephyrClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly maxPages: number;
  readonly concurrency: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(config: ZephyrConfig, options: ClientOptions = {}) {
    this.baseUrl = config.baseUrl;
    this.token = config.token;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxRetries = options.maxRetries ?? 3;
    this.maxPages = options.maxPages ?? 50;
    this.concurrency = options.concurrency ?? 5;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  // ---- Low-level GET ------------------------------------------------------

  private async get<T>(
    path: string,
    query?: Record<string, string | number | undefined>,
  ): Promise<T> {
    const url = new URL(this.baseUrl + path);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }

    let attempt = 0;
    // Loop only re-runs on 429 (bounded by maxRetries).
    for (;;) {
      let res: Response;
      try {
        res = await this.fetchImpl(url.toString(), {
          method: "GET",
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: "application/json",
          },
        });
      } catch (err) {
        throw new ZephyrApiError(
          `Network error calling Zephyr (${path}): ${(err as Error).message}`,
          "network",
        );
      }

      if (res.ok) {
        return (await res.json()) as T;
      }

      if (res.status === 429 && attempt < this.maxRetries) {
        const wait = retryAfterMs(res, attempt);
        attempt += 1;
        await this.sleep(wait);
        continue;
      }

      throw await toApiError(res, path);
    }
  }

  /** Follow `startAt`/`maxResults` pagination and collect all `values`. */
  private async getAllPages<T>(
    path: string,
    query: Record<string, string | number | undefined> = {},
  ): Promise<T[]> {
    const out: T[] = [];
    const maxResults = Number(query.maxResults ?? DEFAULT_PAGE_SIZE);
    let startAt = Number(query.startAt ?? 0);

    for (let page = 0; page < this.maxPages; page++) {
      const body = await this.get<PagedList<T>>(path, {
        ...query,
        maxResults,
        startAt,
      });
      const values = body.values ?? [];
      out.push(...values);

      // `next` (or `isLast`) is authoritative; advance by the count actually
      // returned so we stay correct even if the server caps the page size.
      const done = body.isLast === true || !body.next || values.length === 0;
      if (done) break;
      startAt += values.length;
    }
    return out;
  }

  // ---- Typed endpoints ----------------------------------------------------

  /** GET /issuelinks/{issueKey}/testcases → keys + versions linked to the story. */
  getIssueLinkTestCases(issueKey: string): Promise<KeyAndVersion[]> {
    return this.get<KeyAndVersion[]>(
      `/issuelinks/${encodeURIComponent(issueKey)}/testcases`,
    );
  }

  /** GET /issuelinks/{issueKey}/executions → execution id + link references. */
  getIssueLinkExecutions(issueKey: string): Promise<ResourceLink[]> {
    return this.get<ResourceLink[]>(
      `/issuelinks/${encodeURIComponent(issueKey)}/executions`,
    );
  }

  /** GET /testcases/{key}. */
  getTestCase(testCaseKey: string): Promise<TestCase> {
    return this.get<TestCase>(`/testcases/${encodeURIComponent(testCaseKey)}`);
  }

  /** GET /testcases/{key}/teststeps (all pages, order preserved). */
  getTestSteps(testCaseKey: string): Promise<TestStepOutput[]> {
    return this.getAllPages<TestStepOutput>(
      `/testcases/${encodeURIComponent(testCaseKey)}/teststeps`,
    );
  }

  /** GET /testexecutions/{id}. */
  getTestExecution(id: number | string): Promise<TestExecution> {
    return this.get<TestExecution>(
      `/testexecutions/${encodeURIComponent(String(id))}`,
    );
  }

  /**
   * GET /testexecutions?testCase={key} (all pages) — the full execution history
   * for one test case. `projectKey` is derived from the key prefix and sent
   * alongside `testCase`, since the API may require it.
   */
  getTestExecutionsByCase(testCaseKey: string): Promise<TestExecution[]> {
    return this.getAllPages<TestExecution>("/testexecutions", {
      testCase: testCaseKey,
      projectKey: projectKeyFromTestCaseKey(testCaseKey),
    });
  }

  /** GET /testcases?projectKey=... (all pages). Text filtering is client-side. */
  getProjectTestCases(projectKey: string): Promise<TestCase[]> {
    return this.getAllPages<TestCase>("/testcases", { projectKey });
  }

  /** GET /projects/{projectIdOrKey}. */
  getProject(projectIdOrKey: string): Promise<Project> {
    return this.get<Project>(
      `/projects/${encodeURIComponent(projectIdOrKey)}`,
    );
  }

  /** GET /statuses (optionally scoped/typed) for id→name resolution. */
  getStatuses(projectKey?: string, statusType?: string): Promise<NamedOption[]> {
    return this.getAllPages<NamedOption>("/statuses", {
      projectKey,
      statusType,
    });
  }

  /** GET /priorities (optionally scoped) for id→name resolution. */
  getPriorities(projectKey?: string): Promise<NamedOption[]> {
    return this.getAllPages<NamedOption>("/priorities", { projectKey });
  }

  // ---- Fan-out helper -----------------------------------------------------

  /** Map over items with bounded concurrency, preserving input order. */
  async mapLimited<I, O>(
    items: I[],
    fn: (item: I, index: number) => Promise<O>,
  ): Promise<O[]> {
    const results: O[] = new Array(items.length);
    let cursor = 0;
    const workers = Array.from(
      { length: Math.min(this.concurrency, items.length || 1) },
      async () => {
        for (;;) {
          const i = cursor++;
          if (i >= items.length) return;
          results[i] = await fn(items[i], i);
        }
      },
    );
    await Promise.all(workers);
    return results;
  }
}

/**
 * Derive the Jira/Zephyr project key from a test case key: the text before the
 * first `-` (e.g. `LOYAL-T45` → `LOYAL`). Falls back to the whole string if no
 * `-` is present.
 */
export function projectKeyFromTestCaseKey(testCaseKey: string): string {
  const dash = testCaseKey.indexOf("-");
  return dash > 0 ? testCaseKey.slice(0, dash) : testCaseKey;
}

function retryAfterMs(res: Response, attempt: number): number {
  const header = res.headers.get("Retry-After");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const date = Date.parse(header);
    if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  }
  // Exponential backoff fallback: 0.5s, 1s, 2s, ...
  return 500 * 2 ** attempt;
}

async function toApiError(res: Response, path: string): Promise<ZephyrApiError> {
  const detail = await safeErrorMessage(res);
  switch (res.status) {
    case 401:
      return new ZephyrApiError(
        `Unauthorized calling Zephyr (${path}). The API token is missing, invalid, or expired.`,
        "unauthorized",
        401,
      );
    case 403:
      return new ZephyrApiError(
        `Forbidden calling Zephyr (${path}). The token's user lacks access to this resource.`,
        "unauthorized",
        403,
      );
    case 404:
      return new ZephyrApiError(
        `Not found on Zephyr (${path}). The requested key/id does not exist or is not visible to this token.`,
        "not_found",
        404,
      );
    case 429:
      return new ZephyrApiError(
        `Rate limited by Zephyr (${path}) and retries were exhausted. Try again shortly.`,
        "rate_limited",
        429,
      );
    default:
      if (res.status >= 500) {
        return new ZephyrApiError(
          `Zephyr server error ${res.status} (${path})${detail ? `: ${detail}` : ""}.`,
          "server_error",
          res.status,
        );
      }
      return new ZephyrApiError(
        `Unexpected Zephyr response ${res.status} (${path})${detail ? `: ${detail}` : ""}.`,
        "unexpected",
        res.status,
      );
  }
}

async function safeErrorMessage(res: Response): Promise<string | undefined> {
  try {
    const text = await res.text();
    if (!text) return undefined;
    try {
      const json = JSON.parse(text) as { message?: string; errorMessage?: string };
      return json.message ?? json.errorMessage ?? text.slice(0, 300);
    } catch {
      return text.slice(0, 300);
    }
  } catch {
    return undefined;
  }
}
