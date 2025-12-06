output "codebuild_project_name" {
  description = "CodeBuild project name"
  value       = aws_codebuild_project.main.name
}

output "codebuild_project_arn" {
  description = "CodeBuild project ARN"
  value       = aws_codebuild_project.main.arn
}

output "codebuild_project_id" {
  description = "CodeBuild project ID"
  value       = aws_codebuild_project.main.id
}

output "codebuild_role_arn" {
  description = "IAM role ARN for CodeBuild"
  value       = aws_iam_role.codebuild.arn
}

output "codebuild_role_name" {
  description = "IAM role name for CodeBuild"
  value       = aws_iam_role.codebuild.name
}

output "build_badge_url" {
  description = "Build badge URL"
  value       = var.enable_build_badge ? aws_codebuild_project.main.badge_url : null
}

output "webhook_url" {
  description = "GitHub webhook URL"
  value       = var.enable_webhook ? aws_codebuild_webhook.main[0].payload_url : null
}

output "webhook_secret" {
  description = "GitHub webhook secret"
  value       = var.enable_webhook ? aws_codebuild_webhook.main[0].secret : null
  sensitive   = true
}

output "cloudwatch_log_group" {
  description = "CloudWatch Logs group name"
  value       = var.enable_cloudwatch_logs ? aws_cloudwatch_log_group.codebuild[0].name : null
}

output "cache_bucket" {
  description = "S3 cache bucket name"
  value       = var.cache_type == "S3" ? aws_s3_bucket.cache[0].id : null
}

output "console_url" {
  description = "AWS Console URL for CodeBuild project"
  value       = "https://console.aws.amazon.com/codesuite/codebuild/${data.aws_caller_identity.current.account_id}/projects/${aws_codebuild_project.main.name}?region=${data.aws_region.current.name}"
}

output "start_build_command" {
  description = "AWS CLI command to start a build"
  value       = "aws codebuild start-build --project-name ${aws_codebuild_project.main.name} --region ${data.aws_region.current.name}"
}

output "environment_variables" {
  description = "Environment variables configured for builds"
  value = {
    AWS_REGION                = data.aws_region.current.name
    CODEARTIFACT_DOMAIN       = var.codeartifact_domain
    CODEARTIFACT_DOMAIN_OWNER = var.codeartifact_domain_owner
    CODEARTIFACT_REPO         = var.codeartifact_repository
    CODEARTIFACT_URL          = "https://${var.codeartifact_domain}-${var.codeartifact_domain_owner}.d.codeartifact.${data.aws_region.current.name}.amazonaws.com/maven/${var.codeartifact_repository}/"
  }
}
