#!/usr/bin/env node

/**
 * Generate package.json from pom.xml for modules missing package.json
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { XMLParser } from 'fast-xml-parser';
import { fileURLToPath } from 'url';
import { Command } from 'commander';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const program = new Command();

program
  .name('maven-init')
  .description('Generate package.json from pom.xml for modules missing package.json')
  .version('1.0.0')
  .option('-f, --force', 'Overwrite existing package.json files', false)
  .option('-m, --module <name>', 'Initialize only a specific module')
  .option('-d, --dry-run', 'Show what would be done without making changes', false)
  .parse(process.argv);

const options = program.opts();

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
 * Read metadata from pom.xml
 */
function readPomMetadata(modulePath) {
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
    const project = pom?.project;

    if (!project) {
      return null;
    }

    // Get groupId (might be inherited from parent)
    const groupId = project.groupId || project.parent?.groupId || 'com.example';
    const artifactId = project.artifactId;
    const version = project.version || project.parent?.version || '0.0.1-SNAPSHOT';
    const name = project.name || artifactId;
    const description = project.description || '';
    const packaging = project.packaging || 'jar';

    return {
      groupId,
      artifactId,
      version,
      name,
      description,
      packaging
    };
  } catch (error) {
    console.error(`Error reading ${modulePath}/pom.xml:`, error);
    return null;
  }
}

/**
 * Generate package.json from pom metadata
 */
function generatePackageJson(moduleName, metadata) {
  // Remove -SNAPSHOT for npm version
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
function initializeModules(rootDir, opts) {
  let modules = findMavenModules(rootDir);

  // Filter to specific module if requested
  if (opts.module) {
    modules = modules.filter(m => m === opts.module);
    if (modules.length === 0) {
      console.error(`Error: Module '${opts.module}' not found`);
      process.exit(1);
    }
  }

  let createdCount = 0;
  let skippedCount = 0;

  console.log('\nInitializing package.json for Maven modules...\n');

  for (const moduleName of modules) {
    const modulePath = join(rootDir, moduleName);
    const packageJsonPath = join(modulePath, 'package.json');

    // Skip if package.json already exists (unless --force)
    if (existsSync(packageJsonPath) && !opts.force) {
      console.log(`✓ ${moduleName}: package.json already exists`);
      skippedCount++;
      continue;
    }

    // Read pom.xml metadata
    const metadata = readPomMetadata(modulePath);
    if (!metadata) {
      console.error(`✗ ${moduleName}: Could not read pom.xml`);
      continue;
    }

    // Generate package.json
    const packageJson = generatePackageJson(moduleName, metadata);

    if (opts.dryRun) {
      console.log(`[DRY RUN] ${moduleName}: Would create package.json (${metadata.version} → ${packageJson.version})`);
      createdCount++;
      continue;
    }

    // Write package.json
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

/**
 * Main execution
 */
function main() {
  try {
    const rootDir = join(__dirname, '../..');
    initializeModules(rootDir, options);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
