/**
 * Shared utilities for Maven CLI commands
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { XMLParser } from 'fast-xml-parser';
import { fileURLToPath } from 'url';

/**
 * Get the root directory of the monorepo
 */
export function getRootDir(metaUrl) {
  const __filename = fileURLToPath(metaUrl);
  const __dirname = dirname(__filename);
  return join(__dirname, '../../..');
}

/**
 * Find all Maven modules from root pom.xml
 */
export function findMavenModules(rootDir) {
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
export function readPackageVersion(modulePath) {
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
export function readPomVersion(modulePath) {
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
 * Read full metadata from pom.xml
 */
export function readPomMetadata(modulePath) {
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
 * Normalize version (remove -SNAPSHOT suffix)
 */
export function normalizeVersion(version) {
  if (!version) return null;
  return version.replace(/-SNAPSHOT$/, '');
}

// Color codes for terminal output
export const COLORS = {
  BLUE: '\x1b[34m',
  GREEN: '\x1b[32m',
  MAGENTA: '\x1b[35m',
  CYAN: '\x1b[36m',
  YELLOW: '\x1b[33m',
  RED: '\x1b[31m',
  RESET: '\x1b[0m',
  BOLD: '\x1b[1m'
};

// Array of colors for cycling through modules
export const MODULE_COLORS = [
  COLORS.BLUE,
  COLORS.GREEN,
  COLORS.MAGENTA,
  COLORS.CYAN,
  COLORS.YELLOW
];

