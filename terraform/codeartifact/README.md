# AWS CodeArtifact Infrastructure

This Terraform configuration provisions AWS CodeArtifact resources for the Maven PNPM monorepo.

## Resources Created

- **CodeArtifact Domain**: Container for repositories
- **CodeArtifact Repository**: Maven repository for artifacts
- **Maven Central Upstream**: External connection to Maven Central (optional)
- **IAM Policy**: Policy for programmatic access to CodeArtifact
- **Repository Policies**: Fine-grained access control

## Prerequisites

1. **AWS CLI**: Install and configure with credentials
   ```bash
   aws configure
   ```

2. **Terraform**: Version >= 1.0
   ```bash
   brew install terraform  # macOS
   # or download from https://www.terraform.io/downloads
   ```

3. **AWS Permissions**: Your AWS user/role needs permissions to:
   - Create CodeArtifact domains and repositories
   - Create IAM policies
   - Manage resource tags

## Quick Start

### 1. Initialize Terraform

```bash
cd terraform/codeartifact
terraform init
```

### 2. Review Configuration

Create a `terraform.tfvars` file to customize settings (optional):

```hcl
aws_region      = "us-east-1"
environment     = "dev"
domain_name     = "maven-pnpm-monorepo"
repository_name = "maven-pnpm-repo"

# Optional: Specify principals for access control
allowed_principals = [
  "arn:aws:iam::123456789012:user/ci-user",
  "arn:aws:iam::123456789012:role/github-actions"
]
```

### 3. Plan and Apply

```bash
# Preview changes
terraform plan

# Apply changes
terraform apply
```

### 4. Export Environment Variables

After successful apply, Terraform will output environment variables. Add them to your `.env` file:

```bash
# Get formatted output
terraform output -raw setup_commands

# Or manually export
terraform output -json environment_variables | jq -r 'to_entries[] | "export \(.key)=\"\(.value)\""'
```

## Configuration Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `aws_region` | AWS region for resources | `us-east-1` |
| `environment` | Environment name (dev/staging/prod) | `dev` |
| `domain_name` | CodeArtifact domain name | `maven-pnpm-monorepo` |
| `repository_name` | CodeArtifact repository name | `maven-pnpm-repo` |
| `enable_maven_central_upstream` | Enable Maven Central upstream | `true` |
| `allowed_principals` | AWS principals allowed to access | `[]` |
| `tags` | Additional resource tags | `{}` |

## Outputs

| Output | Description |
|--------|-------------|
| `domain_name` | CodeArtifact domain name |
| `domain_owner` | AWS account ID |
| `repository_name` | Repository name |
| `repository_endpoint` | Maven repository URL |
| `iam_policy_arn` | ARN of IAM policy for access |
| `environment_variables` | Environment variables for authentication |
| `setup_commands` | Commands to configure environment |

## IAM Access

### For CI/CD (GitHub Actions, GitLab CI, etc.)

Attach the created IAM policy to your CI/CD role:

```bash
# Get the policy ARN
POLICY_ARN=$(terraform output -raw iam_policy_arn)

# Attach to a role
aws iam attach-role-policy \
  --role-name github-actions-role \
  --policy-arn $POLICY_ARN
```

### For Local Development

Your AWS credentials (via `aws configure`) will automatically work if you have the necessary permissions.

## Testing

### 1. Test Authentication

```bash
# Get authorization token
aws codeartifact get-authorization-token \
  --domain $(terraform output -raw domain_name) \
  --domain-owner $(terraform output -raw domain_owner) \
  --region $(terraform output -raw aws_region)
```

### 2. Test Maven Access

```bash
# Export environment variables
eval $(terraform output -raw setup_commands | grep export)

# Run authentication script
cd ../..
pnpm setup:codeartifact

# Build and deploy a module
mvn -pl demo-module-a clean deploy
```

## Maintenance

### Update Configuration

1. Modify `terraform.tfvars` or variables
2. Run `terraform plan` to preview changes
3. Run `terraform apply` to apply changes

### Destroy Resources

```bash
# WARNING: This will delete all CodeArtifact resources
terraform destroy
```

### State Management

For production use, configure remote state:

```hcl
# Add to versions.tf
terraform {
  backend "s3" {
    bucket = "my-terraform-state"
    key    = "codeartifact/terraform.tfstate"
    region = "us-east-1"
  }
}
```

## Cost Considerations

CodeArtifact pricing (as of 2024):
- **Storage**: $0.05 per GB-month
- **Requests**: $0.05 per 10,000 requests
- **Data Transfer**: Standard AWS data transfer rates

Estimated costs for small projects: ~$1-5/month

## Troubleshooting

### "Access Denied" Errors

1. Verify AWS credentials: `aws sts get-caller-identity`
2. Check IAM permissions for CodeArtifact
3. Ensure correct region is configured

### "Domain Already Exists"

If domain exists in another account/region:
- Change `domain_name` in variables
- Or import existing: `terraform import aws_codeartifact_domain.main <domain-name>`

### Maven Central Connection Issues

Verify external connection is configured:
```bash
aws codeartifact list-repositories-in-domain \
  --domain $(terraform output -raw domain_name) \
  --domain-owner $(terraform output -raw domain_owner)
```

## Security Best Practices

1. **Use IAM Roles**: Prefer roles over access keys for CI/CD
2. **Least Privilege**: Use `allowed_principals` to restrict access
3. **Enable Logging**: Configure CloudTrail for audit logs
4. **Rotate Tokens**: CodeArtifact tokens expire after 12 hours
5. **Tag Resources**: Use tags for cost tracking and organization

## Next Steps

After infrastructure is provisioned:

1. Add environment variables to `.env` file
2. Run `pnpm setup:codeartifact` to configure Maven
3. Test artifact deployment: `mvn deploy`
4. Configure CI/CD to use CodeArtifact

## References

- [AWS CodeArtifact Documentation](https://docs.aws.amazon.com/codeartifact/)
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [Maven with CodeArtifact](https://docs.aws.amazon.com/codeartifact/latest/ug/maven-mvn.html)
