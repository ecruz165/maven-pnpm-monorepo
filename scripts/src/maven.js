#!/usr/bin/env node

/**
 * Maven CLI - Unified command-line interface for Maven monorepo management
 *
 * This is a standalone single-file version with all dependencies inlined.
 * External dependencies: commander, fast-xml-parser, yaml, @octokit/rest
 */

import {Command} from 'commander';
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'fs';
import {execSync, spawn} from 'child_process';
import {XMLParser} from 'fast-xml-parser';
import {Octokit} from '@octokit/rest';
import YAML from 'yaml';

// ============================================================================
// UTILITIES
// ============================================================================

const COLORS = {
    BLUE: '\x1b[34m',
    GREEN: '\x1b[32m',
    MAGENTA: '\x1b[35m',
    CYAN: '\x1b[36m',
    YELLOW: '\x1b[33m',
    RED: '\x1b[31m',
    RESET: '\x1b[0m',
    BOLD: '\x1b[1m'
};

const MODULE_COLORS = [COLORS.BLUE, COLORS.GREEN, COLORS.MAGENTA, COLORS.CYAN, COLORS.YELLOW];

function findMavenModules(rootDir) {
    const rootPomPath = join(rootDir, 'pom.xml');
    if (!existsSync(rootPomPath)) throw new Error('Root pom.xml not found');
    const rootPom = readFileSync(rootPomPath, 'utf8');
    const moduleMatches = rootPom.matchAll(/<module>([^<]+)<\/module>/g);
    const modules = [];
    for (const match of moduleMatches) modules.push(match[1].trim());
    return modules;
}

function readPackageVersion(modulePath) {
    const packageJsonPath = join(modulePath, 'package.json');
    if (!existsSync(packageJsonPath)) return null;
    try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
        return packageJson.version || null;
    } catch {
        return null;
    }
}

function readPomVersion(modulePath) {
    const pomPath = join(modulePath, 'pom.xml');
    if (!existsSync(pomPath)) return null;
    try {
        const pomXml = readFileSync(pomPath, 'utf8');
        const parser = new XMLParser({ignoreAttributes: false, parseTagValue: true});
        const pom = parser.parse(pomXml);
        return pom?.project?.version || null;
    } catch {
        return null;
    }
}

function readPomMetadata(modulePath) {
    const pomPath = join(modulePath, 'pom.xml');
    if (!existsSync(pomPath)) return null;
    try {
        const pomXml = readFileSync(pomPath, 'utf8');
        const parser = new XMLParser({ignoreAttributes: false, parseTagValue: true});
        const pom = parser.parse(pomXml);
        const project = pom?.project;
        if (!project) return null;
        return {
            groupId: project.groupId || project.parent?.groupId || 'com.example',
            artifactId: project.artifactId,
            version: project.version || project.parent?.version || '0.0.1-SNAPSHOT',
            name: project.name || project.artifactId,
            description: project.description || '',
            packaging: project.packaging || 'jar'
        };
    } catch (error) {
        console.error(`Error reading ${modulePath}/pom.xml:`, error);
        return null;
    }
}

function normalizeVersion(version) {
    if (!version) return null;
    return version.replace(/-SNAPSHOT$/, '');
}

// ============================================================================
// DEPENDENCY ANALYSIS
// ============================================================================

// Get dependencies from a module's pom.xml that are internal (within the monorepo)
function getModuleDependencies(modulePath, allModules, rootDir) {
    const pomPath = join(modulePath, 'pom.xml');
    if (!existsSync(pomPath)) return [];

    try {
        const pomXml = readFileSync(pomPath, 'utf8');
        const parser = new XMLParser({ignoreAttributes: false, parseTagValue: true});
        const pom = parser.parse(pomXml);
        const project = pom?.project;
        if (!project) return [];

        // Get parent groupId for reference
        const parentGroupId = project.parent?.groupId || project.groupId || 'com.example';

        // Get all dependencies
        let deps = project.dependencies?.dependency || [];
        if (!Array.isArray(deps)) deps = [deps];

        // Build a map of artifactId -> moduleName for all modules
        const moduleMap = {};
        for (const mod of allModules) {
            const modMeta = readPomMetadata(join(rootDir, mod));
            if (modMeta) {
                moduleMap[modMeta.artifactId] = mod;
            }
        }

        // Filter to only internal dependencies (same groupId and in our modules)
        const internalDeps = [];
        for (const dep of deps) {
            if (dep.groupId === parentGroupId && moduleMap[dep.artifactId]) {
                internalDeps.push(moduleMap[dep.artifactId]);
            }
        }

        return internalDeps;
    } catch (error) {
        console.error(`Error reading dependencies from ${modulePath}/pom.xml:`, error.message);
        return [];
    }
}

// Build dependency graph for all modules
function buildDependencyGraph(rootDir) {
    const modules = findMavenModules(rootDir);
    const graph = {};

    for (const mod of modules) {
        const deps = getModuleDependencies(join(rootDir, mod), modules, rootDir);
        graph[mod] = deps;
    }

    return graph;
}

// Topological sort to get build order (dependencies first)
function getBuildOrder(modules, dependencyGraph) {
    const visited = new Set();
    const result = [];

    function visit(mod) {
        if (visited.has(mod)) return;
        visited.add(mod);

        // Visit dependencies first
        const deps = dependencyGraph[mod] || [];
        for (const dep of deps) {
            if (modules.includes(dep)) {
                visit(dep);
            }
        }

        result.push(mod);
    }

    for (const mod of modules) {
        visit(mod);
    }

    return result;
}

// Group modules into build levels (modules in same level can be built in parallel)
function getBuildLevels(modules, dependencyGraph) {
    const levels = [];
    const built = new Set();
    let remaining = [...modules];

    while (remaining.length > 0) {
        // Find modules whose dependencies are all built
        const canBuild = remaining.filter(mod => {
            const deps = dependencyGraph[mod] || [];
            return deps.every(dep => !modules.includes(dep) || built.has(dep));
        });

        if (canBuild.length === 0 && remaining.length > 0) {
            // Circular dependency detected, just add remaining
            console.warn(`${COLORS.YELLOW}Warning: Possible circular dependency detected${COLORS.RESET}`);
            levels.push(remaining);
            break;
        }

        levels.push(canBuild);
        canBuild.forEach(mod => built.add(mod));
        remaining = remaining.filter(mod => !built.has(mod));
    }

    return levels;
}

// Print dependency tree
function printDependencyTree(rootDir, options = {}) {
    const modules = findMavenModules(rootDir);
    const graph = buildDependencyGraph(rootDir);

    console.log(`\n${COLORS.BOLD}Module Dependency Tree${COLORS.RESET}`);
    console.log('='.repeat(50) + '\n');

    for (const mod of modules) {
        const deps = graph[mod] || [];
        if (deps.length > 0) {
            console.log(`${COLORS.BLUE}${mod}${COLORS.RESET}`);
            deps.forEach((dep, i) => {
                const isLast = i === deps.length - 1;
                console.log(`  ${isLast ? '└──' : '├──'} ${dep}`);
            });
        } else {
            console.log(`${COLORS.GREEN}${mod}${COLORS.RESET} (no internal dependencies)`);
        }
    }

    // Show build levels
    const levels = getBuildLevels(modules, graph);
    console.log(`\n${COLORS.BOLD}Build Levels (parallel-safe)${COLORS.RESET}`);
    console.log('='.repeat(50) + '\n');

    levels.forEach((level, i) => {
        console.log(`Level ${i + 1}: ${level.join(', ')}`);
    });

    console.log('');
}

// ============================================================================
// INIT COMMAND
// ============================================================================

function generatePackageJson(moduleName, metadata) {
    const npmVersion = metadata.version.replace(/-SNAPSHOT$/, '');
    return {
        name: `@libs/${metadata.artifactId}`,
        version: npmVersion,
        private: true,
        description: metadata.description || metadata.name,
        maven: {groupId: metadata.groupId, artifactId: metadata.artifactId, packaging: metadata.packaging},
        scripts: {
            build: `cd .. && mvn -pl ${moduleName} -am clean package -DskipTests`,
            test: `cd .. && mvn -pl ${moduleName} test`,
            deploy: `cd .. && mvn -pl ${moduleName} -am clean deploy -DskipTests`
        }
    };
}

function initCommand(rootDir, options) {
    let modules = findMavenModules(rootDir);
    if (options.module) {
        modules = modules.filter(m => m === options.module);
        if (modules.length === 0) {
            console.error(`Error: Module '${options.module}' not found`);
            process.exit(1);
        }
    }
    let createdCount = 0, skippedCount = 0;
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
        writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');
        console.log(`✓ ${moduleName}: Created package.json (${metadata.version} → ${packageJson.version})`);
        createdCount++;
    }
    console.log('\n' + '='.repeat(60));
    console.log(`Created: ${createdCount} | Skipped: ${skippedCount}\n`);
}

// ============================================================================
// STATUS COMMAND
// ============================================================================

function statusCommand(rootDir, options) {
    const modules = findMavenModules(rootDir);
    let versions = modules.map(moduleName => {
        const modulePath = join(rootDir, moduleName);
        const packageVersion = readPackageVersion(modulePath);
        const pomVersion = readPomVersion(modulePath);
        const normalizedPkg = normalizeVersion(packageVersion);
        const normalizedPom = normalizeVersion(pomVersion);
        return {
            name: moduleName,
            packageVersion,
            pomVersion,
            match: normalizedPkg === normalizedPom && normalizedPkg !== null
        };
    });
    if (options.module) {
        versions = versions.filter(v => v.name === options.module);
        if (versions.length === 0) {
            console.error(`Error: Module '${options.module}' not found`);
            process.exit(1);
        }
    }
    if (options.json) {
        console.log(JSON.stringify(versions, null, 2));
        if (versions.filter(v => !v.match).length > 0) process.exit(1);
        return;
    }
    const mismatchModules = versions.filter(v => !v.match).length;
    if (options.quiet && mismatchModules === 0) return;
    console.log('\nMaven-npm Version Status\n========================\n');
    const maxNameLen = Math.max(...versions.map(v => v.name.length), 'Module'.length);
    const maxPkgLen = Math.max(...versions.map(v => (v.packageVersion || 'N/A').length), 'package.json'.length);
    const maxPomLen = Math.max(...versions.map(v => (v.pomVersion || 'N/A').length), 'pom.xml'.length);
    console.log('Module'.padEnd(maxNameLen + 2) + 'package.json'.padEnd(maxPkgLen + 2) + 'pom.xml'.padEnd(maxPomLen + 2) + 'Status');
    console.log('-'.repeat(maxNameLen + maxPkgLen + maxPomLen + 16));
    for (const v of versions) {
        console.log(v.name.padEnd(maxNameLen + 2) + (v.packageVersion || 'N/A').padEnd(maxPkgLen + 2) + (v.pomVersion || 'N/A').padEnd(maxPomLen + 2) + (v.match ? '✓' : '⚠️  MISMATCH'));
    }
    console.log('\n' + '='.repeat(maxNameLen + maxPkgLen + maxPomLen + 16));
    console.log(`Total: ${versions.length} | Matching: ${versions.filter(v => v.match).length} | Mismatches: ${mismatchModules}\n`);
    if (mismatchModules > 0) process.exit(1);
}

// ============================================================================
// SYNC COMMAND
// ============================================================================

function updatePomVersion(modulePath, newVersion) {
    const pomPath = join(modulePath, 'pom.xml');
    if (!existsSync(pomPath)) return false;
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

function syncCommand(rootDir, options) {
    const modules = findMavenModules(rootDir);
    let modulesToSync = modules.map(moduleName => {
        const modulePath = join(rootDir, moduleName);
        const packageVersion = readPackageVersion(modulePath);
        const pomVersion = readPomVersion(modulePath);
        const pomVersionWithoutSnapshot = pomVersion?.replace(/-SNAPSHOT$/, '') || null;
        return {
            name: moduleName,
            path: modulePath,
            packageVersion,
            pomVersion,
            needsSync: packageVersion !== null && pomVersion !== null && packageVersion !== pomVersionWithoutSnapshot
        };
    });
    if (options.module) {
        modulesToSync = modulesToSync.filter(m => m.name === options.module);
        if (modulesToSync.length === 0) {
            console.error(`Error: Module '${options.module}' not found`);
            process.exit(1);
        }
    }
    const toSync = modulesToSync.filter(m => m.needsSync);
    if (toSync.length === 0) {
        console.log('\n✓ All versions are in sync. No changes needed.\n');
        return;
    }
    console.log('\nSyncing pom.xml versions to match package.json...\n');
    let syncedCount = 0, failedCount = 0;
    for (const module of toSync) {
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
    if (failedCount > 0) process.exit(1);
}

// ============================================================================
// CHANGED COMMAND
// ============================================================================

const BASE_PATHS = ['pom.xml', 'scripts/', '.github/', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.mvn/', 'mvnw', 'mvnw.cmd'];

function isBaseFile(file) {
    for (const basePath of BASE_PATHS) {
        if (basePath.endsWith('/')) {
            if (file.startsWith(basePath)) return true;
        } else {
            if (file === basePath) return true;
        }
    }
    return false;
}

function getChangedFiles(baseBranch) {
    try {
        let diffCommand;
        if (process.env.CI && process.env.GITHUB_EVENT_NAME === 'push') {
            diffCommand = 'git diff --name-only HEAD~1';
        } else {
            try {
                execSync(`git fetch origin ${baseBranch}:${baseBranch}`, {stdio: 'pipe'});
            } catch {
            }
            diffCommand = `git diff --name-only ${baseBranch}...HEAD`;
        }
        const output = execSync(diffCommand, {encoding: 'utf8'});
        return output.split('\n').map(f => f.trim()).filter(f => f.length > 0);
    } catch {
        try {
            const output = execSync('git diff --name-only HEAD', {encoding: 'utf8'});
            return output.split('\n').map(f => f.trim()).filter(f => f.length > 0);
        } catch {
            return [];
        }
    }
}

function changedCommand(rootDir, options) {
    const modules = findMavenModules(rootDir).map(name => ({name, path: name}));
    const changedFiles = getChangedFiles(options.base);
    const baseFilesChanged = changedFiles.some(f => isBaseFile(f));
    let changedModules;
    if (baseFilesChanged) {
        changedModules = modules.map(m => m.name);
        console.error(`Base files changed, all modules will be built.`);
    } else {
        changedModules = [];
        for (const file of changedFiles) {
            for (const module of modules) {
                if (file.startsWith(module.path + '/') || file.startsWith(module.path + '\\')) {
                    changedModules.push(module.name);
                    break;
                }
            }
        }
        changedModules = [...new Set(changedModules)];
    }
    if (options.output) {
        if (!existsSync(options.output)) mkdirSync(options.output, {recursive: true});
        writeFileSync(join(options.output, 'changed-modules.txt'), changedModules.join('\n'));
        writeFileSync(join(options.output, 'maven-pl.txt'), changedModules.join(','));
    }
    if (changedModules.length === 0) process.exit(0);
    if (options.csv) console.log(changedModules.join(','));
    else changedModules.forEach(m => console.log(m));
}

// ============================================================================
// BUILD COMMAND
// ============================================================================

function getTimestamp() {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
}

function isImportantLine(line) {
    return ['BUILD', 'ERROR', 'Compiling', 'Tests run', 'Results :', 'FAILURE', 'SUCCESS', 'Downloaded', 'Installing', 'Uploading'].some(k => line.includes(k));
}

function getMavenCommand(rootDir) {
    // Use Maven wrapper if available, otherwise fall back to mvn
    const mvnwPath = join(rootDir, 'mvnw');
    if (existsSync(mvnwPath)) {
        return './mvnw';
    }
    return 'mvn';
}

function buildModule(moduleName, color, rootDir, options) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        const prefix = `${color}[${moduleName}]${COLORS.RESET}`;
        const mavenCmd = getMavenCommand(rootDir);
        // Don't use -am when building multiple modules to avoid race conditions
        // The reactor build handles dependencies correctly
        const mavenArgs = ['-pl', moduleName, 'clean', options.goal];
        if (options.skipTests) mavenArgs.push('-DskipTests');
        if (options.offline) mavenArgs.push('--offline');
        console.log(`${prefix} ${getTimestamp()} Starting build...`);
        const mvn = spawn(mavenCmd, mavenArgs, {cwd: rootDir, shell: true});
        mvn.stdout.on('data', (data) => {
            for (const line of data.toString().split('\n')) {
                if (line.trim() && isImportantLine(line)) console.log(`${prefix} ${getTimestamp()} ${line.trim()}`);
            }
        });
        mvn.stderr.on('data', (data) => {
            for (const line of data.toString().split('\n')) {
                if (line.trim()) console.error(`${prefix} ${getTimestamp()} ${COLORS.RED}${line.trim()}${COLORS.RESET}`);
            }
        });
        mvn.on('close', (code) => {
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            const status = code === 0 ? `${COLORS.GREEN}SUCCESS${COLORS.RESET}` : `${COLORS.RED}FAILED${COLORS.RESET}`;
            console.log(`${prefix} ${getTimestamp()} Build ${status} (${duration}s)`);
            resolve({module: moduleName, success: code === 0, duration: parseFloat(duration), exitCode: code});
        });
        mvn.on('error', (error) => {
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            console.error(`${prefix} ${getTimestamp()} ${COLORS.RED}ERROR: ${error.message}${COLORS.RESET}`);
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

// Build a single level of modules (can be parallelized safely)
function buildLevel(levelModules, rootDir, options, isFirstLevel = false) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        const mavenCmd = getMavenCommand(rootDir);
        const moduleList = levelModules.join(',');

        // For test goal: always use 'install' to ensure artifacts are available for dependent modules
        // For other goals (install, package, etc.): use the specified goal
        const effectiveGoal = options.goal === 'test' ? 'install' : options.goal;

        // Build only these modules (no -am since dependencies already built)
        const mavenArgs = ['-pl', moduleList, 'clean', effectiveGoal];

        // For test goal, we run tests (don't skip them)
        // For other goals, respect the skipTests option
        if (options.goal === 'test') {
            // Don't add -DskipTests - we want to run tests
        } else if (options.skipTests) {
            mavenArgs.push('-DskipTests');
        }

        if (options.offline) mavenArgs.push('--offline');
        // Use Maven's parallel build for modules in this level
        if (options.maxParallel > 1 && levelModules.length > 1) {
            mavenArgs.push(`-T${Math.min(options.maxParallel, levelModules.length)}`);
        }

        console.log(`${COLORS.CYAN}[level]${COLORS.RESET} Building: ${levelModules.join(', ')}`);
        console.log(`${COLORS.CYAN}[level]${COLORS.RESET} Command: ${mavenCmd} ${mavenArgs.join(' ')}\n`);

        const mvn = spawn(mavenCmd, mavenArgs, {cwd: rootDir, shell: true});
        let output = '';

        mvn.stdout.on('data', (data) => {
            output += data.toString();
            for (const line of data.toString().split('\n')) {
                if (line.trim() && isImportantLine(line)) {
                    console.log(`${COLORS.BLUE}[build]${COLORS.RESET} ${getTimestamp()} ${line.trim()}`);
                }
            }
        });
        mvn.stderr.on('data', (data) => {
            for (const line of data.toString().split('\n')) {
                if (line.trim()) console.error(`${COLORS.RED}[build]${COLORS.RESET} ${getTimestamp()} ${line.trim()}`);
            }
        });
        mvn.on('close', (code) => {
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            const results = levelModules.map(mod => {
                const successPattern = new RegExp(`${mod}[^\\n]*SUCCESS`, 'i');
                const failPattern = new RegExp(`${mod}[^\\n]*FAILURE`, 'i');
                const success = code === 0 || (successPattern.test(output) && !failPattern.test(output));
                return {module: mod, success, duration: parseFloat(duration) / levelModules.length, exitCode: code};
            });
            resolve({results, success: code === 0});
        });
        mvn.on('error', (error) => {
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            console.error(`${COLORS.RED}ERROR: ${error.message}${COLORS.RESET}`);
            resolve({
                results: levelModules.map(mod => ({module: mod, success: false, duration: parseFloat(duration), exitCode: 1, error: error.message})),
                success: false
            });
        });
    });
}

// Install parent POM to local repository (required for module builds without -am)
async function installParentPom(rootDir) {
    return new Promise((resolve) => {
        const mavenCmd = getMavenCommand(rootDir);
        const pomPath = join(rootDir, 'pom.xml');

        if (!existsSync(pomPath)) {
            console.log(`${COLORS.YELLOW}[parent]${COLORS.RESET} No parent pom.xml found, skipping parent install`);
            resolve(true);
            return;
        }

        console.log(`${COLORS.CYAN}[parent]${COLORS.RESET} Installing parent POM to local repository...`);

        // Install only the parent POM (non-recursive, no modules)
        const mvn = spawn(mavenCmd, ['-N', 'install', '-DskipTests'], {cwd: rootDir, shell: true});

        mvn.stdout.on('data', (data) => {
            for (const line of data.toString().split('\n')) {
                if (line.trim() && isImportantLine(line)) {
                    console.log(`${COLORS.BLUE}[parent]${COLORS.RESET} ${getTimestamp()} ${line.trim()}`);
                }
            }
        });
        mvn.stderr.on('data', (data) => {
            for (const line of data.toString().split('\n')) {
                if (line.trim()) console.error(`${COLORS.RED}[parent]${COLORS.RESET} ${getTimestamp()} ${line.trim()}`);
            }
        });
        mvn.on('close', (code) => {
            if (code === 0) {
                console.log(`${COLORS.GREEN}[parent]${COLORS.RESET} Parent POM installed successfully\n`);
            } else {
                console.error(`${COLORS.RED}[parent]${COLORS.RESET} Failed to install parent POM\n`);
            }
            resolve(code === 0);
        });
        mvn.on('error', (error) => {
            console.error(`${COLORS.RED}[parent]${COLORS.RESET} Error: ${error.message}`);
            resolve(false);
        });
    });
}

// Build modules level by level (dependencies first, then dependents)
async function buildByLevels(modules, rootDir, options) {
    const graph = buildDependencyGraph(rootDir);
    const levels = getBuildLevels(modules, graph);

    console.log(`${COLORS.BOLD}Dependency Analysis${COLORS.RESET}`);
    console.log('='.repeat(50));
    levels.forEach((level, i) => {
        console.log(`Level ${i + 1}: ${level.join(', ')}`);
    });
    console.log('='.repeat(50) + '\n');

    // Install parent POM first (required for module builds without -am)
    const parentInstalled = await installParentPom(rootDir);
    if (!parentInstalled) {
        console.error(`${COLORS.RED}Failed to install parent POM. Aborting build.${COLORS.RESET}`);
        return modules.map(mod => ({module: mod, success: false, duration: 0, exitCode: 1, error: 'Parent POM installation failed'}));
    }

    const allResults = [];

    for (let i = 0; i < levels.length; i++) {
        const level = levels[i];
        console.log(`\n${COLORS.BOLD}Building Level ${i + 1}/${levels.length}${COLORS.RESET}\n`);

        const {results, success} = await buildLevel(level, rootDir, options);
        allResults.push(...results);

        if (!success) {
            console.error(`\n${COLORS.RED}Level ${i + 1} failed. Stopping build.${COLORS.RESET}\n`);
            // Mark remaining modules as not built
            for (let j = i + 1; j < levels.length; j++) {
                for (const mod of levels[j]) {
                    allResults.push({module: mod, success: false, duration: 0, exitCode: -1, error: 'Skipped due to dependency failure'});
                }
            }
            break;
        }
    }

    return allResults;
}

async function buildModulesInParallel(modules, rootDir, options) {
    const results = [], queue = [...modules], active = new Set();
    while (queue.length > 0 || active.size > 0) {
        while (queue.length > 0 && active.size < options.maxParallel) {
            const moduleName = queue.shift();
            const color = MODULE_COLORS[results.length % MODULE_COLORS.length];
            const buildPromise = buildModule(moduleName, color, rootDir, options);
            active.add(buildPromise);
            buildPromise.then((result) => {
                active.delete(buildPromise);
                results.push(result);
            });
        }
        if (active.size > 0) await Promise.race(active);
    }
    return results;
}

function printBuildSummary(results) {
    console.log('\n' + COLORS.BOLD + '='.repeat(70) + COLORS.RESET);
    console.log(COLORS.BOLD + 'Build Summary' + COLORS.RESET);
    console.log(COLORS.BOLD + '='.repeat(70) + COLORS.RESET);
    const successful = results.filter(r => r.success), failed = results.filter(r => !r.success);
    console.log(`\nTotal Modules: ${results.length}`);
    console.log(`${COLORS.GREEN}Successful: ${successful.length}${COLORS.RESET}`);
    console.log(`${COLORS.RED}Failed: ${failed.length}${COLORS.RESET}`);
    console.log(`Total Time: ${results.reduce((sum, r) => sum + r.duration, 0).toFixed(2)}s`);
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

async function buildCommand(rootDir, options) {
    let modulesToBuild;
    if (options.all) {
        modulesToBuild = findMavenModules(rootDir);
        console.log(`${COLORS.BOLD}Building all modules (${modulesToBuild.length})${COLORS.RESET}\n`);
    } else if (options.modules && options.modules.length > 0) {
        modulesToBuild = options.modules;
        console.log(`${COLORS.BOLD}Building specified modules (${modulesToBuild.length})${COLORS.RESET}\n`);
    } else {
        // Get changed modules inline
        const modules = findMavenModules(rootDir).map(name => ({name, path: name}));
        const changedFiles = getChangedFiles('main');
        const baseFilesChanged = changedFiles.some(f => isBaseFile(f));
        if (baseFilesChanged) {
            modulesToBuild = modules.map(m => m.name);
        } else {
            const changed = new Set();
            for (const file of changedFiles) {
                for (const m of modules) {
                    if (file.startsWith(m.path + '/')) {
                        changed.add(m.name);
                        break;
                    }
                }
            }
            modulesToBuild = [...changed];
        }
        if (modulesToBuild.length === 0) {
            console.log(`${COLORS.GREEN}No changed modules detected. Nothing to build.${COLORS.RESET}\n`);
            process.exit(0);
        }
        console.log(`${COLORS.BOLD}Building changed modules (${modulesToBuild.length})${COLORS.RESET}\n`);
    }
    console.log(`Modules: ${modulesToBuild.join(', ')}\nMax Parallel: ${options.maxParallel}\nSkip Tests: ${options.skipTests}\nGoal: ${options.goal}\n`);
    const startTime = Date.now();
    // Build by dependency levels to avoid race conditions
    const results = await buildByLevels(modulesToBuild, rootDir, options);
    console.log(`\n${COLORS.BOLD}All builds completed in ${((Date.now() - startTime) / 1000).toFixed(2)}s${COLORS.RESET}`);
    process.exit(printBuildSummary(results));
}

// ============================================================================
// DEPS COMMAND - Download Maven dependencies
// ============================================================================

function depsCommand(rootDir, options) {
    const mavenCmd = getMavenCommand(rootDir);
    const args = ['dependency:go-offline', '-B'];
    if (options.quiet) args.push('-q');

    console.log(`${COLORS.BOLD}Downloading Maven dependencies...${COLORS.RESET}`);
    console.log(`Using: ${mavenCmd} ${args.join(' ')}\n`);

    try {
        execSync(`${mavenCmd} ${args.join(' ')}`, {
            cwd: rootDir,
            stdio: 'inherit',
            shell: true
        });
        console.log(`\n${COLORS.GREEN}✓ Dependencies downloaded successfully${COLORS.RESET}`);
        return 0;
    } catch (error) {
        console.error(`\n${COLORS.RED}✗ Failed to download dependencies${COLORS.RESET}`);
        return 1;
    }
}

// ============================================================================
// DOWNSTREAM COMMAND
// ============================================================================

function readDependentsConfig(rootDir, moduleName) {
    const dependentsPath = join(rootDir, moduleName, 'DEPENDENTS.yaml');
    if (!existsSync(dependentsPath)) {
        console.log(`No DEPENDENTS.yaml found for ${moduleName}`);
        return null;
    }
    try {
        return YAML.parse(readFileSync(dependentsPath, 'utf8'));
    } catch (error) {
        console.error(`Error reading DEPENDENTS.yaml:`, error);
        return null;
    }
}

function cloneOrUpdateRepo(repoUrl, localPath, baseBranch, githubToken) {
    try {
        let authRepoUrl = repoUrl;
        if (githubToken && repoUrl.startsWith('https://github.com/')) {
            authRepoUrl = repoUrl.replace('https://github.com/', `https://x-access-token:${githubToken}@github.com/`);
        }
        if (existsSync(localPath)) {
            console.log(`  Updating existing repository at ${localPath}`);
            execSync(`git -C ${localPath} fetch origin`, {stdio: 'pipe'});
            execSync(`git -C ${localPath} checkout ${baseBranch}`, {stdio: 'pipe'});
            execSync(`git -C ${localPath} pull origin ${baseBranch}`, {stdio: 'pipe'});
        } else {
            console.log(`  Cloning repository ${repoUrl}`);
            mkdirSync(dirname(localPath), {recursive: true});
            execSync(`git clone ${authRepoUrl} ${localPath}`, {stdio: 'pipe'});
            execSync(`git -C ${localPath} checkout ${baseBranch}`, {stdio: 'pipe'});
        }
        return true;
    } catch (error) {
        console.error(`  Error cloning/updating repository:`, error.message || error);
        return false;
    }
}

function applyFileReplacements(localPath, files, version) {
    const changes = [];
    let modified = false;
    for (const file of files) {
        const filePath = join(localPath, file.path);
        if (!existsSync(filePath)) {
            console.log(`  Warning: File ${file.path} not found, skipping`);
            continue;
        }
        try {
            const content = readFileSync(filePath, 'utf8');
            const replacement = file.replace.replace(/\{\{version\}\}/g, version);
            const newContent = content.replace(new RegExp(file.search, 'g'), replacement);
            if (newContent !== content) {
                writeFileSync(filePath, newContent, 'utf8');
                changes.push(`Updated ${file.path}`);
                modified = true;
                console.log(`  ✓ Modified ${file.path}`);
            } else {
                console.log(`  No changes needed for ${file.path}`);
            }
        } catch (error) {
            console.error(`  Error processing ${file.path}:`, error);
        }
    }
    return {modified, changes};
}

function createAndPushBranch(localPath, branchName, moduleName, version, changes) {
    try {
        execSync(`git -C ${localPath} config user.name "github-actions[bot]"`, {stdio: 'pipe'});
        execSync(`git -C ${localPath} config user.email "github-actions[bot]@users.noreply.github.com"`, {stdio: 'pipe'});
        execSync(`git -C ${localPath} checkout -b ${branchName}`, {stdio: 'pipe'});
        execSync(`git -C ${localPath} add -A`, {stdio: 'pipe'});
        const commitMessage = `chore(deps): update ${moduleName} to ${version}\n\n${changes.join('\n')}`;
        execSync(`git -C ${localPath} commit -m "${commitMessage}"`, {stdio: 'pipe'});
        execSync(`git -C ${localPath} push -u origin ${branchName}`, {stdio: 'pipe'});
        console.log(`  ✓ Pushed branch ${branchName}`);
        return true;
    } catch (error) {
        console.error(`  Error creating/pushing branch:`, error.message || error);
        return false;
    }
}

async function createPullRequest(octokit, repo, baseBranch, branchName, moduleName, version, changes) {
    try {
        const [owner, repoName] = repo.split('/');
        const title = `chore(deps): update ${moduleName} to ${version}`;
        const body = `## Summary\n\nThis PR updates the dependency \`${moduleName}\` to version \`${version}\`.\n\n## Changes\n\n${changes.map(c => `- ${c}`).join('\n')}\n\n---\n*Generated by maven-pnpm-monorepo*`;
        const response = await octokit.pulls.create({
            owner,
            repo: repoName,
            title,
            head: branchName,
            base: baseBranch,
            body
        });
        console.log(`  ✓ Created PR #${response.data.number}: ${response.data.html_url}`);
        return response.data.html_url;
    } catch (error) {
        console.error(`  Error creating pull request:`, error.message || error);
        return null;
    }
}

async function processDependent(octokit, dependent, moduleName, version, dryRun, githubToken) {
    console.log(`\nProcessing dependent: ${dependent.repo}`);
    const branchName = `deps/update-${moduleName}-${version}`;
    const repoUrl = `https://github.com/${dependent.repo}.git`;
    const localPath = join('/tmp', 'downstream-prs', dependent.repo);
    if (!cloneOrUpdateRepo(repoUrl, localPath, dependent.baseBranch, githubToken)) return false;
    const {modified, changes} = applyFileReplacements(localPath, dependent.files, version);
    if (!modified) {
        console.log(`  No changes needed for ${dependent.repo}`);
        return true;
    }
    if (dryRun) {
        console.log(`  [DRY RUN] Would create PR with changes:`);
        changes.forEach(c => console.log(`    - ${c}`));
        return true;
    }
    if (!createAndPushBranch(localPath, branchName, moduleName, version, changes)) return false;
    return (await createPullRequest(octokit, dependent.repo, dependent.baseBranch, branchName, moduleName, version, changes)) !== null;
}

async function downstreamCommand(rootDir, options) {
    console.log(`Creating downstream PRs for ${options.module} v${options.targetVersion}\n`);
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken && !options.dryRun) {
        console.error('Error: GITHUB_TOKEN environment variable is required');
        process.exit(1);
    }
    const octokit = new Octokit({auth: githubToken});
    const config = readDependentsConfig(rootDir, options.module);
    if (!config || !config.dependents || config.dependents.length === 0) {
        console.log('No dependents configured');
        process.exit(0);
    }
    console.log(`Found ${config.dependents.length} dependent(s)`);
    const results = await Promise.allSettled(config.dependents.map(dep => processDependent(octokit, dep, options.module, options.targetVersion, options.dryRun, githubToken)));
    const successful = results.filter(r => r.status === 'fulfilled' && r.value).length;
    console.log(`\n${'='.repeat(60)}\nSummary: ${successful} successful, ${results.length - successful} failed\n${'='.repeat(60)}`);
    if (results.length - successful > 0) process.exit(1);
}

// ============================================================================
// CLI SETUP
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '../..');

const program = new Command();

program
    .name('maven')
    .description('Maven monorepo management CLI')
    .version('1.0.0');

program
    .command('init')
    .description('Generate package.json from pom.xml for modules missing package.json')
    .option('-f, --force', 'Overwrite existing package.json files', false)
    .option('-m, --module <name>', 'Initialize only a specific module')
    .option('-d, --dry-run', 'Show what would be done without making changes', false)
    .action((options) => {
        try {
            initCommand(rootDir, options);
        } catch (e) {
            console.error('Error:', e.message || e);
            process.exit(1);
        }
    });

program
    .command('status')
    .description('Display version comparison between package.json and pom.xml')
    .option('-m, --module <name>', 'Show status for a specific module only')
    .option('-j, --json', 'Output as JSON', false)
    .option('-q, --quiet', 'Only output if there are mismatches', false)
    .action((options) => {
        try {
            statusCommand(rootDir, options);
        } catch (e) {
            console.error('Error:', e.message || e);
            process.exit(1);
        }
    });

program
    .command('sync')
    .description('Sync pom.xml versions to match package.json versions')
    .option('-m, --module <name>', 'Sync only a specific module')
    .option('-d, --dry-run', 'Show what would be done without making changes', false)
    .option('-r, --reverse', 'Sync package.json to match pom.xml (reverse direction)', false)
    .action((options) => {
        try {
            syncCommand(rootDir, options);
        } catch (e) {
            console.error('Error:', e.message || e);
            process.exit(1);
        }
    });

program
    .command('changed')
    .description('Detect changed Maven modules based on git diff')
    .option('-b, --base <branch>', 'Base branch to compare against', 'main')
    .option('-c, --csv', 'Output as comma-separated values', false)
    .option('-o, --output <dir>', 'Write results to directory')
    .action((options) => {
        try {
            changedCommand(rootDir, options);
        } catch (e) {
            console.error('Error:', e.message || e);
            process.exit(1);
        }
    });

program
    .command('deps')
    .description('Show module dependency tree and build order')
    .action(() => {
        try {
            printDependencyTree(rootDir);
        } catch (e) {
            console.error('Error:', e.message || e);
            process.exit(1);
        }
    });

program
    .command('build')
    .description('Parallel Maven build with colored output (respects dependency order)')
    .option('-p, --max-parallel <number>', 'Maximum parallel builds per level', '4')
    .option('-a, --all', 'Build all modules', false)
    .option('-m, --modules <modules>', 'Comma-separated list of modules to build')
    .option('--with-tests', 'Run tests during build', false)
    .option('--skip-tests', 'Skip tests during build (default)', true)
    .option('-g, --goal <goal>', 'Maven goal to execute', 'install')
    .option('-o, --offline', 'Run Maven in offline mode', false)
    .action(async (opts) => {
        try {
            await buildCommand(rootDir, {
                maxParallel: parseInt(opts.maxParallel, 10),
                all: opts.all,
                modules: opts.modules ? opts.modules.split(',').map(m => m.trim()) : [],
                skipTests: opts.withTests ? false : true,
                goal: opts.goal,
                offline: opts.offline
            });
        } catch (e) {
            console.error('Error:', e.message || e);
            process.exit(1);
        }
    });

program
    .command('downstream')
    .description('Create pull requests in downstream repositories when a module is published')
    .requiredOption('-m, --module <name>', 'Module name (e.g., demo-module-a)')
    .requiredOption('--target-version <version>', 'Version to update to (e.g., 0.0.6-SNAPSHOT)')
    .option('-d, --dry-run', 'Preview changes without creating PR', false)
    .action(async (options) => {
        try {
            await downstreamCommand(rootDir, options);
        } catch (e) {
            console.error('Error:', e.message || e);
            process.exit(1);
        }
    });

program.parse(process.argv);

if (!process.argv.slice(2).length) program.outputHelp();

