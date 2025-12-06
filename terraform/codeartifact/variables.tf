variable "aws_region" {
  description = "AWS region for CodeArtifact resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "domain_name" {
  description = "CodeArtifact domain name"
  type        = string
  default     = "maven-pnpm-monorepo"
}

variable "repository_name" {
  description = "CodeArtifact repository name"
  type        = string
  default     = "maven-pnpm-repo"
}

variable "repository_description" {
  description = "Description for the CodeArtifact repository"
  type        = string
  default     = "Maven repository for hybrid Maven-PNPM monorepo"
}

variable "enable_maven_central_upstream" {
  description = "Enable Maven Central as upstream repository"
  type        = bool
  default     = true
}

variable "allowed_principals" {
  description = "List of AWS principal ARNs allowed to access the repository"
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Additional tags to apply to resources"
  type        = map(string)
  default     = {}
}
