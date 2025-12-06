# maven-monorepo-template

Multi-module Maven monorepo with independent versioning, change detection, Changesets, and automated downstream PRs.

## Why?

Managing shared Java libraries across multiple repositories is painful:

- **Rebuilding everything** when only one module changed
- **Version coordination** across modules with different release cycles
- **Manual changelog** maintenance
- **Notifying downstream repos** when a library updates

This template solves all of that.

## Features

| Feature | Description |
|---------|-------------|
| **Selective Builds** | Only build modules that changed (git diff detection) |
| **Independent Versions** | Each module has its own version lifecycle |
| **Changesets** | Explicit versioning with auto-generated changelogs |
| **Downstream PRs** | Automatically create PRs on repos that depend on your libraries |
| **pnpm Workspaces** | Modern monorepo tooling integrated with Maven |
| **CI/CD Ready** | GitHub Actions + AWS CodeBuild configurations included |

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm 9+ (`corepack enable && corepack prepare pnpm@9 --activate`)
- Java 17+
- Maven 3.8+

### Setup

```bash
# Clone the template
git clone https://github.com/your-org/maven-monorepo-template.git my-libs
cd my-libs

# Install dependencies
pnpm install

# Initialize package.json files from existing pom.xml versions
pnpm maven:init

# Verify setup
pnpm maven:status
```

### Create Your First Module

```bash
# Create module directory
mkdir -p modules/my-utils/src/main/java/com/company/utils

# Create pom.xml
cat > modules/my-utils/pom.xml << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>com.company.libs</groupId>
        <artifactId>libs-parent</artifactId>
        <version>1.0.0</version>
        <relativePath>../../pom.xml</relativePath>
    </parent>

    <artifactId>my-utils</artifactId>
    <version>1.0.0</version>
    <description>My utility library</description>
</project>
EOF

# Initialize for changesets
pnpm maven:init

# Build it
mvn clean install -pl modules/my-utils
```

## Project Structure

```
.
├── package.json              # pnpm workspace root
├── pnpm-workspace.yaml       # Workspace configuration
├── pom.xml                   # Maven parent POM
├── .changeset/
│   └── config.json           # Changesets configuration
├── modules/
│   ├── auth-commons/
│   │   ├── package.json      # @libs/auth-commons (version tracking)
│   │   ├── pom.xml           # Maven module
│   │   ├── DEPENDENTS.yaml   # Downstream repos to notify
│   │   └── src/
│   └── <other-modules>/
├── scripts/
│   ├── package.json
│   └── src/
│       ├── changed-modules.js    # Git diff detection
│       └── ...
└── .github/
    └── workflows/
        └── release.yml       # CI/CD workflow
```

## How It Works

### 1. Change Detection

When you push changes, the CI detects which modules were modified:

```bash
# See what changed
node scripts/changed-modules.js

# Output:
modules/auth-commons
modules/logging-utils

# For Maven -pl flag
node scripts/changed-modules.js --csv
# Output: modules/auth-commons,modules/logging-utils

# Build only changed modules
mvn clean install -pl $(node scripts/changed-modules.js --csv) -am
```

### 2. Versioning with Changesets

Instead of bumping versions manually, you declare your intent:

```bash
# After making changes, add a changeset
pnpm changeset

# ? Which packages would you like to include?
# ◉ @libs/auth-commons
#
# ? Which packages should have a major bump?
# ? Which packages should have a minor bump?
# ◉ @libs/auth-commons
#
# ? Summary: Added OAuth2 support with token refresh
```

This creates a file in `.changeset/`:

```markdown
---
"@libs/auth-commons": minor
---

Added OAuth2 support with token refresh
```

When merged to main, CI automatically:
1. Bumps version in `package.json` (1.0.0 → 1.1.0)
2. Syncs to `pom.xml`
3. Generates `CHANGELOG.md`
4. Publishes to artifact repository

### 3. Downstream Notifications

Define dependent repos in `DEPENDENTS.yaml`:

```yaml
# modules/auth-commons/DEPENDENTS.yaml
dependents:
  - repo: your-org/backend-api
    paths:
      - pom.xml
    branch: main

  - repo: your-org/user-service
    paths:
      - pom.xml
    branch: develop
```

When `auth-commons` is published, PRs are automatically created on those repos to update the dependency version.

## Commands

### Root Commands

| Command | Description |
|---------|-------------|
| `pnpm changeset` | Add a new changeset |
| `pnpm changeset:status` | Show pending changesets |
| `pnpm changeset:version` | Apply versions and sync to Maven |
| `pnpm maven:status` | Check version sync (npm ↔ Maven) |
| `pnpm maven:init` | Initialize package.json from pom.xml |
| `pnpm build:module <name>` | Build a specific module |
| `pnpm build:changed` | Build all changed modules |

### Change Detection

```bash
# List changed modules (one per line)
node scripts/changed-modules.js

# Comma-separated (for mvn -pl)
node scripts/changed-modules.js --csv

# Compare against different branch
node scripts/changed-modules.js --base develop

# Output artifacts for CI debugging
node scripts/changed-modules.js --output ./artifacts
```

### Maven Integration

```bash
# Build changed modules with dependencies
mvn clean install -pl $(node scripts/changed-modules.js --csv) -am

# Build a specific module
mvn clean install -pl modules/auth-commons

# Deploy to artifact repository
mvn clean deploy -pl modules/auth-commons
```

## CI/CD

### GitHub Actions

The included workflow (`.github/workflows/release.yml`) handles:

1. **On PR**: Auto-generates changeset from branch name and changed modules
2. **On merge to main**: Creates "Version Packages" PR
3. **When Version PR merges**: Bumps versions, publishes artifacts, creates downstream PRs

### AWS CodeBuild

Use the included `buildspec.yml`:

```yaml
phases:
  pre_build:
    commands:
      - node scripts/changed-modules.js --output ./artifacts

  build:
    commands:
      - CHANGED=$(cat ./artifacts/maven-pl.txt)
      - |
        if [ -n "$CHANGED" ]; then
          mvn clean deploy -pl "$CHANGED" -am
        fi

artifacts:
  files:
    - 'artifacts/**/*'
```

## Configuration

### Changesets (`.changeset/config.json`)

```json
{
  "changelog": ["@changesets/changelog-github", { "repo": "your-org/libs" }],
  "baseBranch": "main",
  "ignore": ["@libs/scripts"]
}
```

### Module Dependencies (`DEPENDENTS.yaml`)

```yaml
dependents:
  - repo: org/repo-name
    paths:
      - pom.xml
      - path/to/other/pom.xml
    branch: main
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `GITHUB_TOKEN` | GitHub PAT for creating PRs |
| `CODEARTIFACT_DOMAIN` | AWS CodeArtifact domain |
| `CODEARTIFACT_REPO` | AWS CodeArtifact repository |
| `AWS_REGION` | AWS region |

## Workflows

### Adding a Feature

```bash
# 1. Create branch
git checkout -b feat/add-oauth

# 2. Make changes to modules/auth-commons
# ...

# 3. Add changeset
pnpm changeset
# Select @libs/auth-commons, minor bump

# 4. Commit and push
git add .
git commit -m "feat(auth-commons): add OAuth2 support"
git push origin feat/add-oauth

# 5. Create PR → CI auto-generates changeset if missing
# 6. Merge PR → "Version Packages" PR is created
# 7. Merge Version PR → Published with changelog
```

### Releasing a Hotfix

```bash
# 1. Create branch
git checkout -b fix/null-pointer

# 2. Fix the bug
# ...

# 3. Add changeset
pnpm changeset
# Select affected module, patch bump

# 4. Push and merge
git add . && git commit -m "fix: null pointer" && git push
```

### Checking Status

```bash
# What's pending release?
pnpm changeset:status

# Are versions in sync?
pnpm maven:status

# What will be built?
node scripts/changed-modules.js
```

## Troubleshooting

### "No modules changed" but I made changes

```bash
# Check what base branch is being compared
node scripts/changed-modules.js --base main --output ./debug

# Review the artifacts
cat ./debug/summary.txt
cat ./debug/changed-files.txt
```

### Version mismatch between package.json and pom.xml

```bash
# Check status
pnpm maven:status

# Re-sync from package.json to pom.xml
pnpm maven:sync

# Or re-initialize from pom.xml
pnpm maven:init
```

### Changeset not being picked up

Ensure your module has a `package.json` with a `name` field:

```json
{
  "name": "@libs/my-module",
  "version": "1.0.0",
  "private": true
}
```

## Migration Guide

### From Single-Version Monorepo

1. Add `package.json` to each module with independent version
2. Run `pnpm maven:init` to sync versions
3. Update parent POM to not enforce version inheritance
4. Start using changesets for version bumps

### From Multiple Repositories

1. Move each repo into `modules/` directory
2. Update `pom.xml` to reference parent POM
3. Add `package.json` for each module
4. Create `DEPENDENTS.yaml` to maintain downstream notifications

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/amazing-feature`)
3. Add a changeset (`pnpm changeset`)
4. Commit your changes (`git commit -m 'feat: add amazing feature'`)
5. Push to the branch (`git push origin feat/amazing-feature`)
6. Open a Pull Request

## License

MIT © [Your Organization]

---

## Related

- [Changesets](https://github.com/changesets/changesets) - Version management for monorepos
- [pnpm Workspaces](https://pnpm.io/workspaces) - Fast, disk space efficient package manager
- [Maven Multi-Module](https://maven.apache.org/guides/mini/guide-multiple-modules.html) - Official Maven guide
