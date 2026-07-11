## Context

`reviewStoryCoverage` already resolves the linked test case keys (`keys`) before it loads executions. `loadExecutionsByCaseKey` then makes a second, separate call to the issue-link executions endpoint and indexes the results by `keyFromSelf(exec.testCase.self)`. That endpoint is unreliable, so the map is usually empty and every `lastExecution` becomes `null`.

The client already has `getTestExecutionsByCase(key)`, which hits `GET /testexecutions?testCase={key}` and returns the real execution history for one test case.

## Goals / Non-Goals

**Goals:**
- Make `review_story_coverage` return real per-test-case execution results.
- Reuse the linked keys already computed in `reviewStoryCoverage`.
- Keep the same output shape and the graceful "omit on failure" behavior.

**Non-Goals:**
- Changing `list_story_executions` (still uses the issue-link executions endpoint).
- Changing the digest/summary shape or the cycle collection logic.

## Decisions

**Fan out per test case key.** Change the signature to `loadExecutionsByCaseKey(keys: string[], resolver, notes)`. For each key, call `getTestExecutionsByCase(key)` through `client.mapLimited` to keep concurrency bounded. Map each key directly to its resolved executions — no `keyFromSelf` lookup needed, since we already know the key.

Flow before → after:

```
before: keys ──┐
               ├─ getIssueLinkExecutions(issueKey)  ← empty
               └─ index by exec.testCase.self

after:  keys ──> mapLimited(key => getTestExecutionsByCase(key))
               └─ map.set(key, execs.map(toDigest))
```

**Error handling per call.** Wrap each per-case fetch so one failing key does not drop the others. If a fetch throws, push a note once and skip that key (leaving `lastExecution` null for it). Keep returning the partial map so the bundle still renders.

**Call site.** In `reviewStoryCoverage`, pass the existing `keys` array instead of `issueKey`. `pickLatest` and `collectCycles(execByCaseKey)` keep working unchanged because the map shape (`Map<caseKey, DigestExecution[]>`) is identical.

## Risks / Trade-offs

- **More HTTP calls:** one request per linked test case instead of one per story. Bounded by `mapLimited`; acceptable because it is the only way to get real data.
- **`collectCycles` depends on `cycleId`** being present on each `DigestExecution`. `getTestExecutionsByCase` returns full `TestExecution` objects, so `toDigestExecution` still fills `cycleId` — no regression expected. Covered by updated unit tests in `test/service.test.ts`.
