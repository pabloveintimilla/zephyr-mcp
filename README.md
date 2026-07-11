# Zephyr Review MCP

A **read-only** [Model Context Protocol](https://modelcontextprotocol.io) server that exposes
[Zephyr Scale Cloud](https://smartbear.com/test-management/zephyr-scale/) test data as
review-oriented tools, so Claude (e.g. in Cowork) can review a **story**
against its actual test coverage.

It answers: *does this story have adequate, well-formed tests, and are they passing?*

The story text (description, acceptance criteria) is expected to come from Jira (e.g. the Atlassian
Rovo MCP). This server supplies the **test-coverage half** of the picture from Zephyr.

## What it does (and does not)

- **Read-only.** Every tool issues only `GET` requests. No tool creates, updates, or deletes
  Zephyr data. "Draft new tests" is a Claude reasoning activity in the conversation, not a write
  call.
- Assumes your team **links test cases to Jira issues** in Zephyr (the `issuelinks`
  relationship). If a story has no linked tests, coverage reads as empty.

## Tools

| Tool | Purpose |
|------|---------|
| `review_story_coverage(issueKey)` | Headline tool. Fans out over the linked test cases, their steps, and executions and returns one digested coverage bundle plus a pass/fail/not-run summary. Heavier — use when assessing coverage/quality/pass-fail. |
| `list_story_test_cases(issueKey)` | Lightweight, story-scoped listing: the test cases linked to a story, each with key, name/title, priority, and status. No steps or executions. Use when you just want the list/titles of a story's tests. |
| `get_test_case(testCaseKey)` | Full detail of one test case, including ordered steps (empty expected-result fields kept visible for quality review). |
| `list_story_executions(issueKey)` | Focused pass/fail view: each linked execution's status, cycle, and date. |
| `list_test_case_executions(testCaseKey)` | Full execution **history** of one test case, newest-first — every run across all cycles plus ad-hoc runs (not just the latest). Each execution carries status, cycle, date, comment, timing (execution/estimated ms), who ran it, environment, custom fields, and linked Jira issues. Test-case-scoped; use `list_story_executions` for a whole story. |
| `search_test_cases(projectKey, query)` | Project-wide discovery: test cases in a project whose key/name/objective match `query` (client-side filter — the Zephyr API has no full-text search). Not story-scoped; use only when you don't have an issue key. |
| `get_project(projectKey)` | Project identifier and metadata. |

## Configuration

Set via environment variables (see `.env.example`):

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `ZEPHYR_API_TOKEN` | **yes** | — | JWT bearer token. Generate in Jira → profile → *Zephyr API keys*. The server fails fast if unset. |
| `ZEPHYR_REGION` | no | `us` | One of `us`, `eu`, `au`, `de`. |
| `ZEPHYR_BASE_URL` | no | derived from region | Full base URL override; takes precedence over `ZEPHYR_REGION`. |

Regional base URLs:

- `us` → `https://api.zephyrscale.smartbear.com/v2` (default)
- `eu` → `https://eu.api.zephyrscale.smartbear.com/v2`
- `au` → `https://au.api.zephyrscale.smartbear.com/v2`
- `de` → `https://de.api.zephyrscale.smartbear.com/v2`

The token maps to a Jira/Zephyr **user**; the server sees only what that user can see.

## Usage

For **using** the server in an MCP client. Requires Node.js 18+. No clone or build needed — `npx` fetches and runs the published package.

Add to your MCP client config (Claude Cowork / Claude Desktop):

```json
{
  "mcpServers": {
    "zephyr": {
      "command": "npx",
      "args": ["-y", "@pabloveintimilla/zephyr-mcp"],
      "env": {
        "ZEPHYR_API_TOKEN": "<your-token>",
        "ZEPHYR_REGION": "us"
      }
    }
  }
}
```

That's it — the client launches the server on demand.

## Development

For **working on** the server itself: clone the repository and install dependencies.

```bash
git clone https://github.com/pabloveintimilla/zephyr-mcp.git
cd zephyr-mcp
npm install
npm run build
```

Run it:

```bash
ZEPHYR_API_TOKEN=<your-token> npm start        # from built dist/
ZEPHYR_API_TOKEN=<your-token> npm run dev       # from source, no build step
```

Run the tests:

```bash
npm test
```

Point an MCP client at your local build (instead of the published package):

```json
{
  "mcpServers": {
    "zephyr": {
      "command": "node",
      "args": ["/absolute/path/to/zephyr-mcp/dist/index.js"],
      "env": {
        "ZEPHYR_API_TOKEN": "<your-token>",
        "ZEPHYR_REGION": "us"
      }
    }
  }
}
```

### Spec-driven development with OpenSpec

This project uses [OpenSpec](https://github.com/Fission-AI/OpenSpec) for spec-driven
development. **Do not start coding a feature directly** — capture the intent as a change
first, then implement against it. This keeps `openspec/specs/` (the source of truth for
current behavior) accurate and makes each change reviewable before code is written.

Layout:

- `openspec/specs/` — the current, agreed behavior (one folder per capability).
- `openspec/changes/` — active changes in progress (proposal, design, specs delta, tasks).
- `openspec/changes/archive/` — completed changes, kept for history.

Workflow (run as slash commands in Claude Code, or with the `openspec` CLI):

1. **Explore** — `/opsx:explore` to think through the problem before committing to a design.
2. **Propose** — `/opsx:propose` to create a change with `proposal.md`, `design.md`,
   a spec delta under `specs/`, and `tasks.md`.
3. **Apply** — `/opsx:apply` to implement the tasks, checking them off as you go.
4. **Archive** — `/opsx:archive` once the work is done and verified; this syncs the spec
   delta into `openspec/specs/` and moves the change to `archive/`.

Useful CLI commands:

```bash
openspec list                          # active changes
openspec status --change "<name>"      # artifacts + task progress
openspec instructions <artifact> --change "<name>"
```

## Publishing / Release

Publishing to npm is automated by GitHub Actions ([`.github/workflows/publish.yml`](.github/workflows/publish.yml)). Publishing a **GitHub Release** builds the package and runs `npm publish --provenance --access public`.

One-time setup:

1. Create an npm access token (Automation or Granular, with publish rights for `@pabloveintimilla/zephyr-mcp`).
2. Add it as a repository secret named `NPM_TOKEN` (Settings → Secrets and variables → Actions).

Each release:

1. Bump the version: `npm version <patch|minor|major>` (commits and tags).
2. Push with tags: `git push --follow-tags`.
3. Create a GitHub Release for that tag — the workflow publishes it.

Verify: `npx -y @pabloveintimilla/zephyr-mcp` on a clean shell resolves the new version.

## Reference

The Zephyr Scale Cloud OpenAPI spec is vendored at [`docs/zephyr.api.yml`](docs/zephyr.api.yml).
