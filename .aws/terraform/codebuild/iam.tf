# IAM Role and Policies for CodeBuild

# CodeBuild service role
resource "aws_iam_role" "codebuild" {
  name               = "${var.project_name}-codebuild-role"
  assume_role_policy = data.aws_iam_policy_document.codebuild_assume_role.json

  tags = {
    Name = "${var.project_name}-codebuild-role"
  }
}

# Assume role policy
data "aws_iam_policy_document" "codebuild_assume_role" {
  statement {
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["codebuild.amazonaws.com"]
    }

    actions = ["sts:AssumeRole"]
  }
}

# CodeBuild service policy
resource "aws_iam_role_policy" "codebuild" {
  role   = aws_iam_role.codebuild.name
  policy = data.aws_iam_policy_document.codebuild.json
}

data "aws_iam_policy_document" "codebuild" {
  # CloudWatch Logs
  statement {
    effect = "Allow"

    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]

    resources = [
      "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/codebuild/${var.project_name}",
      "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/codebuild/${var.project_name}:*",
    ]
  }

  # S3 - Artifacts
  statement {
    effect = "Allow"

    actions = [
      "s3:PutObject",
      "s3:GetObject",
      "s3:GetObjectVersion",
      "s3:GetBucketAcl",
      "s3:GetBucketLocation",
    ]

    resources = [
      "arn:aws:s3:::${var.artifact_bucket_name}/*",
      "arn:aws:s3:::${var.artifact_bucket_name}",
    ]
  }

  # S3 - Cache
  statement {
    effect = "Allow"

    actions = [
      "s3:PutObject",
      "s3:GetObject",
      "s3:GetObjectVersion",
    ]

    resources = [
      "arn:aws:s3:::${var.cache_bucket_name}/*",
      "arn:aws:s3:::${var.cache_bucket_name}",
    ]
  }

  # S3 - Logs
  statement {
    effect = "Allow"

    actions = [
      "s3:PutObject",
      "s3:GetBucketAcl",
      "s3:GetBucketLocation",
    ]

    resources = [
      "arn:aws:s3:::${var.logs_bucket_name}/*",
      "arn:aws:s3:::${var.logs_bucket_name}",
    ]
  }

  # Systems Manager Parameter Store - GitHub Token
  statement {
    effect = "Allow"

    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
    ]

    resources = [
      "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${var.github_token_parameter}",
    ]
  }

  # CodeBuild - Reports
  statement {
    effect = "Allow"

    actions = [
      "codebuild:CreateReportGroup",
      "codebuild:CreateReport",
      "codebuild:UpdateReport",
      "codebuild:BatchPutTestCases",
      "codebuild:BatchPutCodeCoverages",
    ]

    resources = [
      "arn:aws:codebuild:${var.aws_region}:${data.aws_caller_identity.current.account_id}:report-group/${var.project_name}-*",
    ]
  }
}

# Get current AWS account ID
data "aws_caller_identity" "current" {}
