## MODIFIED Requirements

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
