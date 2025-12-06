# AWS CodeBuild Project for Maven-pnpm Monorepo
# Builds on AWS, publishes to GitHub Packages

terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "maven-pnpm-monorepo"
      ManagedBy   = "Terraform"
      Environment = var.environment
    }
  }
}

# CodeBuild project
resource "aws_codebuild_project" "maven_monorepo" {
  name          = "${var.project_name}-${var.environment}"
  description   = "Maven-pnpm monorepo with selective building and GitHub Packages publishing"
  service_role  = aws_iam_role.codebuild.arn
  build_timeout = var.build_timeout

  artifacts {
    type = "NO_ARTIFACTS"
  }

  # Optional: Store artifacts in S3 for debugging
  secondary_artifacts {
    artifact_identifier = "build-artifacts"
    type                = "S3"
    location            = var.artifact_bucket_name
    name                = "build-artifacts"
    packaging           = "ZIP"
    override_artifact_name = true
  }

  cache {
    type     = "S3"
    location = "${var.cache_bucket_name}/build-cache"
  }

  environment {
    compute_type                = var.compute_type
    image                       = var.build_image
    type                        = "LINUX_CONTAINER"
    image_pull_credentials_type = "CODEBUILD"
    privileged_mode             = false

    environment_variable {
      name  = "NODE_VERSION"
      value = "20"
    }

    environment_variable {
      name  = "PNPM_VERSION"
      value = "9"
    }

    environment_variable {
      name  = "MAX_PARALLEL_BUILDS"
      value = var.max_parallel_builds
    }

    # GitHub token from Parameter Store
    environment_variable {
      name  = "GITHUB_TOKEN"
      type  = "PARAMETER_STORE"
      value = var.github_token_parameter
    }
  }

  source {
    type            = "GITHUB"
    location        = var.github_repo_url
    git_clone_depth = 1
    buildspec       = ".aws/buildspec.yml"

    git_submodules_config {
      fetch_submodules = false
    }
  }

  logs_config {
    cloudwatch_logs {
      group_name  = "/aws/codebuild/${var.project_name}"
      stream_name = var.environment
    }

    s3_logs {
      status   = "ENABLED"
      location = "${var.logs_bucket_name}/build-logs"
    }
  }

  # Test reports
  reports {
    report_group {
      export_config {
        type = "NO_EXPORT"
      }
    }
  }

  tags = {
    Name = "${var.project_name}-${var.environment}"
  }
}

# Webhook for automatic builds
resource "aws_codebuild_webhook" "maven_monorepo" {
  project_name = aws_codebuild_project.maven_monorepo.name

  # Trigger on push to main branch
  filter_group {
    filter {
      type    = "EVENT"
      pattern = "PUSH"
    }

    filter {
      type    = "HEAD_REF"
      pattern = "^refs/heads/main$"
    }
  }

  # Optional: Trigger on pull requests
  filter_group {
    filter {
      type    = "EVENT"
      pattern = "PULL_REQUEST_CREATED,PULL_REQUEST_UPDATED,PULL_REQUEST_REOPENED"
    }

    filter {
      type    = "BASE_REF"
      pattern = "^refs/heads/main$"
    }
  }
}

# S3 bucket for build artifacts (optional, for debugging)
resource "aws_s3_bucket" "artifacts" {
  count  = var.create_artifact_bucket ? 1 : 0
  bucket = var.artifact_bucket_name

  tags = {
    Name = "${var.project_name}-artifacts"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "artifacts" {
  count  = var.create_artifact_bucket ? 1 : 0
  bucket = aws_s3_bucket.artifacts[0].id

  rule {
    id     = "delete-old-artifacts"
    status = "Enabled"

    expiration {
      days = 30
    }
  }
}

# S3 bucket for build cache
resource "aws_s3_bucket" "cache" {
  count  = var.create_cache_bucket ? 1 : 0
  bucket = var.cache_bucket_name

  tags = {
    Name = "${var.project_name}-cache"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "cache" {
  count  = var.create_cache_bucket ? 1 : 0
  bucket = aws_s3_bucket.cache[0].id

  rule {
    id     = "delete-old-cache"
    status = "Enabled"

    expiration {
      days = 7
    }
  }
}

# S3 bucket for logs
resource "aws_s3_bucket" "logs" {
  count  = var.create_logs_bucket ? 1 : 0
  bucket = var.logs_bucket_name

  tags = {
    Name = "${var.project_name}-logs"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  count  = var.create_logs_bucket ? 1 : 0
  bucket = aws_s3_bucket.logs[0].id

  rule {
    id     = "delete-old-logs"
    status = "Enabled"

    expiration {
      days = 90
    }
  }
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "codebuild" {
  name              = "/aws/codebuild/${var.project_name}"
  retention_in_days = var.log_retention_days

  tags = {
    Name = "${var.project_name}-logs"
  }
}

# CloudWatch Metric Alarm for build failures
resource "aws_cloudwatch_metric_alarm" "build_failures" {
  count               = var.enable_failure_alarm ? 1 : 0
  alarm_name          = "${var.project_name}-build-failures"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "FailedBuilds"
  namespace           = "AWS/CodeBuild"
  period              = "300"
  statistic           = "Sum"
  threshold           = "0"
  alarm_description   = "Alert when CodeBuild builds fail"
  alarm_actions       = var.alarm_sns_topic_arn != "" ? [var.alarm_sns_topic_arn] : []

  dimensions = {
    ProjectName = aws_codebuild_project.maven_monorepo.name
  }
}

# SNS Topic for notifications (optional)
resource "aws_sns_topic" "codebuild_notifications" {
  count = var.create_sns_topic ? 1 : 0
  name  = "${var.project_name}-notifications"

  tags = {
    Name = "${var.project_name}-notifications"
  }
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.create_sns_topic && var.notification_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.codebuild_notifications[0].arn
  protocol  = "email"
  endpoint  = var.notification_email
}
