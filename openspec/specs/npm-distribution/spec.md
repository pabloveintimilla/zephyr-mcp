# npm-distribution Specification

## Purpose

Distribute the Zephyr MCP server as a public, scoped npm package so any MCP client can run it with `npx` without cloning or building, published automatically and repeatably via CI.
## Requirements

### Requirement: Runnable via npx from the public npm registry

The package SHALL be published to the public npm registry as the scoped package `@pabloveintimilla/zephyr-mcp`, so any MCP client can launch it with `npx -y @pabloveintimilla/zephyr-mcp` without a prior clone or install. Because scoped packages default to private, `package.json` SHALL set `publishConfig.access` to `public`. The published `bin` entry SHALL point to the compiled `dist/index.js`, which SHALL start with a `#!/usr/bin/env node` shebang.

#### Scenario: Client launches the server via npx

- **WHEN** an MCP client is configured with `command: "npx"` and `args: ["-y", "@pabloveintimilla/zephyr-mcp"]`
- **THEN** npx downloads the package and runs `dist/index.js`, and the server connects its stdio transport

#### Scenario: Fresh machine with no local clone

- **WHEN** `npx -y @pabloveintimilla/zephyr-mcp` is run on a machine that has never installed the package
- **THEN** npx fetches the latest published version and starts the server without any manual build step

#### Scenario: Scoped package is published publicly

- **WHEN** the package is published with `publishConfig.access` set to `public`
- **THEN** the scoped package is publicly installable without npm authentication, not published as a private package

### Requirement: Published tarball ships built output and excludes source and secrets

The package SHALL rebuild `dist/` before publishing via a `prepublishOnly` (or `prepare`) script running the build, so a publish from a fresh clone never ships an empty `dist/`. The tarball SHALL include only the compiled `dist/` output (via the `files` allowlist), `package.json`, `README.md`, and `LICENSE`, and SHALL NOT include `src/`, tests, `.env`, or other local files.

#### Scenario: Publish from a fresh clone

- **WHEN** the package is published from a clone where `dist/` was never built
- **THEN** `prepublishOnly` runs the build first, and the tarball contains a complete `dist/index.js`

#### Scenario: Tarball contents are verified before publish

- **WHEN** `npm pack --dry-run` is run
- **THEN** the listed files include `dist/`, `package.json`, `README.md`, and `LICENSE`, and exclude `src/`, `test/`, and `.env`

### Requirement: Package metadata identifies the personal author and repository

`package.json` SHALL declare `author` as `Pablo Veintimilla <pabloveintimilla@gmail.com>`, `license` as `MIT`, and `repository`, `homepage`, and `bugs` pointing at the personal GitHub repository `pabloveintimilla/zephyr-mcp`. A `LICENSE` file with the MIT text and copyright to Pablo Veintimilla SHALL be present.

#### Scenario: npm page shows personal identity

- **WHEN** the published package page is viewed on npm
- **THEN** it shows the MIT license, the personal author, and links to the personal GitHub repository

#### Scenario: License file is present

- **WHEN** the tarball is inspected
- **THEN** it contains a `LICENSE` file with MIT terms and copyright to Pablo Veintimilla

### Requirement: README separates user and developer instructions

`README.md` SHALL present two distinct audiences in separate sections:

- A **user / installation** section that shows the zero-setup path: an MCP client configuration example using `npx` (`command: "npx"`, `args: ["-y", "@pabloveintimilla/zephyr-mcp"]`) with the required `ZEPHYR_API_TOKEN` and region environment variables, and the Node.js 18+ prerequisite. This section SHALL NOT require cloning the repository or running a build.
- A **developer / contributing** section that covers cloning the repository, `npm install`, `npm run build`, running from source (`npm run dev` / `node dist/index.js`), `npm test`, and the local-path MCP client configuration.

The user section SHALL appear before the developer section.

#### Scenario: End user configures a client without cloning

- **WHEN** a reader who only wants to use the server follows the user/installation section
- **THEN** they can copy an `npx` MCP config block with the correct environment variables, without cloning or building the project

#### Scenario: Contributor sets up a local checkout

- **WHEN** a reader who wants to modify the server follows the developer section
- **THEN** they find clone, `npm install`, build, run-from-source, and test instructions, plus the local-path MCP config

### Requirement: Automated publish to npm via GitHub Actions

The repository SHALL include a GitHub Actions workflow at `.github/workflows/publish.yml` that publishes the package to the npm registry when a GitHub Release is published. The workflow SHALL check out the code, set up Node.js with `registry-url: https://registry.npmjs.org`, install dependencies with `npm ci`, build the TypeScript to `dist/`, and run `npm publish --provenance --access public`. It SHALL authenticate with an `NPM_TOKEN` repository secret exposed as `NODE_AUTH_TOKEN`, and SHALL request `id-token: write` permission so npm provenance can be attached. The compiled `dist/` SHALL be produced on the CI runner and SHALL NOT be committed to git.

The workflow SHALL pin GitHub-maintained actions (`actions/checkout` and `actions/setup-node`) to major versions that run on a non-deprecated Node.js runtime, and SHALL set `node-version` to a supported Node.js LTS. It SHALL NOT rely on action versions that GitHub reports as deprecated.

#### Scenario: Release triggers a publish

- **WHEN** a GitHub Release is published on the repository
- **THEN** the workflow runs, builds the compiled output, and publishes the package to npm so `npx -y @pabloveintimilla/zephyr-mcp` resolves the new version

#### Scenario: Publish carries provenance

- **WHEN** the workflow runs `npm publish --provenance` with `id-token: write` granted
- **THEN** the published version has a provenance attestation linking it to the source repository and the commit that built it

#### Scenario: Missing or invalid npm token

- **WHEN** the `NPM_TOKEN` secret is absent or invalid at publish time
- **THEN** the workflow fails during `npm publish` without publishing a partial or unauthenticated version

#### Scenario: Workflow runs on a supported, non-deprecated runtime

- **WHEN** the publish workflow runs on GitHub-hosted runners
- **THEN** `actions/checkout` and `actions/setup-node` run on a supported Node.js runtime and GitHub emits no Node.js deprecation warning for these actions, and the build and publish steps run on the configured Node.js LTS

### Requirement: Documented release and versioning runbook

The repository SHALL document a repeatable release runbook covering the one-time setup (create an npm automation/granular token with publish rights, add it as the `NPM_TOKEN` GitHub Actions secret) and the per-release flow (bump the version with `npm version`, push, and create a GitHub Release whose tag matches the `package.json` version, which triggers the publish workflow). The runbook SHALL also cover local pre-publish verification (`npm pack --dry-run` and an `npx ./` smoke test) for validating changes before cutting a release.

#### Scenario: Maintainer cuts a new release

- **WHEN** the maintainer bumps the version, pushes, and publishes a matching GitHub Release
- **THEN** the publish workflow runs and the new version becomes installable via `npx -y @pabloveintimilla/zephyr-mcp`

#### Scenario: Version and release tag match

- **WHEN** a GitHub Release is created for a version
- **THEN** its tag corresponds to the `version` in `package.json`, so the published npm version matches the release
