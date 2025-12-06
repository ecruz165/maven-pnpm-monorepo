#!/usr/bin/env node

/**
 * Parallel Maven build with colored output
 * Usage: node parallel-build.js [--all] [--modules m1,m2] [-p 4] [--with-tests]
 */

const { spawn, execSync } = require('child_process');
const { existsSync, readFileSync } = require('fs');
const { join } = require('path');
const path = require('path');

// Color codes for each module (cycle through)
const COLORS = [
  '\x1b[34m', // Blue
  '\x1b[32m', // Green
  '\x1b[35m', // Magenta
  '\x1b[36m', // Cyan
  '\x1b[33m'  // Yellow
];
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';

/**
 * Parse CLI arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    maxParallel: 4,
    all: false,
    modules: [],
    skipTests: true,
    goal: 'install',
    offline: false
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--max-parallel' || args[i] === '-p') {
      options.maxParallel = parseInt(args[++i], 10);
    } else if (args[i] === '--all' || args[i] === '-a') {
      options.all = true;
    } else if (args[i] === '--modules' || args[i] === '-m') {
      options.modules = args[++i].split(',').map(m => m.trim());
    } else if (args[i] === '--with-tests') {
      options.skipTests = false;
    } else if (args[i] === '--skip-tests') {
      options.skipTests = true;
    } else if (args[i] === '--goal' || args[i] === '-g') {
      options.goal = args[++i];
    } else if (args[i] === '--offline' || args[i] === '-o') {
      options.offline = true;
    }
  }

  return options;
}

/**
 * Find all Maven modules
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
 * Get changed modules using changed-modules.js
 */
function getChangedModules(rootDir) {
  try {
    const changedModulesScript = join(rootDir, 'scripts/src/changed-modules.js');
    if (!existsSync(changedModulesScript)) {
      return [];
    }

    const output = execSync(`node ${changedModulesScript}`, {
      cwd: rootDir,
      encoding: 'utf8'
    });

    return output
      .split('\n')
      .map(m => m.trim())
      .filter(m => m.length > 0);
  } catch (error) {
    // No changes detected
    return [];
  }
}

/**
 * Get timestamp string
 */
function getTimestamp() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Filter output to important lines
 */
function isImportantLine(line) {
  const important = [
    'BUILD',
    'ERROR',
    'Compiling',
    'Tests run',
    'Results :',
    'FAILURE',
    'SUCCESS',
    'Downloaded',
    'Installing',
    'Uploading'
  ];

  return important.some(keyword => line.includes(keyword));
}

/**
 * Build a single module
 */
function buildModule(moduleName, color, rootDir, options) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const prefix = `${color}[${moduleName}]${RESET}`;

    const mavenArgs = [
      '-pl', moduleName,
      '-am', // Also make dependencies
      'clean',
      options.goal
    ];

    if (options.skipTests) {
      mavenArgs.push('-DskipTests');
    }

    if (options.offline) {
      mavenArgs.push('--offline');
    }

    console.log(`${prefix} ${getTimestamp()} Starting build...`);

    const mvn = spawn('mvn', mavenArgs, {
      cwd: rootDir,
      shell: true
    });

    let lastOutput = Date.now();

    // Handle stdout
    mvn.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.trim() && isImportantLine(line)) {
          console.log(`${prefix} ${getTimestamp()} ${line.trim()}`);
          lastOutput = Date.now();
        }
      }
    });

    // Handle stderr
    mvn.stderr.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          console.error(`${prefix} ${getTimestamp()} ${RED}${line.trim()}${RESET}`);
          lastOutput = Date.now();
        }
      }
    });

    // Handle exit
    mvn.on('close', (code) => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      const status = code === 0 ? `${GREEN}SUCCESS${RESET}` : `${RED}FAILED${RESET}`;
      console.log(`${prefix} ${getTimestamp()} Build ${status} (${duration}s)`);

      resolve({
        module: moduleName,
        success: code === 0,
        duration: parseFloat(duration),
        exitCode: code
      });
    });

    // Handle errors
    mvn.on('error', (error) => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.error(`${prefix} ${getTimestamp()} ${RED}ERROR: ${error.message}${RESET}`);
      resolve({
        module: moduleName,
        success: false,
        duration: parseFloat(duration),
        exitCode: 1,
        error: error.message
      });
    });
  });
}

/**
 * Build modules in parallel batches
 */
async function buildModulesInParallel(modules, rootDir, options) {
  const results = [];
  const queue = [...modules];
  const active = new Set();

  while (queue.length > 0 || active.size > 0) {
    // Start new builds up to max parallel
    while (queue.length > 0 && active.size < options.maxParallel) {
      const moduleName = queue.shift();
      const colorIndex = results.length % COLORS.length;
      const color = COLORS[colorIndex];

      const buildPromise = buildModule(moduleName, color, rootDir, options);
      active.add(buildPromise);

      buildPromise.then((result) => {
        active.delete(buildPromise);
        results.push(result);
      });
    }

    // Wait for at least one to complete
    if (active.size > 0) {
      await Promise.race(active);
    }
  }

  return results;
}

/**
 * Print build summary
 */
function printSummary(results) {
  console.log('\n' + BOLD + '='.repeat(70) + RESET);
  console.log(BOLD + 'Build Summary' + RESET);
  console.log(BOLD + '='.repeat(70) + RESET);

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const totalTime = results.reduce((sum, r) => sum + r.duration, 0).toFixed(2);

  console.log(`\nTotal Modules: ${results.length}`);
  console.log(`${GREEN}Successful: ${successful.length}${RESET}`);
  console.log(`${RED}Failed: ${failed.length}${RESET}`);
  console.log(`Total Time: ${totalTime}s`);

  if (successful.length > 0) {
    console.log(`\n${GREEN}✓ Successful Builds:${RESET}`);
    successful.forEach(r => {
      console.log(`  ${r.module.padEnd(20)} ${r.duration.toFixed(2)}s`);
    });
  }

  if (failed.length > 0) {
    console.log(`\n${RED}✗ Failed Builds:${RESET}`);
    failed.forEach(r => {
      console.log(`  ${r.module.padEnd(20)} ${r.error || 'Build failed'}`);
    });
  }

  console.log('\n' + BOLD + '='.repeat(70) + RESET + '\n');

  return failed.length === 0 ? 0 : 1;
}

/**
 * Main execution
 */
async function main() {
  try {
    const options = parseArgs();
    const rootDir = path.resolve(__dirname, '../..');

    let modulesToBuild;

    if (options.all) {
      // Build all modules
      modulesToBuild = findMavenModules(rootDir);
      console.log(`${BOLD}Building all modules (${modulesToBuild.length})${RESET}\n`);
    } else if (options.modules.length > 0) {
      // Build specified modules
      modulesToBuild = options.modules;
      console.log(`${BOLD}Building specified modules (${modulesToBuild.length})${RESET}\n`);
    } else {
      // Build changed modules
      modulesToBuild = getChangedModules(rootDir);
      if (modulesToBuild.length === 0) {
        console.log(`${GREEN}No changed modules detected. Nothing to build.${RESET}\n`);
        process.exit(0);
      }
      console.log(`${BOLD}Building changed modules (${modulesToBuild.length})${RESET}\n`);
    }

    console.log(`Modules: ${modulesToBuild.join(', ')}`);
    console.log(`Max Parallel: ${options.maxParallel}`);
    console.log(`Skip Tests: ${options.skipTests}`);
    console.log(`Goal: ${options.goal}`);
    console.log('');

    const startTime = Date.now();
    const results = await buildModulesInParallel(modulesToBuild, rootDir, options);
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`\n${BOLD}All builds completed in ${totalTime}s${RESET}`);

    const exitCode = printSummary(results);
    process.exit(exitCode);

  } catch (error) {
    console.error(`${RED}Error: ${error.message}${RESET}`);
    process.exit(1);
  }
}

main();
