#!/usr/bin/env node
/**
 * Dry-run npm pack for all workspace packages.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const packagesDir = path.join(process.cwd(), 'packages');
const packages = readdirSync(packagesDir, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

console.log(`Dry-run packing ${packages.length} packages...`);

for (const pkg of packages) {
  const pkgDir = path.join(packagesDir, pkg);
  console.log(`\n📦 Packing ${pkg}...`);
  execFileSync(npmCmd, ['pack', '--dry-run'], {
    cwd: pkgDir,
    stdio: 'inherit',
  });
}

console.log('\n✅ All packages pack successfully');
