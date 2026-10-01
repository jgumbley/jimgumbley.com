# Repository AWS infrastructure

Run commands from the repository root. `infra/Makefile` owns the recipes; root
targets only forward to it, preserving relative upload paths. Terraform,
deployment helpers, tests and documentation live here. Workflow definitions
remain in `.github/workflows/`, where GitHub requires them.

## First setup

Use Node.js 22+, Terraform 1.15.8 (pinned in Actions), AWS CLI v2 and GitHub CLI.
Terraform configurations require at least 1.10 for native S3 locking.

1. Authenticate AWS locally as an operator allowed to create the state bucket,
   OIDC provider and IAM policies/roles. For a new account, establish a human
   operator login first, for example through
   [IAM Identity Center](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html).
   Select that login using `AWS_PROFILE` or temporary AWS environment credentials.
   Bootstrap does not create the initial human login.
2. Authenticate `gh` as an administrator of `jgumbley/jimgumbley.com`. To log in
   through the repository's make entry point:

   ```sh
   make --eval='login: ; gh auth login' login
   ```

3. Run `make infra-test`, then `make bootstrap`. Bootstrap verifies both logins
   before provisioning. Terraform displays the foundation plan and asks for
   confirmation. Resources use **Ireland (`eu-west-1`)**.
4. Bootstrap creates the private state bucket, GitHub OIDC provider, deployment
   role and runtime permissions boundary. It migrates its local state into S3,
   verifies that migration, then sets these GitHub repository **variables**:

   | Variable | Purpose |
   | --- | --- |
   | `AWS_REGION` | `eu-west-1` |
   | `AWS_DEPLOY_ROLE_ARN` | Role assumed by Actions |
   | `TF_STATE_BUCKET` | Repository Terraform state bucket |
   | `AWS_RUNTIME_BOUNDARY_ARN` | Required boundary for application runtime roles |

5. Run `make wedding-upload-token`. It saves the guest token in a private, ignored
   local file and writes its hash to `infra/wedding/guest.auto.tfvars.json`. In
   GitHub **Settings → Secrets and variables → Actions → Variables**, set
   `WEDDING_GUEST_TOKEN_SHA256` to that file's `guest_token_sha256` value. Set
   `WEDDING_CLOSING_AT` to the agreed absolute UTC timestamp, such as
   `2027-01-01T00:00:00Z`. That is an example, not a configured deadline. Never put
   the raw guest token in GitHub.
6. Merge infrastructure changes to `main`. Actions tests, authenticates using
   temporary AWS credentials, plans and applies the wedding infrastructure.
   Variable changes do not trigger a push: use **Actions → Deploy AWS
   infrastructure → Run workflow**, selecting `main`, to deploy a later hash/date
   change or retry deployment after completing setup.

No permanent AWS credentials are stored in GitHub. Authentication follows
[GitHub's AWS OIDC guidance](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws).
Trust uses exact `main` subjects for this repository, supporting legacy and
immutable-ID formats. Bootstrap rejects custom OIDC subjects. The deployment job
has no GitHub environment because environment subjects differ from branch subjects.

## Commands and deployment

| Root command | Operation |
| --- | --- |
| `make bootstrap` | Operator-only foundation setup/update and GitHub configuration |
| `make infra-test` | Upload/helper tests and isolated, mocked Terraform tests |
| `make wedding-upload-test` | Offline upload tests only |
| `make wedding-upload-plan` | Initialize wedding S3 backend, validate and save a plan |
| `make wedding-upload-apply` | Apply that exact saved plan |
| `make wedding-upload-token` | Generate a local guest token and its hash once |
| `make wedding-upload` | Upload one file using the guest token |

The AWS workflow is separate from Pages. It runs for changes under `infra/`, the
root Makefile or its workflow definition, and only deploys from `main`. Tests run
before AWS authentication. Deployments share one concurrency group and never
cancel an active apply. Failed tests/plans stop deployment. Terraform/API errors
remain visible in Actions logs; a successful apply prints the upload endpoint
and bucket name. Verify the first deployment with the [upload CLI](wedding/README.md).

For local plan/apply, export `AWS_REGION`, `TF_STATE_BUCKET` and
`AWS_RUNTIME_BOUNDARY_ARN` from bootstrap's values, authenticate AWS locally, and
supply `TF_VAR_closing_at` plus `TF_VAR_guest_token_sha256` (or ignored local
wedding tfvars files). Actions supplies these explicitly. Photo/video limits
remain Terraform variables, defaulting to 25 MiB and 1 GiB. Change their committed
defaults to deploy different limits through Actions.

## State and permissions

The state bucket is `jimgumbley-com-tfstate-<account>-eu-west-1`: private, encrypted,
versioned, ACLs disabled and TLS required. Terraform uses
[native S3 lock files](https://developer.hashicorp.com/terraform/language/backend/s3),
not DynamoDB. Use the default workspace; projects have separate state keys:

- `bootstrap/terraform.tfstate`: foundation, managed only by the local operator.
- `apps/wedding/terraform.tfstate`: wedding resources, managed by Actions.

The deployment role can read/write application state and delete application lock
files, but cannot access bootstrap state, change the state bucket configuration,
modify its own role or change the runtime boundary. Runtime roles cannot access
the state bucket at all.

Application resources use `jimgumbley-com-app-` names; runtime roles use
`/jimgumbley-com/apps/`. Deployment permissions cover S3 buckets, Lambda,
CloudWatch log groups and constrained IAM runtime roles. New roles require the
bootstrap-owned boundary and can only be passed to Lambda. The boundary permits
application S3 object operations and writing application logs. The wedding role
further limits itself to encrypted uploads before closing. Only CloudWatch log
group discovery uses a wildcard resource, as required by that API.

This is reusable repository deployment access, not administrator access. Projects
sharing the role are in the same trust domain. Additional services or runtime
privileges require a reviewed bootstrap policy change and an operator rerun of
`make bootstrap`. Actions cannot expand its own permissions. Bootstrap changes in
a push are tested but are not applied by Actions.

## Reruns and recovery

Rerun `make bootstrap` with the same account to update the foundation or repair
GitHub variables. A fresh checkout discovers existing S3 bootstrap state and
reconnects. AWS permission/network errors are never treated as absent resources.
The state bucket, deployment role, OIDC provider and runtime boundary have
Terraform destruction protection.

First setup uses local state because the bucket does not yet exist. Migration
saves a private backup under `infra/bootstrap/.local/`, then writes ignored
`backend.generated.tf.json` to switch bootstrap to S3. Active local state is
removed only after remote state verification; the backup remains. AWS credentials
are not written into backend configuration. State, plans, settings and backups
are all ignored.

If apply or migration stops, retain the bootstrap directory and rerun with the
same account. Bootstrap resumes from the local source when necessary, or connects
to existing remote state. If the states disagree it stops without overwriting
either. Inspect their lineage/serial and recover the authoritative snapshot from
the retained backup or S3 version history before retrying. Do not force-copy a
stale snapshot over newer state. If the bucket exists but both state sources are
missing, restore state first; the command refuses to recreate resources blindly.

The earlier wedding configuration has never been deployed here. Names now use
the repository prefix, and the region is Ireland. If someone independently
applied the earlier local-state version, migrate/adopt that state explicitly
before using this version. Planning rejects active local wedding state rather
than silently starting a second deployment.

## Validation limits

`make infra-test` downloads providers on its first run but needs no AWS credentials.
It stages Terraform source and lock files under ignored `infra/.local/`; operator
tfvars, backend metadata and real state are never copied. AWS resources are mocked.
Tests cover upload policies, bootstrap sequencing, interrupted/conflicting state,
trust, permissions, workflow routing and relative upload paths.

These checks do not perform a deployment or prove live AWS authorization. The
first authenticated bootstrap, Actions run and CLI upload are the integration
check against the new account. No frontend changes are included.
