# Data sources
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# CodeArtifact Domain
resource "aws_codeartifact_domain" "main" {
  domain = var.domain_name

  tags = merge(
    var.tags,
    {
      Name = var.domain_name
    }
  )
}

# CodeArtifact Repository
resource "aws_codeartifact_repository" "main" {
  repository = var.repository_name
  domain     = aws_codeartifact_domain.main.domain
  description = var.repository_description

  tags = merge(
    var.tags,
    {
      Name = var.repository_name
    }
  )
}

# Maven Central Upstream Repository (if enabled)
resource "aws_codeartifact_repository" "maven_central" {
  count = var.enable_maven_central_upstream ? 1 : 0

  repository = "maven-central-store"
  domain     = aws_codeartifact_domain.main.domain
  description = "Maven Central upstream repository"

  external_connections {
    external_connection_name = "public:maven-central"
  }

  tags = merge(
    var.tags,
    {
      Name = "maven-central-store"
    }
  )
}

# Associate upstream repository
resource "aws_codeartifact_repository_association" "maven_central" {
  count = var.enable_maven_central_upstream ? 1 : 0

  domain          = aws_codeartifact_domain.main.domain
  repository      = aws_codeartifact_repository.main.repository
  upstream_repository = aws_codeartifact_repository.maven_central[0].repository

  depends_on = [
    aws_codeartifact_repository.main,
    aws_codeartifact_repository.maven_central
  ]
}

# Domain Policy (if principals are specified)
resource "aws_codeartifact_domain_permissions_policy" "main" {
  count = length(var.allowed_principals) > 0 ? 1 : 0

  domain          = aws_codeartifact_domain.main.domain
  policy_document = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowDomainAccess"
        Effect = "Allow"
        Principal = {
          AWS = var.allowed_principals
        }
        Action = [
          "codeartifact:GetDomainPermissionsPolicy",
          "codeartifact:DescribeDomain",
          "codeartifact:ListRepositoriesInDomain",
          "codeartifact:GetAuthorizationToken"
        ]
        Resource = "*"
      }
    ]
  })
}

# Repository Policy (if principals are specified)
resource "aws_codeartifact_repository_permissions_policy" "main" {
  count = length(var.allowed_principals) > 0 ? 1 : 0

  domain     = aws_codeartifact_domain.main.domain
  repository = aws_codeartifact_repository.main.repository

  policy_document = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowRepositoryReadWrite"
        Effect = "Allow"
        Principal = {
          AWS = var.allowed_principals
        }
        Action = [
          "codeartifact:DescribePackageVersion",
          "codeartifact:DescribeRepository",
          "codeartifact:GetPackageVersionReadme",
          "codeartifact:GetRepositoryEndpoint",
          "codeartifact:ListPackages",
          "codeartifact:ListPackageVersions",
          "codeartifact:ListPackageVersionAssets",
          "codeartifact:PublishPackageVersion",
          "codeartifact:PutPackageMetadata",
          "codeartifact:ReadFromRepository"
        ]
        Resource = "*"
      }
    ]
  })
}

# IAM Policy for CI/CD access (optional, can be attached to roles/users)
resource "aws_iam_policy" "codeartifact_access" {
  name        = "${var.domain_name}-codeartifact-access"
  description = "IAM policy for accessing CodeArtifact domain and repository"

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
          aws_codeartifact_repository.main.arn,
          "${aws_codeartifact_repository.main.arn}/*"
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
          aws_codeartifact_repository.main.arn,
          "${aws_codeartifact_repository.main.arn}/*"
        ]
      }
    ]
  })

  tags = merge(
    var.tags,
    {
      Name = "${var.domain_name}-codeartifact-access"
    }
  )
}
