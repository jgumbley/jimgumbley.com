terraform {
  required_version = ">= 1.10.0, < 2.0.0"
  backend "s3" {
    key                  = "apps/wedding/terraform.tfstate"
    workspace_key_prefix = "apps/workspaces"
    encrypt              = true
    use_lockfile         = true
  }
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.7"
    }
  }
}

provider "aws" {
  region              = var.region
  allowed_account_ids = [var.account_id]
}

variable "account_id" {
  type = string
  validation {
    condition     = can(regex("^[0-9]{12}$", var.account_id))
    error_message = "Account ID must match the repository bootstrap."
  }
}

variable "runtime_boundary_arn" {
  type = string
  validation {
    condition     = can(regex("^arn:aws:iam::[0-9]{12}:policy/jimgumbley-com-runtime-boundary$", var.runtime_boundary_arn))
    error_message = "Use the runtime permissions boundary created by repository bootstrap."
  }
}

variable "region" {
  type    = string
  default = "eu-west-1"
  validation {
    condition     = var.region == "eu-west-1"
    error_message = "Repository infrastructure is deployed in Ireland (eu-west-1)."
  }
}

variable "name" {
  type    = string
  default = "jimgumbley-com-app-wedding"
  validation {
    condition     = can(regex("^jimgumbley-com-app-[a-z0-9-]{1,18}$", var.name))
    error_message = "Name must use the jimgumbley-com-app- prefix and a 1–18 character lowercase suffix."
  }
}

variable "guest_token_sha256" {
  type        = string
  description = "SHA-256 of a locally generated 32-byte guest token. Never supply the raw token."
  validation {
    condition     = can(regex("^[a-f0-9]{64}$", var.guest_token_sha256))
    error_message = "Generate the token and hash with make wedding-upload-token."
  }
}

variable "closing_at" {
  type        = string
  description = "Fixed UTC closing timestamp, e.g. 2027-01-01T00:00:00Z. Required; no rolling deadline."
  validation {
    condition     = can(regex("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$", var.closing_at)) && can(formatdate("YYYY", var.closing_at))
    error_message = "Supply an absolute UTC timestamp in YYYY-MM-DDTHH:MM:SSZ format."
  }
}

variable "photo_max_bytes" {
  type    = number
  default = 26214400
  validation {
    condition     = var.photo_max_bytes >= 1 && var.photo_max_bytes <= 5368709120 && floor(var.photo_max_bytes) == var.photo_max_bytes
    error_message = "Photo limit must be an integer between 1 byte and 5 GiB."
  }
}

variable "video_max_bytes" {
  type    = number
  default = 1073741824
  validation {
    condition     = var.video_max_bytes >= 1 && var.video_max_bytes <= 5368709120 && floor(var.video_max_bytes) == var.video_max_bytes
    error_message = "Video limit must be an integer between 1 byte and 5 GiB."
  }
}

resource "aws_s3_bucket" "uploads" {
  bucket_prefix = "${var.name}-"
  force_destroy = false
}

resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket                  = aws_s3_bucket.uploads.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_policy" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport", Effect = "Deny", Principal = "*", Action = "s3:*"
        Resource  = [aws_s3_bucket.uploads.arn, "${aws_s3_bucket.uploads.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
      {
        Sid       = "DenyUploadsAfterClosing", Effect = "Deny", Principal = "*", Action = "s3:PutObject"
        Resource  = "${aws_s3_bucket.uploads.arn}/*"
        Condition = { DateGreaterThanEquals = { "aws:CurrentTime" = var.closing_at } }
      }
    ]
  })
}

resource "aws_iam_role" "signer" {
  name_prefix          = "${var.name}-"
  path                 = "/jimgumbley-com/apps/"
  permissions_boundary = var.runtime_boundary_arn
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_cloudwatch_log_group" "signer" {
  name              = "/aws/lambda/${var.name}"
  retention_in_days = 14
}

resource "aws_iam_role_policy" "signer" {
  role = aws_iam_role.signer.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow", Action = "s3:PutObject", Resource = "${aws_s3_bucket.uploads.arn}/uploads/*"
        Condition = {
          DateLessThan = { "aws:CurrentTime" = var.closing_at }
          StringEquals = { "s3:x-amz-server-side-encryption" = "AES256" }
        }
      },
      {
        Effect   = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.signer.arn}:*"
      }
    ]
  })
}

# Archive only the signer, never the local token, Terraform files or client.
data "archive_file" "signer" {
  type        = "zip"
  source_file = "${path.module}/signer.mjs"
  output_path = "${path.module}/lambda.zip"
}

resource "aws_lambda_function" "signer" {
  function_name    = var.name
  role             = aws_iam_role.signer.arn
  filename         = data.archive_file.signer.output_path
  source_code_hash = data.archive_file.signer.output_base64sha256
  handler          = "signer.handler"
  runtime          = "nodejs22.x"
  timeout          = 10
  memory_size      = 128
  environment {
    variables = {
      BUCKET_NAME        = aws_s3_bucket.uploads.id
      GUEST_TOKEN_SHA256 = var.guest_token_sha256
      CLOSING_AT         = var.closing_at
      PHOTO_MAX_BYTES    = tostring(var.photo_max_bytes)
      VIDEO_MAX_BYTES    = tostring(var.video_max_bytes)
    }
  }
  depends_on = [aws_iam_role_policy.signer, aws_cloudwatch_log_group.signer]
}

resource "aws_lambda_function_url" "signer" {
  function_name      = aws_lambda_function.signer.function_name
  authorization_type = "NONE"
}

resource "aws_lambda_permission" "url" {
  statement_id           = "PublicFunctionURL"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.signer.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

resource "aws_lambda_permission" "invoke" {
  statement_id             = "InvokeOnlyViaURL"
  action                   = "lambda:InvokeFunction"
  function_name            = aws_lambda_function.signer.function_name
  principal                = "*"
  invoked_via_function_url = true
}

output "upload_url" {
  value = aws_lambda_function_url.signer.function_url
}

output "bucket_name" {
  value = aws_s3_bucket.uploads.id
}
