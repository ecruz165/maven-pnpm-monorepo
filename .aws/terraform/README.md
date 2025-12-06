# Terraform Configuration for AWS CodeBuild

Infrastructure as Code for deploying CodeBuild to build Maven-pnpm monorepo and publish to GitHub Packages.

## Overview

This Terraform configuration creates:
- **CodeBuild Project** - Builds Maven modules on push to main
- **IAM Roles & Policies** - Service role with minimal required permissions
- **S3 Buckets** - Artifacts, cache, and logs storage
- **CloudWatch Logs** - Centralized build logging
- **CloudWatch Alarms** - Alerts on build failures
- **Webhooks** - Automatic triggers from GitHub
- **SNS Topics** (Optional) - Build notifications

## Architecture

```
GitHub Repository
       ↓
    Webhook
       ↓
AWS CodeBuild ──→ GitHub Packages
  │                (Maven Artifacts)
  ├─→ S3 (Cache)
  ├─→ S3 (Artifacts - debugging)
  ├─→ S3 (Logs)
  ├─→ CloudWatch Logs
  └─→ SNS → Email (optional)
```

## Prerequisites

1. **AWS CLI** installed and configured
2. **Terraform** >= 1.0 installed
3. **GitHub PAT** created with `repo` and `write:packages` scopes
4. **S3 bucket names** planned (must be globally unique)

## Quick Start

### Step 1: Store GitHub Token

```bash
# Store GitHub PAT in AWS Systems Manager Parameter Store
aws ssm put-parameter \
  --name "/codebuild/maven-pnpm-monorepo/github-token" \
  --value "ghp_your_personal_access_token_here" \
  --type "SecureString" \
  --region us-east-1
```

### Step 2: Configure Terraform

```bash
cd .aws/terraform/codebuild

# Copy example variables
cp terraform.tfvars.example terraform.tfvars

# Edit terraform.tfvars with your values
vim terraform.tfvars
```

**Required changes in `terraform.tfvars`:**
```hcl
github_repo_url = "https://github.com/YOUR-ORG/maven-pnpm-monorepo.git"

# S3 bucket names must be globally unique
artifact_bucket_name = "your-unique-prefix-maven-pnpm-monorepo-artifacts"
cache_bucket_name    = "your-unique-prefix-maven-pnpm-monorepo-cache"
logs_bucket_name     = "your-unique-prefix-maven-pnpm-monorepo-logs"
```

### Step 3: Deploy

```bash
# Initialize Terraform
terraform init

# Preview changes
terraform plan

# Apply configuration
terraform apply
```

### Step 4: Verify

```bash
# Get outputs
terraform output

# Trigger test build
aws codebuild start-build --project-name maven-pnpm-monorepo-prod

# Watch logs
aws logs tail /aws/codebuild/maven-pnpm-monorepo --follow
```

## Configuration

### Variables Reference

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `aws_region` | AWS region | `us-east-1` | No |
| `environment` | Environment name | `prod` | No |
| `github_repo_url` | GitHub repository URL | - | **Yes** |
| `github_token_parameter` | SSM parameter path for GitHub token | `/codebuild/maven-pnpm-monorepo/github-token` | No |
| `compute_type` | Build instance size | `BUILD_GENERAL1_MEDIUM` | No |
| `build_timeout` | Build timeout (minutes) | `30` | No |
| `artifact_bucket_name` | S3 bucket for artifacts | `maven-pnpm-monorepo-artifacts` | **Yes** |
| `cache_bucket_name` | S3 bucket for cache | `maven-pnpm-monorepo-cache` | **Yes** |
| `create_artifact_bucket` | Create artifact bucket | `true` | No |
| `log_retention_days` | CloudWatch log retention | `30` | No |
| `enable_failure_alarm` | Enable failure alarm | `true` | No |

### Compute Types

| Type | vCPU | Memory | Use Case | Hourly Cost |
|------|------|--------|----------|-------------|
| `BUILD_GENERAL1_SMALL` | 3 | 3 GB | Small projects (1-3 modules) | ~$0.30 |
| `BUILD_GENERAL1_MEDIUM` | 7 | 15 GB | Medium projects (4-10 modules) | ~$0.60 |
| `BUILD_GENERAL1_LARGE` | 15 | 30 GB | Large projects (10+ modules) | ~$1.20 |

### Outputs

After `terraform apply`, useful outputs include:

```bash
# View all outputs
terraform output

# Specific outputs
terraform output codebuild_project_name
terraform output webhook_url
terraform output build_trigger_command
```

**Key outputs:**
- `codebuild_project_name` - Project name for AWS CLI commands
- `webhook_url` - GitHub webhook URL (auto-configured)
- `build_trigger_command` - Command to manually trigger builds
- `build_logs_command` - Command to tail CloudWatch logs

## Usage

### Manual Build Trigger

```bash
# Trigger build from main branch
aws codebuild start-build \
  --project-name $(terraform output -raw codebuild_project_name) \
  --region us-east-1

# With environment overrides
aws codebuild start-build \
  --project-name $(terraform output -raw codebuild_project_name) \
  --environment-variables-override \
    name=MAX_PARALLEL_BUILDS,value=8,type=PLAINTEXT \
  --region us-east-1
```

### View Build Logs

```bash
# Tail logs in real-time
$(terraform output -raw build_logs_command)

# Or directly
aws logs tail /aws/codebuild/maven-pnpm-monorepo --follow
```

### Download Build Artifacts

```bash
# List artifacts
aws s3 ls s3://$(terraform output -raw artifact_bucket_name)/ --recursive

# Download latest
aws s3 sync \
  s3://$(terraform output -raw artifact_bucket_name)/build-artifacts-latest/ \
  ./downloaded-artifacts/
```

## Maintenance

### Update Configuration

```bash
# Edit variables
vim terraform.tfvars

# Preview changes
terraform plan

# Apply updates
terraform apply
```

### View Resource State

```bash
# List all managed resources
terraform state list

# Show specific resource
terraform state show aws_codebuild_project.maven_monorepo
```

### Import Existing Resources

If CodeBuild project already exists:

```bash
terraform import aws_codebuild_project.maven_monorepo maven-pnpm-monorepo-prod
```

## Monitoring

### CloudWatch Metrics

Key metrics to monitor:
- `Builds` - Total builds
- `SucceededBuilds` - Successful builds
- `FailedBuilds` - Failed builds
- `Duration` - Build duration

View metrics:
```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/CodeBuild \
  --metric-name Duration \
  --dimensions Name=ProjectName,Value=maven-pnpm-monorepo-prod \
  --statistics Average \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-12-31T23:59:59Z \
  --period 3600
```

### Cost Monitoring

```bash
# Estimate monthly cost
# BUILD_GENERAL1_MEDIUM @ $0.005/min
# 500 builds/month * 8 min avg = 4000 min = $20/month

# View actual costs in Cost Explorer
aws ce get-cost-and-usage \
  --time-period Start=2024-01-01,End=2024-01-31 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --filter file://codebuild-filter.json
```

## Troubleshooting

### Build Fails to Start

**Check IAM permissions:**
```bash
terraform state show aws_iam_role_policy.codebuild
```

**Check webhook:**
```bash
aws codebuild list-webhooks \
  --project-name maven-pnpm-monorepo-prod
```

### Cannot Access GitHub

**Verify token:**
```bash
aws ssm get-parameter \
  --name /codebuild/maven-pnpm-monorepo/github-token \
  --with-decryption
```

### S3 Bucket Already Exists

**Use existing bucket:**
```hcl
# In terraform.tfvars
create_artifact_bucket = false
artifact_bucket_name   = "existing-bucket-name"
```

### Terraform State Issues

**Refresh state:**
```bash
terraform refresh
```

**Recover from state mismatch:**
```bash
terraform import aws_codebuild_project.maven_monorepo <project-name>
```

## Cleanup

### Destroy All Resources

```bash
# Preview what will be destroyed
terraform plan -destroy

# Destroy all resources
terraform destroy
```

**Note:** This will:
- Delete CodeBuild project
- Delete S3 buckets (if created by Terraform)
- Delete CloudWatch log groups
- Delete IAM roles and policies
- Delete SNS topics (if created)

### Keep S3 Buckets

To preserve S3 buckets during destroy:

```bash
# Remove buckets from state
terraform state rm aws_s3_bucket.artifacts
terraform state rm aws_s3_bucket.cache
terraform state rm aws_s3_bucket.logs

# Then destroy
terraform destroy
```

## Advanced Configuration

### Multiple Environments

```bash
# Development environment
terraform workspace new dev
terraform apply -var-file=dev.tfvars

# Production environment
terraform workspace new prod
terraform apply -var-file=prod.tfvars
```

### Custom Build Image

```hcl
# In terraform.tfvars
build_image = "123456789012.dkr.ecr.us-east-1.amazonaws.com/maven-pnpm-build:latest"
```

### VPC Configuration

Add to `main.tf`:
```hcl
resource "aws_codebuild_project" "maven_monorepo" {
  # ... existing configuration ...

  vpc_config {
    vpc_id             = var.vpc_id
    subnets            = var.subnet_ids
    security_group_ids = var.security_group_ids
  }
}
```

## Security

### Secrets Management

- **GitHub Token**: Stored in AWS Systems Manager Parameter Store (encrypted)
- **IAM Policies**: Follow principle of least privilege
- **S3 Buckets**: Not public, encrypted at rest
- **CloudWatch Logs**: Retention policy enforced

### Compliance

- **SOC 2**: Enable CloudTrail logging
- **HIPAA**: Use encrypted S3 buckets
- **PCI DSS**: Network isolation via VPC

## Related Documentation

- [Main AWS README](../README.md) - Buildspec and CodeBuild overview
- [Project README](../../README.md) - Project architecture
- [AWS CodeBuild Terraform Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/codebuild_project)

## Support

For Terraform-specific issues:
- Check `terraform plan` output
- Review state with `terraform state show`
- Enable debug logging: `TF_LOG=DEBUG terraform apply`

For CodeBuild issues:
- Check CloudWatch Logs
- Review IAM permissions
- Verify buildspec.yml syntax

---

**Version**: 1.0.0
**Last Updated**: December 2024
