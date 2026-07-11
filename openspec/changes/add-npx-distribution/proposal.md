## Why

Today the server can only be run from a local clone with `node /absolute/path/to/dist/index.js`. This is hard to share and to configure in MCP clients. Publishing to npm lets anyone run it with `npx -y @pabloveintimilla/zephyr-mcp`, the same one-line setup used by tools like `tempo-mcp-server`.

## What Changes

- Rename the package to `@pabloveintimilla/zephyr-mcp` (the unscoped `zephyr-mcp` is taken, so it is scoped to the personal npm account) and publish it publicly.
- Add `publishConfig: { access: "public" }` so the scoped package publishes publicly (scoped packages default to private).
- Add a `prepublishOnly` script so `dist/` is always rebuilt before publish (today `dist/` is git-ignored and could ship empty).
- Add npm metadata: `author`, `repository`, `homepage`, `bugs`, `license`, and `main`.
- Add an `MIT` `LICENSE` file (© Pablo Veintimilla).
- Update `README.md` with an `npx` usage block and install/prerequisite notes, alongside the existing local-path option.
- Add a GitHub Actions workflow (`.github/workflows/publish.yml`) that builds and publishes the compiled package to npmjs when a GitHub Release is published, using `npm publish --provenance --access public`.
- Document the release runbook (create npm token → add `NPM_TOKEN` repo secret → bump version → create GitHub Release → CI publishes).

No runtime behavior, tool, or API changes. The existing `bin`, shebang, `files: ["dist"]`, ESM setup, and stdio transport already support this. Publishing is automated in CI, so the compiled `dist/` is built on GitHub runners, not committed to git.

## Capabilities

### New Capabilities
- `npm-distribution`: how the server is packaged, named, and published so it can be launched with `npx` by any MCP client, and how release/versioning is handled.

### Modified Capabilities
<!-- None. Runtime behavior and tools are unchanged. -->

## Impact

- Files: `package.json` (name, `bin`, scripts, `publishConfig`, metadata), `README.md`, new `LICENSE`, new `.github/workflows/publish.yml`.
- Build/config: `tsconfig.json` optional (drop `.d.ts` output to slim the tarball).
- Systems: public npm registry (new account + automation token), personal GitHub repo with an `NPM_TOKEN` Actions secret.
- Git hygiene: set local `git config user.email` to the personal address before the first public commit so the `@ppm.com.ec` address is not baked into history.
- No changes to `src/`, Zephyr API usage, or environment variables.
