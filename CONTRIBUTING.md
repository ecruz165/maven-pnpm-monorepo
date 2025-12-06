# Contributing to Maven-pnpm Monorepo

Thank you for contributing! This guide will help you understand our development workflow, conventions, and processes.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Branching Conventions](#branching-conventions)
- [Commit Message Format](#commit-message-format)
- [Pull Request Process](#pull-request-process)
- [Changeset Requirements](#changeset-requirements)
- [Code Review Guidelines](#code-review-guidelines)
- [Testing Requirements](#testing-requirements)

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 9+ (`corepack enable && corepack prepare pnpm@9 --activate`)
- Java 21+
- Maven 3.9+
- Git

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/your-org/maven-pnpm-monorepo.git
cd maven-pnpm-monorepo

# Install dependencies
pnpm install

# Verify setup
pnpm maven:status
```

## Development Workflow

### 1. Create a Feature Branch

```bash
# Always branch from main
git checkout main
git pull origin main

# Create feature branch using conventional naming
git checkout -b feat/add-user-auth
# or
git checkout -b fix/null-pointer-exception
# or
git checkout -b docs/update-readme
```

### 2. Make Your Changes

Work on your changes in the appropriate module(s):

```bash
# Build specific module during development
pnpm build:module demo-module-a

# Or use Maven directly
mvn clean install -pl demo-module-a
```

### 3. Add a Changeset

**Every PR that changes functionality MUST include a changeset.**

```bash
# Create a changeset
pnpm changeset

# Follow the prompts:
# 1. Select which packages changed
# 2. Choose version bump type (major/minor/patch)
# 3. Write a user-facing summary
```

Example changeset file (`.changeset/funny-pandas-dance.md`):

```markdown
---
"@libs/demo-module-a": minor
---

Add OAuth2 authentication support with token refresh
```

### 4. Commit Your Changes

```bash
# Stage your changes
git add .

# Commit following conventional commits format
git commit -m "feat(demo-module-a): add OAuth2 support"
```

### 5. Push and Create PR

```bash
# Push to your branch
git push origin feat/add-user-auth

# Create PR via GitHub UI or gh CLI
gh pr create --title "feat(demo-module-a): add OAuth2 support" \
  --body "Implements OAuth2 authentication with token refresh for demo-module-a"
```

## Branching Conventions

We follow a simplified Git Flow model:

### Branch Types

| Prefix | Purpose | Example | Merges To |
|--------|---------|---------|-----------|
| `feat/` | New features | `feat/add-user-auth` | `main` |
| `fix/` | Bug fixes | `fix/null-pointer` | `main` |
| `docs/` | Documentation only | `docs/update-readme` | `main` |
| `refactor/` | Code refactoring | `refactor/extract-utils` | `main` |
| `test/` | Test additions/fixes | `test/add-integration-tests` | `main` |
| `chore/` | Maintenance tasks | `chore/update-dependencies` | `main` |

### Branch Naming Rules

- Use lowercase and hyphens (kebab-case)
- Be descriptive but concise
- Include ticket number if applicable: `feat/JIRA-123-add-auth`

### Protected Branches

- `main` - Production-ready code, requires PR approval
- Direct pushes to `main` are disabled (except for CI automation)

## Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/) specification:

### Format

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

### Types

| Type | Description | Example |
|------|-------------|---------|
| `feat` | New feature | `feat(auth): add OAuth2 support` |
| `fix` | Bug fix | `fix(parser): handle null values` |
| `docs` | Documentation | `docs(readme): add setup instructions` |
| `style` | Formatting | `style(auth): fix indentation` |
| `refactor` | Code restructuring | `refactor(utils): extract validation logic` |
| `test` | Tests | `test(auth): add OAuth2 integration tests` |
| `chore` | Maintenance | `chore(deps): update spring boot to 3.2` |
| `perf` | Performance | `perf(query): optimize database queries` |
| `ci` | CI/CD changes | `ci(workflow): add parallel builds` |

### Scope

The scope is the module or component affected:

- `demo-module-a`
- `demo-module-b`
- `scripts`
- `workflow`
- `docs`

### Examples

```bash
# Feature with scope
git commit -m "feat(demo-module-a): add OAuth2 authentication"

# Bug fix with detailed body
git commit -m "fix(demo-module-b): prevent null pointer in validation

The validator was not handling null input values correctly,
causing NPE when processing empty requests.

Fixes #123"

# Breaking change
git commit -m "feat(auth)!: migrate to OAuth2

BREAKING CHANGE: The authentication API has changed.
Old token-based auth is no longer supported."
```

## Pull Request Process

### Before Creating PR

- [ ] All tests pass locally: `mvn test`
- [ ] Code builds successfully: `pnpm build:changed`
- [ ] Changeset added (if functional changes)
- [ ] Documentation updated (if needed)
- [ ] Commit messages follow conventions

### PR Title Format

PR titles should match commit message format:

```
feat(demo-module-a): add OAuth2 support
fix(parser): handle null input values
docs(contributing): add PR guidelines
```

### PR Description Template

```markdown
## Description
Brief description of changes

## Changes Made
- Added OAuth2 authentication flow
- Updated configuration to support token refresh
- Added integration tests for auth endpoints

## Changeset Included
- [x] Yes, changeset added
- [ ] No, not needed (docs/tests only)

## Testing
- [x] Unit tests added/updated
- [x] Integration tests added/updated
- [x] Manual testing completed

## Checklist
- [x] Code builds successfully
- [x] All tests pass
- [x] Documentation updated
- [x] Changeset added
```

### Review Process

1. **Automated Checks**: CI runs build, tests, and change detection
2. **Code Review**: At least 1 approval required
3. **Merge**: Squash and merge to main (preserves clean history)

## Changeset Requirements

### When to Add a Changeset

**Always required:**
- New features (`feat`)
- Bug fixes (`fix`)
- Breaking changes
- Performance improvements (`perf`)
- API changes

**Not required:**
- Documentation only (`docs`)
- Test additions (`test`)
- Build/CI changes (`ci`, `chore`)

### Changeset Types

#### Patch (0.0.x → 0.0.x+1)

Bug fixes, minor improvements, no API changes:

```bash
pnpm changeset
# Select "patch" for the affected package
```

```markdown
---
"@libs/demo-module-a": patch
---

Fix null pointer exception in request validator
```

#### Minor (0.x.0 → 0.x+1.0)

New features, backward-compatible changes:

```markdown
---
"@libs/demo-module-a": minor
---

Add OAuth2 authentication with token refresh
```

#### Major (x.0.0 → x+1.0.0)

Breaking changes, incompatible API modifications:

```markdown
---
"@libs/demo-module-a": major
---

BREAKING CHANGE: Migrate authentication from token-based to OAuth2.
Old token authentication endpoints have been removed.

Migration guide: See docs/migration-to-oauth2.md
```

### Multiple Packages

If your change affects multiple modules:

```markdown
---
"@libs/demo-module-a": minor
"@libs/demo-module-b": patch
---

Add shared authentication utilities and update module-b to use them
```

## Code Review Guidelines

### For Authors

- Keep PRs focused and reasonably sized (< 500 lines ideal)
- Provide context in PR description
- Respond to feedback promptly
- Mark resolved conversations

### For Reviewers

- Review within 24 hours
- Be constructive and respectful
- Focus on:
  - Correctness and logic
  - Code quality and maintainability
  - Test coverage
  - Documentation completeness
  - Security implications

### Review Checklist

- [ ] Code follows project conventions
- [ ] Tests adequately cover changes
- [ ] Documentation is updated
- [ ] No security vulnerabilities introduced
- [ ] Performance impact considered
- [ ] Changeset appropriately reflects changes

## Testing Requirements

### Unit Tests

Every module must maintain test coverage:

```bash
# Run tests for specific module
mvn test -pl demo-module-a

# Run all tests
mvn test
```

### Integration Tests

For features that interact with external systems or multiple modules:

```bash
# Integration tests are in src/test/java/.../integration/
mvn verify
```

### CI Testing

The CI pipeline automatically:
1. Detects changed modules
2. Builds affected modules and dependencies
3. Runs tests in parallel
4. Verifies changesets

## Additional Resources

### Documentation

- [README.md](./README.md) - Project overview and quick start
- [scripts/README.md](./scripts/README.md) - Automation scripts guide
- [.github/WORKFLOW_SEQUENCE.md](./.github/WORKFLOW_SEQUENCE.md) - CI/CD pipeline details
- [.github/PAT_SETUP.md](./.github/PAT_SETUP.md) - GitHub PAT configuration

### Scripts Documentation

Each script has detailed documentation:
- [changed-modules.js](./scripts/src/README-changed-modules.md)
- [maven-sync.js](./scripts/src/README-maven-sync.md)
- [maven-init.js](./scripts/src/README-maven-init.md)
- [maven-status.js](./scripts/src/README-maven-status.md)
- [parallel-build.js](./scripts/src/README-parallel-build.md)
- [downstream-prs.js](./scripts/src/README-downstream-prs.md)

### Getting Help

- Create an issue for bugs or feature requests
- Tag maintainers for urgent reviews
- Check existing PRs for similar work

## Release Process

Releases are automated via CI/CD:

1. **Merge PR with changeset** → Creates "Version Packages" PR
2. **Approve Version PR** → Updates versions, generates CHANGELOG.md
3. **Merge Version PR** → Publishes to GitHub Packages, creates downstream PRs

Manual intervention is rarely needed.

---

Thank you for contributing to maven-pnpm-monorepo!
