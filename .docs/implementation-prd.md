# Implementation PRD: Maven Monorepo Template

## Overview

### Problem Statement

Managing multiple Maven libraries in separate repositories creates operational overhead:

- **Versioning complexity** — No standardized approach across libraries
- **Build inefficiency** — Full rebuilds even when only one module changed
- **Release friction** — Manual version bumping and changelog management
- **Downstream coordination** — No automated notification when libraries update
- **Tooling gaps** — Bash scripts are fragile and hard to maintain

### Solution

A monorepo template that consolidates Maven modules into a single repository with:

- Independent versioning per module
- Git-based change detection for selective builds
- Changesets for explicit version control and changelogs
- Automated downstream PR creation
- TypeScript-based build tooling
- CI/CD integration (GitHub Actions + AWS CodeBuild)

### Success Criteria

- Developers can release a single module without affecting others
- CI only builds modules that changed
- Version bumps and changelogs are generated automatically
- Downstream repositories receive PRs within minutes of a release
- Build failures produce artifacts for easy troubleshooting

---

## Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Git Repository                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Module A  │  │   Module B  │  │   Module C  │  │   Scripts   │        │
│  │   v1.2.0    │  │   v2.0.1    │  │   v1.0.0    │  │   (pnpm)    │        │
│  │             │  │             │  │             │  │             │        │
│  │  pom.xml    │  │  pom.xml    │  │  pom.xml    │  │  TS files   │        │
│  │  pkg.json   │  │  pkg.json   │  │  pkg.json   │  │             │        │
│  │  DEPS.yaml  │  │  DEPS.yaml  │  │  DEPS.yaml  │  │             │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  pnpm-workspace.yaml │ package.json │ pom.xml (parent) │ .changeset/       │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CI/CD Pipeline                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────────────┐      │
│  │ Detect   │───▶│ Version  │───▶│ Build &  │───▶│ Downstream PRs   │      │
│  │ Changes  │    │ Bump     │    │ Publish  │    │                  │      │
│  └──────────┘    └──────────┘    └──────────┘    └──────────────────┘      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AWS CodeArtifact                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Overview

| Component | Technology | Purpose |
|-----------|------------|---------|
| Build Tool | Maven 3.8+ | Compile, test, package Java modules |
| Package Manager | pnpm 9+ | Manage JS dependencies, workspace orchestration |
| Versioning | Changesets | Track version bumps, generate changelogs |
| Scripts | TypeScript / Node.js | Build automation, change detection |
| Parallel Builds | concurrently (optional) | Run multiple Maven builds simultaneously |
| CI/CD | GitHub Actions / CodeBuild | Automated builds and releases |
| Artifact Repository | AWS CodeArtifact | Private Maven repository |

---

## Functional Requirements

### FR-1: Repository Structure

**FR-1.1: Directory Layout**

```
repository/
├── package.json                    # Root workspace configuration
├── pnpm-workspace.yaml             # Workspace package definitions
├── pom.xml                         # Maven parent POM (aggregator)
├── .changeset/
│   ├── config.json                 # Changesets configuration
│   └── *.md                        # Pending changesets
├── modules/
│   └── {module-name}/
│       ├── package.json            # npm package for version tracking
│       ├── pom.xml                 # Maven module configuration
│       ├── DEPENDENTS.yaml         # Downstream repository manifest
│       └── src/                    # Java source code
├── scripts/
│   ├── package.json                # Build scripts package
│   ├── tsconfig.json
│   └── src/
│       ├── changed-modules.ts      # Change detection
│       ├── maven-sync.ts           # Version synchronization
│       └── downstream-prs.ts       # PR creation
└── .github/workflows/
    └── release.yml                 # CI/CD pipeline
```

**FR-1.2: Module Requirements**

Each module MUST have:
- `pom.xml` with independent version (not inherited from parent)
- `package.json` with matching version for Changesets
- `DEPENDENTS.yaml` listing downstream consumers (optional)

**FR-1.3: Parent POM**

The parent POM MUST:
- Define common dependencies and plugin versions
- Configure CodeArtifact distribution management
- List all modules in `<modules>` section
- NOT enforce version inheritance

---

### FR-2: Change Detection

**FR-2.1: Git Diff Analysis**

The system MUST detect changed modules by:
1. Comparing current branch against base branch (default: `main`)
2. Mapping changed files to their containing module
3. Outputting module paths compatible with Maven `-pl` flag

**FR-2.2: Change Detection Script**

```
Input:
  --base <branch>     Base branch to compare (default: main)
  --csv               Output comma-separated
  --output <dir>      Write troubleshooting artifacts

Output (default):
  modules/auth-commons
  modules/logging-utils

Output (--csv):
  modules/auth-commons,modules/logging-utils
```

**FR-2.3: Troubleshooting Artifacts**

When `--output` is specified, generate:

| File | Content |
|------|---------|
| `change-detection.json` | Full structured data |
| `changed-modules.txt` | Module list (one per line) |
| `maven-pl.txt` | Comma-separated for Maven |
| `changed-files.txt` | All changed files |
| `summary.txt` | Human-readable summary |

---

### FR-3: Version Management

**FR-3.1: Changesets Integration**

The system MUST support Changesets workflow:
1. Developer runs `pnpm changeset` to create version intent
2. Changeset file specifies package(s) and bump type
3. On merge, `pnpm changeset version` applies bumps
4. CHANGELOG.md is auto-generated per module

**FR-3.2: Maven-npm Version Sync**

Since Maven reads `pom.xml` and Changesets reads `package.json`:
- Versions MUST be synchronized after Changesets runs
- `pnpm maven:sync` copies `package.json` version to `pom.xml`
- `pnpm maven:status` shows sync status

**FR-3.3: Version Sync Script**

```
Command: pnpm maven:status

Output:
  Package                  package.json   pom.xml        Status
  ─────────────────────────────────────────────────────────────
  @libs/auth-commons       1.2.0          1.2.0          ✓
  @libs/logging-utils      2.0.0          1.9.0          ⚠️ MISMATCH

Command: pnpm maven:sync

Output:
  Syncing Changesets to Maven
  → logging-utils: 1.9.0 → 2.0.0
  ✓ logging-utils: Updated pom.xml
```

**FR-3.4: Branch-Based Versioning (Alternative)**

For teams preferring automatic versioning:

| Branch Pattern | Bump Type |
|----------------|-----------|
| `feat/*`, `feature/*` | minor |
| `fix/*`, `bugfix/*`, `hotfix/*` | patch |
| `breaking/*`, `feat!/*` | major |
| `release/x.y.z` | exact version |
| `chore/*`, `docs/*`, `ci/*` | none |

---

### FR-4: Build System

**FR-4.1: Selective Builds**

The system MUST only build changed modules:

```bash
# Detect changed modules
CHANGED=$(node scripts/changed-modules.js --csv)

# Build only changed (with dependencies)
mvn clean install -pl "$CHANGED" -am
```

**FR-4.2: Parallel Builds**

The system MUST support parallel module builds:

```bash
# Build changed modules in parallel (4 concurrent)
node scripts/parallel-build.js

# Build all modules with 8 parallel processes
node scripts/parallel-build.js --all -p 8

# Build specific modules
node scripts/parallel-build.js --modules modules/a,modules/b
```

**FR-4.3: Parallel Build Output**

Each module MUST have distinguishable output:

| Feature | Implementation |
|---------|----------------|
| Colored prefixes | Each module gets unique color (blue, green, magenta, cyan, etc.) |
| Timestamps | `[HH:mm:ss]` prefix on each line |
| Module name | `[module-name]` prefix (padded for alignment) |
| Filtered output | Show only important lines (BUILD, ERROR, Compiling, Tests) |
| Summary | Pass/fail count with duration per module |

Example output:
```
[10:30:15] [auth-commons   ] [INFO] Compiling 12 source files
[10:30:15] [logging-utils  ] [INFO] Compiling 8 source files
[10:30:22] [auth-commons   ] ✓ Completed in 7.2s
[10:30:23] [logging-utils  ] ✓ Completed in 8.1s

================================================================================
BUILD SUMMARY
================================================================================
  ✓ auth-commons         7.2s
  ✓ logging-utils        8.1s
================================================================================
✅ ALL PASSED - 2 modules built successfully
================================================================================
```

**FR-4.4: Parallel Build Options**

| Option | Default | Description |
|--------|---------|-------------|
| `--max-parallel, -p` | 4 | Maximum concurrent builds |
| `--all, -a` | false | Build all modules |
| `--modules, -m` | (changed) | Comma-separated module list |
| `--skip-tests` | true | Skip test execution |
| `--with-tests` | false | Run tests |
| `--goal, -g` | install | Maven goal |
| `--native` | false | Use Node.js native parallelism (no concurrently) |
| `--offline, -o` | false | Maven offline mode |

**FR-4.5: Build Commands**

| Command | Description |
|---------|-------------|
| `pnpm build:module <n>` | Build single module (sequential) |
| `pnpm build:changed` | Build changed modules (sequential) |
| `pnpm build:parallel` | Build changed modules (parallel) |
| `pnpm build:parallel:all` | Build all modules (parallel) |
| `mvn -pl <path> -am` | Direct Maven selective build |

**FR-4.6: Build Artifacts**

Each build MUST produce:
- JAR file in module's `target/` directory
- Build log captured for troubleshooting
- Exit code indicating success/failure
- Summary with per-module timing

---


**FR-5.1: CodeArtifact Integration**

The system MUST:
1. Authenticate with AWS CodeArtifact
2. Generate Maven `settings.xml` with auth token
3. Deploy artifacts via `mvn deploy`

**FR-5.2: Authentication Flow**

```
1. Assume IAM role (via OIDC or instance profile)
2. Call codeartifact:GetAuthorizationToken
3. Generate settings.xml with token
4. Token valid for 12 hours
```

**FR-5.3: Distribution Management**

```xml
<distributionManagement>
    <repository>
        <id>codeartifact</id>
        <url>https://${domain}-${account}.d.codeartifact.${region}.amazonaws.com/maven/${repo}/</url>
    </repository>
</distributionManagement>
```

---

### FR-6: Downstream Notifications

**FR-6.1: DEPENDENTS.yaml Schema**

```yaml
dependents:
  - repo: org/repo-name              # Required: GitHub repository
    baseBranch: main                 # Optional: default main
    files:                           # Required: files to update
      - path: pom.xml
        search: '<lib.version>.*</lib.version>'
        replace: '<lib.version>{{version}}</lib.version>'
```

**FR-6.2: PR Creation**

When a module is published, the system MUST:
1. Read module's `DEPENDENTS.yaml`
2. For each dependent repository:
    - Clone repository
    - Create branch `deps/update-{module}-{version}`
    - Apply file replacements
    - Create PR with standardized title/body
3. Handle errors gracefully (log and continue)

**FR-6.3: PR Template**

```markdown
Title: chore(deps): update {module} to {version}

Body:
## Summary
Automated dependency update for `{groupId}:{artifactId}` to version `{version}`.

## Changes
- Updated `{file}` with new version

## Release Notes
{changelog excerpt if available}

---
🤖 This PR was automatically created by the libs release pipeline.
```

---

### FR-7: CI/CD Pipeline

**FR-7.1: GitHub Actions Workflow**

Triggers:
- `pull_request` → main: Run checks, auto-generate changeset
- `push` → main: Create version PR or publish

Jobs:

```yaml
# On PR
auto-changeset:
  - Checkout with full history
  - Detect changed modules
  - Generate changeset from branch name
  - Commit and push changeset

# On main
release:
  - Run changesets/action
  - If changesets exist: Create "Version Packages" PR
  - If no changesets: Publish released packages
```

**FR-7.2: CodeBuild Specification**

```yaml
phases:
  install:
    - Install pnpm
    - pnpm install
  
  pre_build:
    - Setup CodeArtifact auth
    - Detect changed modules
    - Write artifacts
  
  build:
    - Build changed modules
    - Deploy to CodeArtifact
  
  post_build:
    - Create downstream PRs
    - Upload artifacts

artifacts:
  - change-detection/
  - build-logs/
```

**FR-7.3: Required Secrets/Variables**

| Name | Type | Description |
|------|------|-------------|
| `GITHUB_TOKEN` | Secret | PR creation (auto-provided) |
| `AWS_ROLE_ARN` | Secret | IAM role for CodeArtifact |
| `AWS_REGION` | Variable | AWS region |
| `CODEARTIFACT_DOMAIN` | Variable | CodeArtifact domain name |
| `CODEARTIFACT_REPO` | Variable | CodeArtifact repository name |

---

## Technical Requirements

### TR-1: Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Runtime | Node.js | 18+ |
| Package Manager | pnpm | 9+ |
| Build | Maven | 3.8+ |
| Language | Java | 17+ |
| Scripts | TypeScript | 5+ |
| CI | GitHub Actions | v4 actions |
| Artifact Store | AWS CodeArtifact | - |

### TR-2: Script Requirements

**TR-2.1: No External Dependencies for Core Scripts**

`changed-modules.js` and `parallel-build.js` MUST:
- Run with Node.js only (no npm install required)
- Use only built-in modules (`fs`, `path`, `child_process`)
- Be copy-paste portable

**TR-2.2: Parallel Build with Optional Enhancement**

`parallel-build.js` MUST support two modes:
- **Native mode (`--native`)**: Pure Node.js, no dependencies
- **Enhanced mode**: Uses `concurrently` for better output formatting

**TR-2.3: TypeScript for Complex Scripts**

Build orchestration scripts MAY use:
- TypeScript with tsx runtime
- External packages (AWS SDK, Octokit, etc.)
- Defined in `scripts/package.json`

### TR-3: Performance Requirements

| Operation | Target |
|-----------|--------|
| Change detection | < 5 seconds |
| Version sync | < 10 seconds |
| Single module build | Depends on module |
| Parallel build (4 modules) | ~1.5x single longest module |
| Downstream PR creation | < 30 seconds per repo |

### TR-4: Error Handling

**TR-4.1: Graceful Degradation**

- If change detection fails, fall back to building all modules
- If downstream PR fails, log error and continue with next
- If CodeArtifact auth fails, exit with clear error message

**TR-4.2: Exit Codes**

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Configuration error |
| 3 | Git error |
| 4 | Maven build failure |
| 5 | Publishing failure |

---

## Implementation Checklist

### Phase 1: Repository Setup

- [ ] Create root `package.json` with pnpm workspaces
- [ ] Create `pnpm-workspace.yaml`
- [ ] Create parent `pom.xml` with aggregator config
- [ ] Create `.changeset/config.json`
- [ ] Create `.gitignore`
- [ ] Create `.nvmrc`

### Phase 2: Change Detection

- [ ] Implement `changed-modules.js`
    - [ ] Find all pom.xml files
    - [ ] Git diff against base branch
    - [ ] Map files to modules
    - [ ] Output formats (list, csv, artifacts)
- [ ] Test with various scenarios
    - [ ] Single module change
    - [ ] Multiple module changes
    - [ ] No changes
    - [ ] New module added

### Phase 3: Version Management

- [ ] Implement `maven-sync.ts`
    - [ ] Read package.json versions
    - [ ] Read pom.xml versions
    - [ ] Detect mismatches
    - [ ] Update pom.xml via Maven versions plugin
- [ ] Implement `maven-init.ts`
    - [ ] Scan for pom.xml files
    - [ ] Generate package.json for each module
- [ ] Add pnpm scripts
    - [ ] `maven:status`
    - [ ] `maven:sync`
    - [ ] `maven:init`

### Phase 4: Build System

- [ ] Implement `build-module.ts`
    - [ ] Execute Maven with -pl flag
    - [ ] Capture output
    - [ ] Return artifact info
- [ ] Implement `build-changed.ts`
    - [ ] Orchestrate change detection → build → publish
    - [ ] Handle errors per module
- [ ] Implement `parallel-build.js`
    - [ ] Native Node.js parallel execution
    - [ ] Colored output prefixes per module
    - [ ] Timestamps on each line
    - [ ] Filtered output (BUILD, ERROR, Compiling, Tests)
    - [ ] Build summary with per-module timing
    - [ ] Optional `concurrently` enhanced mode
    - [ ] Configurable parallelism (`--max-parallel`)
- [ ] Add pnpm scripts
    - [ ] `build:module`
    - [ ] `build:changed`
    - [ ] `build:parallel`
    - [ ] `build:parallel:all`

### Phase 5: Publishing

- [ ] Implement `setup-codeartifact.ts`
    - [ ] AWS SDK authentication
    - [ ] Generate settings.xml
    - [ ] Write to ~/.m2/settings.xml
- [ ] Configure parent pom.xml
    - [ ] Distribution management
    - [ ] Server credentials reference

### Phase 6: Downstream PRs

- [ ] Define DEPENDENTS.yaml schema
- [ ] Implement `downstream-prs.ts`
    - [ ] Parse DEPENDENTS.yaml
    - [ ] Clone repositories
    - [ ] Apply replacements
    - [ ] Create PRs via Octokit
- [ ] Test with sample downstream repo

### Phase 7: CI/CD

- [ ] Create `.github/workflows/release.yml`
    - [ ] PR job: auto-generate changeset
    - [ ] Main job: version or publish
- [ ] Create `buildspec.yml` for CodeBuild
- [ ] Test full workflow
    - [ ] PR flow
    - [ ] Merge flow
    - [ ] Version PR flow
    - [ ] Release flow

### Phase 8: Documentation

- [ ] Create README.md
- [ ] Create CONTRIBUTING.md
- [ ] Add inline code documentation
- [ ] Create example module

---

## Sample Module Template

### pom.xml

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>com.yourcompany.libs</groupId>
        <artifactId>libs-parent</artifactId>
        <version>1.0.0</version>
        <relativePath>../../pom.xml</relativePath>
    </parent>

    <artifactId>module-name</artifactId>
    <version>1.0.0</version>
    <packaging>jar</packaging>

    <name>Module Name</name>
    <description>Description of the module</description>

    <dependencies>
        <!-- Module-specific dependencies -->
    </dependencies>
</project>
```

### package.json

```json
{
  "name": "@libs/module-name",
  "version": "1.0.0",
  "private": true,
  "description": "Description of the module",
  "maven": {
    "groupId": "com.yourcompany.libs",
    "artifactId": "module-name",
    "packaging": "jar"
  },
  "scripts": {
    "build": "cd ../.. && mvn -pl modules/module-name -am clean package -DskipTests",
    "test": "cd ../.. && mvn -pl modules/module-name test",
    "deploy": "cd ../.. && mvn -pl modules/module-name -am clean deploy -DskipTests"
  }
}
```

### DEPENDENTS.yaml

```yaml
dependents:
  - repo: your-org/consumer-service
    baseBranch: main
    files:
      - path: pom.xml
        search: '<module-name.version>.*</module-name.version>'
        replace: '<module-name.version>{{version}}</module-name.version>'
```

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Git history too large for diff | Slow change detection | Use shallow clone with fetch |
| Changesets unfamiliar to team | Adoption friction | Provide auto-changeset from branch |
| CodeArtifact token expiry | Build failures | Token valid 12h, refresh in CI |
| Downstream PR conflicts | Manual intervention needed | Clear PR description, easy to re-run |
| pom.xml/package.json drift | Wrong versions published | `maven:status` check in CI |

---

## Glossary

| Term | Definition |
|------|------------|
| **Changeset** | A markdown file describing intended version bump and changelog entry |
| **Module** | A Maven project within the monorepo with its own pom.xml |
| **Downstream** | A repository that depends on a module from this monorepo |
| **Selective Build** | Building only modules that changed, not the entire repo |
| **Version Sync** | Ensuring package.json and pom.xml have matching versions |

---

## References

- [Changesets Documentation](https://github.com/changesets/changesets)
- [pnpm Workspaces](https://pnpm.io/workspaces)
- [Maven Reactor](https://maven.apache.org/guides/mini/guide-multiple-modules.html)
- [AWS CodeArtifact](https://docs.aws.amazon.com/codeartifact/)
- [GitHub Actions](https://docs.github.com/en/actions)