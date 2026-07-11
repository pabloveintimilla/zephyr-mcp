## Why

GitHub Actions runners now warn that Node.js 20 is deprecated and force `actions/checkout@v4` and `actions/setup-node@v4` to run on Node.js 24. These pinned actions target the retiring Node.js 20 runtime, so the publish workflow will break once GitHub removes Node.js 20 from the runners. We need to move to maintained action versions before that happens.

## What Changes

- Upgrade `actions/checkout@v4` to `actions/checkout@v5` in `.github/workflows/publish.yml`.
- Upgrade `actions/setup-node@v4` to `actions/setup-node@v5` in the same workflow.
- Raise the workflow `node-version` from `20.x` to a supported LTS (`22.x`) so the build and publish run on a non-deprecated Node.js runtime.
- Strengthen the automated-publish requirement so the workflow stays on maintained action major versions and a supported Node.js LTS.

## Capabilities

### New Capabilities

<!-- None -->

### Modified Capabilities

- `npm-distribution`: The "Automated publish to npm via GitHub Actions" requirement now mandates maintained (non-deprecated) action major versions and a supported Node.js LTS runtime for the publish workflow.

## Impact

- File: `.github/workflows/publish.yml` (action versions and `node-version`).
- Spec: `openspec/specs/npm-distribution/spec.md`.
- No changes to package code, published artifacts, or runtime behavior of the MCP server.
