# Releasing x402-sdk

This monorepo publishes three packages to npm:

| Package | Description |
|---------|-------------|
| `@fastxyz/x402-client` | Client SDK for making x402 payments |
| `@fastxyz/x402-server` | Server middleware for accepting x402 payments |
| `@fastxyz/x402-facilitator` | Facilitator service for processing payments |

## One-time npm setup

1. Create or verify access to the `@fastxyz` npm scope.
2. Configure npm trusted publishing for `fastxyz/x402-sdk`.
3. Register the publish workflow filename exactly as `.github/workflows/publish.yml`.

Trusted publishing is the expected path for this repo. Do not add a long-lived npm token unless trusted publishing is unavailable.

## Release strategy

This repo uses coordinated releases only. All three packages share the same version and are published together from one git tag.

1. Update `version` in all three `packages/*/package.json` files to the same version.
2. Run `npm install` at root to refresh the lockfile if dependencies changed.
3. Run the full release gates locally:
   - `npm run build`
   - `npm test`
   - `npm run pack:dry-run`
   - `npm run pack:smoke`
4. Commit with message: `chore: release vX.Y.Z`
5. Merge to `main`.
6. Create and push a single tag: `vX.Y.Z`
7. The publish workflow rebuilds, re-tests, re-packs, smoke-tests, and publishes all packages.

## Release invariants

- Git tags must match `package.json` versions exactly.
- The publish workflow rebuilds from source, runs tests, and runs smoke checks before publishing.
- `npm pack` must include built `dist/*` artifacts for every package.
- Public scoped packages must publish with `--access public`.
- All packages in a release must have matching versions.

## Verifying releases

After publishing, verify each package:

```bash
npm info @fastxyz/x402-client
npm info @fastxyz/x402-server
npm info @fastxyz/x402-facilitator
```

Test fresh installs and imports:

```bash
npm install @fastxyz/x402-client @fastxyz/x402-server @fastxyz/x402-facilitator
```
