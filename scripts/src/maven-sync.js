#!/usr/bin/env node

/**
 * Sync pom.xml versions to match package.json versions
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
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
 * Update pom.xml version using direct XML modification
 */
function updatePomVersion(modulePath, newVersion) {
  const pomPath = join(modulePath, 'pom.xml');

  if (!existsSync(pomPath)) {
    return false;
  }

  try {
    let pomXml = readFileSync(pomPath, 'utf8');

    // Add -SNAPSHOT suffix if not present (Maven convention)
    const mavenVersion = newVersion.endsWith('-SNAPSHOT') ? newVersion : `${newVersion}-SNAPSHOT`;

    // Find the module's own version tag (after </parent> if parent exists, or after <artifactId>)
    // We need to find the version that belongs to this module, not the parent
    const parentEndRegex = /<\/parent>/;

    if (parentEndRegex.test(pomXml)) {
      // Has parent - find version after </parent>
      const versionRegex = /(<\/parent>[\s\S]*?<version>)[^<]+(<\/version>)/;
      if (versionRegex.test(pomXml)) {
        pomXml = pomXml.replace(versionRegex, `$1${mavenVersion}$2`);
        writeFileSync(pomPath, pomXml, 'utf8');
        return true;
      }
    } else {
      // No parent - find first version after artifactId
      const versionRegex = /(<artifactId>[^<]+<\/artifactId>[\s\S]*?<version>)[^<]+(<\/version>)/;
      if (versionRegex.test(pomXml)) {
        pomXml = pomXml.replace(versionRegex, `$1${mavenVersion}$2`);
        writeFileSync(pomPath, pomXml, 'utf8');
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error(`Error updating ${modulePath}/pom.xml:`, error);
    return false;
  }
}

/**
 * Get modules that need syncing
 */
function getModulesToSync(rootDir) {
  const modules = findMavenModules(rootDir);
  const results = [];

  for (const moduleName of modules) {
    const modulePath = join(rootDir, moduleName);
    const packageVersion = readPackageVersion(modulePath);
    const pomVersion = readPomVersion(modulePath);

    // Determine if sync is needed
    const pomVersionWithoutSnapshot = pomVersion?.replace(/-SNAPSHOT$/, '') || null;
    const needsSync = packageVersion !== null &&
                      pomVersion !== null &&
                      packageVersion !== pomVersionWithoutSnapshot;

    results.push({
      name: moduleName,
      path: modulePath,
      packageVersion,
      pomVersion,
      needsSync
    });
  }

  return results;
}

/**
 * Sync versions
 */
function syncVersions(modules) {
  const modulesToSync = modules.filter(m => m.needsSync);

  if (modulesToSync.length === 0) {
    console.log('\n✓ All versions are in sync. No changes needed.\n');
    return;
  }

  console.log('\nSyncing pom.xml versions to match package.json...\n');

  let syncedCount = 0;
  let failedCount = 0;

  for (const module of modulesToSync) {
    if (module.packageVersion) {
      console.log(`Syncing ${module.name}: ${module.pomVersion} → ${module.packageVersion}-SNAPSHOT`);

      if (updatePomVersion(module.path, module.packageVersion)) {
        syncedCount++;
      } else {
        console.error(`  ✗ Failed to update ${module.name}`);
        failedCount++;
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Synced: ${syncedCount} | Failed: ${failedCount}\n`);

  if (failedCount > 0) {
    process.exit(1);
  }
}

/**
 * Main execution
 */
function main() {
  try {
    const rootDir = join(__dirname, '../..');
    const modules = getModulesToSync(rootDir);
    syncVersions(modules);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
