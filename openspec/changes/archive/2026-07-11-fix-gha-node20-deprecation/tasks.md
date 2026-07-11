## 1. Update publish workflow

- [x] 1.1 In `.github/workflows/publish.yml`, change `uses: actions/checkout@v4` to `actions/checkout@v5`
- [x] 1.2 In the same file, change `uses: actions/setup-node@v4` to `actions/setup-node@v5`
- [x] 1.3 Change the `setup-node` `node-version` from `"20.x"` to `"22.x"`, keeping `registry-url: https://registry.npmjs.org`

## 2. Verify

- [x] 2.1 Confirm the workflow still passes `registry-url` and exposes `NODE_AUTH_TOKEN` from the `NPM_TOKEN` secret so `npm publish` authenticates
- [x] 2.2 Validate the workflow YAML is well-formed (e.g. `actionlint` or GitHub's workflow parser) with no remaining `@v4` pins
- [x] 2.3 Confirm no `actions/*` pin in the workflow triggers a Node.js deprecation warning
