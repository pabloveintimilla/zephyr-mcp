# zephyr-mcp-server Specification

## Purpose

Provide a read-only Model Context Protocol (MCP) server that exposes Zephyr Scale Cloud data to MCP clients (e.g. Claude Cowork) over stdio, handling authentication, region configuration, and robust API error handling.

## Requirements

### Requirement: MCP server exposes tools over stdio

The server SHALL implement the Model Context Protocol using the official TypeScript SDK and communicate over the stdio transport so it can be launched as a subprocess by Claude Cowork and other MCP clients.

#### Scenario: Client lists available tools

- **WHEN** an MCP client connects and issues a `tools/list` request
- **THEN** the server responds with the registered read-only tools (`review_story_coverage`, `get_test_case`, `list_story_executions`, `search_test_cases`, `get_project`), each with a name, description, and input schema

#### Scenario: Server starts on stdio

- **WHEN** the server process is started
- **THEN** it connects a stdio transport and remains available to serve requests without writing protocol-breaking output to stdout

### Requirement: Authentication via JWT bearer token

The server SHALL read the Zephyr API token from the `ZEPHYR_API_TOKEN` environment variable and send it as `Authorization: Bearer <token>` on every request to the Zephyr Scale Cloud API.

#### Scenario: Token is present

- **WHEN** `ZEPHYR_API_TOKEN` is set and a tool makes a Zephyr API call
- **THEN** the request includes the `Authorization: Bearer` header with that token

#### Scenario: Token is missing

- **WHEN** the server starts and `ZEPHYR_API_TOKEN` is not set
- **THEN** the server fails fast with a clear error message instructing the operator to set `ZEPHYR_API_TOKEN`, rather than making unauthenticated calls

### Requirement: Configurable API region

The server SHALL allow the Zephyr API base URL to be configured via environment variable and SHALL default to the US region base URL `https://api.zephyrscale.smartbear.com/v2` when none is provided.

#### Scenario: Default region

- **WHEN** no base URL / region override is configured
- **THEN** requests are sent to `https://api.zephyrscale.smartbear.com/v2`

#### Scenario: Overridden region

- **WHEN** the operator sets a base URL / region for EU, AU, or DE
- **THEN** requests are sent to the corresponding regional base URL

### Requirement: Read-only API access

The server SHALL only issue GET requests to the Zephyr Scale API and SHALL NOT expose any tool that creates, updates, or deletes Zephyr data.

#### Scenario: No mutating tools registered

- **WHEN** a client lists or invokes tools
- **THEN** no tool performs a POST, PUT, PATCH, or DELETE against the Zephyr API

### Requirement: Robust API error handling

The Zephyr API client SHALL translate API failures into clear, structured tool errors and SHALL handle authentication, not-found, and rate-limit responses distinctly.

#### Scenario: Unauthorized response

- **WHEN** the Zephyr API returns 401
- **THEN** the tool returns an error indicating the token is invalid or expired

#### Scenario: Resource not found

- **WHEN** the Zephyr API returns 404 for a requested key
- **THEN** the tool returns an error indicating the specific issue/test key was not found

#### Scenario: Rate limited

- **WHEN** the Zephyr API returns 429
- **THEN** the client respects the retry guidance (e.g. `Retry-After`) and retries within a bounded limit before surfacing a rate-limit error

### Requirement: Tool output is self-contained in text content

Every tool SHALL return its full result in the `content` text block of the response, not only in `structuredContent`. The text block SHALL be self-contained so that MCP clients which read only the text content (and ignore `structuredContent`) still receive the complete result. A short human-readable summary MAY lead the text block, but the detailed data (e.g. test case keys, steps, executions) MUST also be present. Tools MAY continue to populate `structuredContent` in addition, for clients that support it.

#### Scenario: Client reads only the text content block

- **WHEN** a client that surfaces only the `content` text block invokes `review_story_coverage` for a story with linked test cases
- **THEN** the text block contains the individual test case keys and their step/execution detail, not just the summary line

#### Scenario: Summary precedes full detail

- **WHEN** any tool returns a successful result
- **THEN** the text block leads with a concise summary and is followed by the full result payload

#### Scenario: Structured content remains available

- **WHEN** a tool returns a successful result
- **THEN** `structuredContent` is still populated with the same result for clients that support it

### Requirement: Test-case-scoped execution history

The server SHALL expose a read-only tool `list_test_case_executions` that accepts a Zephyr test case key and returns every test execution for that test case, sorted most-recent-first. The tool SHALL fetch executions using the Zephyr API `testCase` filter and SHALL follow pagination so the full history is returned, not only the latest run. The tool SHALL NOT restrict the result to the last execution per cycle.

#### Scenario: Test case has multiple executions

- **WHEN** a client invokes `list_test_case_executions` for a test case key that has been run several times across cycles
- **THEN** the response lists every execution for that test case, ordered from newest to oldest by execution date

#### Scenario: Test case has never been executed

- **WHEN** a client invokes `list_test_case_executions` for a test case with no executions
- **THEN** the tool returns an empty execution list (not an error) with a summary stating the test case has not been run

#### Scenario: Unknown test case key

- **WHEN** a client invokes `list_test_case_executions` with a test case key that does not exist
- **THEN** the tool returns a not-found error indicating the specific test case key was not found

### Requirement: Rich per-execution detail

Each execution returned by `list_test_case_executions` SHALL include, when the Zephyr API provides them, the execution status (raw and normalized), test cycle, execution date, comment, and automated flag, plus the richer fields: `executionTime` and `estimatedTime` in milliseconds, `executedById`, `assignedToId`, `environment`, `customFields`, and any linked Jira issues. Fields absent from the API response SHALL be omitted or null rather than causing an error.

#### Scenario: Execution carries timing, owner, and linked issues

- **WHEN** an execution in the history has timing data, an executor, and a linked Jira defect
- **THEN** its entry includes `executionTime`, `estimatedTime`, `executedById`, and the linked issue reference alongside the status, cycle, and date

#### Scenario: Partial execution data

- **WHEN** an execution is missing optional fields such as `comment` or `environment`
- **THEN** those fields are omitted or null in the result and the remaining fields are still returned
