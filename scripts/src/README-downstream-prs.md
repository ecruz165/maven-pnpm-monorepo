# downstream-prs.js

Creates pull requests in downstream/dependent repositories when a module version is published.

## Purpose

Automates the process of updating dependencies in downstream repositories by:
1. Cloning the dependent repository
2. Updating version references (property-based or direct)
3. Creating a branch and commit
4. Pushing changes and creating a PR

## Usage

### Basic Usage

```bash
# Create downstream PR for a module version
node scripts/src/downstream-prs.js --module demo-module-a --version 0.0.6

# With SNAPSHOT suffix
node scripts/src/downstream-prs.js --module demo-module-a --version 0.0.6-SNAPSHOT

# Dry run (preview changes without creating PR)
node scripts/src/downstream-prs.js --module demo-module-a --version 0.0.6 --dry-run
```

### Via pnpm Scripts

```bash
# Run downstream PR automation (requires env vars)
pnpm downstream:prs
```

## Command-Line Options

| Option | Required | Description |
|--------|----------|-------------|
| `--module <name>` | ✅ | Module name (e.g., `demo-module-a`) |
| `--version <ver>` | ✅ | Version to update to (e.g., `0.0.6-SNAPSHOT`) |
| `--dry-run` | ❌ | Preview changes without creating PR |

## Configuration

Each module must have a `DEPENDENTS.yaml` file defining downstream repositories:

### Example: `demo-module-a/DEPENDENTS.yaml`

```yaml
dependents:
  - repo: ecruz165/maven-pnpm-monorepo-dependent-repo
    baseBranch: main
    files:
      - path: pom.xml
        # Property-based version reference
        search: '<demo-module-a\.version>[^<]+</demo-module-a\.version>'
        replace: '<demo-module-a.version>{{version}}</demo-module-a.version>'
```

### Configuration Options

**Repository Configuration:**
- `repo`: GitHub repository in `owner/repo` format
- `baseBranch`: Branch to create PR against (usually `main`)

**File Configuration:**
- `path`: Relative path to file in dependent repo
- `search`: Regex pattern to find version reference
- `replace`: Replacement string (use `{{version}}` placeholder)

## How It Works

1. **Read Configuration**:
   - Looks for `<module>/DEPENDENTS.yaml`
   - Parses list of dependent repositories

2. **Clone Repository**:
   - Clones or updates local copy to `/tmp/downstream-prs/<repo>`
   - Uses GitHub token for authentication

3. **Apply Changes**:
   - Searches for version patterns in specified files
   - Replaces with new version using template

4. **Create Branch & Commit**:
   - Branch name: `deps/update-<module>-<version>`
   - Commit author: `github-actions[bot]`
   - Commit message includes change summary

5. **Create Pull Request**:
   - Uses Octokit to create PR via GitHub API
   - Includes formatted description with changes

## Expected Output

### Success

```
Creating downstream PRs for demo-module-a v0.0.6-SNAPSHOT

Found 1 dependent(s)

Processing dependent: ecruz165/maven-pnpm-monorepo-dependent-repo
  Cloning repository https://github.com/ecruz165/maven-pnpm-monorepo-dependent-repo.git
  ✓ Modified pom.xml
  ✓ Pushed branch deps/update-demo-module-a-0.0.6-SNAPSHOT
  ✓ Created PR #1: https://github.com/ecruz165/maven-pnpm-monorepo-dependent-repo/pull/1

============================================================
Summary: 1 successful, 0 failed
============================================================
```

Exit code: `0`

### Dry Run Output

```
Creating downstream PRs for demo-module-a v0.0.6-SNAPSHOT

Found 1 dependent(s)

Processing dependent: ecruz165/maven-pnpm-monorepo-dependent-repo
  Cloning repository https://github.com/ecruz165/maven-pnpm-monorepo-dependent-repo.git
  ✓ Modified pom.xml
  [DRY RUN] Would create PR with changes:
    - Updated pom.xml

============================================================
Summary: 1 successful, 0 failed
============================================================
```

Exit code: `0`

### No Dependents

```
Creating downstream PRs for demo-module-a v0.0.6-SNAPSHOT

No dependents configured
```

Exit code: `0`

### Error Scenarios

**Missing arguments:**
```
Error: --module and --version are required
Usage: node downstream-prs.js --module demo-module-a --version 0.0.2
```
Exit code: `1`

**Missing GITHUB_TOKEN:**
```
Error: GITHUB_TOKEN environment variable is required
Set it with: export GITHUB_TOKEN=your_token_here
```
Exit code: `1`

**Permission denied:**
```
Processing dependent: ecruz165/maven-pnpm-monorepo-dependent-repo
  Cloning repository https://github.com/ecruz165/maven-pnpm-monorepo-dependent-repo.git
  Error creating/pushing branch: remote: Permission denied

============================================================
Summary: 0 successful, 1 failed
============================================================
```
Exit code: `1`

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | ✅ | GitHub Personal Access Token with `repo` scope |

**Important**: The default `GITHUB_TOKEN` in Actions only works for the current repo. For cross-repository PRs, you must use a Personal Access Token (PAT).

## Created Pull Request Format

### Title
```
chore(deps): update <module> to <version>
```

### Body
```markdown
## Summary

This PR updates the dependency `<module>` to version `<version>`.

## Changes

- Updated pom.xml

## Notes

This PR was automatically generated by the Maven PNPM monorepo downstream PR automation.

---
*Generated with ❤️ by [maven-pnpm-monorepo](https://github.com/ecruz165/maven-pnpm-monorepo)*
```

### Branch Name
```
deps/update-<module>-<version>
```

## Examples

### Example 1: Property-Based Version Update

**DEPENDENTS.yaml:**
```yaml
dependents:
  - repo: myorg/service-a
    baseBranch: main
    files:
      - path: pom.xml
        search: '<mylib\.version>[^<]+</mylib\.version>'
        replace: '<mylib.version>{{version}}</mylib.version>'
```

**Before (pom.xml):**
```xml
<properties>
    <mylib.version>1.0.0-SNAPSHOT</mylib.version>
</properties>
```

**Command:**
```bash
node scripts/src/downstream-prs.js --module mylib --version 1.1.0-SNAPSHOT
```

**After (pom.xml):**
```xml
<properties>
    <mylib.version>1.1.0-SNAPSHOT</mylib.version>
</properties>
```

### Example 2: Direct Dependency Update

**DEPENDENTS.yaml:**
```yaml
dependents:
  - repo: myorg/service-b
    baseBranch: develop
    files:
      - path: pom.xml
        search: '<version>[\d.]+</version>\s*<!--\s*demo-module-a\s*-->'
        replace: '<version>{{version}}</version> <!-- demo-module-a -->'
```

**Before:**
```xml
<dependency>
    <groupId>com.example</groupId>
    <artifactId>demo-module-a</artifactId>
    <version>0.0.5</version> <!-- demo-module-a -->
</dependency>
```

**After:**
```xml
<dependency>
    <groupId>com.example</groupId>
    <artifactId>demo-module-a</artifactId>
    <version>0.0.6</version> <!-- demo-module-a -->
</dependency>
```

### Example 3: Multiple File Updates

**DEPENDENTS.yaml:**
```yaml
dependents:
  - repo: myorg/multi-module-app
    baseBranch: main
    files:
      - path: pom.xml
        search: '<demo-module-a\.version>[^<]+</demo-module-a\.version>'
        replace: '<demo-module-a.version>{{version}}</demo-module-a.version>'
      - path: README.md
        search: 'demo-module-a:[\d.]+-SNAPSHOT'
        replace: 'demo-module-a:{{version}}'
```

Updates both `pom.xml` and `README.md` in one PR.

## Integration with Workflow

Used in `.github/workflows/version-and-publish.yml`:

```yaml
- name: Create downstream PRs for changed modules
  run: |
    for MODULE in ${{ needs.detect-changes.outputs.changed-modules }}; do
      VERSION=$(cat "$MODULE/package.json" | jq -r '.version')
      pnpm -F @libs/scripts downstream:prs --module "$MODULE" --version "${VERSION}-SNAPSHOT"
    done
  env:
    GITHUB_TOKEN: ${{ secrets.PAT_TOKEN }}
```

## Troubleshooting

### Issue: "Permission denied" when pushing

**Cause**: Default `GITHUB_TOKEN` doesn't have cross-repo permissions

**Solution**:
1. Create a PAT with `repo` scope
2. Add as repository secret `PAT_TOKEN`
3. Use in workflow: `GITHUB_TOKEN: ${{ secrets.PAT_TOKEN }}`

See `.github/PAT_SETUP.md` for detailed instructions.

### Issue: Pattern not matching

**Cause**: Regex search pattern doesn't match file content

**Solution**:
1. Test pattern locally with `--dry-run`
2. Use regex tester: https://regex101.com/
3. Escape special characters: `\.`, `\(`, `\)`
4. Use `[^<]+` for version matching

### Issue: "No dependents configured"

**Cause**: Missing or invalid `DEPENDENTS.yaml`

**Solution**:
1. Create `<module>/DEPENDENTS.yaml`
2. Validate YAML syntax
3. Ensure file is committed to repo

### Issue: PR already exists

**Cause**: Branch `deps/update-<module>-<version>` already exists

**Solution**:
1. Close/merge existing PR
2. Delete branch in dependent repo
3. Re-run script

## Security Considerations

1. **Token Scope**: PAT must have `repo` scope
2. **Token Storage**: Store in GitHub Secrets, never commit
3. **Repository Access**: Token grants access to all user repos
4. **Commit Attribution**: Uses `github-actions[bot]` identity

## Related Scripts

- **changed-modules.js** - Detects which modules need downstream PRs
- **maven-sync.js** - Ensures versions are synced before PR creation
