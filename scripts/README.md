# Maven-pNPM Monorepo Scripts

Automation scripts for managing a Maven monorepo with pnpm workspace integration and selective versioning.

## Overview

This directory contains a single consolidated Node.js CLI (`maven.js`) that bridges Maven and pnpm ecosystems, enabling:

- **Selective Versioning**: Independent version management per module
- **Change Detection**: Git-based module change detection
- **Parallel Builds**: Concurrent Maven builds with dependency resolution
- **Version Synchronization**: Bidirectional sync between Maven and package.json
- **Downstream Automation**: Automatic PR creation in dependent repositories

## CLI Commands

The `maven.js` CLI provides all functionality through subcommands:

| Command | Purpose |
|---------|---------|
| `maven.js init` | Generate package.json from pom.xml for modules missing package.json |
| `maven.js status` | Display version comparison between package.json and pom.xml |
| `maven.js sync` | Sync pom.xml versions to match package.json versions |
| `maven.js changed` | Detect changed Maven modules based on git diff |
| `maven.js build` | Parallel Maven build with colored output |
| `maven.js downstream` | Create pull requests in downstream repositories |

## Quick Start

### Installation

```bash
# Install dependencies
pnpm install
```

### View Help

```bash
node scripts/src/maven.js --help
node scripts/src/maven.js <command> --help
```

### Common Workflows

#### 1. Initial Setup

```bash
# Initialize package.json for all modules
node scripts/src/maven.js init

# Verify synchronization
node scripts/src/maven.js status
```

#### 2. Development Workflow

```bash
# Detect changed modules
node scripts/src/maven.js changed

# Output as CSV for CI
node scripts/src/maven.js changed --csv

# Build changed modules in parallel
node scripts/src/maven.js build --modules "demo-module-a,demo-module-b"
```

#### 3. Version Bump Workflow

```bash
# Create changeset
pnpm changeset

# Apply version bumps
pnpm changeset version

# Sync Maven versions
node scripts/src/maven.js sync

# Verify
node scripts/src/maven.js status
```

#### 4. Publishing Workflow

```bash
# Build and deploy
node scripts/src/maven.js sync
mvn clean deploy -pl <module>

# Create downstream PRs
GITHUB_TOKEN=your_token node scripts/src/maven.js downstream \
  --module <module> \
  --target-version <version>-SNAPSHOT
```

## Command Reference

### `init` - Initialize package.json

```bash
node scripts/src/maven.js init [options]

Options:
  --dry-run    Show what would be created without making changes
```

### `status` - Check Version Status

```bash
node scripts/src/maven.js status [options]

Options:
  --json       Output as JSON
```

### `sync` - Sync Versions

```bash
node scripts/src/maven.js sync [options]

Options:
  --dry-run    Show what would be changed without making changes
```

### `changed` - Detect Changed Modules

```bash
node scripts/src/maven.js changed [options]

Options:
  --base <ref>     Base ref for comparison (default: origin/main)
  --head <ref>     Head ref for comparison (default: HEAD)
  --csv            Output as comma-separated values
  --json           Output as JSON array
```

### `build` - Parallel Build

```bash
node scripts/src/maven.js build [options]

Options:
  --modules <list>      Comma-separated list of modules to build
  --max-parallel <n>    Maximum parallel builds (default: 4)
  --goal <goal>         Maven goal (default: install)
  --with-tests          Include tests in build
```

### `downstream` - Create Downstream PRs

```bash
node scripts/src/maven.js downstream [options]

Options:
  --module <name>          Module name (required)
  --target-version <ver>   Target version (required)
  --dry-run                Show what would be done without making changes

Environment:
  GITHUB_TOKEN    Required for creating PRs in downstream repositories
```

## CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/version-and-publish.yml
jobs:
  detect-changes:
    steps:
      - run: |
          CHANGED=$(node scripts/src/maven.js changed --csv)
          echo "modules=$CHANGED" >> $GITHUB_OUTPUT

  build-and-test:
    steps:
      - run: mvn -pl "$MODULES" -am clean install -DskipTests
      - run: mvn -pl "$MODULES" test

  version-modules:
    steps:
      - run: pnpm changeset version
      - run: node scripts/src/maven.js sync

  create-downstream-prs:
    steps:
      - run: |
          node scripts/src/maven.js downstream \
            --module "$MODULE" \
            --target-version "${VERSION}-SNAPSHOT"
        env:
          GITHUB_TOKEN: ${{ secrets.PAT_TOKEN }}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | Yes* | GitHub PAT for cross-repo PRs |
| `CI` | Auto | Enables CI-specific behavior |
| `GITHUB_EVENT_NAME` | Auto | GitHub event type detection |

\* Required for `downstream` command

## Configuration Files

### Module Configuration

Each module should have:

- **pom.xml** - Maven project descriptor
- **package.json** - npm package descriptor (created by `init` command)
- **DEPENDENTS.yaml** - Downstream repository configuration (optional)

### DEPENDENTS.yaml Example

```yaml
dependents:
  - repo: owner/repo-name
    files:
      - path: pom.xml
        search: '<my-module.version>[^<]+</my-module.version>'
        replace: '<my-module.version>{{version}}</my-module.version>'
```

## Architecture

### Maven ↔ pnpm Bridge

```
Maven Ecosystem          maven.js CLI           pnpm Ecosystem
─────────────────        ────────────           ──────────────
pom.xml                  sync command           package.json
  ├─ groupId        ─────────────────────►         ├─ @libs/<name>
  ├─ artifactId     ◄─────────────────────         ├─ version
  ├─ version                                       └─ maven metadata
  └─ packaging

mvn commands             build command          pnpm scripts
  ├─ clean          ─────────────────────►         ├─ build
  ├─ package        ◄─────────────────────         ├─ test
  └─ deploy                                        └─ deploy
```

### Change Detection Flow

```
Git Diff → changed command → Module List → build command → Maven Build
                                        ↓
                                 downstream command → GitHub PRs
```

## Troubleshooting

### Common Issues

**Issue**: Versions out of sync

```bash
node scripts/src/maven.js status
node scripts/src/maven.js sync
```

---

**Issue**: No modules detected

```bash
# Ensure modules have package.json
node scripts/src/maven.js init

# Check git status
git status
```

---

**Issue**: Downstream PR fails with 403

- Create PAT with `repo` scope
- Set `GITHUB_TOKEN` environment variable
- Or add to repository secrets as `PAT_TOKEN`

---

**Issue**: Build fails

```bash
# Build single module for debugging
node scripts/src/maven.js build --modules "demo-module-a" --max-parallel 1
```

## Development

### Testing the CLI

```bash
# View help
node scripts/src/maven.js --help

# Test each command
node scripts/src/maven.js status
node scripts/src/maven.js changed --csv
node scripts/src/maven.js downstream --module demo-module-a --target-version 1.0.0-SNAPSHOT --dry-run
```

## License

See root LICENSE file.
