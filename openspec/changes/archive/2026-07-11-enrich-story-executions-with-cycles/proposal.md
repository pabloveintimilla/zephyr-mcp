## Why

Today `list_story_executions` returns each execution's `cycleId` but never a
readable cycle name, and it says nothing about which test cycles the story is
linked to. The Zephyr endpoint `GET /issuelinks/{issueKey}/testcycles` gives the
story's linked cycles directly, so we can show human-readable cycle context
without extra guessing.

## What Changes

- `list_story_executions` also calls `GET /issuelinks/{issueKey}/testcycles` and
  resolves each cycle via `GET /testcycles/{id}` to get its `key` and `name`.
- Each returned execution gains a readable `cycle` name and `cycleKey`
  (the existing `cycleId` stays).
- The tool result adds a `cycles` list: the distinct test cycles linked to the
  story (id, key, name, status), even cycles with no execution yet.
- The tool's summary text mentions the number of linked cycles.
- The tool result shape changes from a plain execution array to
  `{ issueKey, cycles, executions }`.

## Capabilities

### New Capabilities
<!-- None. This enriches an existing tool. -->

### Modified Capabilities
- `story-coverage-review`: the `list_story_executions` requirement now also
  returns the story's linked test cycles and resolves each execution's test
  cycle name/key, not only its id.

## Impact

- Code: `src/client.ts` (two new GET helpers), `src/types.ts` (`TestCycle`),
  `src/digest.ts` (`DigestTestCycle`, populate `cycle`/`cycleKey`),
  `src/service.ts` (`listStoryExecutions` returns a bundle), `src/tools.ts`
  (`list_story_executions` handler and summary text).
- API: adds read-only GETs to `/issuelinks/{issueKey}/testcycles` and
  `/testcycles/{idOrKey}` (see `docs/zephyr.api.yml`). Still read-only.
- Consumers reading the old array result must read `result.executions` instead.
- Tests: new unit tests for the client helpers and the enriched service output.
