## MODIFIED Requirements

### Requirement: Digested story coverage bundle

The server SHALL provide a `review_story_coverage(issueKey)` tool that, given a Jira issue key, returns a single digested bundle describing the test coverage of that story. The tool SHALL internally chain the Zephyr endpoints (`GET /issuelinks/{issueKey}/testcases`, `GET /testcases/{key}`, `GET /testcases/{key}/teststeps`) and, for each linked test case key, SHALL fetch its executions via `GET /testexecutions?testCase={key}` so the caller makes one request. The tool SHALL NOT use `GET /issuelinks/{issueKey}/executions` to source per-test-case executions, because that issue-link endpoint does not reliably index executions and can return an empty array.

#### Scenario: story has linked test cases

- **WHEN** `review_story_coverage` is called with an issue key that has linked test cases
- **THEN** the bundle contains, for each test case, its key, name, objective, priority, status, and ordered steps (each with action, expected result, and test data), plus the most recent execution result for that test case where available

#### Scenario: linked test cases have executions

- **WHEN** a linked test case has one or more executions returned by `GET /testexecutions?testCase={key}`
- **THEN** the bundle reports that test case's most recent execution result rather than treating it as not-run

#### Scenario: story has no linked test cases

- **WHEN** `review_story_coverage` is called with an issue key that has no linked test cases
- **THEN** the tool returns an empty test-case list with a summary indicating zero coverage, rather than an error

#### Scenario: executions cannot be loaded

- **WHEN** the per-test-case execution fetch fails
- **THEN** the tool adds an explanatory note and still returns the coverage bundle with executions omitted, rather than failing the whole request

#### Scenario: Coverage summary is included

- **WHEN** `review_story_coverage` returns
- **THEN** the bundle includes a summary counting total test cases and their execution outcomes (e.g. passed / failed / not-run)
