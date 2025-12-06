# Outputs for CodeBuild configuration

output "codebuild_project_name" {
  description = "Name of the CodeBuild project"
  value       = aws_codebuild_project.maven_monorepo.name
}

output "codebuild_project_arn" {
  description = "ARN of the CodeBuild project"
  value       = aws_codebuild_project.maven_monorepo.arn
}

output "codebuild_project_id" {
  description = "ID of the CodeBuild project"
  value       = aws_codebuild_project.maven_monorepo.id
}

output "codebuild_role_arn" {
  description = "ARN of the CodeBuild IAM role"
  value       = aws_iam_role.codebuild.arn
}

output "codebuild_role_name" {
  description = "Name of the CodeBuild IAM role"
  value       = aws_iam_role.codebuild.name
}

output "webhook_url" {
  description = "CodeBuild webhook URL for GitHub integration"
  value       = aws_codebuild_webhook.maven_monorepo.url
}

output "webhook_payload_url" {
  description = "CodeBuild webhook payload URL"
  value       = aws_codebuild_webhook.maven_monorepo.payload_url
}

output "webhook_secret" {
  description = "CodeBuild webhook secret (sensitive)"
  value       = aws_codebuild_webhook.maven_monorepo.secret
  sensitive   = true
}

output "artifact_bucket_name" {
  description = "Name of the S3 bucket for build artifacts"
  value       = var.create_artifact_bucket ? aws_s3_bucket.artifacts[0].id : var.artifact_bucket_name
}

output "cache_bucket_name" {
  description = "Name of the S3 bucket for build cache"
  value       = var.create_cache_bucket ? aws_s3_bucket.cache[0].id : var.cache_bucket_name
}

output "logs_bucket_name" {
  description = "Name of the S3 bucket for build logs"
  value       = var.create_logs_bucket ? aws_s3_bucket.logs[0].id : var.logs_bucket_name
}

output "cloudwatch_log_group" {
  description = "CloudWatch log group name"
  value       = aws_cloudwatch_log_group.codebuild.name
}

output "sns_topic_arn" {
  description = "SNS topic ARN for notifications (if created)"
  value       = var.create_sns_topic ? aws_sns_topic.codebuild_notifications[0].arn : null
}

output "build_trigger_command" {
  description = "AWS CLI command to manually trigger a build"
  value       = "aws codebuild start-build --project-name ${aws_codebuild_project.maven_monorepo.name} --region ${var.aws_region}"
}

output "build_logs_command" {
  description = "AWS CLI command to tail build logs"
  value       = "aws logs tail ${aws_cloudwatch_log_group.codebuild.name} --follow --region ${var.aws_region}"
}
