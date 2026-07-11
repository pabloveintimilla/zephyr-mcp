## 1. Rewrite loadExecutionsByCaseKey

- [x] 1.1 Change the signature to `loadExecutionsByCaseKey(keys: string[], resolver, notes)` in `src/service.ts`.
- [x] 1.2 Replace the `getIssueLinkExecutions(issueKey)` call with a `mapLimited(keys, key => getTestExecutionsByCase(key))` fan-out.
- [x] 1.3 For each key, resolve statuses and build `Map<key, DigestExecution[]>` directly from that key's executions (drop the `keyFromSelf(exec.testCase.self)` lookup).
- [x] 1.4 Wrap each per-case fetch so one failure adds a note and skips only that key, still returning the partial map.

## 2. Update the call site

- [x] 2.1 In `reviewStoryCoverage`, pass the already-resolved `keys` array to `loadExecutionsByCaseKey` instead of `issueKey`.
- [x] 2.2 Confirm `pickLatest` and `collectCycles(execByCaseKey)` still work with the unchanged map shape.
- [x] 2.3 Remove any now-unused imports (e.g. `keyFromSelf` if no longer referenced).

## 3. Tests and validation

- [x] 3.1 Update `test/service.test.ts` mocks: stub `getTestExecutionsByCase` per key and remove reliance on `getIssueLinkExecutions` for coverage review.
- [x] 3.2 Add a test proving executions now appear in the bundle (regression for the empty-array bug).
- [x] 3.3 Add a test for the per-case fetch failure path (note added, bundle still returned).
- [x] 3.4 Run `npm test` and confirm all tests pass.
