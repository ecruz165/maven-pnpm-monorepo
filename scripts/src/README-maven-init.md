# maven-init.js

Initializes `package.json` files for Maven modules to enable pnpm workspace integration and changesets.

## Purpose

Creates or updates `package.json` files for Maven modules, extracting metadata from `pom.xml` and configuring them for:
- pnpm workspace integration
- Changeset version management
- Build/test/deploy scripts

## Usage

### Basic Usage

```bash
# Initialize all modules
node scripts/src/maven-init.js

# Initialize specific module
node scripts/src/maven-init.js demo-module-a

# Force overwrite existing package.json
node scripts/src/maven-init.js --force
```

### Via pnpm Scripts

```bash
# Initialize all modules
pnpm maven:init

# Initialize specific module
pnpm maven:init demo-module-a
```

## Command-Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `<module>` | Specific module to initialize | All modules |
| `--force` | Overwrite existing package.json | `false` |
| `--help` | Show help message | - |

## How It Works

1. **Scan for Modules**:
   - Finds all directories with `pom.xml` files
   - Excludes root directory

2. **Extract Maven Metadata**:
   - Parses `pom.xml` using xml2js
   - Extracts: groupId, artifactId, version, packaging

3. **Generate package.json**:
   - Creates npm-compatible package name: `@libs/<artifactId>`
   - Sets version from Maven (strips `-SNAPSHOT`)
   - Marks as private (not for npm publish)
   - Adds Maven build scripts

4. **Preserve Existing**:
   - Skips modules with existing `package.json` unless `--force`
   - Preserves custom scripts and dependencies

## Generated package.json Format

```json
{
  "name": "@libs/demo-module-a",
  "version": "0.0.6",
  "private": true,
  "description": "Demo Module A - Testing selective versioning",
  "maven": {
    "groupId": "com.example",
    "artifactId": "demo-module-a",
    "packaging": "jar"
  },
  "scripts": {
    "build": "cd .. && mvn -pl demo-module-a -am clean package -DskipTests",
    "test": "cd .. && mvn -pl demo-module-a test",
    "deploy": "cd .. && mvn -pl demo-module-a -am clean deploy -DskipTests"
  }
}
```

## Expected Output

### Success - New Modules

```
Initializing Maven modules with package.json...

Processing: demo-module-a
  ✓ Created package.json
  Name: @libs/demo-module-a
  Version: 0.0.6

Processing: demo-module-b
  ✓ Created package.json
  Name: @libs/demo-module-b
  Version: 1.0.0

Successfully initialized 2 module(s)
```

Exit code: `0`

### Success - No Changes Needed

```
Initializing Maven modules with package.json...

Processing: demo-module-a
  ℹ Skipping (package.json exists, use --force to overwrite)

Processing: demo-module-b
  ℹ Skipping (package.json exists, use --force to overwrite)

Successfully initialized 0 module(s)
```

Exit code: `0`

### Success - Force Overwrite

```
Initializing Maven modules with package.json...

Processing: demo-module-a
  ✓ Updated package.json (forced)
  Name: @libs/demo-module-a
  Version: 0.0.7

Successfully initialized 1 module(s)
```

Exit code: `0`

### Error Scenarios

**No modules found:**
```
Error: No Maven modules found in the repository
```
Exit code: `1`

**Invalid pom.xml:**
```
Processing: demo-module-a
  ✗ Error reading pom.xml: Unexpected token <

Failed to initialize 1 module(s)
```
Exit code: `1`

## Package Naming Convention

Maven modules are mapped to npm scoped packages:

| Maven artifactId | NPM package name |
|------------------|------------------|
| `demo-module-a` | `@libs/demo-module-a` |
| `core-utils` | `@libs/core-utils` |
| `api-gateway` | `@libs/api-gateway` |

The `@libs` scope keeps them namespaced and prevents npm publish conflicts.

## Build Scripts

### build
```bash
cd .. && mvn -pl <module> -am clean package -DskipTests
```
- `-pl <module>`: Build only this module
- `-am`: Build dependencies (also-make)
- `-DskipTests`: Skip test execution

### test
```bash
cd .. && mvn -pl <module> test
```
- Runs tests for this module only

### deploy
```bash
cd .. && mvn -pl <module> -am clean deploy -DskipTests
```
- Deploys module and dependencies to repository

## Integration with Changesets

After running `maven:init`, you can use changesets:

```bash
# Create a changeset
pnpm changeset

# Select module
? Which packages would you like to include?
  › @libs/demo-module-a

# Choose version bump
? What kind of change is this for @libs/demo-module-a?
  › patch (0.0.6 → 0.0.7)

# Add description
Summary: Add new feature
```

## Examples

### Example 1: New Module Setup

```bash
# Create new Maven module
mkdir demo-module-c
cd demo-module-c

# Create pom.xml
cat > pom.xml << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<project>
  <modelVersion>4.0.0</modelVersion>
  <parent>
    <groupId>com.example</groupId>
    <artifactId>maven-pnpm-monorepo</artifactId>
    <version>1.0.0</version>
  </parent>
  <artifactId>demo-module-c</artifactId>
  <version>0.0.1-SNAPSHOT</version>
</project>
EOF

# Initialize package.json
cd ..
pnpm maven:init demo-module-c

# Output:
#   ✓ Created package.json
#   Name: @libs/demo-module-c
#   Version: 0.0.1
```

### Example 2: Bulk Initialization

```bash
# Initialize all modules in monorepo
pnpm maven:init

# Verify pnpm workspace
pnpm list --depth 0

# Output:
#   @libs/monorepo
#   ├── @libs/demo-module-a@0.0.6
#   ├── @libs/demo-module-b@1.0.0
#   └── @libs/demo-module-c@0.0.1
```

### Example 3: Update After Maven Version Change

```bash
# Update Maven version
mvn versions:set -DnewVersion=1.0.0 -pl demo-module-a

# Force update package.json
pnpm maven:init demo-module-a --force

# Output:
#   ✓ Updated package.json (forced)
#   Version: 1.0.0
```

## When to Run

Run `maven:init` when:

1. **Adding new modules** to the monorepo
2. **Setting up repository** for the first time
3. **After version changes** in `pom.xml` (though `maven:sync` is better)
4. **CI/CD workflows** to ensure package.json exists

## Integration with Workflow

Used in `.github/workflows/version-and-publish.yml`:

```yaml
- name: Ensure all modules have package.json
  run: pnpm maven:init
```

This ensures all modules have `package.json` before changeset version bumping.

## Comparison with maven-sync.js

| Feature | maven-init.js | maven-sync.js |
|---------|---------------|---------------|
| **Purpose** | Create package.json | Sync versions |
| **When to use** | New modules | After version bumps |
| **Overwrites** | Only with --force | Always syncs version |
| **Direction** | Maven → package.json | Maven ↔ package.json |

**Rule of thumb**:
- Use `maven:init` once per module
- Use `maven:sync` after every version change

## Troubleshooting

### Issue: "Error reading pom.xml"

**Cause**: Malformed XML in `pom.xml`

**Solution**:
- Validate XML syntax
- Check for unclosed tags
- Ensure UTF-8 encoding

### Issue: Wrong version in package.json

**Cause**: `-SNAPSHOT` suffix handling

**Solution**:
- Maven: `0.0.1-SNAPSHOT`
- package.json: `0.0.1` (no suffix)
- This is intentional for npm compatibility

### Issue: Missing module in pnpm workspace

**Cause**: Module not in workspace configuration

**Solution**:
1. Add to root `package.json`:
   ```json
   "workspaces": ["demo-module-*"]
   ```
2. Run `pnpm install`

## Related Scripts

- **maven-sync.js** - Syncs versions between Maven and pnpm
- **maven-status.js** - Shows sync status
- **changed-modules.js** - Detects which modules changed
