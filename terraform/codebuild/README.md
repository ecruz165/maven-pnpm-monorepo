# AWS CodeBuild Infrastructure

This Terraform configuration provisions AWS CodeBuild for building Maven modules from GitHub and publishing to CodeArtifact.

## Architecture

```
GitHub Repository → CodeBuild (Maven Build) → CodeArtifact (Artifact Storage)
```

## Resources Created

- **CodeBuild Project**: Build execution environment
- **IAM Role**: Service role for CodeBuild with permissions for:
  - CloudWatch Logs
  - CodeArtifact (read & publish)
  - Secrets Manager (GitHub token)
  - S3 (cache, if enabled)
- **CloudWatch Log Group**: Build execution logs
- **GitHub Webhook**: Automatic build triggers
- **S3 Bucket** (optional): Build cache storage

## Prerequisites

### 1. CodeArtifact Setup

CodeArtifact must be provisioned first:

```bash
cd ../codeartifact
terraform apply
```

### 2. GitHub Personal Access Token

Create a GitHub token with `repo` permissions and store it in AWS Secrets Manager:

```bash
# Create secret in AWS Secrets Manager
aws secretsmanager create-secret \
  --name github-token \
  --description "GitHub personal access token for CodeBuild" \
  --secret-string "ghp_your_token_here" \
  --region us-east-1
```

**Required GitHub Token Scopes:**
- `repo` - Full control of private repositories
- `admin:repo_hook` - Full control of repository hooks (for webhooks)

### 3. Get CodeArtifact Values

Get values from CodeArtifact Terraform:

```bash
cd ../codeartifact
export CODEARTIFACT_DOMAIN=$(terraform output -raw domain_name)
export CODEARTIFACT_REPO=$(terraform output -raw repository_name)
export CODEARTIFACT_DOMAIN_OWNER=$(terraform output -raw domain_owner)
```

## Quick Start

### 1. Create terraform.tfvars

```hcl
# Required variables
github_repo_url           = "https://github.com/your-username/maven-pnpm-monorepo.git"
codeartifact_domain       = "maven-pnpm-monorepo"
codeartifact_repository   = "maven-pnpm-repo"
codeartifact_domain_owner = "123456789012"

# Optional customizations
github_branch             = "main"
github_token_secret_name  = "github-token"
build_compute_type        = "BUILD_GENERAL1_SMALL"
build_timeout_minutes     = 60
enable_webhook            = true
cache_type                = "LOCAL"
```

### 2. Initialize and Apply

```bash
cd terraform/codebuild
terraform init
terraform plan
terraform apply
```

### 3. Configure GitHub Webhook (if enabled)

The webhook is automatically configured! Verify in your GitHub repo:

```
Settings → Webhooks → Check for AWS CodeBuild webhook
```

### 4. Trigger a Build

**Option 1: Push to GitHub** (if webhook enabled)
```bash
git push origin main
```

**Option 2: Manual trigger via AWS CLI**
```bash
aws codebuild start-build --project-name maven-pnpm-monorepo
```

**Option 3: AWS Console**
```
CodeBuild → Build projects → maven-pnpm-monorepo → Start build
```

## Configuration

### Compute Types & Pricing

| Type | vCPUs | Memory | Storage | Price per Minute |
|------|-------|--------|---------|------------------|
| `BUILD_GENERAL1_SMALL` | 2 | 3 GB | 50 GB | $0.005 |
| `BUILD_GENERAL1_MEDIUM` | 4 | 7 GB | 100 GB | $0.01 |
| `BUILD_GENERAL1_LARGE` | 8 | 15 GB | 200 GB | $0.02 |
| `BUILD_GENERAL1_2XLARGE` | 72 | 145 GB | 824 GB | $0.15 |

**Recommendation**: Start with `SMALL`, upgrade if builds timeout or need more memory.

### Build Images

Default: `aws/codebuild/standard:7.0`

**Includes:**
- Java 21 (Corretto)
- Node.js 20
- Maven 3.9.x
- Git, Docker, AWS CLI

**Other options:**
- `aws/codebuild/standard:6.0` - Java 17, Node 18
- `aws/codebuild/amazonlinux2-x86_64-standard:5.0` - Amazon Linux 2

### Cache Configuration

**LOCAL (default, recommended):**
```hcl
cache_type = "LOCAL"
cache_modes = [
  "LOCAL_MAVEN_LOCAL_REPOSITORY",  # Maven .m2 cache
  "LOCAL_CUSTOM_CACHE"              # Custom cache
]
```

**S3 (for distributed caching):**
```hcl
cache_type = "S3"
```

**NO_CACHE:**
```hcl
cache_type = "NO_CACHE"
```

### Webhook Filters

Default triggers builds on:
- Push to `main` or `develop` branches
- Pull requests

**Custom filters:**
```hcl
webhook_filter_groups = [
  {
    type    = "EVENT"
    pattern = "PUSH"
  },
  {
    type    = "HEAD_REF"
    pattern = "^refs/heads/main$"
  }
]
```

## Build Process

### Build Phases (buildspec.yml)

1. **Install**: Install Java, Node.js, pnpm
2. **Pre-build**: Configure CodeArtifact authentication
3. **Build**: Run `mvn clean install` and tests
4. **Post-build**: Deploy artifacts with `mvn deploy`

### Environment Variables

Automatically configured:
- `AWS_REGION`
- `CODEARTIFACT_DOMAIN`
- `CODEARTIFACT_DOMAIN_OWNER`
- `CODEARTIFACT_REPO`
- `CODEARTIFACT_URL`

**Add custom variables:**
```hcl
environment_variables = [
  {
    name  = "JAVA_OPTS"
    value = "-Xmx2048m"
    type  = "PLAINTEXT"
  },
  {
    name  = "DATABASE_URL"
    value = "my-secret:db-url::"
    type  = "SECRETS_MANAGER"
  }
]
```

## Monitoring & Logs

### CloudWatch Logs

View build logs:
```bash
aws logs tail /aws/codebuild/maven-pnpm-monorepo --follow
```

Or in AWS Console:
```
CloudWatch → Log groups → /aws/codebuild/maven-pnpm-monorepo
```

### Build Badge

Add to README.md:
```markdown
![Build Status](https://codebuild.us-east-1.amazonaws.com/badges?uuid=<badge-uuid>)
```

Get badge URL:
```bash
terraform output build_badge_url
```

### Test Reports

Test results are automatically captured from:
- `*/target/surefire-reports/*.xml`

View in:
```
CodeBuild → Build projects → Reports
```

## Cost Optimization

### Estimated Monthly Costs

**Small project (10 builds/month, 10 min each):**
- Build minutes: 10 × 10 = 100 min × $0.005 = **$0.50**
- Logs: ~100 MB × $0.03/GB = **$0.003**
- **Total: ~$0.50/month**

**Active development (100 builds/month, 10 min each):**
- Build minutes: 100 × 10 = 1,000 min × $0.005 = **$5.00**
- Logs: ~1 GB × $0.03/GB = **$0.03**
- **Total: ~$5/month**

### Cost Reduction Tips

1. **Use LOCAL cache** (free vs S3 costs)
2. **Optimize build time**:
   - Use smaller Maven goals (`install` vs `package`)
   - Skip tests in install, run separately
   - Use parallel builds: `mvn -T 1C`
3. **Set shorter log retention** (7 days vs 30)
4. **Use smaller compute type** if sufficient

## Troubleshooting

### Build Fails: "Access Denied" to CodeArtifact

**Cause**: IAM role lacks permissions

**Fix**: Verify IAM role has CodeArtifact policies:
```bash
aws iam get-role-policy \
  --role-name maven-pnpm-monorepo-codebuild-role \
  --policy-name maven-pnpm-monorepo-codebuild-codeartifact-policy
```

### Build Fails: "Cannot connect to GitHub"

**Cause**: GitHub token invalid or expired

**Fix**: Update token in Secrets Manager:
```bash
aws secretsmanager update-secret \
  --secret-id github-token \
  --secret-string "ghp_new_token_here"
```

### Webhook Not Triggering

**Cause**: Webhook not created or filters incorrect

**Fix 1**: Check webhook exists:
```bash
terraform output webhook_url
```

**Fix 2**: Verify GitHub webhook in repo settings

**Fix 3**: Check webhook filters match your branch/events

### Build Timeout

**Cause**: Build exceeds timeout limit

**Fix**: Increase timeout or use larger compute type:
```hcl
build_timeout_minutes = 120
build_compute_type    = "BUILD_GENERAL1_MEDIUM"
```

## Security Best Practices

1. **Secrets Management**:
   - Store tokens in Secrets Manager
   - Use IAM roles, not access keys
   - Rotate secrets regularly

2. **IAM Permissions**:
   - Use least privilege
   - Separate build and deploy roles
   - Audit CloudTrail logs

3. **Code Security**:
   - Enable SAST scanning (add to buildspec.yml)
   - Scan dependencies for vulnerabilities
   - Sign artifacts

4. **Network Security**:
   - Use VPC for builds if accessing private resources
   - Enable VPC endpoints for AWS services

## Advanced Usage

### Multi-Branch Builds

Create separate projects for different branches:

```hcl
module "codebuild_main" {
  source        = "./codebuild"
  github_branch = "main"
  project_name  = "maven-pnpm-monorepo-main"
}

module "codebuild_develop" {
  source        = "./codebuild"
  github_branch = "develop"
  project_name  = "maven-pnpm-monorepo-develop"
}
```

### Docker Builds

Enable privileged mode:
```hcl
privileged_mode = true
```

### VPC Configuration

Add VPC config for private resources:
```hcl
vpc_config {
  vpc_id             = var.vpc_id
  subnets            = var.subnet_ids
  security_group_ids = var.security_group_ids
}
```

## Outputs

| Output | Description |
|--------|-------------|
| `codebuild_project_name` | Project name |
| `codebuild_project_arn` | Project ARN |
| `build_badge_url` | Build status badge URL |
| `webhook_url` | GitHub webhook URL |
| `console_url` | AWS Console direct link |
| `start_build_command` | CLI command to trigger build |

## Next Steps

After infrastructure is provisioned:

1. ✅ Push code to GitHub
2. ✅ Verify webhook triggers build
3. ✅ Monitor build in CloudWatch
4. ✅ Check artifacts in CodeArtifact
5. ✅ Add build badge to README

## References

- [AWS CodeBuild Documentation](https://docs.aws.amazon.com/codebuild/)
- [Build Specification Reference](https://docs.aws.amazon.com/codebuild/latest/userguide/build-spec-ref.html)
- [CodeBuild with CodeArtifact](https://docs.aws.amazon.com/codeartifact/latest/ug/using-maven-packages-in-codebuild.html)
