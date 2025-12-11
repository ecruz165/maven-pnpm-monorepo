/**
 * sync command - Sync pom.xml versions to match package.json versions
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { findMavenModules, readPackageVersion, readPomVersion } from '../utils.js';

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
    const mavenVersion = newVersion.endsWith('-SNAPSHOT') ? newVersion : `${newVersion}-SNAPSHOT`;
    const parentEndRegex = /<\/parent>/;

    if (parentEndRegex.test(pomXml)) {
      const versionRegex = /(<\/parent>[\s\S]*?<version>)[^<]+(<\/version>)/;
      if (versionRegex.test(pomXml)) {
        pomXml = pomXml.replace(versionRegex, `$1${mavenVersion}$2`);
        writeFileSync(pomPath, pomXml, 'utf8');
        return true;
      }
    } else {
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
function syncVersions(modules, options) {
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
      const targetVersion = `${module.packageVersion}-SNAPSHOT`;

      if (options.dryRun) {
        console.log(`[DRY RUN] Would sync ${module.name}: ${module.pomVersion} → ${targetVersion}`);
        syncedCount++;
        continue;
      }

      console.log(`Syncing ${module.name}: ${module.pomVersion} → ${targetVersion}`);

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
 * Sync command handler
 */
export function syncCommand(rootDir, options) {
  let modules = getModulesToSync(rootDir);

  if (options.module) {
    modules = modules.filter(m => m.name === options.module);
    if (modules.length === 0) {
      console.error(`Error: Module '${options.module}' not found`);
      process.exit(1);
    }
  }

  syncVersions(modules, options);
}

