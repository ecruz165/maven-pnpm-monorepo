#!/usr/bin/env node

/**
 * Display version comparison between package.json and pom.xml
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { XMLParser } from 'fast-xml-parser';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Find all Maven modules from root pom.xml
 */
function findMavenModules(rootDir) {
  const rootPomPath = join(rootDir, 'pom.xml');

  if (!existsSync(rootPomPath)) {
    throw new Error('Root pom.xml not found');
  }

  const rootPom = readFileSync(rootPomPath, 'utf8');
  const moduleMatches = rootPom.matchAll(/<module>([^<]+)<\/module>/g);

  const modules = [];
  for (const match of moduleMatches) {
    modules.push(match[1].trim());
  }

  return modules;
}

/**
 * Read version from package.json
 */
function readPackageVersion(modulePath) {
  const packageJsonPath = join(modulePath, 'package.json');

  if (!existsSync(packageJsonPath)) {
    return null;
  }

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    return packageJson.version || null;
  } catch (error) {
    return null;
  }
}

/**
 * Read version from pom.xml
 */
function readPomVersion(modulePath) {
  const pomPath = join(modulePath, 'pom.xml');

  if (!existsSync(pomPath)) {
    return null;
  }

  try {
    const pomXml = readFileSync(pomPath, 'utf8');
    const parser = new XMLParser({
      ignoreAttributes: false,
      parseTagValue: true
    });
    const pom = parser.parse(pomXml);

    return pom?.project?.version || null;
  } catch (error) {
    return null;
  }
}

/**
 * Normalize version (remove -SNAPSHOT suffix)
 */
function normalizeVersion(version) {
  if (!version) return null;
  return version.replace(/-SNAPSHOT$/, '');
}

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

    // Normalize versions for comparison
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
function displayVersionTable(versions) {
  console.log('\nMaven-npm Version Status\n========================\n');

  // Calculate column widths
  const maxNameLen = Math.max(...versions.map(v => v.name.length), 'Module'.length);
  const maxPkgLen = Math.max(...versions.map(v => (v.packageVersion || 'N/A').length), 'package.json'.length);
  const maxPomLen = Math.max(...versions.map(v => (v.pomVersion || 'N/A').length), 'pom.xml'.length);

  // Header
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

  // Rows
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

  // Summary
  const totalModules = versions.length;
  const matchingModules = versions.filter(v => v.match).length;
  const mismatchModules = totalModules - matchingModules;

  console.log('\n' + '='.repeat(namePad + pkgPad + pomPad + 10));
  console.log(`Total: ${totalModules} | Matching: ${matchingModules} | Mismatches: ${mismatchModules}\n`);

  if (mismatchModules > 0) {
    process.exit(1);
  }
}

/**
 * Main execution
 */
function main() {
  try {
    const rootDir = join(__dirname, '../..');
    const versions = getModuleVersions(rootDir);
    displayVersionTable(versions);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
