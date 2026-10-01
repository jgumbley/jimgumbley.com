import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const repository = 'jgumbley/jimgumbley.com';
export const region = 'eu-west-1';
const infra = fileURLToPath(new URL('./', import.meta.url));

function execute(program, args, { env = process.env, capture = false } = {}) {
  const result = spawnSync(program, args, {
    env: { ...env, AWS_PAGER: '' }, encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${program} ${args[0]} failed (${result.status}): ${result.stderr ?? ''}`);
  return result.stdout;
}

async function readJSON(path) {
  try {
    const contents = await readFile(path, 'utf8');
    // Terraform empties the local state file after moving it to a backend.
    if (contents.length === 0 && path.endsWith('.tfstate')) return null;
    return JSON.parse(contents);
  }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function saveJSON(path, value) {
  await writeFile(path, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
}

export function backend(bucket, key, account) {
  return { terraform: { backend: { s3: {
    bucket, key, region, encrypt: true, use_lockfile: true,
    allowed_account_ids: [account], workspace_key_prefix: 'bootstrap/workspaces',
  } } } };
}

export function sameState(left, right) {
  return left.lineage === right.lineage && left.serial === right.serial &&
    migratedState(left, right);
}

export function migratedState(source, destination) {
  // The first S3 snapshot can receive a new lineage and serial. Verify the
  // actual managed resources and outputs; migration need not retain metadata.
  return isDeepStrictEqual(source.resources, destination.resources) &&
    isDeepStrictEqual(source.outputs, destination.outputs);
}

// Only this local operator command can change repository deployment access.
// A generated backend declaration lets the very first apply use local state.
export async function bootstrap({ directory = join(infra, 'bootstrap'), run = execute, env = process.env } = {}) {
  if (env.TF_WORKSPACE && env.TF_WORKSPACE !== 'default') throw new Error('Bootstrap uses the default Terraform workspace.');
  env = { ...env, TF_WORKSPACE: 'default' };
  const capture = { env, capture: true };
  run('gh', ['auth', 'status'], capture);
  const repo = JSON.parse(run('gh', ['api', `repos/${repository}`], capture));
  if (repo.full_name !== repository || !repo.permissions?.admin || !repo.id || !repo.owner?.id)
    throw new Error(`Bootstrap requires GitHub administrator access to ${repository}`);
  const oidc = JSON.parse(run('gh', ['api', `repos/${repository}/actions/oidc/customization/sub`], capture));
  if (!oidc.use_default) throw new Error('Custom GitHub OIDC subjects are not supported; restore the default subject before bootstrap.');
  const identity = JSON.parse(run('aws', ['sts', 'get-caller-identity', '--region', region, '--output', 'json'], capture));
  if (!/^[0-9]{12}$/.test(identity.Account)) throw new Error('Invalid AWS account identity');
  const account = identity.Account;
  const bucket = `jimgumbley-com-tfstate-${account}-${region}`;
  const config = backend(bucket, 'bootstrap/terraform.tfstate', account);
  const local = join(directory, '.local');
  const backendPath = join(directory, 'backend.generated.tf.json');
  const statePath = join(directory, 'terraform.tfstate');
  const previous = await readJSON(join(local, 'identity.json'));
  if (previous && previous.account !== account) throw new Error('This checkout was bootstrapped in another AWS account; refusing to switch accounts.');
  const existingBackend = await readJSON(backendPath);
  if (existingBackend && JSON.stringify(existingBackend) !== JSON.stringify(config))
    throw new Error('Bootstrap backend differs from the expected repository/account configuration.');
  await mkdir(local, { recursive: true, mode: 0o700 });
  await saveJSON(join(local, 'identity.json'), { account });
  await saveJSON(join(directory, 'bootstrap.auto.tfvars.json'), {
    account_id: account, github_owner_id: String(repo.owner.id), github_repository_id: String(repo.id),
  });
  const tf = (...args) => run('terraform', [`-chdir=${directory}`, ...args], { env });
  const tfJSON = (...args) => JSON.parse(run('terraform', [`-chdir=${directory}`, ...args], { env, capture: true }));
  const buckets = JSON.parse(run('aws', ['s3api', 'list-buckets', '--region', region, '--output', 'json'], capture));
  const bucketExists = buckets.Buckets.some(item => item.Name === bucket);
  const localState = await readJSON(statePath);
  const hasLocalState = Boolean(localState?.resources?.length);
  if (hasLocalState && localState.outputs?.account_id?.value !== account)
    throw new Error('Local bootstrap state does not belong to the authenticated account.');
  let remoteState = null;
  if (bucketExists) {
    const objects = JSON.parse(run('aws', ['s3api', 'list-objects-v2', '--bucket', bucket,
      '--prefix', 'bootstrap/terraform.tfstate', '--region', region, '--output', 'json'], capture));
    if (objects.Contents?.some(item => item.Key === 'bootstrap/terraform.tfstate')) {
      const download = join(local, 'remote-bootstrap.tfstate');
      run('aws', ['s3api', 'get-object', '--bucket', bucket, '--key', 'bootstrap/terraform.tfstate',
        '--region', region, download], capture);
      remoteState = await readJSON(download);
      if (!remoteState?.resources?.length) throw new Error('Remote bootstrap state is empty; recover it before continuing.');
    }
  }
  if (remoteState) {
    const backup = await readJSON(join(local, 'before-migration.tfstate'));
    const completedMigration = existingBackend && backup && hasLocalState &&
      sameState(localState, backup) && migratedState(localState, remoteState);
    if (hasLocalState && !sameState(localState, remoteState) && !completedMigration)
      throw new Error('Local and remote bootstrap state disagree. Recover the authoritative state before retrying; neither has been overwritten.');
    await saveJSON(backendPath, config);
    // S3 already has authoritative state; never copy a stale local snapshot over it.
    tf('init', '-input=false', '-reconfigure', '-lockfile=readonly');
  } else {
    if (bucketExists && !hasLocalState)
      throw new Error('The state bucket exists but bootstrap state is missing. Restore state instead of recreating resources.');
    if (existingBackend) {
      if (!bucketExists || !hasLocalState) throw new Error('Interrupted migration has no source state/bucket; recover bootstrap state.');
      await copyFile(statePath, join(local, 'before-migration.tfstate'));
      tf('init', '-input=false', '-migrate-state', '-force-copy', '-lockfile=readonly');
      if (!migratedState(localState, tfJSON('state', 'pull'))) throw new Error('Migrated state verification failed; local backup retained.');
    } else {
      tf('init', '-input=false', '-lockfile=readonly');
    }
  }

  if ((remoteState || existingBackend) && (await readJSON(statePath))?.resources?.length) {
    if (!migratedState(localState, tfJSON('state', 'pull'))) throw new Error('Remote bootstrap state verification failed; local source retained.');
    await copyFile(statePath, join(local, 'migrated.tfstate'));
    await rm(statePath);
  }

  // Terraform presents its concrete plan and asks the operator to confirm it.
  tf('apply', '-lock-timeout=5m');
  if (!remoteState && !existingBackend) {
    const source = await readJSON(statePath);
    if (!source?.resources?.length) throw new Error('Bootstrap produced no local state; refusing migration.');
    await copyFile(statePath, join(local, 'before-migration.tfstate'));
    await saveJSON(backendPath, config);
    tf('init', '-input=false', '-migrate-state', '-force-copy', '-lockfile=readonly');
    if (!migratedState(source, tfJSON('state', 'pull'))) throw new Error('Migrated state verification failed; local backup retained.');
  }
  // Terraform may leave a source snapshot after migration. Preserve it as a
  // backup, but remove the active local state only after verifying remote state.
  const remaining = await readJSON(statePath);
  if (remaining?.resources?.length) {
    const current = tfJSON('state', 'pull');
    if (!migratedState(remaining, current)) throw new Error('Local state still differs from S3; refusing cleanup.');
    await copyFile(statePath, join(local, 'migrated.tfstate'));
    await rm(statePath);
  }
  const outputs = tfJSON('output', '-json');
  for (const [name, value] of Object.entries(outputs.github_variables.value))
    run('gh', ['variable', 'set', name, '--repo', repository, '--body', value], { env });
  console.log(`Bootstrap ready for ${repository} in ${region}. Wedding configuration is separate.`);
}

export function deploymentSettings(env) {
  const bucket = env.TF_STATE_BUCKET;
  const match = /^jimgumbley-com-tfstate-([0-9]{12})-eu-west-1$/.exec(bucket ?? '');
  if (!match || env.AWS_REGION !== region) throw new Error('Set TF_STATE_BUCKET and AWS_REGION from the repository bootstrap outputs (eu-west-1).');
  const boundary = `arn:aws:iam::${match[1]}:policy/jimgumbley-com-runtime-boundary`;
  if (env.AWS_RUNTIME_BOUNDARY_ARN !== boundary) throw new Error('AWS_RUNTIME_BOUNDARY_ARN must match the bootstrap account.');
  if (env.TF_WORKSPACE && env.TF_WORKSPACE !== 'default') throw new Error('Use the default Terraform workspace; projects have separate state keys.');
  return { bucket, account: match[1], env: { ...env, TF_WORKSPACE: 'default',
    TF_VAR_region: region, TF_VAR_runtime_boundary_arn: boundary, TF_VAR_account_id: match[1] } };
}

export async function deploy(command, { run = execute, env = process.env, directory = join(infra, 'wedding') } = {}) {
  const settings = deploymentSettings(env);
  if (env.GITHUB_ACTIONS === 'true' && (!env.TF_VAR_closing_at || !env.TF_VAR_guest_token_sha256))
    throw new Error('Set WEDDING_CLOSING_AT and WEDDING_GUEST_TOKEN_SHA256 repository variables before deployment.');
  const options = { env: settings.env };
  const tf = (...args) => run('terraform', [`-chdir=${directory}`, ...args], options);
  if (command === 'plan') {
    const legacy = await readJSON(join(directory, 'terraform.tfstate'));
    if (legacy?.resources?.length) throw new Error('Existing local wedding state requires an explicit migration; refusing to start a second deployment.');
    tf('init', '-input=false', '-lockfile=readonly', `-backend-config=bucket=${settings.bucket}`,
      `-backend-config=region=${region}`, `-backend-config=allowed_account_ids=["${settings.account}"]`);
    tf('validate');
    tf('plan', '-input=false', '-lock-timeout=5m', '-out=upload.tfplan');
  } else if (command === 'apply') {
    // No new plan and no initialization against a potentially different backend.
    const initialized = await readJSON(join(directory, '.terraform', 'terraform.tfstate'));
    if (initialized?.backend?.type !== 's3' || initialized.backend.config.bucket !== settings.bucket ||
        initialized.backend.config.key !== 'apps/wedding/terraform.tfstate' ||
        initialized.backend.config.region !== region || initialized.backend.config.use_lockfile !== true ||
        initialized.backend.config.encrypt !== true)
      throw new Error('Run wedding-upload-plan against the expected remote backend before applying.');
    tf('apply', '-input=false', '-lock-timeout=5m', 'upload.tfplan');
  } else throw new Error(`Unknown deployment command: ${command}`);
}

async function testTerraform() {
  const local = join(infra, '.local');
  await mkdir(local, { recursive: true, mode: 0o700 });
  const stage = await mkdtemp(join(local, 'terraform-test-'));
  const cache = join(local, 'providers');
  await mkdir(cache, { recursive: true });
  try {
    for (const module of ['bootstrap', 'wedding']) {
      const source = join(infra, module);
      const destination = join(stage, module);
      await mkdir(destination);
      // Never copy operator tfvars, real state, backend metadata or guest tokens.
      for (const name of await readdir(source)) {
        if (name.endsWith('.tf') || name.endsWith('.tftest.hcl') || name === '.terraform.lock.hcl' || name === 'signer.mjs')
          await copyFile(join(source, name), join(destination, name));
      }
      const env = { ...process.env, TF_DATA_DIR: join(destination, '.terraform'), TF_PLUGIN_CACHE_DIR: cache, TF_WORKSPACE: 'default' };
      for (const args of [['fmt', '-check'], ['init', '-backend=false', '-input=false', '-lockfile=readonly'], ['validate'], ['test']])
        execute('terraform', [`-chdir=${destination}`, ...args], { env });
    }
  } finally { await rm(stage, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // All state, including failed-migration backups, is private to this operator.
  process.umask(0o077);
  try {
    const command = process.argv[2];
    if (command === 'bootstrap') await bootstrap();
    else if (command === 'plan' || command === 'apply') await deploy(command);
    else if (command === 'test') await testTerraform();
    else throw new Error('Use make bootstrap, infra-test, wedding-upload-plan or wedding-upload-apply.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
