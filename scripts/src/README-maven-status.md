# maven-status.js

Displays synchronization status between Maven `pom.xml` and `package.json` versions.

## Purpose

Provides a visual overview of version alignment across Maven and pnpm workspaces, helping identify:
- Modules with mismatched versions
- Modules ready for publishing
- Modules needing synchronization

## Usage

### Basic Usage

```bash
# Check status of all modules
node scripts/src/maven-status.js

# Check specific module
node scripts/src/maven-status.js demo-module-a

# JSON output for automation
node scripts/src/maven-status.js --json
```

### Via pnpm Scripts

```bash
# Check all modules
pnpm maven:status

# Check specific module
pnpm maven:status demo-module-a
```

## Command-Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `<module>` | Specific module to check | All modules |
| `--json` | Output as JSON | `false` (table format) |
| `--help` | Show help message | - |

## How It Works

1. **Scan Modules**:
   - Finds all directories with both `pom.xml` and `package.json`

2. **Extract Versions**:
   - Reads version from `pom.xml` (strips `-SNAPSHOT`)
   - Reads version from `package.json`

3. **Compare & Report**:
   - Marks as ✓ (synced) or ✗ (out of sync)
   - Displays both versions side-by-side

## Expected Output

### Success - All Synced (Table Format)

```
Maven/Package.json Version Status
══════════════════════════════════════════════════════════

Module              Maven Version    Package Version    Status
──────────────────────────────────────────────────────────
demo-module-a       0.0.6-SNAPSHOT   0.0.6             ✓ Synced
demo-module-b       1.0.0-SNAPSHOT   1.0.0             ✓ Synced
demo-module-c       0.1.0-SNAPSHOT   0.1.0             ✓ Synced

All 3 module(s) are in sync ✓
```

Exit code: `0`

### Warning - Out of Sync (Table Format)

```
Maven/Package.json Version Status
══════════════════════════════════════════════════════════

Module              Maven Version    Package Version    Status
──────────────────────────────────────────────────────────
demo-module-a       0.0.7-SNAPSHOT   0.0.6             ✗ Out of sync
demo-module-b       1.0.0-SNAPSHOT   1.0.0             ✓ Synced
demo-module-c       0.1.0-SNAPSHOT   0.1.0             ✓ Synced

Warning: 1 module(s) out of sync
Run 'pnpm maven:sync' to synchronize versions
```

Exit code: `1`

### Success - JSON Output

```json
{
  "modules": [
    {
      "name": "demo-module-a",
      "mavenVersion": "0.0.6-SNAPSHOT",
      "packageVersion": "0.0.6",
      "synced": true
    },
    {
      "name": "demo-module-b",
      "mavenVersion": "1.0.0-SNAPSHOT",
      "packageVersion": "1.0.0",
      "synced": true
    }
  ],
  "summary": {
    "total": 2,
    "synced": 2,
    "outOfSync": 0
  }
}
```

Exit code: `0`

### Warning - JSON Output (Out of Sync)

```json
{
  "modules": [
    {
      "name": "demo-module-a",
      "mavenVersion": "0.0.7-SNAPSHOT",
      "packageVersion": "0.0.6",
      "synced": false
    },
    {
      "name": "demo-module-b",
      "mavenVersion": "1.0.0-SNAPSHOT",
      "packageVersion": "1.0.0",
      "synced": true
    }
  ],
  "summary": {
    "total": 2,
    "synced": 1,
    "outOfSync": 1
  }
}
```

Exit code: `1`

### Error Scenarios

**No modules found:**
```
Error: No Maven modules with package.json found
Hint: Run 'pnpm maven:init' to initialize modules
```
Exit code: `1`

**Module not found:**
```
Error: Module 'demo-module-x' not found or missing pom.xml/package.json
```
Exit code: `1`

## Version Format Handling

Maven and package.json use different version formats:

| Maven Version | package.json Version | Status |
|---------------|---------------------|--------|
| `0.0.6-SNAPSHOT` | `0.0.6` | ✓ Synced |
| `0.0.6` | `0.0.6` | ✓ Synced |
| `0.0.7-SNAPSHOT` | `0.0.6` | ✗ Out of sync |
| `1.0.0-SNAPSHOT` | `0.0.6` | ✗ Out of sync |

**Note**: `-SNAPSHOT` suffix is automatically stripped for comparison.

## Exit Codes

| Exit Code | Meaning | Action Required |
|-----------|---------|----------------|
| `0` | All modules synced | None |
| `1` | Modules out of sync | Run `pnpm maven:sync` |
| `1` | Error occurred | Check error message |

## Examples

### Example 1: Pre-Commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Check Maven/package.json sync
if ! pnpm maven:status --json > /dev/null; then
  echo "Error: Maven and package.json versions out of sync"
  echo "Run: pnpm maven:sync"
  exit 1
fi
```

### Example 2: CI/CD Validation

```yaml
# .github/workflows/validate.yml
- name: Validate version sync
  run: |
    pnpm maven:status
    if [ $? -ne 0 ]; then
      echo "::error::Versions out of sync"
      exit 1
    fi
```

### Example 3: Local Development Check

```bash
# Before creating a release
pnpm maven:status

# If out of sync:
pnpm maven:sync

# Verify
pnpm maven:status
```

### Example 4: Automated Reporting

```bash
# Generate JSON report
pnpm maven:status --json > version-status.json

# Parse with jq
cat version-status.json | jq '.summary'
# Output:
# {
#   "total": 3,
#   "synced": 2,
#   "outOfSync": 1
# }

# List out-of-sync modules
cat version-status.json | jq '.modules[] | select(.synced == false)'
```

## When to Run

Run `maven:status` to:

1. **Before commits** - Ensure versions are synced
2. **After changeset version** - Verify changes applied correctly
3. **In CI/CD** - Validate version consistency
4. **During debugging** - Identify version mismatches

## Integration with Workflow

Can be used in `.github/workflows/version-and-publish.yml`:

```yaml
- name: Validate version sync
  run: |
    pnpm maven:status
    if [ $? -ne 0 ]; then
      echo "Running maven:sync to fix..."
      pnpm maven:sync
    fi
```

## Comparison with Other Scripts

| Feature | maven-status.js | maven-sync.js | maven-init.js |
|---------|----------------|---------------|---------------|
| **Action** | Read-only check | Sync versions | Create package.json |
| **Exit on mismatch** | Yes (1) | No (always 0) | N/A |
| **Fixes issues** | No | Yes | No |
| **Use in CI** | Validation | Fix | Initialization |

## Output Format Details

### Table Format

```
Maven/Package.json Version Status
══════════════════════════════════════════════════════════
[Header with equals signs]

Module              Maven Version    Package Version    Status
──────────────────────────────────────────────────────────
[Dashes separator]

[module-name]       [maven-ver]      [pkg-ver]         [✓/✗ status]
...

[Summary line]
[Action suggestion if needed]
```

### JSON Format

```json
{
  "modules": [
    {
      "name": "string",          // Module directory name
      "mavenVersion": "string",  // From pom.xml
      "packageVersion": "string", // From package.json
      "synced": boolean          // true if versions match
    }
  ],
  "summary": {
    "total": number,        // Total modules checked
    "synced": number,       // Modules in sync
    "outOfSync": number     // Modules out of sync
  }
}
```

## Troubleshooting

### Issue: "No modules found"

**Cause**: Modules missing `package.json`

**Solution**:
```bash
pnpm maven:init
```

### Issue: Always shows out of sync

**Cause**: Version format mismatch

**Solution**:
- Maven should use: `X.Y.Z-SNAPSHOT` or `X.Y.Z`
- package.json should use: `X.Y.Z` (no `-SNAPSHOT`)
- Run `pnpm maven:sync` to auto-fix

### Issue: JSON parsing errors

**Cause**: Malformed pom.xml or package.json

**Solution**:
- Validate XML: `xmllint pom.xml`
- Validate JSON: `jq . package.json`

## Related Scripts

- **maven-sync.js** - Synchronizes versions (fixes issues)
- **maven-init.js** - Creates initial package.json
- **changed-modules.js** - Identifies which modules changed
