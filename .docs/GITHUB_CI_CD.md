# GitHub-Centric CI/CD Setup

This project uses GitHub Actions for CI/CD and GitHub Packages for Maven artifact management.

## Architecture

```
GitHub Repository
    ↓
GitHub Actions (CI/CD)
    ├─ Build (Maven + Tests)
    ├─ Publish to GitHub Packages
    └─ Create Downstream PRs
```

## Features

✅ **Automated Builds** - Triggered on push/PR to main/develop
✅ **Maven Package Registry** - Artifacts hosted on GitHub Packages
✅ **Test Reporting** - Automatic test result publishing
✅ **Artifact Caching** - Fast builds with Maven/pnpm cache
✅ **Downstream Automation** - Auto-create PRs in dependent repos
✅ **100% Free** - No cloud costs (within GitHub free tier limits)

## Prerequisites

### 1. GitHub Personal Access Token

Create a token with these scopes:
- `repo` - Full control of repositories
- `write:packages` - Upload packages to GitHub Packages
- `read:packages` - Download packages from GitHub Packages
- `workflow` - Update GitHub Action workflows

**Create token:** https://github.com/settings/tokens/new

```bash
# Add to repository secrets
# Settings → Secrets and variables → Actions → New repository secret
Name: GITHUB_TOKEN (already available by default, or create PAT for enhanced permissions)
```

## GitHub Actions Workflow

### File: `.github/workflows/maven-build.yml`

**Triggers:**
- Push to `main` or `develop`
- Pull requests to `main` or `develop`
- Manual trigger (`workflow_dispatch`)

**Jobs:**

#### 1. Build Job
- Sets up Java 21 (Corretto)
- Sets up Node.js 20 + pnpm 9
- Caches Maven dependencies
- Runs `mvn clean install`
- Runs `mvn test`
- Publishes test results
- Uploads build artifacts

#### 2. Publish Job (main/develop only)
- Deploys artifacts to GitHub Packages
- Only runs on push to main/develop branches
- Creates deployment summary

## GitHub Packages Configuration

### Publishing Artifacts

Artifacts are automatically published to:
```
https://maven.pkg.github.com/ecruz165/maven-pnpm-monorepo
```

### Consuming Artifacts

#### In Maven Projects

**1. Add to `~/.m2/settings.xml`:**

```xml
<settings>
  <servers>
    <server>
      <id>github</id>
      <username>YOUR_GITHUB_USERNAME</username>
      <password>YOUR_GITHUB_TOKEN</password>
    </server>
  </servers>

  <profiles>
    <profile>
      <id>github</id>
      <repositories>
        <repository>
          <id>github</id>
          <url>https://maven.pkg.github.com/ecruz165/maven-pnpm-monorepo</url>
          <snapshots>
            <enabled>true</enabled>
          </snapshots>
        </repository>
      </repositories>
    </profile>
  </profiles>

  <activeProfiles>
    <activeProfile>github</activeProfile>
  </activeProfiles>
</settings>
```

**2. Use in `pom.xml`:**

```xml
<dependency>
    <groupId>com.example</groupId>
    <artifactId>demo-module-a</artifactId>
    <version>0.0.1-SNAPSHOT</version>
</dependency>
```

#### In GitHub Actions

GitHub Actions automatically authenticates using `GITHUB_TOKEN`:

```yaml
- name: Build with Maven
  run: mvn clean install
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Local Development

### Setup Maven Settings

```bash
# Create settings.xml for GitHub Packages
cat > ~/.m2/settings.xml << 'EOF'
<settings>
  <servers>
    <server>
      <id>github</id>
      <username>YOUR_GITHUB_USERNAME</username>
      <password>YOUR_GITHUB_TOKEN</password>
    </server>
  </servers>
</settings>
EOF
```

### Build and Test Locally

```bash
# Install dependencies
pnpm install

# Build all modules
mvn clean install

# Run tests
mvn test

# Deploy to GitHub Packages (requires GitHub token)
mvn deploy
```

## Workflow Commands

### Trigger Manual Build

```bash
# Via GitHub CLI
gh workflow run maven-build.yml

# Via GitHub UI
Actions → Maven Build & Publish → Run workflow
```

### View Workflow Status

```bash
# List workflow runs
gh run list --workflow=maven-build.yml

# View specific run
gh run view <run-id>

# Watch logs
gh run watch
```

## Build Badge

Add to README.md:

```markdown
![Build Status](https://github.com/ecruz165/maven-pnpm-monorepo/actions/workflows/maven-build.yml/badge.svg)
```

## Cost & Limits

### GitHub Free Tier

**GitHub Actions:**
- Public repos: Unlimited minutes
- Private repos: 2,000 minutes/month

**GitHub Packages:**
- Public repos: Unlimited storage
- Private repos: 500 MB storage

**Our Usage (Estimated):**
- Build time: ~5 minutes
- Storage: ~10 MB per artifact
- Well within free tier limits ✅

## Security Best Practices

### 1. Token Management

- ✅ Use repository secrets for tokens
- ✅ Rotate tokens every 90 days
- ✅ Use fine-grained tokens (beta) when possible
- ✅ Never commit tokens to repository

### 2. Dependency Security

```yaml
# Add to workflow for dependency scanning
- name: Run dependency check
  run: mvn dependency-check:check
```

### 3. Code Scanning

```yaml
# Add CodeQL scanning
- name: Initialize CodeQL
  uses: github/codeql-action/init@v3
  with:
    languages: java

- name: Perform CodeQL Analysis
  uses: github/codeql-action/analyze@v3
```

## Troubleshooting

### Authentication Errors

**Problem:** `401 Unauthorized` when deploying

**Solution:**
1. Verify GitHub token has `write:packages` scope
2. Check token hasn't expired
3. Verify username matches token owner

### Build Failures

**Problem:** Tests fail in CI but pass locally

**Solution:**
1. Check Java version matches (21)
2. Verify environment variables
3. Review test logs in Actions tab

### Package Not Found

**Problem:** Cannot download package from GitHub Packages

**Solution:**
1. Verify package name and version
2. Check `~/.m2/settings.xml` configuration
3. Ensure token has `read:packages` scope
4. Verify repository URL is correct

## Monitoring

### View Build Logs

```bash
# Recent runs
gh run list

# Specific run logs
gh run view <run-id> --log

# Follow live build
gh run watch
```

### View Published Packages

```
https://github.com/ecruz165/maven-pnpm-monorepo/packages
```

## Downstream PR Automation

The existing `downstream-prs.js` script works seamlessly with GitHub Actions:

```yaml
- name: Create downstream PRs
  run: pnpm downstream:prs
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Advanced Configuration

### Matrix Builds

Test against multiple Java versions:

```yaml
strategy:
  matrix:
    java: [17, 21]
    os: [ubuntu-latest, windows-latest, macos-latest]
```

### Conditional Steps

```yaml
- name: Deploy to production
  if: github.ref == 'refs/heads/main' && github.event_name == 'push'
  run: mvn deploy
```

### Scheduled Builds

```yaml
on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM UTC
```

## Migration from AWS

Previous AWS CodeArtifact/CodeBuild setup has been removed in favor of this GitHub-native approach.

**Benefits:**
- ✅ No AWS costs
- ✅ Simpler authentication
- ✅ Better GitHub integration
- ✅ Familiar developer experience
- ✅ Built-in security scanning

## References

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [GitHub Packages Maven Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-apache-maven-registry)
- [Publishing Maven Packages](https://docs.github.com/en/actions/publishing-packages/publishing-java-packages-with-maven)
