## 1. Types

- [x] 1.1 Add a `TestCycle` interface to `src/types.ts` with optional `id`, `key`, `name`, `status` (ResourceLink), `description`, `plannedStartDate`, `plannedEndDate`.

## 2. Client helpers

- [x] 2.1 Add `getIssueLinkTestCycles(issueKey)` to `src/client.ts` → `GET /issuelinks/{issueKey}/testcycles`, returning `ResourceLink[]`.
- [x] 2.2 Add `getTestCycle(idOrKey)` to `src/client.ts` → `GET /testcycles/{idOrKey}`, returning `TestCycle`.

## 3. Digest shaping

- [x] 3.1 Add a `DigestTestCycle` interface to `src/digest.ts` with `id`, `key?`, `name?`, `status?`.
- [x] 3.2 Add `cycleKey?` to `DigestExecution` (keep existing `cycle` and `cycleId`).
- [x] 3.3 Add a helper that maps a `TestCycle` to a `DigestTestCycle` (best-effort, name resolved via NameResolver for status).

## 4. Service enrichment

- [x] 4.1 In `listStoryExecutions`, fetch linked cycles via `getIssueLinkTestCycles` and resolve each via `getTestCycle` using `mapLimited`; build a `Map<number, DigestTestCycle>` (best-effort, drop failures).
- [x] 4.2 Populate each execution's `cycle` (name) and `cycleKey` from the map using `cycleId`.
- [x] 4.3 Change the return type to a bundle `{ executions: DigestExecution[]; cycles: DigestTestCycle[] }`, keeping executions sorted newest-first.

## 5. Tool handler

- [x] 5.1 Update the `list_story_executions` handler in `src/tools.ts` to return `{ issueKey, cycles, executions }` and mention the linked-cycle count in the summary text.

## 6. Tests

- [x] 6.1 Add client tests for `getIssueLinkTestCycles` and `getTestCycle` (path and parsing).
- [x] 6.2 Add/update service tests: executions gain readable `cycle`/`cycleKey`, `cycles` includes a linked cycle with no execution, and a failed cycle fetch omits the name without error.
- [x] 6.3 Run `npm test` and confirm all tests pass.
