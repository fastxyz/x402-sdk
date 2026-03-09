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

## Release strategies

### Coordinated release (recommended)

All packages share the same version and are released together:

1. Update `version` in all three `packages/*/package.json` files to the same version.
2. Run `npm install` at root to refresh the lockfile.
3. Commit with message: `chore: release vX.Y.Z`
4. Merge to `main`.
5. Create and push a single tag: `vX.Y.Z`
6. The publish workflow builds, tests, and publishes all packages.

### Independent release

If packages need independent versioning:

1. Update `version` in the specific package's `package.json`.
2. Run `npm install` at root.
3. Commit with message: `chore: release @fastxyz/x402-client@X.Y.Z` (or relevant package).
4. Merge to `main`.
5. Create and push a scoped tag: `x402-client@X.Y.Z`
6. The publish workflow detects which package changed and publishes only that one.

## Release invariants

- Git tags must match `package.json` versions exactly.
- The publish workflow rebuilds from source, runs tests, and runs smoke checks before publishing.
- Public scoped packages must publish with `--access public`.
- All packages in a coordinated release should have matching versions.

## Verifying releases

After publishing, verify each package:

```bash
npm info @fastxyz/x402-client
npm info @fastxyz/x402-server
npm info @fastxyz/x402-facilitator
```

Test fresh installs:

```bash
npm install @fastxyz/x402-client @fastxyz/x402-server
```
