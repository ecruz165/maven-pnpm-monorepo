# Variables for CodeBuild Terraform configuration

variable "aws_region" {
  description = "AWS region for CodeBuild project"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "prod"
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "maven-pnpm-monorepo"
}

variable "github_repo_url" {
  description = "GitHub repository URL (https://github.com/org/repo.git)"
  type        = string
}

variable "github_token_parameter" {
  description = "SSM Parameter Store path for GitHub token"
  type        = string
  default     = "/codebuild/maven-pnpm-monorepo/github-token"
}

variable "build_image" {
  description = "Docker image for build environment"
  type        = string
  default     = "aws/codebuild/amazonlinux2-x86_64-standard:5.0"
}

variable "compute_type" {
  description = "CodeBuild compute type (BUILD_GENERAL1_SMALL, BUILD_GENERAL1_MEDIUM, BUILD_GENERAL1_LARGE)"
  type        = string
  default     = "BUILD_GENERAL1_MEDIUM"

  validation {
    condition = contains([
      "BUILD_GENERAL1_SMALL",
      "BUILD_GENERAL1_MEDIUM",
      "BUILD_GENERAL1_LARGE",
      "BUILD_GENERAL1_2XLARGE"
    ], var.compute_type)
    error_message = "Invalid compute type. Must be BUILD_GENERAL1_SMALL, BUILD_GENERAL1_MEDIUM, BUILD_GENERAL1_LARGE, or BUILD_GENERAL1_2XLARGE."
  }
}

variable "build_timeout" {
  description = "Build timeout in minutes"
  type        = number
  default     = 30
}

variable "max_parallel_builds" {
  description = "Maximum number of parallel Maven builds"
  type        = string
  default     = "4"
}

variable "artifact_bucket_name" {
  description = "S3 bucket name for build artifacts"
  type        = string
  default     = "maven-pnpm-monorepo-artifacts"
}

variable "cache_bucket_name" {
  description = "S3 bucket name for build cache"
  type        = string
  default     = "maven-pnpm-monorepo-cache"
}

variable "logs_bucket_name" {
  description = "S3 bucket name for build logs"
  type        = string
  default     = "maven-pnpm-monorepo-logs"
}

variable "create_artifact_bucket" {
  description = "Whether to create S3 bucket for artifacts"
  type        = bool
  default     = true
}

variable "create_cache_bucket" {
  description = "Whether to create S3 bucket for cache"
  type        = bool
  default     = true
}

variable "create_logs_bucket" {
  description = "Whether to create S3 bucket for logs"
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 30
}

variable "enable_failure_alarm" {
  description = "Enable CloudWatch alarm for build failures"
  type        = bool
  default     = true
}

variable "alarm_sns_topic_arn" {
  description = "SNS topic ARN for build failure notifications (leave empty to disable)"
  type        = string
  default     = ""
}

variable "create_sns_topic" {
  description = "Create SNS topic for notifications"
  type        = bool
  default     = false
}

variable "notification_email" {
  description = "Email address for build notifications"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Additional tags for resources"
  type        = map(string)
  default     = {}
}
