#!/usr/bin/env node

/**
 * Maven CLI - Unified command-line interface for Maven monorepo management
 */

import { Command } from 'commander';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { initCommand } from './lib/commands/init.js';
import { statusCommand } from './lib/commands/status.js';
import { syncCommand } from './lib/commands/sync.js';
import { changedCommand } from './lib/commands/changed.js';
import { buildCommand } from './lib/commands/build.js';
import { downstreamCommand } from './lib/commands/downstream.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '../..');

const program = new Command();

program
  .name('maven')
  .description('Maven monorepo management CLI')
  .version('1.0.0');

// init command
program
  .command('init')
  .description('Generate package.json from pom.xml for modules missing package.json')
  .option('-f, --force', 'Overwrite existing package.json files', false)
  .option('-m, --module <name>', 'Initialize only a specific module')
  .option('-d, --dry-run', 'Show what would be done without making changes', false)
  .action((options) => {
    try {
      initCommand(rootDir, options);
    } catch (error) {
      console.error('Error:', error.message || error);
      process.exit(1);
    }
  });

// status command
program
  .command('status')
  .description('Display version comparison between package.json and pom.xml')
  .option('-m, --module <name>', 'Show status for a specific module only')
  .option('-j, --json', 'Output as JSON', false)
  .option('-q, --quiet', 'Only output if there are mismatches', false)
  .action((options) => {
    try {
      statusCommand(rootDir, options);
    } catch (error) {
      console.error('Error:', error.message || error);
      process.exit(1);
    }
  });

// sync command
program
  .command('sync')
  .description('Sync pom.xml versions to match package.json versions')
  .option('-m, --module <name>', 'Sync only a specific module')
  .option('-d, --dry-run', 'Show what would be done without making changes', false)
  .option('-r, --reverse', 'Sync package.json to match pom.xml (reverse direction)', false)
  .action((options) => {
    try {
      syncCommand(rootDir, options);
    } catch (error) {
      console.error('Error:', error.message || error);
      process.exit(1);
    }
  });

// changed command
program
  .command('changed')
  .description('Detect changed Maven modules based on git diff')
  .option('-b, --base <branch>', 'Base branch to compare against', 'main')
  .option('-c, --csv', 'Output as comma-separated values', false)
  .option('-o, --output <dir>', 'Write results to directory')
  .action((options) => {
    try {
      changedCommand(rootDir, options);
    } catch (error) {
      console.error('Error:', error.message || error);
      process.exit(1);
    }
  });

// build command
program
  .command('build')
  .description('Parallel Maven build with colored output')
  .option('-p, --max-parallel <number>', 'Maximum parallel builds', '4')
  .option('-a, --all', 'Build all modules', false)
  .option('-m, --modules <modules>', 'Comma-separated list of modules to build')
  .option('--with-tests', 'Run tests during build', false)
  .option('--skip-tests', 'Skip tests during build (default)', true)
  .option('-g, --goal <goal>', 'Maven goal to execute', 'install')
  .option('-o, --offline', 'Run Maven in offline mode', false)
  .action(async (opts) => {
    try {
      const options = {
        maxParallel: parseInt(opts.maxParallel, 10),
        all: opts.all,
        modules: opts.modules ? opts.modules.split(',').map(m => m.trim()) : [],
        skipTests: opts.withTests ? false : true,
        goal: opts.goal,
        offline: opts.offline
      };
      await buildCommand(rootDir, options);
    } catch (error) {
      console.error('Error:', error.message || error);
      process.exit(1);
    }
  });

// downstream command
program
  .command('downstream')
  .description('Create pull requests in downstream repositories when a module is published')
  .requiredOption('-m, --module <name>', 'Module name (e.g., demo-module-a)')
  .requiredOption('--target-version <version>', 'Version to update to (e.g., 0.0.6-SNAPSHOT)')
  .option('-d, --dry-run', 'Preview changes without creating PR', false)
  .action(async (options) => {
    try {
      await downstreamCommand(rootDir, options);
    } catch (error) {
      console.error('Error:', error.message || error);
      process.exit(1);
    }
  });

program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}

