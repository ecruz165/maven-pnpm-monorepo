output "domain_name" {
  description = "CodeArtifact domain name"
  value       = aws_codeartifact_domain.main.domain
}

output "domain_owner" {
  description = "AWS account ID (domain owner)"
  value       = data.aws_caller_identity.current.account_id
}

output "domain_arn" {
  description = "CodeArtifact domain ARN"
  value       = aws_codeartifact_domain.main.arn
}

output "repository_name" {
  description = "CodeArtifact repository name"
  value       = aws_codeartifact_repository.main.repository
}

output "repository_arn" {
  description = "CodeArtifact repository ARN"
  value       = aws_codeartifact_repository.main.arn
}

output "repository_endpoint" {
  description = "CodeArtifact repository endpoint URL"
  value       = "https://${aws_codeartifact_domain.main.domain}-${data.aws_caller_identity.current.account_id}.d.codeartifact.${data.aws_region.current.name}.amazonaws.com/maven/${aws_codeartifact_repository.main.repository}/"
}

output "maven_central_repository_name" {
  description = "Maven Central upstream repository name"
  value       = var.enable_maven_central_upstream ? aws_codeartifact_repository.maven_central[0].repository : null
}

output "aws_region" {
  description = "AWS region"
  value       = data.aws_region.current.name
}

output "iam_policy_arn" {
  description = "ARN of the IAM policy for CodeArtifact access"
  value       = aws_iam_policy.codeartifact_access.arn
}

output "environment_variables" {
  description = "Environment variables for authentication script"
  value = {
    AWS_REGION                 = data.aws_region.current.name
    CODEARTIFACT_DOMAIN        = aws_codeartifact_domain.main.domain
    CODEARTIFACT_DOMAIN_OWNER  = data.aws_caller_identity.current.account_id
    CODEARTIFACT_REPO          = aws_codeartifact_repository.main.repository
    CODEARTIFACT_URL           = "https://${aws_codeartifact_domain.main.domain}-${data.aws_caller_identity.current.account_id}.d.codeartifact.${data.aws_region.current.name}.amazonaws.com/maven/${aws_codeartifact_repository.main.repository}/"
  }
}

output "setup_commands" {
  description = "Commands to set up environment and test access"
  value = <<-EOT
    # Export environment variables (add to .env file):
    export AWS_REGION="${data.aws_region.current.name}"
    export CODEARTIFACT_DOMAIN="${aws_codeartifact_domain.main.domain}"
    export CODEARTIFACT_DOMAIN_OWNER="${data.aws_caller_identity.current.account_id}"
    export CODEARTIFACT_REPO="${aws_codeartifact_repository.main.repository}"
    export CODEARTIFACT_URL="https://${aws_codeartifact_domain.main.domain}-${data.aws_caller_identity.current.account_id}.d.codeartifact.${data.aws_region.current.name}.amazonaws.com/maven/${aws_codeartifact_repository.main.repository}/"

    # Test authentication (requires AWS credentials):
    aws codeartifact get-authorization-token --domain ${aws_codeartifact_domain.main.domain} --domain-owner ${data.aws_caller_identity.current.account_id} --region ${data.aws_region.current.name}

    # Run setup script:
    pnpm setup:codeartifact
  EOT
}
