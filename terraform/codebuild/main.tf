# Data sources
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# GitHub token from Secrets Manager
data "aws_secretsmanager_secret" "github_token" {
  name = var.github_token_secret_name
}

data "aws_secretsmanager_secret_version" "github_token" {
  secret_id = data.aws_secretsmanager_secret.github_token.id
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "codebuild" {
  count = var.enable_cloudwatch_logs ? 1 : 0

  name              = "/aws/codebuild/${var.project_name}"
  retention_in_days = var.log_retention_days

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-codebuild-logs"
    }
  )
}

# IAM Role for CodeBuild
resource "aws_iam_role" "codebuild" {
  name = "${var.project_name}-codebuild-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "codebuild.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-codebuild-role"
    }
  )
}

# IAM Policy for CloudWatch Logs
resource "aws_iam_role_policy" "codebuild_logs" {
  count = var.enable_cloudwatch_logs ? 1 : 0

  role = aws_iam_role.codebuild.name
  name = "${var.project_name}-codebuild-logs-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = [
          aws_cloudwatch_log_group.codebuild[0].arn,
          "${aws_cloudwatch_log_group.codebuild[0].arn}:*"
        ]
      }
    ]
  })
}

# IAM Policy for CodeArtifact
resource "aws_iam_role_policy" "codebuild_codeartifact" {
  role = aws_iam_role.codebuild.name
  name = "${var.project_name}-codebuild-codeartifact-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "GetAuthorizationToken"
        Effect = "Allow"
        Action = [
          "codeartifact:GetAuthorizationToken",
          "sts:GetServiceBearerToken"
        ]
        Resource = "*"
      },
      {
        Sid    = "ReadFromRepository"
        Effect = "Allow"
        Action = [
          "codeartifact:DescribePackageVersion",
          "codeartifact:DescribeRepository",
          "codeartifact:GetPackageVersionReadme",
          "codeartifact:GetRepositoryEndpoint",
          "codeartifact:ListPackages",
          "codeartifact:ListPackageVersions",
          "codeartifact:ListPackageVersionAssets",
          "codeartifact:ReadFromRepository"
        ]
        Resource = [
          "arn:aws:codeartifact:${data.aws_region.current.name}:${var.codeartifact_domain_owner}:repository/${var.codeartifact_domain}/${var.codeartifact_repository}",
          "arn:aws:codeartifact:${data.aws_region.current.name}:${var.codeartifact_domain_owner}:repository/${var.codeartifact_domain}/${var.codeartifact_repository}/*"
        ]
      },
      {
        Sid    = "PublishToRepository"
        Effect = "Allow"
        Action = [
          "codeartifact:PublishPackageVersion",
          "codeartifact:PutPackageMetadata"
        ]
        Resource = [
          "arn:aws:codeartifact:${data.aws_region.current.name}:${var.codeartifact_domain_owner}:package/${var.codeartifact_domain}/${var.codeartifact_repository}/*/*"
        ]
      }
    ]
  })
}

# IAM Policy for Secrets Manager (GitHub token access)
resource "aws_iam_role_policy" "codebuild_secrets" {
  role = aws_iam_role.codebuild.name
  name = "${var.project_name}-codebuild-secrets-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [
          data.aws_secretsmanager_secret.github_token.arn
        ]
      }
    ]
  })
}

# IAM Policy for S3 (if using S3 cache)
resource "aws_iam_role_policy" "codebuild_s3" {
  count = var.cache_type == "S3" ? 1 : 0

  role = aws_iam_role.codebuild.name
  name = "${var.project_name}-codebuild-s3-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:GetObjectVersion"
        ]
        Resource = [
          "${aws_s3_bucket.cache[0].arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.cache[0].arn
        ]
      }
    ]
  })
}

# S3 Bucket for Build Cache (if using S3 cache)
resource "aws_s3_bucket" "cache" {
  count = var.cache_type == "S3" ? 1 : 0

  bucket = "${var.project_name}-codebuild-cache"

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-codebuild-cache"
    }
  )
}

resource "aws_s3_bucket_lifecycle_configuration" "cache" {
  count = var.cache_type == "S3" ? 1 : 0

  bucket = aws_s3_bucket.cache[0].id

  rule {
    id     = "expire-old-cache"
    status = "Enabled"

    expiration {
      days = 7
    }
  }
}

resource "aws_s3_bucket_public_access_block" "cache" {
  count = var.cache_type == "S3" ? 1 : 0

  bucket = aws_s3_bucket.cache[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# CodeBuild Project
resource "aws_codebuild_project" "main" {
  name          = var.project_name
  description   = "Build project for ${var.project_name}"
  build_timeout = var.build_timeout_minutes
  service_role  = aws_iam_role.codebuild.arn
  badge_enabled = var.enable_build_badge

  artifacts {
    type = "NO_ARTIFACTS"
  }

  cache {
    type  = var.cache_type
    modes = var.cache_type == "LOCAL" ? var.cache_modes : null
    location = var.cache_type == "S3" ? aws_s3_bucket.cache[0].bucket : null
  }

  environment {
    compute_type                = var.build_compute_type
    image                       = var.build_image
    type                        = "LINUX_CONTAINER"
    image_pull_credentials_type = "CODEBUILD"
    privileged_mode             = var.privileged_mode

    # CodeArtifact environment variables
    environment_variable {
      name  = "AWS_REGION"
      value = data.aws_region.current.name
    }

    environment_variable {
      name  = "CODEARTIFACT_DOMAIN"
      value = var.codeartifact_domain
    }

    environment_variable {
      name  = "CODEARTIFACT_DOMAIN_OWNER"
      value = var.codeartifact_domain_owner
    }

    environment_variable {
      name  = "CODEARTIFACT_REPO"
      value = var.codeartifact_repository
    }

    environment_variable {
      name  = "CODEARTIFACT_URL"
      value = "https://${var.codeartifact_domain}-${var.codeartifact_domain_owner}.d.codeartifact.${data.aws_region.current.name}.amazonaws.com/maven/${var.codeartifact_repository}/"
    }

    # Additional custom environment variables
    dynamic "environment_variable" {
      for_each = var.environment_variables
      content {
        name  = environment_variable.value.name
        value = environment_variable.value.value
        type  = environment_variable.value.type
      }
    }
  }

  logs_config {
    dynamic "cloudwatch_logs" {
      for_each = var.enable_cloudwatch_logs ? [1] : []
      content {
        group_name  = aws_cloudwatch_log_group.codebuild[0].name
        stream_name = "build-log"
        status      = "ENABLED"
      }
    }

    s3_logs {
      status = "DISABLED"
    }
  }

  source {
    type            = "GITHUB"
    location        = var.github_repo_url
    git_clone_depth = 1
    buildspec       = "buildspec.yml"

    git_submodules_config {
      fetch_submodules = false
    }
  }

  source_version = var.github_branch

  tags = merge(
    var.tags,
    {
      Name = var.project_name
    }
  )
}

# GitHub Webhook for automatic builds
resource "aws_codebuild_webhook" "main" {
  count = var.enable_webhook ? 1 : 0

  project_name = aws_codebuild_project.main.name

  dynamic "filter_group" {
    for_each = [var.webhook_filter_groups]
    content {
      dynamic "filter" {
        for_each = filter_group.value
        content {
          type    = filter.value.type
          pattern = filter.value.pattern
        }
      }
    }
  }
}
