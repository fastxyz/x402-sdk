import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

export function getNpmEnv(workspaceDir) {
  return {
    ...process.env,
    NPM_CONFIG_CACHE: process.env.NPM_CONFIG_CACHE ?? path.join(workspaceDir, '.npm-cache'),
  };
}

export function getWorkspacePackages(workspaceDir) {
  const packagesDir = path.join(workspaceDir, 'packages');

  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const pkgDir = path.join(packagesDir, entry.name);
      const manifest = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));

      return {
        dir: entry.name,
        pkgDir,
        manifest,
      };
    })
    .sort((a, b) => a.dir.localeCompare(b.dir));
}

function collectExportFiles(value, expectedFiles) {
  if (!value) {
    return;
  }

  if (typeof value === 'string') {
    if (value.startsWith('./')) {
      expectedFiles.add(value.slice(2));
    }
    return;
  }

  if (typeof value === 'object') {
    for (const nestedValue of Object.values(value)) {
      collectExportFiles(nestedValue, expectedFiles);
    }
  }
}

function getExpectedBuildFiles(manifest) {
  const expectedFiles = new Set();

  for (const field of ['main', 'module', 'types']) {
    if (typeof manifest[field] === 'string') {
      expectedFiles.add(manifest[field]);
    }
  }

  collectExportFiles(manifest.exports, expectedFiles);

  return [...expectedFiles].filter((file) => file.startsWith('dist/')).sort();
}

export function assertBuildArtifacts(pkgDir, manifest) {
  const distDir = path.join(pkgDir, 'dist');
  if (!existsSync(distDir)) {
    throw new Error(`${manifest.name}: missing dist/ directory after packing. Run npm run build and try again.`);
  }

  for (const relativeFile of getExpectedBuildFiles(manifest)) {
    if (!existsSync(path.join(pkgDir, relativeFile))) {
      throw new Error(`${manifest.name}: missing build artifact "${relativeFile}" after packing.`);
    }
  }
}

export function packPackage(pkgDir, env, options = {}) {
  const args = ['pack', '--json'];

  if (options.dryRun) {
    args.push('--dry-run');
  }

  const packJson = execFileSync(npmCmd, args, {
    cwd: pkgDir,
    encoding: 'utf8',
    env,
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  const packResult = JSON.parse(packJson);
  const tarball = Array.isArray(packResult) ? packResult[0] : packResult;

  if (!tarball) {
    throw new Error(`${path.basename(pkgDir)}: npm pack --json returned no tarball metadata.`);
  }

  return tarball;
}

export function assertTarballIncludesBuildArtifacts(manifest, packResult) {
  const packedFiles = Array.isArray(packResult.files) ? packResult.files.map((file) => file.path) : [];

  if (packedFiles.length === 0) {
    throw new Error(`${manifest.name}: npm pack --json did not return packed file details.`);
  }

  const missingFiles = getExpectedBuildFiles(manifest).filter((relativeFile) => !packedFiles.includes(relativeFile));

  if (missingFiles.length > 0) {
    throw new Error(`${manifest.name}: packed tarball is missing build artifacts: ${missingFiles.join(', ')}`);
  }
}
