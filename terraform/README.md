# Terraform Infrastructure

This directory contains Terraform configurations for provisioning AWS infrastructure for the Maven PNPM monorepo.

## Modules

### CodeArtifact (`./codeartifact/`)

Provisions AWS CodeArtifact for Maven artifact repository management.

**Resources Created:**
- CodeArtifact domain
- CodeArtifact repository with Maven Central upstream
- IAM policies for access control
- Domain and repository permissions

**Usage:**

```bash
cd codeartifact
terraform init
terraform plan
terraform apply
```

See [codeartifact/README.md](./codeartifact/README.md) for detailed documentation.

## Directory Structure

```
terraform/
├── README.md                    # This file
└── codeartifact/               # CodeArtifact infrastructure
    ├── main.tf                 # Main resources
    ├── variables.tf            # Input variables
    ├── outputs.tf              # Output values
    ├── versions.tf             # Provider configuration
    ├── README.md               # Module documentation
    └── terraform.tfvars        # Your values (gitignored)
```

## Getting Started

### 1. Prerequisites

- AWS CLI configured with credentials
- Terraform >= 1.0 installed
- Appropriate AWS IAM permissions

### 2. Initialize Module

```bash
cd codeartifact
terraform init
```

### 3. Configure Variables (Optional)

Create `terraform.tfvars`:

```hcl
aws_region      = "us-east-1"
environment     = "dev"
domain_name     = "maven-pnpm-monorepo"
repository_name = "maven-pnpm-repo"
```

### 4. Apply Configuration

```bash
terraform plan    # Review changes
terraform apply   # Create resources
```

### 5. Export Environment Variables

```bash
# Get setup commands
terraform output -raw setup_commands

# Copy to .env file
terraform output -json environment_variables | \
  jq -r 'to_entries[] | "\(.key)=\"\(.value)\""' >> ../../.env
```

### 6. Setup Maven Authentication

```bash
cd ../..
pnpm setup:codeartifact
```

## Best Practices

### State Management

For production, use remote state:

```hcl
# Add to codeartifact/versions.tf
terraform {
  backend "s3" {
    bucket = "my-terraform-state"
    key    = "maven-monorepo/codeartifact/terraform.tfstate"
    region = "us-east-1"
  }
}
```

### Variable Management

- Use `terraform.tfvars` for non-sensitive values (gitignored)
- Use environment variables for sensitive values
- Use Terraform Cloud/Enterprise for team collaboration

### Security

- Enable MFA for AWS accounts
- Use IAM roles instead of access keys where possible
- Regularly rotate credentials
- Review and audit resource policies

## Cost Management

CodeArtifact costs are based on:
- Storage: $0.05 per GB-month
- Requests: $0.05 per 10,000 requests

Typical small project: ~$1-5/month

## Troubleshooting

### Common Issues

**"Failed to load backend"**
- Run `terraform init` in the module directory

**"Access Denied"**
- Verify AWS credentials: `aws sts get-caller-identity`
- Check IAM permissions for CodeArtifact

**"Resource already exists"**
- Import existing resources or change names
- Use `terraform import` to bring existing resources under management

## Additional Modules

Future infrastructure modules can be added here:

```
terraform/
├── codeartifact/   # Maven repository
├── ecr/            # Container registry (future)
├── rds/            # Database (future)
└── vpc/            # Networking (future)
```

## Resources

- [Terraform Documentation](https://www.terraform.io/docs)
- [AWS Provider Documentation](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [CodeArtifact Documentation](https://docs.aws.amazon.com/codeartifact/)
