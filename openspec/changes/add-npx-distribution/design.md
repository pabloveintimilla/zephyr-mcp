## Context

The server is already built for npx: it has a `bin`, a `#!/usr/bin/env node` shebang, `type: "module"`, `files: ["dist"]`, `engines.node >=18`, and a stdio transport. It just is not published. The unscoped name `zephyr-mcp` is already taken on npm (v1.0.0), so the package is scoped to the owner's account as `@pabloveintimilla/zephyr-mcp`. The owner will publish under a personal npm account (Pablo Veintimilla), not PPM.

How npx resolves the package (the package NAME, not the bin name, is the handle):

```
 client config              npm registry                 user machine
 command: npx        ──▶  @pabloveintimilla/zephyr-mcp ──▶ ~/.npm/_npx cache
 args: -y <name>          tarball (dist/)                  node dist/index.js
```

## Goals / Non-Goals

**Goals:**
- Anyone can run the server with `npx -y @pabloveintimilla/zephyr-mcp`.
- Publishing is safe (never ships an empty `dist/`, no source or secrets).
- Metadata and license reflect the personal author, with no PPM references.
- A clear, repeatable release runbook.

**Goals (added):**
- Publishing is automated: creating a GitHub Release builds and publishes the compiled package to npm, with provenance.

**Non-Goals:**
- No runtime, tool, or API changes.
- No private registry or org publish (public npm only).
- No automated version bumping / changelog tooling (semantic-release, changesets) — versions are bumped manually before a release.

## Decisions

- **Public npm publish, personal account.** Chosen by the owner; matches `tempo-mcp-server`. Simplest for consumers. Alternative (private registry / npx-from-git) rejected: no org registry and the owner wants public.
- **Scoped name `@pabloveintimilla/zephyr-mcp`.** The owner wanted the short `zephyr-mcp`, but `npm view zephyr-mcp` shows it is taken (v1.0.0). Scoping to the personal account keeps the short `zephyr-mcp` name and is permanently owned. Because scoped packages default to private, `publishConfig: { access: "public" }` is required (or `npm publish --access public`). Alternatives: unscoped `zephyr-scale-mcp` (free) — rejected in favor of keeping `zephyr-mcp`; keep `zephyr-review-mcp` — rejected, owner wants the shorter name.
- **Rename `bin` command to `zephyr-mcp`.** Short, memorable command name; independent of the scoped package name that npx resolves.
- **`prepublishOnly: "npm run build"`.** `dist/` is git-ignored, so a fresh clone has no build output. `prepublishOnly` guarantees a rebuild before pack. `prepare` also works but runs on plain installs too; `prepublishOnly` is narrower and enough here.
- **Keep the `files` allowlist.** `files: ["dist"]` already wins over `.gitignore`; a `npm pack --dry-run` confirmed the tarball excludes `src/` and `.env`. No `.npmignore` needed.
- **Add metadata + MIT LICENSE.** `author`, `repository`, `homepage`, `bugs`, `license`, `main` drive the npm page. MIT is a common permissive default for a personal open-source tool.
- **Optionally drop `declaration` in tsconfig.** This tool is a CLI/stdio server, not an imported library, so `.d.ts` files add weight without value. Cosmetic; low priority.
- **Publish via GitHub Actions on Release, not manually.** A `.github/workflows/publish.yml` triggers on `release: [published]`, runs `npm ci` → `npm run build` → `npm publish --provenance --access public`. Chosen because the owner wants a GitHub-driven pipeline; it also keeps `dist/` out of git (built on the runner) and makes releases reproducible. Follows the current GitHub docs workflow (`actions/setup-node` with `registry-url`, `NODE_AUTH_TOKEN`).
- **Auth via `NPM_TOKEN` secret + provenance.** An npm automation (or granular) token with publish rights is stored as the `NPM_TOKEN` repo secret and exposed as `NODE_AUTH_TOKEN`; `--provenance` with `id-token: write` attaches a supply-chain attestation. Alternative considered: npm OIDC "trusted publishing" (no long-lived token) — cleaner but requires extra configuration on npmjs.com and is easier to add later; the token path is the documented default and simplest for the first release.
- **Keep `prepublishOnly` as a backstop.** The workflow builds explicitly, but `prepublishOnly: npm run build` still guarantees a fresh `dist/` for any manual/local publish.

## Risks / Trade-offs

- **Broken first publish lives forever** (npm versions are immutable) → verify with `npm pack --dry-run` and a local `npx ./` / MCP Inspector smoke test before cutting the release that triggers CI.
- **Source becomes world-readable** (accepted) → only the code is public; the Zephyr token stays in the client env and is never bundled.
- **Release tag ≠ package.json version** → the published npm version comes from `package.json`, not the tag; bump the version first and tag to match, or a release can publish an unexpected version.
- **NPM_TOKEN leak or over-broad scope** → use a granular token scoped to publish this package only, store it as a repo secret (never in code), and rotate if exposed. The first publish of a brand-new package may require creating it, or a token with the right org/scope permissions.
- **First scoped publish needs `--access public`** → already passed explicitly in the workflow, so the package is not created private by accident.

## Migration Plan

1. Make the file changes (package.json, README, LICENSE, `.github/workflows/publish.yml`).
2. `npm run build` then `npm pack --dry-run` to verify tarball contents; optional local smoke test via `npm link` / `npx ./` against the MCP Inspector.
3. One-time: create an npm automation/granular token with publish rights and add it as the `NPM_TOKEN` GitHub Actions secret.
4. Set repo git identity (`git config user.email pabloveintimilla@gmail.com`), push to the personal GitHub repo.
5. Bump the version (`npm version <patch|minor>`), push the tag, and create a GitHub Release with the matching tag → the workflow publishes.
6. Verify `npx -y @pabloveintimilla/zephyr-mcp` on a clean shell.
7. Rollback: `npm deprecate` a bad version and publish a fixed patch via a new release (unpublish is restricted within 72h and discouraged).

## Open Questions

- Slim the tarball by dropping `.d.ts` output now, or leave for later? (Cosmetic.)
- Switch to npm OIDC trusted publishing (token-less) in a follow-up, once the first token-based release is proven?
- Add tests as a required CI gate before publish (run `npm test` in the workflow)?
