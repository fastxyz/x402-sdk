#!/usr/bin/env node
/**
 * Dry-run npm pack for all workspace packages.
 */
import {
  assertBuildArtifacts,
  assertTarballIncludesBuildArtifacts,
  getNpmEnv,
  getWorkspacePackages,
  packPackage,
} from './package-release-utils.mjs';

const workspaceDir = process.cwd();
const npmEnv = getNpmEnv(workspaceDir);
const packages = getWorkspacePackages(workspaceDir);

console.log(`Dry-run packing ${packages.length} packages...`);

for (const pkg of packages) {
  console.log(`\n📦 Packing ${pkg.manifest.name}...`);
  const packResult = packPackage(pkg.pkgDir, npmEnv, { dryRun: true });
  assertBuildArtifacts(pkg.pkgDir, pkg.manifest);
  assertTarballIncludesBuildArtifacts(pkg.manifest, packResult);
  console.log(`✅ ${pkg.manifest.name} dry-run pack includes dist artifacts`);
}

console.log('\n✅ All packages pack successfully');
