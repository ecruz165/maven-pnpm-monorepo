# AWS CodeBuild Setup

This directory contains the AWS CodeBuild configuration that mirrors `.github/workflows/ci.yml`.

## Overview

The `buildspec.yml` uses the same maven.js CLI commands as the GitHub Actions workflow:

| Command | Description |
|---------|-------------|
| `maven.js init` | Generate package.json from pom.xml |
| `maven.js status` | Check version alignment |
| `maven.js sync` | Sync versions between package.json and pom.xml |
| `maven.js changed` | Detect changed modules via git diff |
| `maven.js deps` | Show dependency tree |
| `maven.js build` | Build with dependency-aware parallel execution |
| `maven.js downstream` | Create PRs in downstream repos |

### Features

- **Change Detection** - Detects which modules changed using git diff
- **Dependency-Aware Builds** - Builds modules in correct order based on dependencies
- **Parallel Building** - Builds independent modules in parallel within each level
- **Testing** - Runs tests for changed modules
- **Versioning** - Applies changeset versions and syncs to Maven POMs
- **Publishing** - Deploys artifacts to GitHub Packages
- **Downstream PRs** - Creates pull requests in dependent repositories

## Prerequisites

### 1. AWS Account Setup

- AWS Account with appropriate permissions
- IAM role for CodeBuild with required permissions (see [IAM Permissions](#iam-permissions))
- VPC configuration (optional, for private resources)

### 2. Artifact Repository

**GitHub Packages**
- Uses existing GitHub Packages setup from pom.xml
- Requires GitHub token with `write:packages` scope
- No additional AWS configuration needed
- Artifacts available at: `https://maven.pkg.github.com/your-org/maven-pnpm-monorepo`

### 3. GitHub Token Storage

Store GitHub PAT in AWS Systems Manager Parameter Store:

```bash
aws ssm put-parameter \
  --name "/codebuild/maven-pnpm-monorepo/github-token" \
  --value "ghp_your_personal_access_token_here" \
  --type "SecureString" \
  --region us-east-1
```

Or use AWS Secrets Manager:

```bash
aws secretsmanager create-secret \
  --name codebuild/maven-pnpm-monorepo/github-token \
  --secret-string "ghp_your_personal_access_token_here" \
  --region us-east-1
```

## Quick Start

### Step 1: Create CodeBuild Project

#### Via AWS Console

1. Navigate to **AWS CodeBuild** → **Build projects** → **Create build project**

2. **Project configuration**
   - Project name: `maven-pnpm-monorepo-build`
   - Description: "Multi-module Maven monorepo with selective building"

3. **Source**
   - Source provider: **GitHub**
   - Repository: `https://github.com/your-org/maven-pnpm-monorepo`
   - Webhook events:
     - ✅ PUSH (for main branch)
     - ✅ PULL_REQUEST (for validation)

4. **Environment**
   - Environment image: **Managed image**
   - Operating system: **Amazon Linux 2023**
   - Runtime: **Standard**
   - Image: `aws/codebuild/amazonlinux2-x86_64-standard:5.0`
   - Privileged mode: **Disabled**
   - Service role: **New service role** or existing role with permissions

5. **Buildspec**
   - Build specifications: **Use a buildspec file**
   - Buildspec name: `.aws/buildspec.yml`

6. **Artifacts**
   - Type: **Amazon S3** (optional)
   - Bucket: `your-build-artifacts-bucket`
   - Name: `build-artifacts`
   - Artifacts packaging: **Zip**

7. **Logs**
   - CloudWatch Logs: **Enabled**
   - Group name: `/aws/codebuild/maven-pnpm-monorepo`

#### Via AWS CLI

```bash
aws codebuild create-project \
  --name maven-pnpm-monorepo-build \
  --source type=GITHUB,location=https://github.com/your-org/maven-pnpm-monorepo.git \
  --artifacts type=S3,location=your-build-artifacts-bucket \
  --environment type=LINUX_CONTAINER,image=aws/codebuild/amazonlinux2-x86_64-standard:5.0,computeType=BUILD_GENERAL1_MEDIUM \
  --service-role arn:aws:iam::account-id:role/CodeBuildServiceRole \
  --buildspec .aws/buildspec.yml \
  --region us-east-1
```

#### Via Terraform

See `terraform/codebuild/` directory for complete Terraform configuration.

### Step 2: Configure Webhooks

Enable automatic builds on code changes:

```bash
aws codebuild create-webhook \
  --project-name maven-pnpm-monorepo-build \
  --filter-groups '[[{"type":"EVENT","pattern":"PUSH"},{"type":"HEAD_REF","pattern":"^refs/heads/main$"}]]' \
  --region us-east-1
```

This triggers builds on:
- Pushes to `main` branch
- Pull request updates (optional, add separate filter group)

### Step 3: Verify Maven Settings

Your `pom.xml` should already have GitHub Packages configured:

```xml
<distributionManagement>
  <repository>
    <id>github</id>
    <name>GitHub Packages</name>
    <url>https://maven.pkg.github.com/your-org/maven-pnpm-monorepo</url>
  </repository>
</distributionManagement>
```

The buildspec automatically authenticates using the `GITHUB_TOKEN` from Parameter Store. No additional Maven settings required!

## Build Configuration

### Environment Variables

Set in CodeBuild project environment:

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `SKIP_TESTS` | Skip test execution | `false` | No |
| `MAX_PARALLEL_BUILDS` | Max concurrent Maven builds | `2` | No |
| `JAVA_VERSION` | Java version | `21` | No |
| `NODE_VERSION` | Node.js version | `20` | No |
| `PNPM_VERSION` | pnpm version | `9` | No |
| `GITHUB_TOKEN` | GitHub PAT (from Parameter Store) | - | Yes |

### Compute Resources

Recommended compute types based on project size:

| Project Size | Compute Type | vCPUs | Memory | Est. Build Time |
|--------------|--------------|-------|--------|-----------------|
| Small (1-3 modules) | `BUILD_GENERAL1_SMALL` | 3 | 3 GB | 2-5 min |
| Medium (4-10 modules) | `BUILD_GENERAL1_MEDIUM` | 7 | 15 GB | 3-8 min |
| Large (10+ modules) | `BUILD_GENERAL1_LARGE` | 15 | 30 GB | 5-15 min |

### Build Phases

The buildspec defines 4 phases:

#### 1. Install Phase
- Configures git for changeset operations
- Installs GitHub CLI for downstream PRs
- Authenticates with GitHub

#### 2. Pre-Build Phase
- Installs pnpm for change detection (Docker mode)
- Detects changed modules using `maven.js changed --csv`
- Sets `SKIP_BUILD=true` if no changes detected
- Exports `CHANGED_MODULES` for build phase

#### 3. Build Phase (Docker Mode)
- Builds `Dockerfile.ci` with BuildKit
- Uses `--target build` for compilation
- Passes `MODULES`, `SKIP_TESTS`, `MAVEN_GOAL` as build args
- Extracts artifacts from container to host
- Runs tests using `--target test` (if not skipped)
- Extracts test reports (surefire-reports) from container

#### 3. Build Phase (Native Mode)
- Runs `maven.js build` directly on host
- Parallel builds with colored output
- Uses Maven wrapper (`./mvnw`)

#### 4. Post-Build Phase
- Applies changeset versions
- Syncs package.json ↔ pom.xml using `maven.js sync`
- Commits version changes
- Publishes artifacts using `./mvnw deploy`
- Creates downstream PRs using `maven.js downstream`

### Caching

**Docker Build Mode:**
- Docker layer cache (`/var/lib/docker/`)
- BuildKit cache mounts for Maven and pnpm (inside container)

**Native Build Mode:**
- Maven local repository (`.m2/repository/`)
- Node.js modules (`node_modules/`)
- pnpm store (`.pnpm-store/`)

This reduces build time by **50-70%** on subsequent builds.

## IAM Permissions

### CodeBuild Service Role

Required permissions for the CodeBuild service role:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:log-group:/aws/codebuild/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:GetObjectVersion",
        "s3:GetBucketLocation"
      ],
      "Resource": [
        "arn:aws:s3:::your-build-artifacts-bucket/*",
        "arn:aws:s3:::codepipeline-*/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParameters"
      ],
      "Resource": "arn:aws:ssm:*:*:parameter/codebuild/maven-pnpm-monorepo/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "codeartifact:GetAuthorizationToken",
        "codeartifact:ReadFromRepository",
        "codeartifact:PublishPackageVersion"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "sts:GetServiceBearerToken"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "sts:AWSServiceName": "codeartifact.amazonaws.com"
        }
      }
    }
  ]
}
```

### Terraform IAM Configuration

See `terraform/codebuild/iam.tf` for complete IAM role and policy definitions.

## Triggering Builds

### Automatic Triggers

Builds automatically trigger on:
- Push to `main` branch (via webhook)
- Pull request creation/update (optional)

### Manual Triggers

#### Via AWS Console
1. Navigate to CodeBuild project
2. Click **Start build**
3. Optionally override environment variables or buildspec

#### Via AWS CLI
```bash
aws codebuild start-build \
  --project-name maven-pnpm-monorepo-build \
  --region us-east-1
```

With environment variable overrides:
```bash
aws codebuild start-build \
  --project-name maven-pnpm-monorepo-build \
  --environment-variables-override \
    name=MAX_PARALLEL_BUILDS,value=8,type=PLAINTEXT \
  --region us-east-1
```

### Scheduled Builds

Create EventBridge rule for nightly builds:

```bash
aws events put-rule \
  --name nightly-maven-build \
  --schedule-expression "cron(0 2 * * ? *)" \
  --region us-east-1

aws events put-targets \
  --rule nightly-maven-build \
  --targets "Id"="1","Arn"="arn:aws:codebuild:region:account-id:project/maven-pnpm-monorepo-build" \
  --region us-east-1
```

## Monitoring and Debugging

### CloudWatch Logs

View build logs in CloudWatch:

```bash
aws logs tail /aws/codebuild/maven-pnpm-monorepo --follow
```

### Build Artifacts

Download build artifacts for debugging:

```bash
aws s3 cp s3://your-build-artifacts-bucket/build-artifacts-latest.zip . --recursive
```

### Metrics and Alarms

Key metrics to monitor:
- Build duration (`Duration`)
- Build success rate (`SucceededBuilds` / `Builds`)
- Test pass rate (from test reports)

Create CloudWatch alarm for build failures:

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name maven-build-failures \
  --alarm-description "Alert on CodeBuild failures" \
  --metric-name FailedBuilds \
  --namespace AWS/CodeBuild \
  --statistic Sum \
  --period 300 \
  --evaluation-periods 1 \
  --threshold 1 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=ProjectName,Value=maven-pnpm-monorepo-build
```

## Comparison: GitHub Actions vs CodeBuild

| Feature | GitHub Actions | AWS CodeBuild |
|---------|----------------|---------------|
| **Hosting** | GitHub-managed | AWS-managed |
| **Pricing** | 2,000 min/month free | $0.005/min (Linux) |
| **Compute** | 2-core, 7GB RAM | Configurable (3-15 vCPU) |
| **Caching** | GitHub cache | S3 + local cache |
| **Secrets** | GitHub secrets | Parameter Store / Secrets Manager |
| **Artifacts** | GitHub artifacts | S3 |
| **Integration** | Native GitHub | Requires webhook |
| **Private VPC** | ❌ Not supported | ✅ Supported |
| **Custom Images** | Limited | Full Docker support |

## Migration from GitHub Actions

### Step-by-Step Migration

1. **Create CodeBuild project** (see [Quick Start](#quick-start))
2. **Store GitHub token** in Parameter Store
3. **Test build manually** to verify functionality
4. **Enable webhook** for automatic triggers
5. **Disable GitHub Actions** (optional):
   ```bash
   # Rename workflow to disable it
   mv .github/workflows/version-and-publish.yml .github/workflows/version-and-publish.yml.disabled
   ```
6. **Monitor first production build**
7. **Clean up GitHub Actions artifacts** (optional)

### Rollback Plan

If issues occur, quickly rollback:

```bash
# Re-enable GitHub Actions
mv .github/workflows/version-and-publish.yml.disabled .github/workflows/version-and-publish.yml
git add .github/workflows/
git commit -m "chore: re-enable GitHub Actions"
git push origin main
```

## Troubleshooting

### Build Fails with "No modules changed"

**Cause**: Git history not available or incorrect branch

**Solution**:
```yaml
# Add to buildspec.yml pre_build
- git fetch --unshallow || true
- git config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'
- git fetch origin
```

### "Permission denied" for Parameter Store

**Cause**: IAM role missing SSM permissions

**Solution**: Add `ssm:GetParameter` to service role (see [IAM Permissions](#iam-permissions))

### Downstream PR Creation Fails

**Cause**: GitHub token expired or lacks permissions

**Solution**:
1. Generate new PAT with `repo` scope
2. Update Parameter Store value
3. Restart build

### Build Times Too Long

**Solutions**:
- Increase compute type (e.g., `BUILD_GENERAL1_LARGE`)
- Enable S3 cache for Maven repository
- Reduce `MAX_PARALLEL_BUILDS` to avoid resource contention
- Use custom Docker image with pre-installed dependencies

## Advanced Configuration

### Custom Docker Image

Create custom image with pre-installed tools:

```dockerfile
# .aws/Dockerfile
FROM public.ecr.aws/docker/library/amazoncorretto:21

# Install Node.js and pnpm
RUN curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - && \
    yum install -y nodejs && \
    corepack enable && \
    corepack prepare pnpm@9 --activate

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/rpm/gh-cli.repo | tee /etc/yum.repos.d/github-cli.repo && \
    yum install -y gh

# Pre-cache common Maven dependencies
COPY pom.xml /tmp/
RUN cd /tmp && mvn dependency:go-offline || true

ENTRYPOINT ["/bin/bash"]
```

Build and push:
```bash
docker build -t maven-pnpm-build:latest .aws/
aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_REGISTRY
docker tag maven-pnpm-build:latest $ECR_REGISTRY/maven-pnpm-build:latest
docker push $ECR_REGISTRY/maven-pnpm-build:latest
```

Update buildspec:
```yaml
environment:
  type: LINUX_CONTAINER
  image: $ECR_REGISTRY/maven-pnpm-build:latest
  computeType: BUILD_GENERAL1_MEDIUM
```

### VPC Configuration

For private resources (e.g., private CodeArtifact):

```yaml
vpcConfig:
  vpcId: vpc-xxxxx
  subnets:
    - subnet-xxxxx
    - subnet-yyyyy
  securityGroupIds:
    - sg-xxxxx
```

### Notifications

Set up SNS notifications for build status:

```bash
aws codebuild update-project \
  --name maven-pnpm-monorepo-build \
  --notifications-config notificationArn=arn:aws:sns:region:account-id:codebuild-notifications
```

## Cost Optimization

### Strategies

1. **Right-size compute resources**
   - Start with `BUILD_GENERAL1_SMALL`
   - Scale up only if builds timeout

2. **Use caching aggressively**
   - Cache Maven repository
   - Cache Node.js modules
   - Saves ~50% build time

3. **Selective building**
   - Only build changed modules (already implemented)
   - Reduces build minutes by 70-90%

4. **Scheduled builds during off-peak**
   - Use EventBridge for nightly builds
   - Avoid peak hours (9am-5pm)

### Cost Estimation

Example monthly costs:

| Scenario | Builds/Month | Avg Duration | Compute Type | Est. Cost |
|----------|--------------|--------------|--------------|-----------|
| Small team | 100 | 5 min | SMALL | $2.50 |
| Medium team | 500 | 8 min | MEDIUM | $20.00 |
| Large team | 2000 | 12 min | LARGE | $120.00 |

## Related Documentation

- [AWS CodeBuild Documentation](https://docs.aws.amazon.com/codebuild/)
- [Buildspec Reference](https://docs.aws.amazon.com/codebuild/latest/userguide/build-spec-ref.html)
- [Project Root README](../README.md)
- [Scripts Documentation](../scripts/README.md)
- [GitHub Actions Workflow](../.github/WORKFLOW_SEQUENCE.md)

## Support

For issues or questions:
- Check [Troubleshooting](#troubleshooting) section
- Review CloudWatch Logs
- Contact DevOps team

---

**Note**: This configuration replicates GitHub Actions functionality. For production use, thoroughly test builds and adjust compute resources based on actual performance.
