/**
 * init command - Generate package.json from pom.xml for modules missing package.json
 */

import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { findMavenModules, readPomMetadata } from '../utils.js';

/**
 * Generate package.json from pom metadata
 */
function generatePackageJson(moduleName, metadata) {
  const npmVersion = metadata.version.replace(/-SNAPSHOT$/, '');

  return {
    name: `@libs/${metadata.artifactId}`,
    version: npmVersion,
    private: true,
    description: metadata.description || metadata.name,
    maven: {
      groupId: metadata.groupId,
      artifactId: metadata.artifactId,
      packaging: metadata.packaging
    },
    scripts: {
      build: `cd .. && mvn -pl ${moduleName} -am clean package -DskipTests`,
      test: `cd .. && mvn -pl ${moduleName} test`,
      deploy: `cd .. && mvn -pl ${moduleName} -am clean deploy -DskipTests`
    }
  };
}

/**
 * Initialize package.json for modules without one
 */
export function initCommand(rootDir, options) {
  let modules = findMavenModules(rootDir);

  if (options.module) {
    modules = modules.filter(m => m === options.module);
    if (modules.length === 0) {
      console.error(`Error: Module '${options.module}' not found`);
      process.exit(1);
    }
  }

  let createdCount = 0;
  let skippedCount = 0;

  console.log('\nInitializing package.json for Maven modules...\n');

  for (const moduleName of modules) {
    const modulePath = join(rootDir, moduleName);
    const packageJsonPath = join(modulePath, 'package.json');

    if (existsSync(packageJsonPath) && !options.force) {
      console.log(`✓ ${moduleName}: package.json already exists`);
      skippedCount++;
      continue;
    }

    const metadata = readPomMetadata(modulePath);
    if (!metadata) {
      console.error(`✗ ${moduleName}: Could not read pom.xml`);
      continue;
    }

    const packageJson = generatePackageJson(moduleName, metadata);

    if (options.dryRun) {
      console.log(`[DRY RUN] ${moduleName}: Would create package.json (${metadata.version} → ${packageJson.version})`);
      createdCount++;
      continue;
    }

    writeFileSync(
      packageJsonPath,
      JSON.stringify(packageJson, null, 2) + '\n',
      'utf8'
    );

    console.log(`✓ ${moduleName}: Created package.json (${metadata.version} → ${packageJson.version})`);
    createdCount++;
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Created: ${createdCount} | Skipped: ${skippedCount}\n`);
}

