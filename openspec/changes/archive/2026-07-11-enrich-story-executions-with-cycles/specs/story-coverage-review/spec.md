## MODIFIED Requirements

### Requirement: story execution status

The server SHALL provide a `list_story_executions(issueKey)` tool that returns the executions linked to a Jira issue with their status, cycle, and date, giving a focused pass/fail view. The tool SHALL also fetch the story's linked test cycles via `GET /issuelinks/{issueKey}/testcycles` and resolve each cycle's key and name via `GET /testcycles/{idOrKey}`. Each returned execution SHALL carry its cycle id, cycle key, and readable cycle name when the cycle is known. The tool result SHALL include a distinct list of the story's linked test cycles (id, key, name, status), including cycles that have no execution yet. Cycle resolution SHALL be best-effort: if a cycle cannot be fetched, the execution SHALL still be returned with the cycle name omitted rather than causing an error.

#### Scenario: Executions exist

- **WHEN** `list_story_executions` is called for an issue with linked executions
- **THEN** the tool returns each execution's status, execution date, and its test cycle id, key, and readable name

#### Scenario: Story has linked test cycles

- **WHEN** `list_story_executions` is called for an issue linked to one or more test cycles
- **THEN** the tool result includes a `cycles` list with each linked cycle's id, key, name, and status

#### Scenario: Linked cycle has no execution yet

- **WHEN** a story is linked to a test cycle that has no execution
- **THEN** that cycle still appears in the `cycles` list even though it contributes no execution rows

#### Scenario: Cycle detail cannot be resolved

- **WHEN** the test cycle detail request fails for a cycle
- **THEN** the affected execution is still returned with its cycle id but the readable cycle name omitted, and no error is raised

#### Scenario: No executions

- **WHEN** the issue has no linked executions
- **THEN** the tool returns an empty execution list indicating the story's tests have not been run
