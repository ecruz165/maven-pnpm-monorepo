#!/usr/bin/env node

/**
 * Detects changed Maven modules based on git diff
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { Command } from 'commander';

const program = new Command();

program
  .name('maven-changed-modules')
  .description('Detects changed Maven modules based on git diff')
  .version('1.0.0')
  .option('-b, --base <branch>', 'Base branch to compare against', 'main')
  .option('-c, --csv', 'Output as comma-separated values', false)
  .option('-o, --output <dir>', 'Write results to directory')
  .parse(process.argv);

const options = program.opts();

/**
 * Find all Maven modules by locating pom.xml files
 */
function findMavenModules(rootDir) {
  const modules = [];
  const rootPomPath = join(rootDir, 'pom.xml');

  if (!existsSync(rootPomPath)) {
    throw new Error('Root pom.xml not found');
  }

  // Read root pom.xml to find module directories
  const rootPom = readFileSync(rootPomPath, 'utf8');
  const moduleMatches = rootPom.matchAll(/<module>([^<]+)<\/module>/g);

  for (const match of moduleMatches) {
    const modulePath = match[1].trim();
    const modulePomPath = join(rootDir, modulePath, 'pom.xml');

    if (existsSync(modulePomPath)) {
      modules.push({
        name: modulePath,
        path: modulePath,
        absolutePath: join(rootDir, modulePath)
      });
    }
  }

  return modules;
}

/**
 * Get changed files using git diff
 */
function getChangedFiles(baseBranch) {
  try {
    // In CI on push events, compare current commit to previous commit
    // Otherwise compare to base branch
    let diffCommand;

    if (process.env.CI && process.env.GITHUB_EVENT_NAME === 'push') {
      // CI push event: compare to previous commit
      diffCommand = 'git diff --name-only HEAD~1';
    } else {
      // Local or PR: compare to base branch
      try {
        execSync(`git fetch origin ${baseBranch}:${baseBranch}`, { stdio: 'pipe' });
      } catch (e) {
        // Branch might already exist locally
      }
      diffCommand = `git diff --name-only ${baseBranch}...HEAD`;
    }

    const output = execSync(diffCommand, { encoding: 'utf8' });

    return output
      .split('\n')
      .map(f => f.trim())
      .filter(f => f.length > 0);
  } catch (error) {
    // Fallback: compare with HEAD (uncommitted changes)
    try {
      const output = execSync('git diff --name-only HEAD', { encoding: 'utf8' });
      return output
        .split('\n')
        .map(f => f.trim())
        .filter(f => f.length > 0);
    } catch (e) {
      console.error('Error getting changed files:', error.message);
      return [];
    }
  }
}

/**
 * Map changed files to their containing modules
 */
function mapFilesToModules(changedFiles, modules) {
  const changedModules = new Set();

  for (const file of changedFiles) {
    for (const module of modules) {
      // Check if file is within module directory
      if (file.startsWith(module.path + '/') || file.startsWith(module.path + '\\')) {
        changedModules.add(module.name);
        break;
      }
    }
  }

  return Array.from(changedModules);
}

/**
 * Generate troubleshooting artifacts
 */
function generateArtifacts(outputDir, data) {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // change-detection.json: Full structured data
  writeFileSync(
    join(outputDir, 'change-detection.json'),
    JSON.stringify(data, null, 2)
  );

  // changed-modules.txt: Module list (one per line)
  writeFileSync(
    join(outputDir, 'changed-modules.txt'),
    data.changedModules.join('\n')
  );

  // maven-pl.txt: Comma-separated for Maven
  writeFileSync(
    join(outputDir, 'maven-pl.txt'),
    data.changedModules.join(',')
  );

  // changed-files.txt: All changed files
  writeFileSync(
    join(outputDir, 'changed-files.txt'),
    data.changedFiles.join('\n')
  );

  // summary.txt: Human-readable summary
  const summary = `
Change Detection Summary
========================

Base Branch: ${data.baseBranch}
Total Modules: ${data.allModules.length}
Changed Modules: ${data.changedModules.length}

Changed Files: ${data.changedFiles.length}

Modules with Changes:
${data.changedModules.map(m => `  - ${m}`).join('\n') || '  (none)'}

All Modules:
${data.allModules.map(m => `  - ${m.name}`).join('\n')}
`.trim();

  writeFileSync(
    join(outputDir, 'summary.txt'),
    summary
  );

  console.error(`Artifacts written to: ${outputDir}`);
}

/**
 * Main execution
 */
function main() {
  try {
    const rootDir = process.cwd();

    // Find all Maven modules
    const modules = findMavenModules(rootDir);

    // Get changed files
    const changedFiles = getChangedFiles(options.base);

    // Map files to modules
    const changedModules = mapFilesToModules(changedFiles, modules);

    // Prepare data
    const data = {
      baseBranch: options.base,
      allModules: modules,
      changedFiles: changedFiles,
      changedModules: changedModules
    };

    // Generate artifacts if output directory specified
    if (options.output) {
      generateArtifacts(options.output, data);
    }

    // Output results
    if (changedModules.length === 0) {
      // No changes detected
      process.exit(0);
    }

    if (options.csv) {
      console.log(changedModules.join(','));
    } else {
      changedModules.forEach(module => console.log(module));
    }

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
