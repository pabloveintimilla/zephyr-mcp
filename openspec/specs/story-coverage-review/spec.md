# story-coverage-review Specification

## Purpose

Provide review-oriented tools that let a reviewer assess the test coverage of a Jira user story in Zephyr Scale — digesting linked test cases, steps, and executions — while keeping drafted tests as conversational reasoning output rather than writes back to Zephyr.

## Requirements

### Requirement: Digested story coverage bundle

The server SHALL provide a `review_story_coverage(issueKey)` tool that, given a Jira issue key, returns a single digested bundle describing the test coverage of that story. The tool SHALL internally chain the Zephyr endpoints (`GET /issuelinks/{issueKey}/testcases`, `GET /testcases/{key}`, `GET /testcases/{key}/teststeps`, `GET /issuelinks/{issueKey}/executions`) so the caller makes one request.

#### Scenario: story has linked test cases

- **WHEN** `review_story_coverage` is called with an issue key that has linked test cases
- **THEN** the bundle contains, for each test case, its key, name, objective, priority, status, and ordered steps (each with action, expected result, and test data), plus the most recent execution result for the story where available

#### Scenario: story has no linked test cases

- **WHEN** `review_story_coverage` is called with an issue key that has no linked test cases
- **THEN** the tool returns an empty test-case list with a summary indicating zero coverage, rather than an error

#### Scenario: Coverage summary is included

- **WHEN** `review_story_coverage` returns
- **THEN** the bundle includes a summary counting total test cases and their execution outcomes (e.g. passed / failed / not-run)

### Requirement: Lightweight story test-case listing

The server SHALL provide a `list_story_test_cases(issueKey)` tool that returns the test cases linked to a Jira user story as a lightweight list — each entry containing at least the test case key, name, priority, and status — WITHOUT fetching test steps or executions. The tool SHALL reuse the linked-test-cases lookup (`GET /issuelinks/{issueKey}/testcases` then per-case `GET /testcases/{key}`) and SHALL NOT call the steps or executions endpoints.

#### Scenario: story has linked test cases

- **WHEN** `list_story_test_cases` is called with an issue key that has linked test cases
- **THEN** the tool returns one entry per linked test case with its key, name, priority, and status, and no step or execution detail

#### Scenario: story has no linked test cases

- **WHEN** `list_story_test_cases` is called with an issue key that has no linked test cases
- **THEN** the tool returns an empty list rather than an error

#### Scenario: Preferred for title/listing requests

- **WHEN** a reviewer asks for the test cases or titles linked to a specific story
- **THEN** this tool provides the answer without the heavier full-coverage bundle or a project-wide search

### Requirement: Test case drill-down

The server SHALL provide a `get_test_case(testCaseKey)` tool that returns the full detail of a single test case, including its steps and expected results, for focused inspection.

#### Scenario: Existing test case

- **WHEN** `get_test_case` is called with a valid test case key
- **THEN** the tool returns the test case's metadata and ordered steps with expected results

#### Scenario: Missing expected results are visible

- **WHEN** a test case has steps without expected results
- **THEN** those steps are still returned with the expected-result field empty so the reviewer can flag the quality gap

### Requirement: story execution status

The server SHALL provide a `list_story_executions(issueKey)` tool that returns the executions linked to a Jira issue with their status, cycle, and date, giving a focused pass/fail view.

#### Scenario: Executions exist

- **WHEN** `list_story_executions` is called for an issue with linked executions
- **THEN** the tool returns each execution's status, associated test cycle, and execution date

#### Scenario: No executions

- **WHEN** the issue has no linked executions
- **THEN** the tool returns an empty list indicating the story's tests have not been run

### Requirement: Test case search

The server SHALL provide a `search_test_cases(projectKey, query)` tool for discovering test cases across an entire project by matching text against key/name/objective. This tool is project-wide and is NOT scoped to a Jira issue; it is intended for discovery when the reviewer does not have an issue key or wants to look beyond the tests linked to a single story. For questions about the test cases of a specific story, `list_story_test_cases` or `review_story_coverage` SHALL be preferred.

#### Scenario: Matching test cases

- **WHEN** `search_test_cases` is called with a project key and a query
- **THEN** the tool returns matching test cases scoped to that project

#### Scenario: Not used for story-scoped questions

- **WHEN** the reviewer has a Jira issue key and wants the tests linked to that story
- **THEN** `list_story_test_cases` (titles only) or `review_story_coverage` (full coverage) is used instead of `search_test_cases`

### Requirement: Project context lookup

The server SHALL provide a `get_project(projectKey)` tool that returns project metadata, so keys and scope can be resolved during a review.

#### Scenario: Existing project

- **WHEN** `get_project` is called with a valid project key
- **THEN** the tool returns the project's identifier and metadata

### Requirement: Drafted tests are reasoning output only

The server SHALL NOT provide any tool that writes suggested or drafted test cases back to Zephyr. Drafting new tests is a Claude reasoning activity surfaced in the conversation.

#### Scenario: Reviewer asks for suggested tests

- **WHEN** a reviewer asks Claude to propose test cases for uncovered acceptance criteria
- **THEN** Claude produces the proposed tests as conversational output and no tool call mutates Zephyr data
