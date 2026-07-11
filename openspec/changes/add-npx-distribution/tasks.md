## 1. Package name and metadata

- [x] 1.1 Rename `"name"` to `"@pabloveintimilla/zephyr-mcp"` in `package.json`
- [x] 1.2 Rename the `bin` key to `"zephyr-mcp": "dist/index.js"`
- [x] 1.3 Add `"publishConfig": { "access": "public" }` so the scoped package publishes publicly
- [x] 1.4 Add `"prepublishOnly": "npm run build"` to `package.json` scripts
- [x] 1.5 Add `"main": "dist/index.js"` to `package.json`
- [x] 1.6 Add `"author": "Pablo Veintimilla <pabloveintimilla@gmail.com>"` and `"license": "MIT"`
- [x] 1.7 Add `"repository"`, `"homepage"`, and `"bugs"` pointing at `github.com/pabloveintimilla/zephyr-mcp`
- [x] 1.8 Add relevant `"keywords"` (e.g. `mcp`, `zephyr`, `zephyr-scale`, `testing`, `model-context-protocol`)
- [x] 1.9 Confirm no PPM or `@ppm.com.ec` references remain in `package.json`

## 2. License

- [x] 2.1 Create `LICENSE` file with MIT text, copyright © Pablo Veintimilla, current year

## 3. README (split by audience)

- [x] 3.1 Add a **Usage / Installation** section (for users) with the `npx` MCP client config (`command: "npx"`, `args: ["-y", "@pabloveintimilla/zephyr-mcp"]`), `ZEPHYR_API_TOKEN` + region env vars, and the Node.js 18+ prerequisite — no clone/build needed
- [x] 3.2 Add a **Development / Contributing** section (for developers) with git clone, `npm install`, `npm run build`, run-from-source (`npm run dev` / `node dist/index.js`), and `npm test`
- [x] 3.3 Move the existing local-path MCP config (`node dist/index.js`) into the developer section
- [x] 3.4 Reorganize existing headings so the user section precedes the developer section (regroup `Install & build`, `Run`, `Test` under Development)
- [x] 3.5 Add a short **Publishing / Release** section documenting the CI flow (NPM_TOKEN secret → bump version → create GitHub Release → CI publishes)

## 4. GitHub Actions publish workflow

- [x] 4.1 Create `.github/workflows/publish.yml` triggered on `release: [published]`
- [x] 4.2 Set job `permissions: { contents: read, id-token: write }` (id-token enables provenance)
- [x] 4.3 Steps: `actions/checkout` → `actions/setup-node` with `node-version: 20` and `registry-url: https://registry.npmjs.org` → `npm ci` → `npm run build`
- [x] 4.4 Publish step: `npm publish --provenance --access public` with `env: NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`

## 5. Verify build and tarball

- [x] 5.1 Run `npm run build` and confirm `dist/index.js` exists with the shebang
- [x] 5.2 Run `npm pack --dry-run` and confirm the tarball includes `dist/`, `package.json`, `README.md`, `LICENSE` and excludes `src/`, `test/`, `.env`
- [x] 5.3 Smoke test locally via `npm link` or `npx ./` (optionally through the MCP Inspector)

## 6. Release (owner-run)

- [x] 6.1 Set repo git identity: `git config user.email pabloveintimilla@gmail.com`
- [ ] 6.2 Create an npm automation/granular token with publish rights for `@pabloveintimilla/zephyr-mcp`
- [ ] 6.3 Add the token as the `NPM_TOKEN` secret in the GitHub repo settings
- [ ] 6.4 Push the repo, bump the version (`npm version <patch|minor>`), and push the tag
- [ ] 6.5 Create a GitHub Release with the matching tag and confirm the publish workflow succeeds
- [ ] 6.6 Verify `npx -y @pabloveintimilla/zephyr-mcp` runs on a clean shell
