# AWS resources are mocked: this test never creates cloud infrastructure.
mock_provider "aws" {
  mock_resource "aws_s3_bucket" {
    defaults = {
      id  = "wedding-test-bucket"
      arn = "arn:aws:s3:::wedding-test-bucket"
    }
  }
  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/wedding-test"
    }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = {
      arn = "arn:aws:logs:eu-west-2:123456789012:log-group:/aws/lambda/wedding-uploads"
    }
  }
}

variables {
  account_id           = "123456789012"
  runtime_boundary_arn = "arn:aws:iam::123456789012:policy/jimgumbley-com-runtime-boundary"
  guest_token_sha256   = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  closing_at           = "2030-06-01T13:00:00Z"
}

run "private_storage_and_restricted_signer" {
  command = apply

  assert {
    condition = (
      aws_iam_role.signer.permissions_boundary == var.runtime_boundary_arn &&
      aws_iam_role.signer.path == "/jimgumbley-com/apps/" &&
      startswith(aws_lambda_function.signer.function_name, "jimgumbley-com-app-") &&
      startswith(aws_s3_bucket.uploads.bucket_prefix, "jimgumbley-com-app-")
    )
    error_message = "Application resources must remain within the repository deployment role and runtime boundary."
  }

  assert {
    condition = (
      aws_s3_bucket_public_access_block.uploads.block_public_acls &&
      aws_s3_bucket_public_access_block.uploads.block_public_policy &&
      aws_s3_bucket_public_access_block.uploads.ignore_public_acls &&
      aws_s3_bucket_public_access_block.uploads.restrict_public_buckets &&
      !aws_s3_bucket.uploads.force_destroy &&
      one(aws_s3_bucket_ownership_controls.uploads.rule).object_ownership == "BucketOwnerEnforced"
    )
    error_message = "Storage must remain private, with ACLs disabled and nonempty buckets protected."
  }

  assert {
    condition = (
      jsondecode(aws_s3_bucket_policy.uploads.policy).Statement[1].Effect == "Deny" &&
      jsondecode(aws_s3_bucket_policy.uploads.policy).Statement[1].Action == "s3:PutObject" &&
      jsondecode(aws_s3_bucket_policy.uploads.policy).Statement[1].Principal == "*" &&
      jsondecode(aws_s3_bucket_policy.uploads.policy).Statement[1].Resource == "${aws_s3_bucket.uploads.arn}/*" &&
      jsondecode(aws_s3_bucket_policy.uploads.policy).Statement[1].Condition.DateGreaterThanEquals["aws:CurrentTime"] == var.closing_at
    )
    error_message = "Bucket must deny every new object write at and after the fixed closing time."
  }

  assert {
    condition = (
      jsondecode(aws_iam_role_policy.signer.policy).Statement[0].Action == "s3:PutObject" &&
      jsondecode(aws_iam_role_policy.signer.policy).Statement[0].Resource == "${aws_s3_bucket.uploads.arn}/uploads/*" &&
      jsondecode(aws_iam_role_policy.signer.policy).Statement[0].Condition.DateLessThan["aws:CurrentTime"] == var.closing_at &&
      jsondecode(aws_iam_role_policy.signer.policy).Statement[0].Condition.StringEquals["s3:x-amz-server-side-encryption"] == "AES256"
    )
    error_message = "Signer must have only encrypted upload permission, limited by prefix and closing time."
  }

  assert {
    condition = (
      aws_lambda_function.signer.environment[0].variables.GUEST_TOKEN_SHA256 == var.guest_token_sha256 &&
      aws_lambda_function.signer.environment[0].variables.CLOSING_AT == var.closing_at &&
      aws_lambda_function.signer.environment[0].variables.PHOTO_MAX_BYTES == tostring(var.photo_max_bytes) &&
      aws_lambda_function.signer.environment[0].variables.VIDEO_MAX_BYTES == tostring(var.video_max_bytes) &&
      length(aws_lambda_function.signer.environment[0].variables) == 5 &&
      aws_lambda_permission.invoke.invoked_via_function_url &&
      aws_lambda_permission.url.function_url_auth_type == "NONE"
    )
    error_message = "Lambda needs the hash, limits and deadline, with public invocation restricted to the URL."
  }
}

run "invalid_settings" {
  command = plan
  variables {
    guest_token_sha256 = "raw-token-is-not-a-hash"
    closing_at         = "tomorrow"
    photo_max_bytes    = 0
    video_max_bytes    = 5368709121
  }
  expect_failures = [var.guest_token_sha256, var.closing_at, var.photo_max_bytes, var.video_max_bytes]
}
