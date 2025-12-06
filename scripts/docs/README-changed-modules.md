# changed-modules.js

Detects which Maven modules have changed based on git diff analysis.

## Purpose

This script analyzes git diffs to determine which Maven modules have been modified, enabling selective builds and deployments. It's a core component of the selective versioning workflow.

## Usage

### Basic Usage

```bash
# Detect changed modules (default output: space-separated)
node scripts/src/changed-modules.js

# Output as CSV
node scripts/src/changed-modules.js --csv

# Compare against a specific branch
node scripts/src/changed-modules.js --base develop

# Write results to a file
node scripts/src/changed-modules.js --output changed.txt
```

### Via pnpm Scripts

```bash
# Detect changed modules
pnpm changed:modules

# Get CSV output
pnpm changed:modules:csv
```

## Command-Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `--base <branch>` | Base branch to compare against | `main` |
| `--csv` | Output as comma-separated values | `false` (space-separated) |
| `--output <file>` | Write results to file | `stdout` |
| `--help` | Show help message | - |

## How It Works

1. **Git Diff Strategy**:
   - In CI (push events): Compares `HEAD~1` to detect changes in the latest commit
   - In CI (PRs): Compares `base...HEAD` to detect all PR changes
   - Locally: Compares against base branch or uncommitted changes

2. **Module Detection**:
   - Scans all directories with `pom.xml` files
   - Checks if any files in module directory appear in git diff
   - Returns list of changed module directory names

3. **Caching**:
   - Creates `.changed-modules-cache.json` to store results
   - Speeds up repeated calls in CI/local development

## Expected Output

### Success (Space-separated)

```
demo-module-a demo-module-b
```

### Success (CSV format)

```
demo-module-a,demo-module-b
```

### No Changes

```
(empty output)
```

Exit code: `0`

### Error Scenarios

**No modules found:**
```
Error: No Maven modules found in the repository
```
Exit code: `1`

**Git error:**
```
Error getting changed files: <error message>
```
Exit code: `1`

## Environment Variables

| Variable | Description | Used In |
|----------|-------------|---------|
| `CI` | Indicates CI environment | Auto-detection |
| `GITHUB_EVENT_NAME` | GitHub event type (push/pull_request) | GitHub Actions |

## Examples

### Example 1: Detect changes in CI

```bash
# In GitHub Actions
CHANGED=$(node scripts/src/changed-modules.js --csv)
if [ -n "$CHANGED" ]; then
  echo "Changed modules: $CHANGED"
  # Proceed with build
fi
```

### Example 2: Local development

```bash
# Check what would be built
node scripts/src/changed-modules.js --base main
# Output: demo-module-a

# Build only changed modules
mvn clean install -pl $(node scripts/src/changed-modules.js)
```

### Example 3: PR validation

```bash
# In PR workflow
CHANGED=$(node scripts/src/changed-modules.js --base ${{ github.base_ref }} --csv)
if [ -z "$CHANGED" ]; then
  echo "No modules changed, skipping build"
  exit 0
fi
```

## Integration with Workflow

This script is used in `.github/workflows/version-and-publish.yml`:

```yaml
- name: Detect changed modules
  id: detect
  run: |
    CHANGED=$(node scripts/src/changed-modules.js --csv || echo "")
    echo "modules=$CHANGED" >> $GITHUB_OUTPUT
```

## Cache File Format

`.changed-modules-cache.json`:
```json
{
  "timestamp": "2025-12-06T16:00:00.000Z",
  "base": "main",
  "modules": ["demo-module-a", "demo-module-b"]
}
```

## Troubleshooting

### Issue: "No modules found"

**Cause**: Script cannot find any directories with `pom.xml`

**Solution**:
- Ensure you're running from the repository root
- Verify Maven modules have `pom.xml` files
- Check working directory: `pwd`

### Issue: Empty output when changes exist

**Cause**: Git diff strategy might not match your environment

**Solution**:
- Try specifying base branch: `--base main`
- Check git status: `git status`
- Verify uncommitted changes: `git diff --name-only`

### Issue: Wrong modules detected

**Cause**: Changes in parent directory affect all modules

**Solution**:
- Review git diff: `git diff --name-only HEAD~1`
- Consider if root `pom.xml` changes should trigger all modules
- Adjust detection logic if needed

## Related Scripts

- **maven-sync.js** - Syncs versions after detection
- **parallel-build.js** - Builds detected modules in parallel
- **maven-status.js** - Shows sync status for detected modules
