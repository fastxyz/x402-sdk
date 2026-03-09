#!/usr/bin/env node
/**
 * Verify that the git tag matches the version in all workspace packages.
 * Used in the publish workflow to ensure coordinated releases.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

// Get current git tag
const gitTag = execFileSync('git', ['describe', '--tags', '--exact-match'], {
  encoding: 'utf8',
}).trim();

if (!gitTag.startsWith('v')) {
  console.error(`❌ Tag "${gitTag}" does not start with 'v'`);
  process.exit(1);
}

const expectedVersion = gitTag.slice(1); // Remove 'v' prefix
console.log(`Git tag: ${gitTag} → expected version: ${expectedVersion}`);

// Check all workspace packages
const packagesDir = path.join(process.cwd(), 'packages');
const packages = readdirSync(packagesDir, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

let hasError = false;

for (const pkg of packages) {
  const manifestPath = path.join(packagesDir, pkg, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  
  if (manifest.version !== expectedVersion) {
    console.error(`❌ ${manifest.name}: version ${manifest.version} does not match tag ${gitTag}`);
    hasError = true;
  } else {
    console.log(`✅ ${manifest.name}: version ${manifest.version} matches`);
  }
}

if (hasError) {
  console.error('\n❌ Version mismatch detected. Update package.json versions to match the tag.');
  process.exit(1);
}

console.log('\n✅ All package versions match the git tag');
