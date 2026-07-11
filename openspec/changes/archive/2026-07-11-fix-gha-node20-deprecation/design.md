## Context

The publish workflow (`.github/workflows/publish.yml`) pins `actions/checkout@v4` and `actions/setup-node@v4`. Both target the Node.js 20 action runtime, which GitHub deprecated (see the 2025-09-19 changelog). Runners now force these actions onto Node.js 24 and emit a deprecation warning; once Node.js 20 is removed, the pins could fail. The workflow also builds and publishes on `node-version: "20.x"`.

## Goals / Non-Goals

**Goals:**
- Remove the Node.js 20 deprecation warning from the publish workflow.
- Keep the publish workflow on maintained action versions and a supported Node.js LTS.

**Non-Goals:**
- Changing publish behavior, provenance, package contents, or the release runbook.
- Bumping the package's declared minimum Node.js support for end users.

## Decisions

- **Upgrade to `actions/checkout@v5` and `actions/setup-node@v5`.** These major versions run on the supported Node.js runtime and clear the deprecation. Alternative — commit-SHA pinning — was rejected as heavier maintenance than the fix needs here.
- **Set `node-version: "22.x"`.** 22.x is an active LTS. Alternative `24.x` (current) was rejected in favor of an LTS line for build/publish stability; `20.x` was rejected because it is the deprecated line.
- **Verify `setup-node@v5` still honors `registry-url`.** The publish step depends on the registry/`NODE_AUTH_TOKEN` wiring, so confirm the v5 input contract is unchanged before merging.

## Risks / Trade-offs

- **`actions/*@v5` introduces a behavior change (e.g. registry-url or auth handling)** → Check the action release notes; validate on the next release, or roll back to `@v4` if publish auth breaks.
- **`node-version: "22.x"` behaves differently from 20.x during build** → Low risk (TypeScript build only); a test run on the workflow confirms the build passes.

## Migration Plan

1. Edit `.github/workflows/publish.yml`: bump both actions to `@v5` and `node-version` to `22.x`.
2. Merge to `main`; the next published GitHub Release exercises the workflow.
3. Rollback: revert the workflow edit to the `@v4` / `20.x` pins.

## Open Questions

- None.
