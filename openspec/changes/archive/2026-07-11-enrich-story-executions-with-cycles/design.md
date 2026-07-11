## Context

`listStoryExecutions` in `src/service.ts` fetches execution refs from
`/issuelinks/{issueKey}/executions`, loads each execution, and returns
`DigestExecution[]`. `DigestExecution` already declares a `cycle` (name) field,
but `toDigestExecution` only sets `cycleId` — the name is never filled. The
Zephyr API exposes `GET /issuelinks/{issueKey}/testcycles` (returns
`[{ id, self }]`) and `GET /testcycles/{idOrKey}` (returns a full `TestCycle`
with `key`, `name`, `status`). See `docs/zephyr.api.yml`.

## Goals / Non-Goals

**Goals:**
- Populate a readable `cycle` name and `cycleKey` on each story execution.
- Return the distinct test cycles linked to the story, including cycles with no
  execution yet.
- Keep the client read-only and follow existing patterns (typed GET helpers,
  bounded-concurrency fan-out, best-effort resolution).

**Non-Goals:**
- No change to `list_test_case_executions` or `review_story_coverage`.
- No new MCP tool; no cycle-detail tool of its own.
- No caching of cycles across tool calls.

## Decisions

- **Resolve names via `GET /testcycles/{id}`, not from the link.** The
  `/issuelinks/{issueKey}/testcycles` response only carries `id` + `self`, so
  names require a second call. We fan out these calls with the existing
  `client.mapLimited` (bounded concurrency), matching how executions are loaded.
  Alternative: parse the key from `self` — rejected because it yields the key at
  best, never the human-readable name.

- **Build one `Map<number, DigestTestCycle>` per call and reuse it** to both
  enrich executions (`execution.cycleId` → cycle) and produce the `cycles` list.
  This avoids fetching the same cycle twice. Cycles are few per story, so a
  per-call map (no cross-call cache) keeps it simple.

- **Change the service return to a bundle** `{ executions, cycles }` instead of a
  bare array, and have the tool return `{ issueKey, cycles, executions }`. This
  surfaces cycles that have executions and cycles that do not in one place.
  Alternative: attach cycles only onto executions — rejected because linked
  cycles without executions would be invisible.

- **Best-effort cycle resolution.** A failed `/testcycles/{id}` call is caught;
  the execution is still returned (name omitted) and the cycle is dropped from
  the resolved map, mirroring `NameResolver`'s graceful fallback. This keeps a
  single bad cycle from failing the whole tool.

## Risks / Trade-offs

- [Extra API calls: one `GET /testcycles/{id}` per linked cycle] → Cycles per
  story are few; calls run through bounded-concurrency `mapLimited`, so latency
  stays low.
- [Result shape change from array to `{ executions, cycles }`] → This is a small
  server with known consumers; the proposal notes the migration (read
  `result.executions`). Tests are updated in the same change.
- [A cycle linked but never executed adds a row with no execution] → Intended;
  it is useful review context, documented in the spec.

## Migration Plan

1. Add types and client helpers (no behavior change yet).
2. Enrich `listStoryExecutions` and update the tool handler + summary text.
3. Update and run unit tests (`npm test`) to validate the new shape.
   Rollback is a straight revert of these edits.

## Open Questions

None.
