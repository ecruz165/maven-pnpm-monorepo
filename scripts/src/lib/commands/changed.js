/**
 * changed command - Detects changed Maven modules based on git diff
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { findMavenModules } from '../utils.js';

/**
 * Base files/directories that should trigger building ALL modules
 */
const BASE_PATHS = [
  'pom.xml',           // Parent POM
  'scripts/',          // Build scripts
  '.github/',          // Workflows and CI config
  'package.json',      // Root package.json
  'pnpm-lock.yaml',    // Lock file
  'pnpm-workspace.yaml', // Workspace config
  '.mvn/',             // Maven wrapper config
  'mvnw',              // Maven wrapper
  'mvnw.cmd',          // Maven wrapper (Windows)
];

/**
 * Check if a file is a base file that affects all modules
 */
function isBaseFile(file) {
  // Check if file matches any base path
  for (const basePath of BASE_PATHS) {
    if (basePath.endsWith('/')) {
      // Directory prefix match
      if (file.startsWith(basePath)) {
        return true;
      }
    } else {
      // Exact file match
      if (file === basePath) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Get changed files using git diff
 */
function getChangedFiles(baseBranch) {
  try {
    let diffCommand;

    if (process.env.CI && process.env.GITHUB_EVENT_NAME === 'push') {
      diffCommand = 'git diff --name-only HEAD~1';
    } else {
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
 * Check if any base files were changed
 */
function hasBaseChanges(changedFiles) {
  return changedFiles.some(file => isBaseFile(file));
}

/**
 * Map changed files to their containing modules
 */
function mapFilesToModules(changedFiles, modules) {
  const changedModules = new Set();

  for (const file of changedFiles) {
    for (const module of modules) {
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

  writeFileSync(join(outputDir, 'change-detection.json'), JSON.stringify(data, null, 2));
  writeFileSync(join(outputDir, 'changed-modules.txt'), data.changedModules.join('\n'));
  writeFileSync(join(outputDir, 'maven-pl.txt'), data.changedModules.join(','));
  writeFileSync(join(outputDir, 'changed-files.txt'), data.changedFiles.join('\n'));

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

  writeFileSync(join(outputDir, 'summary.txt'), summary);
  console.error(`Artifacts written to: ${outputDir}`);
}

/**
 * Changed command handler
 */
export function changedCommand(rootDir, options) {
  const modules = findMavenModules(rootDir).map(name => ({
    name,
    path: name,
    absolutePath: join(rootDir, name)
  }));

  const changedFiles = getChangedFiles(options.base);

  // Check if base files changed - if so, all modules need to be built
  const baseFilesChanged = hasBaseChanges(changedFiles);
  const baseChangedFiles = changedFiles.filter(f => isBaseFile(f));

  let changedModules;
  if (baseFilesChanged) {
    // All modules affected when base files change
    changedModules = modules.map(m => m.name);
    console.error(`Base files changed (${baseChangedFiles.join(', ')}), all modules will be built.`);
  } else {
    changedModules = mapFilesToModules(changedFiles, modules);
  }

  const data = {
    baseBranch: options.base,
    allModules: modules,
    changedFiles: changedFiles,
    changedModules: changedModules,
    baseFilesChanged: baseFilesChanged,
    baseChangedFiles: baseChangedFiles
  };

  if (options.output) {
    generateArtifacts(options.output, data);
  }

  if (changedModules.length === 0) {
    process.exit(0);
  }

  if (options.csv) {
    console.log(changedModules.join(','));
  } else {
    changedModules.forEach(module => console.log(module));
  }
}

