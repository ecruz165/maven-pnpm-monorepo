# maven-parallel-build.js

Builds multiple Maven modules in parallel with configurable concurrency and dependency resolution.

## Purpose

Accelerates Maven builds by:
- Building independent modules concurrently
- Respecting Maven dependencies (`-am` also-make)
- Controlling parallelism to avoid resource exhaustion
- Providing real-time build progress and status

## Usage

### Basic Usage

```bash
# Build modules with default settings
node scripts/src/maven-parallel-build.js --modules "demo-module-a,demo-module-b"

# Specify Maven goal
node scripts/src/maven-parallel-build.js --modules "demo-module-a,demo-module-b" --goal install

# Control concurrency
node scripts/src/maven-parallel-build.js --modules "demo-module-a,demo-module-b" --max-parallel 2

# Skip tests
node scripts/src/maven-parallel-build.js --modules "demo-module-a,demo-module-b" --skip-tests
```

### Via pnpm Scripts

```bash
# Build all changed modules in parallel
pnpm build:parallel

# Custom invocation
pnpm -F @libs/scripts build:parallel --modules "demo-module-a" --goal clean
```

## Command-Line Options

| Option | Required | Description | Default |
|--------|----------|-------------|---------|
| `--modules <csv>` | ✅ | Comma-separated module list | None |
| `--goal <goal>` | ❌ | Maven goal to execute | `package` |
| `--max-parallel <n>` | ❌ | Max concurrent builds | `4` |
| `--skip-tests` | ❌ | Add `-DskipTests` flag | `false` |
| `--also-make` | ❌ | Build dependencies (`-am`) | `true` |
| `--timeout <ms>` | ❌ | Per-module timeout | `600000` (10min) |
| `--help` | ❌ | Show help message | - |

## How It Works

1. **Parse Modules**:
   - Splits CSV input into array
   - Validates each module exists

2. **Create Build Queue**:
   - Generates Maven command for each module
   - Includes dependency flag (`-am`) if enabled

3. **Execute in Parallel**:
   - Spawns up to `max-parallel` builds concurrently
   - Queues remaining modules
   - Streams output in real-time

4. **Monitor Progress**:
   - Tracks running/completed/failed builds
   - Reports status after each module completes

5. **Aggregate Results**:
   - Collects exit codes
   - Reports final summary

## Expected Output

### Success - All Modules

```
Building 3 module(s) in parallel (max 4 concurrent)
Goal: package
═══════════════════════════════════════════════════════════

[1/3] Building demo-module-a...
  Command: mvn -pl demo-module-a -am clean package

[2/3] Building demo-module-b...
  Command: mvn -pl demo-module-b -am clean package

[3/3] Building demo-module-c...
  Command: mvn -pl demo-module-c -am clean package

──────────────────────────────────────────────────────────

✓ demo-module-a completed (45.2s)
✓ demo-module-b completed (38.7s)
✓ demo-module-c completed (42.1s)

═══════════════════════════════════════════════════════════
Build Summary
───────────────────────────────────────────────────────────
Total: 3 modules
Success: 3 ✓
Failed: 0
Total time: 45.3s
═══════════════════════════════════════════════════════════
```

Exit code: `0`

### Success - With Skipped Tests

```
Building 2 module(s) in parallel (max 4 concurrent)
Goal: install
Options: -DskipTests
═══════════════════════════════════════════════════════════

[1/2] Building demo-module-a...
  Command: mvn -pl demo-module-a -am clean install -DskipTests

[2/2] Building demo-module-b...
  Command: mvn -pl demo-module-b -am clean install -DskipTests

──────────────────────────────────────────────────────────

✓ demo-module-a completed (23.4s)
✓ demo-module-b completed (21.8s)

═══════════════════════════════════════════════════════════
Build Summary
───────────────────────────────────────────────────────────
Total: 2 modules
Success: 2 ✓
Failed: 0
Total time: 23.5s
═══════════════════════════════════════════════════════════
```

Exit code: `0`

### Partial Failure

```
Building 3 module(s) in parallel (max 4 concurrent)
Goal: package
═══════════════════════════════════════════════════════════

[1/3] Building demo-module-a...
  Command: mvn -pl demo-module-a -am clean package

[2/3] Building demo-module-b...
  Command: mvn -pl demo-module-b -am clean package

[3/3] Building demo-module-c...
  Command: mvn -pl demo-module-c -am clean package

──────────────────────────────────────────────────────────

✓ demo-module-a completed (42.1s)
✗ demo-module-b failed (15.3s)
  Exit code: 1
  See: demo-module-b-build.log
✓ demo-module-c completed (38.9s)

═══════════════════════════════════════════════════════════
Build Summary
───────────────────────────────────────────────────────────
Total: 3 modules
Success: 2 ✓
Failed: 1 ✗
Total time: 42.2s
═══════════════════════════════════════════════════════════

Error: 1 module(s) failed to build
```

Exit code: `1`

### Error Scenarios

**Missing modules argument:**
```
Error: --modules argument is required
Usage: node maven-parallel-build.js --modules "module-a,module-b" [options]
```
Exit code: `1`

**Invalid module:**
```
Error: Module 'demo-module-x' not found
Valid modules: demo-module-a, demo-module-b, demo-module-c
```
Exit code: `1`

**Timeout:**
```
[1/1] Building demo-module-a...
  Command: mvn -pl demo-module-a -am clean package

✗ demo-module-a timed out (600.0s)
  Build exceeded timeout of 600000ms
```

Exit code: `1`

## Maven Commands Generated

### Default (package)
```bash
mvn -pl <module> -am clean package
```

### With goal
```bash
# --goal install
mvn -pl <module> -am clean install

# --goal test
mvn -pl <module> -am clean test

# --goal deploy
mvn -pl <module> -am clean deploy
```

### With skip-tests
```bash
mvn -pl <module> -am clean package -DskipTests
```

### Without also-make
```bash
# --also-make false
mvn -pl <module> clean package
```

## Concurrency Control

| max-parallel | Behavior | Use Case |
|--------------|----------|----------|
| `1` | Sequential (one at a time) | Debugging, low memory |
| `2` | Conservative parallel | Medium resources |
| `4` | Default parallel | Most scenarios |
| `8` | Aggressive parallel | High-end machines |
| `unlimited` | Not recommended | May exhaust resources |

**Memory Consideration**: Each Maven build can use 1-2GB RAM. Calculate:
```
Max Memory = max-parallel × 2GB
```

Example:
- `max-parallel 4` → ~8GB RAM needed
- `max-parallel 8` → ~16GB RAM needed

## Build Logs

Each module's output is saved to:
```
<module>-build.log
```

**Example structure:**
```
demo-module-a-build.log
demo-module-b-build.log
demo-module-c-build.log
```

Access logs:
```bash
# View successful build
cat demo-module-a-build.log

# View failed build
cat demo-module-b-build.log | grep -A 10 "BUILD FAILURE"
```

## Integration with Workflow

Used in `.github/workflows/version-and-publish.yml`:

```yaml
- name: Build changed modules in parallel
  run: |
    MODULES="${{ needs.detect-changes.outputs.changed-modules }}"
    node scripts/src/maven-parallel-build.js \
      --modules "$MODULES" \
      --max-parallel 4 \
      --goal install
```

## Examples

### Example 1: CI/CD Fast Build

```bash
# Build only changed modules, skip tests
CHANGED=$(node scripts/src/maven-changed-modules.js --csv)

node scripts/src/maven-parallel-build.js \
  --modules "$CHANGED" \
  --goal install \
  --skip-tests \
  --max-parallel 8
```

### Example 2: Local Development Build

```bash
# Build with tests, conservative parallelism
node scripts/src/maven-parallel-build.js \
  --modules "demo-module-a,demo-module-b" \
  --goal package \
  --max-parallel 2
```

### Example 3: Deploy to Repository

```bash
# Deploy specific modules
node scripts/src/maven-parallel-build.js \
  --modules "demo-module-a,demo-module-b" \
  --goal deploy \
  --skip-tests \
  --max-parallel 4
```

### Example 4: Test Only

```bash
# Run tests in parallel
node scripts/src/maven-parallel-build.js \
  --modules "demo-module-a,demo-module-b,demo-module-c" \
  --goal test \
  --max-parallel 6
```

### Example 5: Sequential Build (Debugging)

```bash
# Build one at a time
node scripts/src/maven-parallel-build.js \
  --modules "demo-module-a,demo-module-b" \
  --max-parallel 1
```

## Performance Comparison

**Sequential Build:**
```bash
mvn clean install
# Time: ~120s for 3 modules
```

**Parallel Build:**
```bash
node scripts/src/maven-parallel-build.js \
  --modules "demo-module-a,demo-module-b,demo-module-c" \
  --goal install \
  --max-parallel 4
# Time: ~45s for 3 modules
```

**Speedup**: ~2.7x faster

## Troubleshooting

### Issue: "Module not found"

**Cause**: Module name typo or doesn't exist

**Solution**:
- Check available modules: `ls -d */ | grep demo`
- Verify spelling matches directory name
- Ensure module has `pom.xml`

### Issue: Build hangs

**Cause**: Deadlock or infinite wait

**Solution**:
- Reduce `--max-parallel` to 1
- Check logs for stuck processes
- Increase `--timeout`
- Kill stuck processes: `pkill -f "mvn.*demo-module-a"`

### Issue: Out of memory errors

**Cause**: Too many concurrent builds

**Solution**:
- Reduce `--max-parallel`
- Increase system memory
- Use `--skip-tests` to reduce memory usage
- Set Maven memory: `export MAVEN_OPTS="-Xmx1024m"`

### Issue: Builds fail randomly

**Cause**: Race conditions in parallel builds

**Solution**:
- Reduce `--max-parallel`
- Enable `--also-make` to build dependencies
- Build sequentially: `--max-parallel 1`

### Issue: Cannot read build logs

**Cause**: Logs not written or wrong location

**Solution**:
- Check working directory: `pwd`
- Logs written to: `./` (current directory)
- Ensure write permissions
- Check disk space: `df -h .`

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MAVEN_OPTS` | JVM options for Maven | None |
| `MAVEN_HOME` | Maven installation path | Auto-detected |

**Example:**
```bash
export MAVEN_OPTS="-Xmx2048m -XX:MaxPermSize=512m"
node scripts/src/maven-parallel-build.js --modules "demo-module-a,demo-module-b"
```

## Related Scripts

- **maven-changed-modules.js** - Identifies which modules to build
- **maven-sync.js** - Syncs versions before build
- **maven-status.js** - Validates sync before build
