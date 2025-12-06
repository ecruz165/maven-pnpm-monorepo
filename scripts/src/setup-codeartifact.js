#!/usr/bin/env node

/**
 * Setup AWS CodeArtifact authentication for Maven
 * Generates or updates ~/.m2/settings.xml with CodeArtifact credentials
 */

import { CodeartifactClient, GetAuthorizationTokenCommand } from '@aws-sdk/client-codeartifact';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';

// Environment variables
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const CODEARTIFACT_DOMAIN = process.env.CODEARTIFACT_DOMAIN;
const CODEARTIFACT_DOMAIN_OWNER = process.env.CODEARTIFACT_DOMAIN_OWNER;
const CODEARTIFACT_REPO = process.env.CODEARTIFACT_REPO;
const CODEARTIFACT_URL = process.env.CODEARTIFACT_URL;

/**
 * Validate required environment variables
 */
function validateEnvironment() {
  const missing = [];

  if (!CODEARTIFACT_DOMAIN) missing.push('CODEARTIFACT_DOMAIN');
  if (!CODEARTIFACT_DOMAIN_OWNER) missing.push('CODEARTIFACT_DOMAIN_OWNER');
  if (!CODEARTIFACT_REPO) missing.push('CODEARTIFACT_REPO');
  if (!CODEARTIFACT_URL) missing.push('CODEARTIFACT_URL');

  if (missing.length > 0) {
    console.error('\n❌ Missing required environment variables:');
    missing.forEach(v => console.error(`   - ${v}`));
    console.error('\nPlease set these variables in your .env file.');
    console.error('Run: cd terraform/codeartifact && terraform output -raw setup_commands\n');
    process.exit(1);
  }
}

/**
 * Get CodeArtifact authorization token
 */
async function getAuthToken() {
  console.log('\n🔐 Authenticating with AWS CodeArtifact...');
  console.log(`   Domain: ${CODEARTIFACT_DOMAIN}`);
  console.log(`   Region: ${AWS_REGION}\n`);

  try {
    const client = new CodeartifactClient({ region: AWS_REGION });

    const command = new GetAuthorizationTokenCommand({
      domain: CODEARTIFACT_DOMAIN,
      domainOwner: CODEARTIFACT_DOMAIN_OWNER,
      durationSeconds: 43200 // 12 hours (maximum)
    });

    const response = await client.send(command);

    if (!response.authorizationToken) {
      throw new Error('No authorization token received from CodeArtifact');
    }

    const expiration = new Date(response.expiration);
    console.log(`✓ Token obtained successfully`);
    console.log(`   Expires: ${expiration.toLocaleString()}\n`);

    return response.authorizationToken;
  } catch (error) {
    console.error('\n❌ Failed to get authorization token:');
    console.error(`   ${error.message}`);

    if (error.name === 'ResourceNotFoundException') {
      console.error('\n   The CodeArtifact domain or repository does not exist.');
      console.error('   Run Terraform to create the resources:');
      console.error('   cd terraform/codeartifact && terraform apply\n');
    } else if (error.name === 'AccessDeniedException') {
      console.error('\n   AWS credentials do not have permission to access CodeArtifact.');
      console.error('   Check your IAM permissions or attach the CodeArtifact policy.\n');
    } else {
      console.error('\n   Make sure AWS credentials are configured:');
      console.error('   aws configure\n');
    }

    process.exit(1);
  }
}

/**
 * Generate Maven settings.xml content
 */
function generateSettings(token) {
  const settings = {
    settings: {
      servers: {
        server: {
          id: 'codeartifact',
          username: 'aws',
          password: token
        }
      },
      profiles: {
        profile: {
          id: 'codeartifact',
          repositories: {
            repository: {
              id: 'codeartifact',
              url: CODEARTIFACT_URL
            }
          }
        }
      },
      activeProfiles: {
        activeProfile: 'codeartifact'
      }
    }
  };

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    format: true,
    indentBy: '  ',
    suppressEmptyNode: true
  });

  return '<?xml version="1.0" encoding="UTF-8"?>\n' + builder.build(settings);
}

/**
 * Merge with existing settings.xml or create new one
 */
function writeSettings(settingsXml, settingsPath) {
  if (existsSync(settingsPath)) {
    console.log('⚠️  Existing settings.xml found');
    console.log(`   Location: ${settingsPath}`);
    console.log('\n   Creating backup...');

    // Backup existing file
    const backupPath = `${settingsPath}.backup-${Date.now()}`;
    const existing = readFileSync(settingsPath, 'utf8');
    writeFileSync(backupPath, existing, 'utf8');
    console.log(`   Backup: ${backupPath}\n`);

    // Parse existing settings
    try {
      const parser = new XMLParser({
        ignoreAttributes: false,
        parseTagValue: true
      });

      const existingSettings = parser.parse(existing);
      const newSettings = parser.parse(settingsXml);

      // Merge servers
      if (!existingSettings.settings.servers) {
        existingSettings.settings.servers = newSettings.settings.servers;
      } else {
        // Update or add codeartifact server
        const servers = Array.isArray(existingSettings.settings.servers.server)
          ? existingSettings.settings.servers.server
          : [existingSettings.settings.servers.server];

        const codeartifactIndex = servers.findIndex(s => s.id === 'codeartifact');
        if (codeartifactIndex >= 0) {
          servers[codeartifactIndex] = newSettings.settings.servers.server;
        } else {
          servers.push(newSettings.settings.servers.server);
        }

        existingSettings.settings.servers.server = servers;
      }

      // Merge profiles
      if (!existingSettings.settings.profiles) {
        existingSettings.settings.profiles = newSettings.settings.profiles;
      } else {
        const profiles = Array.isArray(existingSettings.settings.profiles.profile)
          ? existingSettings.settings.profiles.profile
          : [existingSettings.settings.profiles.profile];

        const codeartifactIndex = profiles.findIndex(p => p.id === 'codeartifact');
        if (codeartifactIndex >= 0) {
          profiles[codeartifactIndex] = newSettings.settings.profiles.profile;
        } else {
          profiles.push(newSettings.settings.profiles.profile);
        }

        existingSettings.settings.profiles.profile = profiles;
      }

      // Merge active profiles
      if (!existingSettings.settings.activeProfiles) {
        existingSettings.settings.activeProfiles = newSettings.settings.activeProfiles;
      } else {
        const activeProfiles = Array.isArray(existingSettings.settings.activeProfiles.activeProfile)
          ? existingSettings.settings.activeProfiles.activeProfile
          : [existingSettings.settings.activeProfiles.activeProfile];

        if (!activeProfiles.includes('codeartifact')) {
          activeProfiles.push('codeartifact');
        }

        existingSettings.settings.activeProfiles.activeProfile = activeProfiles;
      }

      // Build merged XML
      const builder = new XMLBuilder({
        ignoreAttributes: false,
        format: true,
        indentBy: '  ',
        suppressEmptyNode: true
      });

      settingsXml = '<?xml version="1.0" encoding="UTF-8"?>\n' + builder.build(existingSettings);
      console.log('   Merged with existing settings\n');
    } catch (error) {
      console.warn(`   ⚠️  Could not merge with existing file: ${error.message}`);
      console.warn('   Writing new settings (backup preserved)\n');
    }
  } else {
    console.log('📝 No existing settings.xml found, creating new one\n');
  }

  // Ensure .m2 directory exists
  const m2Dir = join(homedir(), '.m2');
  if (!existsSync(m2Dir)) {
    mkdirSync(m2Dir, { recursive: true });
  }

  // Write settings
  writeFileSync(settingsPath, settingsXml, 'utf8');
  console.log(`✓ Settings written to: ${settingsPath}\n`);
}

/**
 * Main execution
 */
async function main() {
  console.log('\n════════════════════════════════════════════════');
  console.log('  AWS CodeArtifact Setup for Maven');
  console.log('════════════════════════════════════════════════');

  // Validate environment
  validateEnvironment();

  // Get auth token
  const token = await getAuthToken();

  // Generate settings XML
  const settingsXml = generateSettings(token);

  // Write settings
  const settingsPath = join(homedir(), '.m2', 'settings.xml');
  writeSettings(settingsXml, settingsPath);

  console.log('════════════════════════════════════════════════');
  console.log('✓ CodeArtifact setup complete!');
  console.log('════════════════════════════════════════════════\n');
  console.log('Next steps:');
  console.log('  1. Test Maven access: mvn help:effective-settings');
  console.log('  2. Build and deploy: mvn -pl demo-module-a clean deploy');
  console.log('  3. Token expires in 12 hours, re-run this script to refresh\n');
}

main().catch(error => {
  console.error('\n❌ Unexpected error:', error);
  process.exit(1);
});
