# maven-sync.js

Synchronizes versions between Maven `pom.xml` and `package.json` files bidirectionally.

## Purpose

Keeps Maven and pnpm workspace versions in sync after:
- Changeset version bumps
- Manual `pom.xml` edits
- `mvn versions:set` commands

Ensures both build systems always use consistent version numbers.

## Usage

### Basic Usage

```bash
# Sync all modules
node scripts/src/maven-sync.js

# Sync specific module
node scripts/src/maven-sync.js demo-module-a

# Sync with direction preference
node scripts/src/maven-sync.js --source maven
node scripts/src/maven-sync.js --source package
```

### Via pnpm Scripts

```bash
# Sync all modules
pnpm maven:sync

# Sync specific module
pnpm maven:sync demo-module-a
```

## Command-Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `<module>` | Specific module to sync | All modules |
| `--source <type>` | Prefer `maven` or `package` version | Auto-detect |
| `--dry-run` | Preview changes without applying | `false` |
| `--help` | Show help message | - |

## How It Works

1. **Scan Modules**:
   - Finds all directories with both `pom.xml` and `package.json`

2. **Read Versions**:
   - Extracts version from `pom.xml`
   - Extracts version from `package.json`

3. **Determine Source**:
   - If `--source` specified, use that version
   - Otherwise, prefer newer version (higher semver)
   - If versions equal, no sync needed

4. **Apply Synchronization**:
   - Updates `pom.xml` if Maven version differs
   - Updates `package.json` if package version differs
   - Preserves file formatting and structure

5. **Write Changes**:
   - Atomically writes updated files
   - Maintains XML/JSON formatting

## Expected Output

### Success - No Sync Needed

```
Syncing Maven and package.json versions...

Processing: demo-module-a
  Maven: 0.0.6-SNAPSHOT
  Package: 0.0.6
  ✓ Already in sync

Processing: demo-module-b
  Maven: 1.0.0-SNAPSHOT
  Package: 1.0.0
  ✓ Already in sync

Successfully synced 2 module(s)
All modules in sync ✓
```

Exit code: `0`

### Success - Synced from package.json to Maven

```
Syncing Maven and package.json versions...

Processing: demo-module-a
  Maven: 0.0.6-SNAPSHOT
  Package: 0.0.7
  → Updating Maven to 0.0.7-SNAPSHOT
  ✓ Synced (package.json → pom.xml)

Successfully synced 1 module(s)
```

Exit code: `0`

### Success - Synced from Maven to package.json

```
Syncing Maven and package.json versions...

Processing: demo-module-a
  Maven: 0.0.8-SNAPSHOT
  Package: 0.0.7
  → Updating package.json to 0.0.8
  ✓ Synced (pom.xml → package.json)

Successfully synced 1 module(s)
```

Exit code: `0`

### Success - Bidirectional Sync

```
Syncing Maven and package.json versions...

Processing: demo-module-a
  Maven: 0.0.6-SNAPSHOT
  Package: 0.0.7
  → Updating Maven to 0.0.7-SNAPSHOT
  ✓ Synced (package.json → pom.xml)

Processing: demo-module-b
  Maven: 1.1.0-SNAPSHOT
  Package: 1.0.0
  → Updating package.json to 1.1.0
  ✓ Synced (pom.xml → package.json)

Successfully synced 2 module(s)
```

Exit code: `0`

### Dry Run Output

```
Syncing Maven and package.json versions... (DRY RUN)

Processing: demo-module-a
  Maven: 0.0.6-SNAPSHOT
  Package: 0.0.7
  → Would update Maven to 0.0.7-SNAPSHOT
  [DRY RUN] No changes applied

Processing: demo-module-b
  Maven: 1.0.0-SNAPSHOT
  Package: 1.0.0
  ✓ Already in sync

Dry run complete - no changes applied
```

Exit code: `0`

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

**Invalid version:**
```
Processing: demo-module-a
  Error: Invalid version in package.json: 'not-a-version'
  Skipping module

Failed to sync 1 module(s)
```
Exit code: `1`

## Version Synchronization Rules

### Format Handling

| Maven Version | package.json Version | Result |
|---------------|---------------------|--------|
| `0.0.6-SNAPSHOT` | `0.0.6` | No change (in sync) |
| `0.0.7-SNAPSHOT` | `0.0.6` | package.json → `0.0.7` |
| `0.0.6-SNAPSHOT` | `0.0.7` | Maven → `0.0.7-SNAPSHOT` |
| `1.0.0` | `0.0.6` | package.json → `1.0.0` |

### Source Preference

**Auto-detect (default)**:
- Uses newer version (semver comparison)
- If equal, no sync needed

**Explicit source**:
```bash
# Always use Maven as source of truth
pnpm maven:sync --source maven

# Always use package.json as source of truth
pnpm maven:sync --source package
```

### SNAPSHOT Handling

Maven `-SNAPSHOT` suffix is automatically:
- **Added** when syncing to `pom.xml`
- **Removed** when syncing to `package.json`

## Workflow Integration

### After Changeset Version Bump

```yaml
# .github/workflows/version-and-publish.yml
- name: Version changed modules
  run: |
    pnpm changeset version
    pnpm maven:sync
```

Changeset updates `package.json` → `maven:sync` updates `pom.xml`

### Before Maven Build

```bash
# Ensure versions in sync before build
pnpm maven:sync
mvn clean install
```

### In Pre-Commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Auto-sync versions
pnpm maven:sync

# Add changes
git add */pom.xml */package.json
```

## Examples

### Example 1: After Changeset

```bash
# Create and apply changeset
pnpm changeset
pnpm changeset version

# Output: package.json updated 0.0.6 → 0.0.7

# Sync to Maven
pnpm maven:sync

# Output:
#   Processing: demo-module-a
#   → Updating Maven to 0.0.7-SNAPSHOT
#   ✓ Synced (package.json → pom.xml)
```

### Example 2: After mvn versions:set

```bash
# Update Maven version
mvn versions:set -DnewVersion=1.0.0 -pl demo-module-a

# Sync to package.json
pnpm maven:sync demo-module-a

# Output:
#   Processing: demo-module-a
#   → Updating package.json to 1.0.0
#   ✓ Synced (pom.xml → package.json)
```

### Example 3: Bulk Sync After Clone

```bash
# Clone repository
git clone https://github.com/user/repo.git
cd repo

# Install dependencies
pnpm install

# Sync all modules
pnpm maven:sync

# Verify
pnpm maven:status
```

### Example 4: Forced Direction

```bash
# Force Maven as source of truth
pnpm maven:sync --source maven

# All package.json files updated to match pom.xml

# Force package.json as source of truth
pnpm maven:sync --source package

# All pom.xml files updated to match package.json
```

## When to Run

Run `maven:sync`:

1. **After `changeset version`** - Sync package.json → pom.xml
2. **After `mvn versions:set`** - Sync pom.xml → package.json
3. **After git pull** - Sync any version discrepancies
4. **Before builds** - Ensure consistency
5. **In CI/CD** - After version bumps

## XML Preservation

The script preserves pom.xml formatting:

**Before:**
```xml
<project>
  <modelVersion>4.0.0</modelVersion>
  <artifactId>demo-module-a</artifactId>
  <version>0.0.6-SNAPSHOT</version>
  <!-- comments preserved -->
</project>
```

**After:**
```xml
<project>
  <modelVersion>4.0.0</modelVersion>
  <artifactId>demo-module-a</artifactId>
  <version>0.0.7-SNAPSHOT</version>
  <!-- comments preserved -->
</project>
```

## JSON Preservation

The script preserves package.json formatting:

**Before:**
```json
{
  "name": "@libs/demo-module-a",
  "version": "0.0.6",
  "private": true,
  "custom-field": "preserved"
}
```

**After:**
```json
{
  "name": "@libs/demo-module-a",
  "version": "0.0.7",
  "private": true,
  "custom-field": "preserved"
}
```

## Troubleshooting

### Issue: Sync keeps reverting

**Cause**: Version being updated by another process

**Solution**:
- Check for conflicting workflows
- Ensure only one source updates versions
- Use `--source` to enforce direction

### Issue: "Invalid version" error

**Cause**: Non-semver version in package.json

**Solution**:
- Ensure version follows: `X.Y.Z`
- No prefixes like `v1.0.0`
- No extra suffixes

### Issue: Changes not persisted

**Cause**: File permissions or write errors

**Solution**:
- Check file permissions: `ls -la */pom.xml`
- Ensure no files are locked
- Run with proper permissions

### Issue: Sync in wrong direction

**Cause**: Auto-detection choosing wrong source

**Solution**:
- Use explicit source: `--source maven` or `--source package`
- Check which version is actually newer

## Comparison with Other Scripts

| Feature | maven-sync.js | maven-status.js | maven-init.js |
|---------|--------------|-----------------|---------------|
| **Action** | Sync versions | Check status | Create package.json |
| **Modifies files** | Yes | No | Yes |
| **Direction** | Bidirectional | N/A | Maven → package.json |
| **Use case** | After version changes | Validation | New modules |

## Related Scripts

- **maven-status.js** - Check sync status before/after
- **maven-init.js** - Create initial package.json
- **changed-modules.js** - Identify modules needing sync
