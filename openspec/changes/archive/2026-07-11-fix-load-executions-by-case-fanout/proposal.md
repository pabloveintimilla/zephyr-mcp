## Why

`review_story_coverage` shows no execution results for stories that clearly have runs in Zephyr. The cause is `loadExecutionsByCaseKey`, which reads executions from `GET /issuelinks/{issueKey}/executions`. That issue-link endpoint does not reliably index executions, so it often returns an empty array. As a result, every test case gets a `null` last execution and the coverage summary counts everything as "not-run".

## What Changes

- Replace the single `GET /issuelinks/{issueKey}/executions` call inside `loadExecutionsByCaseKey` with a per-test-case fan-out: for each linked test case key, call `getTestExecutionsByCase(key)` (`GET /testexecutions?testCase={key}`), which is the endpoint that actually returns execution data.
- Build the `Map<caseKey, executions>` directly from each per-case result, so no `keyFromSelf` lookup on `exec.testCase.self` is needed.
- Keep the graceful behavior: if the executions cannot load, add a note and return an empty map instead of failing.
- Pass the already-resolved linked test case keys into `loadExecutionsByCaseKey` to avoid fetching the linked list twice.
- Only `review_story_coverage` changes. `list_story_executions` keeps using the issue-link executions endpoint (out of scope here).

## Capabilities

### New Capabilities

<!-- None. This is a bug fix to existing behavior. -->

### Modified Capabilities

- `story-coverage-review`: The "Digested story coverage bundle" requirement changes how per-test-case executions are sourced — from the issue-link executions endpoint to a per-case fan-out over `GET /testexecutions?testCase={key}`. The observable contract (last execution per test case, coverage summary) stays the same but now returns real data.

## Impact

- Code: `src/service.ts` (`loadExecutionsByCaseKey`, and its call site in `reviewStoryCoverage`).
- APIs: uses existing `ZephyrClient.getTestExecutionsByCase`; stops using `getIssueLinkExecutions` inside coverage review.
- Tests: `test/service.test.ts` — update mocks and expectations to the fan-out path.
- No breaking change to tool names or output shape.
