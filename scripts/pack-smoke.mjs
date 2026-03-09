#!/usr/bin/env node
/**
 * Pack and smoke-test all workspace packages.
 * Installs each package in isolation and verifies exports work.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  assertBuildArtifacts,
  assertTarballIncludesBuildArtifacts,
  getNpmEnv,
  getWorkspacePackages,
  npmCmd,
  packPackage,
} from './package-release-utils.mjs';

const workspaceDir = process.cwd();
const npmEnv = getNpmEnv(workspaceDir);

const smokeTests = {
  '@fastxyz/x402-client': `
      import { x402Pay, parse402Response, FAST_NETWORKS, EVM_NETWORKS } from "@fastxyz/x402-client";
      if (typeof x402Pay !== "function") throw new Error("x402Pay missing");
      if (typeof parse402Response !== "function") throw new Error("parse402Response missing");
      if (!FAST_NETWORKS) throw new Error("FAST_NETWORKS missing");
      if (!EVM_NETWORKS) throw new Error("EVM_NETWORKS missing");
    `,
  '@fastxyz/x402-server': `
      import { paymentMiddleware, verifyPayment, createPaymentRequired } from "@fastxyz/x402-server";
      if (typeof paymentMiddleware !== "function") throw new Error("paymentMiddleware missing");
      if (typeof verifyPayment !== "function") throw new Error("verifyPayment missing");
      if (typeof createPaymentRequired !== "function") throw new Error("createPaymentRequired missing");
    `,
  '@fastxyz/x402-facilitator': `
      import { verify, settle, createFacilitatorServer } from "@fastxyz/x402-facilitator";
      if (typeof verify !== "function") throw new Error("verify missing");
      if (typeof settle !== "function") throw new Error("settle missing");
      if (typeof createFacilitatorServer !== "function") throw new Error("createFacilitatorServer missing");
    `,
};

const packages = getWorkspacePackages(workspaceDir).map((pkg) => {
  const smokeTest = smokeTests[pkg.manifest.name];

  if (!smokeTest) {
    throw new Error(`No smoke test defined for ${pkg.manifest.name}`);
  }

  return { ...pkg, smokeTest };
});

for (const pkg of packages) {
  console.log(`\n📦 Smoke-testing ${pkg.manifest.name}...`);
  
  const tempDir = mkdtempSync(path.join(os.tmpdir(), `${pkg.dir}-smoke-`));
  let tarballPath = '';

  try {
    // Pack the package
    const packResult = packPackage(pkg.pkgDir, npmEnv);
    assertBuildArtifacts(pkg.pkgDir, pkg.manifest);
    assertTarballIncludesBuildArtifacts(pkg.manifest, packResult);
    const tarballName = packResult.filename;
    if (!tarballName) {
      throw new Error('npm pack --json did not return a tarball filename');
    }

    tarballPath = path.join(pkg.pkgDir, tarballName);

    // Create temp project
    writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: `${pkg.dir}-smoke`,
        private: true,
        type: 'module',
      }, null, 2),
      'utf8',
    );

    // Install the tarball
    execFileSync(npmCmd, ['install', tarballPath], {
      cwd: tempDir,
      env: npmEnv,
      stdio: 'inherit',
    });

    // Run smoke test
    execFileSync(
      process.execPath,
      ['--input-type=module', '--eval', pkg.smokeTest],
      {
        cwd: tempDir,
        stdio: 'inherit',
      },
    );

    console.log(`✅ ${pkg.manifest.name} smoke test passed`);
  } finally {
    if (tarballPath) {
      try { unlinkSync(tarballPath); } catch {}
    }
    rmSync(tempDir, { recursive: true, force: true });
  }
}

console.log('\n✅ All packages smoke-tested successfully');
