/**
 * build command - Parallel Maven build with colored output
 */

import { spawn, execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { findMavenModules, COLORS, MODULE_COLORS } from '../utils.js';

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
  const important = ['BUILD', 'ERROR', 'Compiling', 'Tests run', 'Results :', 'FAILURE', 'SUCCESS', 'Downloaded', 'Installing', 'Uploading'];
  return important.some(keyword => line.includes(keyword));
}

/**
 * Get changed modules using the maven CLI
 */
function getChangedModules(rootDir) {
  try {
    const mavenCli = join(rootDir, 'scripts/src/maven.js');
    if (!existsSync(mavenCli)) {
      return [];
    }

    const output = execSync(`node ${mavenCli} changed`, { cwd: rootDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return output.split('\n').map(m => m.trim()).filter(m => m.length > 0);
  } catch (error) {
    // If changed command exits with 0 but no output, or exits with error
    return [];
  }
}

/**
 * Build a single module
 */
function buildModule(moduleName, color, rootDir, options) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const prefix = `${color}[${moduleName}]${COLORS.RESET}`;

    const mavenArgs = ['-pl', moduleName, '-am', 'clean', options.goal];
    if (options.skipTests) mavenArgs.push('-DskipTests');
    if (options.offline) mavenArgs.push('--offline');

    console.log(`${prefix} ${getTimestamp()} Starting build...`);

    const mvn = spawn('mvn', mavenArgs, { cwd: rootDir, shell: true });

    mvn.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.trim() && isImportantLine(line)) {
          console.log(`${prefix} ${getTimestamp()} ${line.trim()}`);
        }
      }
    });

    mvn.stderr.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          console.error(`${prefix} ${getTimestamp()} ${COLORS.RED}${line.trim()}${COLORS.RESET}`);
        }
      }
    });

    mvn.on('close', (code) => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      const status = code === 0 ? `${COLORS.GREEN}SUCCESS${COLORS.RESET}` : `${COLORS.RED}FAILED${COLORS.RESET}`;
      console.log(`${prefix} ${getTimestamp()} Build ${status} (${duration}s)`);
      resolve({ module: moduleName, success: code === 0, duration: parseFloat(duration), exitCode: code });
    });

    mvn.on('error', (error) => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.error(`${prefix} ${getTimestamp()} ${COLORS.RED}ERROR: ${error.message}${COLORS.RESET}`);
      resolve({ module: moduleName, success: false, duration: parseFloat(duration), exitCode: 1, error: error.message });
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
    while (queue.length > 0 && active.size < options.maxParallel) {
      const moduleName = queue.shift();
      const colorIndex = results.length % MODULE_COLORS.length;
      const color = MODULE_COLORS[colorIndex];

      const buildPromise = buildModule(moduleName, color, rootDir, options);
      active.add(buildPromise);
      buildPromise.then((result) => { active.delete(buildPromise); results.push(result); });
    }

    if (active.size > 0) await Promise.race(active);
  }

  return results;
}

/**
 * Print build summary
 */
function printSummary(results) {
  console.log('\n' + COLORS.BOLD + '='.repeat(70) + COLORS.RESET);
  console.log(COLORS.BOLD + 'Build Summary' + COLORS.RESET);
  console.log(COLORS.BOLD + '='.repeat(70) + COLORS.RESET);

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const totalTime = results.reduce((sum, r) => sum + r.duration, 0).toFixed(2);

  console.log(`\nTotal Modules: ${results.length}`);
  console.log(`${COLORS.GREEN}Successful: ${successful.length}${COLORS.RESET}`);
  console.log(`${COLORS.RED}Failed: ${failed.length}${COLORS.RESET}`);
  console.log(`Total Time: ${totalTime}s`);

  if (successful.length > 0) {
    console.log(`\n${COLORS.GREEN}✓ Successful Builds:${COLORS.RESET}`);
    successful.forEach(r => console.log(`  ${r.module.padEnd(20)} ${r.duration.toFixed(2)}s`));
  }

  if (failed.length > 0) {
    console.log(`\n${COLORS.RED}✗ Failed Builds:${COLORS.RESET}`);
    failed.forEach(r => console.log(`  ${r.module.padEnd(20)} ${r.error || 'Build failed'}`));
  }

  console.log('\n' + COLORS.BOLD + '='.repeat(70) + COLORS.RESET + '\n');
  return failed.length === 0 ? 0 : 1;
}

/**
 * Build command handler
 */
export async function buildCommand(rootDir, options) {
  let modulesToBuild;

  if (options.all) {
    modulesToBuild = findMavenModules(rootDir);
    console.log(`${COLORS.BOLD}Building all modules (${modulesToBuild.length})${COLORS.RESET}\n`);
  } else if (options.modules && options.modules.length > 0) {
    modulesToBuild = options.modules;
    console.log(`${COLORS.BOLD}Building specified modules (${modulesToBuild.length})${COLORS.RESET}\n`);
  } else {
    modulesToBuild = getChangedModules(rootDir);
    if (modulesToBuild.length === 0) {
      console.log(`${COLORS.GREEN}No changed modules detected. Nothing to build.${COLORS.RESET}\n`);
      process.exit(0);
    }
    console.log(`${COLORS.BOLD}Building changed modules (${modulesToBuild.length})${COLORS.RESET}\n`);
  }

  console.log(`Modules: ${modulesToBuild.join(', ')}`);
  console.log(`Max Parallel: ${options.maxParallel}`);
  console.log(`Skip Tests: ${options.skipTests}`);
  console.log(`Goal: ${options.goal}\n`);

  const startTime = Date.now();
  const results = await buildModulesInParallel(modulesToBuild, rootDir, options);
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`\n${COLORS.BOLD}All builds completed in ${totalTime}s${COLORS.RESET}`);
  const exitCode = printSummary(results);
  process.exit(exitCode);
}

