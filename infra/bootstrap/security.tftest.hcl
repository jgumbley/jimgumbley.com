mock_provider "aws" {
  mock_resource "aws_s3_bucket" {
    defaults = {
      id  = "jimgumbley-com-tfstate-123456789012-eu-west-1"
      arn = "arn:aws:s3:::jimgumbley-com-tfstate-123456789012-eu-west-1"
    }
  }
  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/jimgumbley-com-github-deploy"
    }
  }
  mock_resource "aws_iam_policy" {
    defaults = {
      arn = "arn:aws:iam::123456789012:policy/jimgumbley-com-runtime-boundary"
    }
  }
  mock_resource "aws_iam_openid_connect_provider" {
    defaults = {
      arn = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
    }
  }
}

variables {
  account_id           = "123456789012"
  github_owner_id      = "1234"
  github_repository_id = "5678"
}

run "repository_foundation" {
  command = apply

  assert {
    condition = (
      aws_s3_bucket_public_access_block.state.block_public_acls &&
      aws_s3_bucket_public_access_block.state.block_public_policy &&
      aws_s3_bucket_public_access_block.state.ignore_public_acls &&
      aws_s3_bucket_public_access_block.state.restrict_public_buckets &&
      one(aws_s3_bucket_ownership_controls.state.rule).object_ownership == "BucketOwnerEnforced" &&
      aws_s3_bucket_versioning.state.versioning_configuration[0].status == "Enabled" &&
      one(one(aws_s3_bucket_server_side_encryption_configuration.state.rule).apply_server_side_encryption_by_default).sse_algorithm == "AES256" &&
      !aws_s3_bucket.state.force_destroy
    )
    error_message = "Terraform state must remain private, encrypted and versioned."
  }

  assert {
    condition = (
      aws_iam_openid_connect_provider.github.url == "https://token.actions.githubusercontent.com" &&
      toset(aws_iam_openid_connect_provider.github.client_id_list) == toset(["sts.amazonaws.com"]) &&
      jsondecode(aws_iam_role.deploy.assume_role_policy).Statement[0].Action == "sts:AssumeRoleWithWebIdentity" &&
      jsondecode(aws_iam_role.deploy.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:aud"] == "sts.amazonaws.com" &&
      toset(jsondecode(aws_iam_role.deploy.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"]) == toset([
        "repo:jgumbley/jimgumbley.com:ref:refs/heads/main",
        "repo:jgumbley@1234/jimgumbley.com@5678:ref:refs/heads/main"
      ])
    )
    error_message = "OIDC must trust only this repository's main branch, using exact subjects and audience."
  }

  assert {
    condition = alltrue([
      for statement in jsondecode(aws_iam_role_policy.deploy.policy).Statement : (
        statement.Sid != "CreateBoundedRuntimeRoles" ? true :
        statement.Condition.ArnEquals["iam:PermissionsBoundary"] == aws_iam_policy.runtime_boundary.arn &&
        statement.Resource == "arn:aws:iam::123456789012:role/jimgumbley-com/apps/*"
      )
      ]) && alltrue([
      for statement in jsondecode(aws_iam_role_policy.deploy.policy).Statement : (
        statement.Sid != "PassRuntimeRolesToLambda" ? true :
        statement.Condition.StringEquals["iam:PassedToService"] == "lambda.amazonaws.com"
      )
      ]) && contains([
      for statement in jsondecode(aws_iam_role_policy.deploy.policy).Statement : statement.Sid
      if statement.Effect == "Deny" && try(statement.Action == "iam:DeleteRolePermissionsBoundary", false)
    ], "NeverRemoveRuntimeBoundary")
    error_message = "Created roles must have the fixed boundary, it cannot be removed, and roles can only be passed to Lambda."
  }

  assert {
    condition = alltrue([
      for statement in jsondecode(aws_iam_policy.runtime_boundary.policy).Statement :
      statement.Effect == "Allow" && can(regex("jimgumbley-com-app-", statement.Resource))
      ]) && alltrue([
      for statement in jsondecode(aws_iam_role_policy.deploy.policy).Statement :
      try(statement.Resource != "*", true) || statement.Sid == "DiscoverLogGroups"
    ])
    error_message = "Runtime privileges must be application-scoped; only log discovery may use a wildcard resource."
  }

  assert {
    condition = (
      jsondecode(aws_s3_bucket_policy.state.policy).Statement[1].Effect == "Deny" &&
      jsondecode(aws_s3_bucket_policy.state.policy).Statement[1].Resource == "${aws_s3_bucket.state.arn}/bootstrap/*" &&
      jsondecode(aws_s3_bucket_policy.state.policy).Statement[1].Condition.ArnEquals["aws:PrincipalArn"] == aws_iam_role.deploy.arn &&
      jsondecode(aws_s3_bucket_policy.state.policy).Statement[2].Condition.ArnLike["aws:PrincipalArn"] == "arn:aws:iam::123456789012:role/jimgumbley-com/apps/*"
    )
    error_message = "Application deployment cannot access bootstrap state; runtime roles cannot access any Terraform state."
  }

  assert {
    condition = (
      output.github_variables.AWS_REGION == "eu-west-1" &&
      output.github_variables.AWS_DEPLOY_ROLE_ARN == aws_iam_role.deploy.arn &&
      output.github_variables.TF_STATE_BUCKET == aws_s3_bucket.state.id &&
      output.github_variables.AWS_RUNTIME_BOUNDARY_ARN == aws_iam_policy.runtime_boundary.arn &&
      length(output.github_variables) == 4
    )
    error_message = "Publish only the four non-secret repository deployment settings."
  }
}

run "invalid_identity" {
  command = plan
  variables {
    account_id           = "wrong-account"
    github_owner_id      = "owner"
    github_repository_id = "repo"
  }
  expect_failures = [var.account_id, var.github_owner_id, var.github_repository_id]
}
