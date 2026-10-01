terraform {
  required_version = ">= 1.10.0, < 2.0.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

variable "account_id" {
  type = string
  validation {
    condition     = can(regex("^[0-9]{12}$", var.account_id))
    error_message = "Bootstrap requires the authenticated AWS account ID."
  }
}

variable "github_owner_id" {
  type = string
  validation {
    condition     = can(regex("^[0-9]+$", var.github_owner_id))
    error_message = "GitHub owner ID must be numeric."
  }
}

variable "github_repository_id" {
  type = string
  validation {
    condition     = can(regex("^[0-9]+$", var.github_repository_id))
    error_message = "GitHub repository ID must be numeric."
  }
}

locals {
  region      = "eu-west-1"
  prefix      = "jimgumbley-com"
  app_prefix  = "${local.prefix}-app-"
  role_path   = "/${local.prefix}/apps/"
  role_arn    = "arn:aws:iam::${var.account_id}:role${local.role_path}*"
  bucket_name = "${local.prefix}-tfstate-${var.account_id}-${local.region}"
  app_buckets = "arn:aws:s3:::${local.app_prefix}*"
  app_logs    = "arn:aws:logs:${local.region}:${var.account_id}:log-group:/aws/lambda/${local.app_prefix}*"
  subjects = [
    "repo:jgumbley/jimgumbley.com:ref:refs/heads/main",
    "repo:jgumbley@${var.github_owner_id}/jimgumbley.com@${var.github_repository_id}:ref:refs/heads/main"
  ]
}

provider "aws" {
  region              = local.region
  allowed_account_ids = [var.account_id]
}

resource "aws_s3_bucket" "state" {
  bucket        = local.bucket_name
  force_destroy = false
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_iam_role" "deploy" {
  name = "${local.prefix}-github-deploy"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRoleWithWebIdentity"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Condition = { StringEquals = {
        "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        "token.actions.githubusercontent.com:sub" = local.subjects
      } }
    }]
  })
  lifecycle {
    prevent_destroy = true
  }
}

# Applications cannot obtain IAM, bootstrap or deployment permissions by creating
# a runtime role. Only bootstrap can change this ceiling; inline policies narrow it.
resource "aws_iam_policy" "runtime_boundary" {
  name = "${local.prefix}-runtime-boundary"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ApplicationObjects", Effect = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = "${local.app_buckets}/*"
      },
      {
        Sid    = "ApplicationListing", Effect = "Allow"
        Action = "s3:ListBucket", Resource = local.app_buckets
      },
      {
        Sid      = "ApplicationLogs", Effect = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${local.app_logs}:*"
      }
    ]
  })
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "TLSOnly", Effect = "Deny", Principal = "*", Action = "s3:*"
        Resource  = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
      {
        Sid       = "ProtectBootstrapState", Effect = "Deny", Principal = "*", Action = "s3:*"
        Resource  = "${aws_s3_bucket.state.arn}/bootstrap/*"
        Condition = { ArnEquals = { "aws:PrincipalArn" = aws_iam_role.deploy.arn } }
      },
      {
        Sid       = "NoRuntimeStateAccess", Effect = "Deny", Principal = "*", Action = "s3:*"
        Resource  = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
        Condition = { ArnLike = { "aws:PrincipalArn" = local.role_arn } }
      }
    ]
  })
}

resource "aws_iam_role_policy" "deploy" {
  name = "repository-deployment"
  role = aws_iam_role.deploy.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "ListApplicationState", Effect = "Allow", Action = "s3:ListBucket"
        Resource  = aws_s3_bucket.state.arn
        Condition = { StringLike = { "s3:prefix" = ["apps/", "apps/*"] } }
      },
      {
        Sid      = "ReadWriteApplicationState", Effect = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject"]
        Resource = "${aws_s3_bucket.state.arn}/apps/*"
      },
      {
        Sid      = "ReleaseApplicationLocks", Effect = "Allow", Action = "s3:DeleteObject"
        Resource = "${aws_s3_bucket.state.arn}/apps/*.tflock"
      },
      {
        Sid = "ManageApplicationBuckets", Effect = "Allow"
        Action = [
          "s3:CreateBucket", "s3:DeleteBucket", "s3:ListBucket", "s3:GetBucket*",
          "s3:GetEncryptionConfiguration", "s3:GetLifecycleConfiguration", "s3:GetReplicationConfiguration",
          "s3:GetAccelerateConfiguration", "s3:PutBucketTagging", "s3:PutBucketPublicAccessBlock",
          "s3:PutBucketOwnershipControls", "s3:DeleteBucketOwnershipControls",
          "s3:PutEncryptionConfiguration", "s3:PutBucketVersioning", "s3:PutBucketPolicy", "s3:DeleteBucketPolicy"
        ]
        Resource = local.app_buckets
      },
      {
        Sid = "ManageApplicationFunctions", Effect = "Allow"
        Action = [
          "lambda:CreateFunction", "lambda:DeleteFunction", "lambda:GetFunction", "lambda:GetFunctionConfiguration",
          "lambda:UpdateFunctionCode", "lambda:UpdateFunctionConfiguration", "lambda:GetFunctionCodeSigningConfig",
          "lambda:GetRuntimeManagementConfig", "lambda:PutRuntimeManagementConfig", "lambda:ListVersionsByFunction",
          "lambda:GetFunctionConcurrency", "lambda:PutFunctionConcurrency", "lambda:DeleteFunctionConcurrency",
          "lambda:CreateFunctionUrlConfig", "lambda:UpdateFunctionUrlConfig", "lambda:DeleteFunctionUrlConfig",
          "lambda:GetFunctionUrlConfig", "lambda:AddPermission", "lambda:RemovePermission", "lambda:GetPolicy",
          "lambda:ListTags", "lambda:TagResource", "lambda:UntagResource"
        ]
        Resource = "arn:aws:lambda:${local.region}:${var.account_id}:function:${local.app_prefix}*"
      },
      {
        Sid = "DiscoverLogGroups", Effect = "Allow", Action = "logs:DescribeLogGroups", Resource = "*"
      },
      {
        Sid = "ManageApplicationLogs", Effect = "Allow"
        Action = [
          "logs:CreateLogGroup", "logs:DeleteLogGroup", "logs:PutRetentionPolicy", "logs:DeleteRetentionPolicy",
          "logs:ListTagsForResource", "logs:TagResource", "logs:UntagResource"
        ]
        Resource = [local.app_logs, "${local.app_logs}:*"]
      },
      {
        Sid      = "CreateBoundedRuntimeRoles", Effect = "Allow"
        Action   = ["iam:CreateRole", "iam:PutRolePermissionsBoundary"]
        Resource = local.role_arn
        Condition = { ArnEquals = {
          "iam:PermissionsBoundary" = aws_iam_policy.runtime_boundary.arn
        } }
      },
      {
        Sid = "ManageRuntimeRoles", Effect = "Allow"
        Action = [
          "iam:GetRole", "iam:DeleteRole", "iam:UpdateRole", "iam:UpdateRoleDescription", "iam:UpdateAssumeRolePolicy",
          "iam:GetRolePolicy", "iam:PutRolePolicy", "iam:DeleteRolePolicy", "iam:ListRolePolicies",
          "iam:ListAttachedRolePolicies", "iam:ListInstanceProfilesForRole", "iam:TagRole", "iam:UntagRole"
        ]
        Resource = local.role_arn
      },
      {
        Sid       = "PassRuntimeRolesToLambda", Effect = "Allow", Action = "iam:PassRole"
        Resource  = local.role_arn
        Condition = { StringEquals = { "iam:PassedToService" = "lambda.amazonaws.com" } }
      },
      {
        Sid    = "ReadRuntimeBoundary", Effect = "Allow"
        Action = ["iam:GetPolicy", "iam:GetPolicyVersion"], Resource = aws_iam_policy.runtime_boundary.arn
      },
      {
        Sid    = "NeverRemoveRuntimeBoundary", Effect = "Deny"
        Action = "iam:DeleteRolePermissionsBoundary", Resource = local.role_arn
      }
    ]
  })
}

output "account_id" {
  value = var.account_id
}

output "github_variables" {
  value = {
    AWS_REGION               = local.region
    AWS_DEPLOY_ROLE_ARN      = aws_iam_role.deploy.arn
    TF_STATE_BUCKET          = aws_s3_bucket.state.id
    AWS_RUNTIME_BOUNDARY_ARN = aws_iam_policy.runtime_boundary.arn
  }
}
