variable "aws_region" {
  description = "AWS region for CodeBuild resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "maven-pnpm-monorepo"
}

variable "github_repo_url" {
  description = "GitHub repository URL (e.g., https://github.com/user/repo.git)"
  type        = string
}

variable "github_branch" {
  description = "GitHub branch to build"
  type        = string
  default     = "main"
}

variable "github_token_secret_name" {
  description = "AWS Secrets Manager secret name containing GitHub personal access token"
  type        = string
  default     = "github-token"
}

variable "codeartifact_domain" {
  description = "CodeArtifact domain name"
  type        = string
}

variable "codeartifact_repository" {
  description = "CodeArtifact repository name"
  type        = string
}

variable "codeartifact_domain_owner" {
  description = "CodeArtifact domain owner (AWS account ID)"
  type        = string
}

variable "build_compute_type" {
  description = "CodeBuild compute type"
  type        = string
  default     = "BUILD_GENERAL1_SMALL"
  validation {
    condition = contains([
      "BUILD_GENERAL1_SMALL",
      "BUILD_GENERAL1_MEDIUM",
      "BUILD_GENERAL1_LARGE",
      "BUILD_GENERAL1_2XLARGE"
    ], var.build_compute_type)
    error_message = "Must be a valid CodeBuild compute type."
  }
}

variable "build_image" {
  description = "Docker image for build environment"
  type        = string
  default     = "aws/codebuild/standard:7.0"
}

variable "build_timeout_minutes" {
  description = "Build timeout in minutes"
  type        = number
  default     = 60
}

variable "enable_build_badge" {
  description = "Enable CodeBuild build badge"
  type        = bool
  default     = true
}

variable "enable_webhook" {
  description = "Enable GitHub webhook for automatic builds"
  type        = bool
  default     = true
}

variable "webhook_filter_groups" {
  description = "Webhook filter groups for triggering builds"
  type = list(object({
    type    = string
    pattern = string
  }))
  default = [
    {
      type    = "EVENT"
      pattern = "PUSH,PULL_REQUEST"
    },
    {
      type    = "HEAD_REF"
      pattern = "^refs/heads/main$,^refs/heads/develop$"
    }
  ]
}

variable "cache_type" {
  description = "Cache type (NO_CACHE, S3, LOCAL)"
  type        = string
  default     = "LOCAL"
  validation {
    condition     = contains(["NO_CACHE", "S3", "LOCAL"], var.cache_type)
    error_message = "Must be NO_CACHE, S3, or LOCAL."
  }
}

variable "cache_modes" {
  description = "Local cache modes when cache_type is LOCAL"
  type        = list(string)
  default     = ["LOCAL_MAVEN_LOCAL_REPOSITORY", "LOCAL_CUSTOM_CACHE"]
}

variable "enable_cloudwatch_logs" {
  description = "Enable CloudWatch Logs"
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention in days"
  type        = number
  default     = 30
}

variable "privileged_mode" {
  description = "Enable privileged mode (required for Docker builds)"
  type        = bool
  default     = false
}

variable "environment_variables" {
  description = "Additional environment variables for builds"
  type = list(object({
    name  = string
    value = string
    type  = string # PLAINTEXT, PARAMETER_STORE, SECRETS_MANAGER
  }))
  default = []
}

variable "tags" {
  description = "Additional tags to apply to resources"
  type        = map(string)
  default     = {}
}
