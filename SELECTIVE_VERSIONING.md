# Selective Versioning & Publishing

This project uses **selective versioning** - only changed modules are versioned and published to GitHub Packages.

## Architecture

```
Git Push → Detect Changes → Build Changed → Version Changed → Publish Changed → Create PRs
```

## Workflows

### 1. **PR Validation** (`.github/workflows/maven-build.yml`)

**Triggers:** Pull requests to main/develop

**What it does:**
- ✅ Detects changed modules
- ✅ Verifies version sync (maven:status)
- ✅ Builds only changed modules (or all if structural changes)
- ✅ Runs tests on changed modules
- ✅ Publishes test results

**Does NOT:**
- ❌ Version packages
- ❌ Publish to GitHub Packages
- ❌ Create downstream PRs

---

### 2. **Version & Publish** (`.github/workflows/version-and-publish.yml`)

**Triggers:** Push to main branch

**Jobs:**

#### Job 1: Detect Changes
- Uses `scripts/src/changed-modules.js`
- Compares with last commit
- Outputs CSV list of changed modules
- Outputs JSON array for matrix builds

#### Job 2: Build & Test Changed
- Builds ONLY changed modules: `mvn -pl module-a,module-b -am install`
- Runs tests: `mvn -pl module-a,module-b test`
- Publishes test results

#### Job 3: Version Modules
- Applies changesets (if any)
- Updates package.json versions
- Syncs pom.xml versions with `maven:sync`
- Commits version changes
- Pushes to main

#### Job 4: Publish Modules (Matrix)
- Runs in parallel for each changed module
- Publishes each module separately: `mvn -pl module-a deploy`
- Creates deployment summary

#### Job 5: Create Downstream PRs
- Runs `pnpm downstream:prs`
- Creates PRs in dependent repositories
- Only for modules that were published

---

## Change Detection

### How it works:

```bash
# Detect changed modules
node scripts/src/changed-modules.js --csv
# Output: demo-module-a,demo-module-c
```

**Detects changes in:**
- Source code (`src/`)
- POM files (`pom.xml`)
- Package files (`package.json`)
- Build configuration

**Does NOT trigger on:**
- Documentation only (`.md` files)
- CI/CD changes (`.github/`)
- Scripts changes (`scripts/`)

---

## Versioning Strategy

### Using Changesets

**1. Create a changeset when you make changes:**

```bash
pnpm changeset
```

Follow the prompts:
- Select which modules changed (demo-module-a, demo-module-b, etc.)
- Select version bump type (patch, minor, major)
- Write a summary of changes

This creates a file in `.changeset/` directory.

**2. Commit the changeset:**

```bash
git add .changeset/
git commit -m "feat: add new feature to module-a"
git push origin feature-branch
```

**3. When PR is merged to main:**

The workflow automatically:
- Reads all changesets
- Bumps versions in `package.json`
- Syncs `pom.xml` files
- Commits version changes
- Publishes ONLY changed modules

---

## Example Workflow

### Scenario: Update demo-module-a

**1. Make changes:**

```bash
# Edit demo-module-a/src/main/java/...
# Make your changes
```

**2. Create changeset:**

```bash
pnpm changeset
# Select: demo-module-a
# Type: patch (0.0.1 → 0.0.2)
# Summary: "Fix bug in module A"
```

**3. Create PR:**

```bash
git add .
git commit -m "fix: resolve issue in module-a"
git push origin fix/module-a-bug
gh pr create --title "Fix: Module A bug" --body "Resolves #123"
```

**4. PR Validation runs:**
- ✅ Detects `demo-module-a` changed
- ✅ Builds only `demo-module-a` (+ dependencies)
- ✅ Runs tests
- ✅ Shows test results in PR

**5. Merge PR:**

```bash
gh pr merge --squash
```

**6. Version & Publish workflow runs:**

```
Job 1: Detect Changes
  ✅ Changed: demo-module-a

Job 2: Build & Test
  ✅ Build: mvn -pl demo-module-a -am install
  ✅ Test: mvn -pl demo-module-a test

Job 3: Version
  ✅ Apply changeset
  ✅ demo-module-a: 0.0.1 → 0.0.2
  ✅ Update pom.xml: 0.0.1-SNAPSHOT → 0.0.2-SNAPSHOT
  ✅ Commit: "chore: version packages"

Job 4: Publish (Matrix: demo-module-a)
  ✅ mvn -pl demo-module-a deploy
  ✅ Published to GitHub Packages

Job 5: Downstream PRs
  ✅ Create PR in maven-pnpm-monorepo-dependent-repo
  ✅ Update version: 0.0.1-SNAPSHOT → 0.0.2-SNAPSHOT
```

**Result:**
- demo-module-a@0.0.2 published to GitHub Packages
- PR created in dependent repo
- Other modules (b, c) NOT touched

---

## Selective Build Examples

### Build only changed modules:

```bash
# CI automatically runs:
mvn -pl demo-module-a,demo-module-c -am clean install
```

The `-pl` flag specifies project list, `-am` includes dependencies.

### Publish only changed modules:

```bash
# CI runs in matrix (parallel):
mvn -pl demo-module-a -am deploy  # Job 1
mvn -pl demo-module-c -am deploy  # Job 2
```

---

## Manual Operations

### Check what would be published:

```bash
# Detect changes
node scripts/src/changed-modules.js

# Or with more detail
node scripts/src/changed-modules.js --output=./changed.txt
```

### Version manually:

```bash
# Create changeset
pnpm changeset

# Apply changesets
pnpm changeset version

# Sync Maven versions
pnpm maven:sync

# Commit
git add .
git commit -m "chore: version packages"
git push
```

### Publish manually:

```bash
# Publish specific module
mvn -pl demo-module-a clean deploy

# Publish all changed
CHANGED=$(node scripts/src/changed-modules.js --csv)
mvn -pl "$CHANGED" clean deploy
```

### Create downstream PRs manually:

```bash
# Dry run (preview)
pnpm downstream:prs --dry-run

# Create PRs
pnpm downstream:prs
```

---

## Cost Optimization

### With selective publishing:

**Before (publish all 3 modules every time):**
- Build time: 3 modules × 1 min = 3 minutes
- Publish time: 3 modules × 1 min = 3 minutes
- Total: 6 minutes per push
- 100 pushes/month: 600 minutes

**After (publish only changed - avg 1 module):**
- Build time: 1 module × 1 min = 1 minute
- Publish time: 1 module × 1 min = 1 minute
- Total: 2 minutes per push
- 100 pushes/month: 200 minutes

**Savings: 67% reduction in CI time** 🎉

---

## Troubleshooting

### No modules detected as changed

**Cause:** Only documentation or CI files changed

**Solution:** This is expected - no build needed!

### All modules being built in PR

**Cause:** Structural changes (root pom.xml, scripts, etc.)

**Solution:** This is correct - structural changes affect all modules

### Changeset not applied

**Cause:** No changeset files in `.changeset/` directory

**Solution:** Create changeset before merging:
```bash
pnpm changeset
```

### Version not updated after merge

**Cause:** Forgot to create changeset

**Solution:**
1. Create changeset on feature branch
2. Or manually version after merge:
   ```bash
   pnpm changeset
   pnpm changeset version
   pnpm maven:sync
   git commit -am "chore: version packages"
   git push
   ```

### Downstream PR not created

**Cause:** Module doesn't have `DEPENDENTS.yaml`

**Solution:** Create `<module>/DEPENDENTS.yaml`:
```yaml
dependents:
  - repo: owner/repo-name
    baseBranch: main
    files:
      - path: pom.xml
        search: '<version>0\.0\.1-SNAPSHOT</version>[\s]*<!--\s*module-name\s*-->'
        replace: '<version>{{version}}</version> <!-- module-name -->'
```

---

## Best Practices

### 1. Always create changesets

Create changesets for every feature/fix:
```bash
pnpm changeset
```

### 2. Use semantic versioning

- **patch** (0.0.1 → 0.0.2): Bug fixes
- **minor** (0.1.0 → 0.2.0): New features (backward compatible)
- **major** (1.0.0 → 2.0.0): Breaking changes

### 3. One changeset per PR

Keep PRs focused - one feature/fix per PR

### 4. Test locally before pushing

```bash
# Check what changed
node scripts/src/changed-modules.js

# Build changed modules
mvn -pl <modules> -am clean install

# Run tests
mvn -pl <modules> test
```

### 5. Review version bumps

Before merging, check:
```bash
pnpm changeset status
```

---

## References

- [Changesets Documentation](https://github.com/changesets/changesets)
- [Maven Project Selection](https://maven.apache.org/guides/mini/guide-multiple-modules.html)
- [GitHub Actions Matrix](https://docs.github.com/en/actions/using-jobs/using-a-matrix-for-your-jobs)
