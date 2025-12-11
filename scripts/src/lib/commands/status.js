/**
 * status command - Display version comparison between package.json and pom.xml
 */

import { join } from 'path';
import { findMavenModules, readPackageVersion, readPomVersion, normalizeVersion } from '../utils.js';

/**
 * Get version information for all modules
 */
function getModuleVersions(rootDir) {
  const modules = findMavenModules(rootDir);
  const results = [];

  for (const moduleName of modules) {
    const modulePath = join(rootDir, moduleName);
    const packageVersion = readPackageVersion(modulePath);
    const pomVersion = readPomVersion(modulePath);

    const normalizedPkg = normalizeVersion(packageVersion);
    const normalizedPom = normalizeVersion(pomVersion);

    results.push({
      name: moduleName,
      path: modulePath,
      packageVersion,
      pomVersion,
      match: normalizedPkg === normalizedPom && normalizedPkg !== null
    });
  }

  return results;
}

/**
 * Display version comparison table
 */
function displayVersionTable(versions, options) {
  if (options.json) {
    console.log(JSON.stringify(versions, null, 2));
    const mismatchModules = versions.filter(v => !v.match).length;
    if (mismatchModules > 0) {
      process.exit(1);
    }
    return;
  }

  const mismatchModules = versions.filter(v => !v.match).length;
  if (options.quiet && mismatchModules === 0) {
    return;
  }

  console.log('\nMaven-npm Version Status\n========================\n');

  const maxNameLen = Math.max(...versions.map(v => v.name.length), 'Module'.length);
  const maxPkgLen = Math.max(...versions.map(v => (v.packageVersion || 'N/A').length), 'package.json'.length);
  const maxPomLen = Math.max(...versions.map(v => (v.pomVersion || 'N/A').length), 'pom.xml'.length);

  const namePad = maxNameLen + 2;
  const pkgPad = maxPkgLen + 2;
  const pomPad = maxPomLen + 2;

  console.log(
    'Module'.padEnd(namePad) +
    'package.json'.padEnd(pkgPad) +
    'pom.xml'.padEnd(pomPad) +
    'Status'
  );
  console.log('-'.repeat(namePad + pkgPad + pomPad + 10));

  for (const version of versions) {
    const pkgVer = version.packageVersion || 'N/A';
    const pomVer = version.pomVersion || 'N/A';
    const status = version.match ? '✓' : '⚠️  MISMATCH';

    console.log(
      version.name.padEnd(namePad) +
      pkgVer.padEnd(pkgPad) +
      pomVer.padEnd(pomPad) +
      status
    );
  }

  const totalModules = versions.length;
  const matchingModules = versions.filter(v => v.match).length;

  console.log('\n' + '='.repeat(namePad + pkgPad + pomPad + 10));
  console.log(`Total: ${totalModules} | Matching: ${matchingModules} | Mismatches: ${mismatchModules}\n`);

  if (mismatchModules > 0) {
    process.exit(1);
  }
}

/**
 * Status command handler
 */
export function statusCommand(rootDir, options) {
  let versions = getModuleVersions(rootDir);

  if (options.module) {
    versions = versions.filter(v => v.name === options.module);
    if (versions.length === 0) {
      console.error(`Error: Module '${options.module}' not found`);
      process.exit(1);
    }
  }

  displayVersionTable(versions, options);
}

