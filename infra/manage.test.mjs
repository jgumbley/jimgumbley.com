import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { backend, bootstrap, deploymentSettings, deploy, sameState, migratedState } from './manage.mjs';

const account = '123456789012';
const bucket = `jimgumbley-com-tfstate-${account}-eu-west-1`;
const variables = {
  AWS_REGION: 'eu-west-1', TF_STATE_BUCKET: bucket,
  AWS_DEPLOY_ROLE_ARN: `arn:aws:iam::${account}:role/jimgumbley-com-github-deploy`,
  AWS_RUNTIME_BOUNDARY_ARN: `arn:aws:iam::${account}:policy/jimgumbley-com-runtime-boundary`,
};
const state = () => ({ version: 4, lineage: 'test-lineage', serial: 1,
  resources: [{ type: 'aws_s3_bucket', name: 'state', instances: [{ attributes: { id: bucket } }] }],
  outputs: { account_id: { value: account }, github_variables: { value: variables } },
});

async function fixture(t, settings = {}) {
  await mkdir(new URL('./.local/', import.meta.url), { recursive: true });
  const directory = await mkdtemp(new URL('./.local/bootstrap-test-', import.meta.url));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const context = { directory, calls: [], bucketExists: false, remote: null, ...settings };
  if (settings.local) await writeFile(join(directory, 'terraform.tfstate'), JSON.stringify(settings.local));
  if (settings.generated) await writeFile(join(directory, 'backend.generated.tf.json'), JSON.stringify(backend(bucket, 'bootstrap/terraform.tfstate', account)));
  const readLocal = () => {
    try { return JSON.parse(readFileSync(join(directory, 'terraform.tfstate'), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  };
  context.run = (program, args) => {
    context.calls.push([program, ...args]);
    if (context.fail?.(program, args)) throw new Error('simulated command failure');
    if (program === 'gh') {
      if (args[0] === 'auth' || args[0] === 'variable') return '';
      if (args[1].endsWith('/sub')) return JSON.stringify({ use_default: true });
      return JSON.stringify({ full_name: 'jgumbley/jimgumbley.com', id: 5678, owner: { id: 1234 }, permissions: { admin: true } });
    }
    if (program === 'aws') {
      if (args[0] === 'sts') return JSON.stringify({ Account: account });
      if (args[1] === 'list-buckets') return JSON.stringify({ Buckets: context.bucketExists ? [{ Name: bucket }] : [] });
      if (args[1] === 'list-objects-v2') return JSON.stringify({ Contents: context.remote ? [{ Key: 'bootstrap/terraform.tfstate' }] : [] });
      if (args[1] === 'get-object') { writeFileSync(args.at(-1), JSON.stringify(context.remote)); return '{}'; }
    }
    if (program === 'terraform') {
      if (args[1] === 'init') {
        if (args.includes('-migrate-state')) { context.remote = readLocal(); context.remote.serial++; context.remoteBackend = true; }
        if (args.includes('-reconfigure')) context.remoteBackend = true;
        return '';
      }
      if (args[1] === 'apply') {
        context.bucketExists = true;
        const next = structuredClone(context.remoteBackend ? context.remote : readLocal()) ?? state();
        next.serial++;
        if (context.remoteBackend) context.remote = next;
        else writeFileSync(join(directory, 'terraform.tfstate'), JSON.stringify(next));
        return '';
      }
      if (args[1] === 'state') return JSON.stringify(context.remote);
      if (args[1] === 'output') return JSON.stringify(context.remote.outputs);
    }
    throw new Error(`Unexpected command in test: ${program} ${args.join(' ')}`);
  };
  context.invoke = () => bootstrap({ directory, run: context.run, env: {} });
  return context;
}

test('fresh bootstrap applies locally, migrates with locking, then publishes only non-secret variables', async t => {
  const f = await fixture(t);
  await f.invoke();
  const config = JSON.parse(await readFile(join(f.directory, 'backend.generated.tf.json')));
  assert.deepEqual(config, backend(bucket, 'bootstrap/terraform.tfstate', account));
  assert.equal(config.terraform.backend.s3.use_lockfile, true);
  assert.equal(config.terraform.backend.s3.encrypt, true);
  const before = JSON.parse(await readFile(join(f.directory, '.local/before-migration.tfstate')));
  assert.ok(migratedState(before, f.remote));
  await assert.rejects(readFile(join(f.directory, 'terraform.tfstate')), { code: 'ENOENT' });
  const migrate = f.calls.findIndex(call => call.includes('-migrate-state'));
  const publish = f.calls.findIndex(call => call[0] === 'gh' && call[1] === 'variable');
  assert.ok(migrate > f.calls.findIndex(call => call[0] === 'terraform' && call[2] === 'apply'));
  assert.ok(publish > migrate);
  assert.deepEqual(f.calls.filter(call => call[1] === 'variable').map(call => call[3]).sort(), Object.keys(variables).sort());
});

test('bootstrap rerun and fresh checkout reconnect to remote state without copying over it', async t => {
  const f = await fixture(t, { bucketExists: true, remote: state() });
  await f.invoke();
  assert.ok(f.calls.some(call => call.includes('-reconfigure')));
  assert.ok(!f.calls.some(call => call.includes('-migrate-state')));
  const serial = f.remote.serial;
  await f.invoke();
  assert.equal(f.remote.serial, serial + 1);
});

test('interrupted migration resumes from retained source before any new apply', async t => {
  const f = await fixture(t, { bucketExists: true, local: state(), generated: true });
  await f.invoke();
  const migrate = f.calls.findIndex(call => call.includes('-migrate-state'));
  const apply = f.calls.findIndex(call => call[0] === 'terraform' && call[2] === 'apply');
  assert.ok(migrate >= 0 && apply > migrate);
  assert.equal(f.remote.serial, 3);
  assert.equal(JSON.parse(await readFile(join(f.directory, '.local/before-migration.tfstate'))).serial, 1);
});

test('bootstrap resumes after Terraform empties the migrated local state file', async t => {
  const f = await fixture(t, { bucketExists: true, remote: state(), generated: true });
  await writeFile(join(f.directory, 'terraform.tfstate'), '');
  await f.invoke();
  assert.ok(f.calls.some(call => call.includes('-reconfigure')));
  assert.ok(!f.calls.some(call => call.includes('-migrate-state')));
  assert.equal(f.calls.filter(call => call[1] === 'variable').length, 4);
});

test('migration failure preserves source/backup and never publishes GitHub configuration', async t => {
  const f = await fixture(t, { fail: (_, args) => args.includes('-migrate-state') });
  await assert.rejects(f.invoke(), /simulated command failure/);
  const source = JSON.parse(await readFile(join(f.directory, 'terraform.tfstate')));
  const backup = JSON.parse(await readFile(join(f.directory, '.local/before-migration.tfstate')));
  assert.ok(sameState(source, backup));
  assert.ok(!f.calls.some(call => call[1] === 'variable'));
  f.fail = null;
  await f.invoke();
  assert.ok(f.remote);
});

test('matching leftover source is archived before remote apply changes serial', async t => {
  const f = await fixture(t, { bucketExists: true, remote: state(), local: state(), generated: true });
  await f.invoke();
  assert.equal(f.remote.serial, 2);
  await assert.rejects(readFile(join(f.directory, 'terraform.tfstate')), { code: 'ENOENT' });
});

test('migration permits new snapshot metadata but no changes to resources or outputs', async t => {
  const source = state();
  const remote = { ...state(), lineage: 'new-s3-lineage', serial: 1 };
  assert.ok(migratedState(source, remote));
  assert.equal(sameState(source, remote), false);
  for (const invalid of [{ resources: [] }, { outputs: {} }])
    assert.equal(migratedState(source, { ...remote, ...invalid }), false);
  const f = await fixture(t, { bucketExists: true, remote, local: source, generated: true });
  await mkdir(join(f.directory, '.local'));
  await writeFile(join(f.directory, '.local/before-migration.tfstate'), JSON.stringify(source));
  await f.invoke();
  assert.equal(f.remote.serial, 2);
  assert.ok(!f.calls.some(call => call.includes('-migrate-state')));
});

test('divergent states and missing state fail without applying or replacing remote state', async t => {
  const stale = state();
  stale.serial = 0;
  const f = await fixture(t, { bucketExists: true, remote: state(), local: stale });
  await assert.rejects(f.invoke(), /disagree/);
  assert.equal(f.remote.serial, 1);
  assert.ok(!f.calls.some(call => call[0] === 'terraform'));
  const lost = await fixture(t, { bucketExists: true });
  await assert.rejects(lost.invoke(), /state is missing/);
  assert.ok(!lost.calls.some(call => call[0] === 'terraform'));
});

test('failed authentication and an account switch stop before infrastructure mutation', async t => {
  const auth = await fixture(t, { fail: (program, args) => program === 'gh' && args[0] === 'auth' });
  await assert.rejects(auth.invoke(), /simulated command failure/);
  assert.equal(auth.calls.length, 1);
  const switched = await fixture(t);
  await mkdir(join(switched.directory, '.local'));
  await writeFile(join(switched.directory, '.local/identity.json'), JSON.stringify({ account: '999999999999' }));
  await assert.rejects(switched.invoke(), /another AWS account/);
  assert.ok(!switched.calls.some(call => call[0] === 'terraform'));
});

test('deployment settings enforce the state account, Ireland and runtime boundary', () => {
  const settings = deploymentSettings(variables);
  assert.equal(settings.account, account);
  assert.equal(settings.env.TF_VAR_runtime_boundary_arn, variables.AWS_RUNTIME_BOUNDARY_ARN);
  for (const invalid of [{ AWS_REGION: 'eu-west-2' }, { TF_STATE_BUCKET: 'other' },
    { AWS_RUNTIME_BOUNDARY_ARN: 'arn:aws:iam::999999999999:policy/jimgumbley-com-runtime-boundary' }, { TF_WORKSPACE: 'other' }])
    assert.throws(() => deploymentSettings({ ...variables, ...invalid }));
});

test('planning initializes only application state, and apply consumes the saved plan', async t => {
  const f = await fixture(t);
  const calls = [];
  const run = (program, args, options) => { calls.push([program, ...args]); assert.equal(options.env.TF_VAR_account_id, account); };
  await deploy('plan', { run, directory: f.directory, env: variables });
  assert.ok(calls[0].includes(`-backend-config=bucket=${bucket}`));
  assert.ok(calls[2].includes('-out=upload.tfplan'));
  await assert.rejects(deploy('apply', { run, directory: f.directory, env: variables }), /expected remote backend/);
  await mkdir(join(f.directory, '.terraform'));
  await writeFile(join(f.directory, '.terraform/terraform.tfstate'), JSON.stringify({ backend: {
    type: 's3', config: { bucket, key: 'apps/wedding/terraform.tfstate', region: 'eu-west-1', encrypt: true, use_lockfile: true },
  } }));
  await deploy('apply', { run, directory: f.directory, env: variables });
  assert.deepEqual(calls.at(-1).slice(2), ['apply', '-input=false', '-lock-timeout=5m', 'upload.tfplan']);
  await assert.rejects(deploy('plan', { run, directory: f.directory, env: { ...variables, GITHUB_ACTIONS: 'true' } }), /WEDDING_CLOSING_AT/);
});

test('root forwarding preserves the caller working directory and upload path containing spaces', async t => {
  const f = await fixture(t);
  const binary = join(f.directory, 'node');
  await writeFile(binary, '#!/bin/sh\nprintf "CALLER=%s\\nUPLOAD=%s\\n" "$PWD" "$WEDDING_UPLOAD_FILE"\n', { mode: 0o700 });
  const result = spawnSync('make', ['wedding-upload'], { encoding: 'utf8', env: {
    ...process.env, PATH: `${f.directory}:${process.env.PATH}`, WEDDING_UPLOAD_FILE: './my photos/video.mov',
  } });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes(`CALLER=${process.cwd()}\nUPLOAD=./my photos/video.mov`));
});

test('one pipeline builds, applies Terraform, then deploys Pages, stopping on failure', async () => {
  const workflow = await readFile(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
  await assert.rejects(readFile(new URL('../.github/workflows/infra.yml', import.meta.url)), { code: 'ENOENT' });
  assert.match(workflow, /branches: \[main\]/);
  assert.match(workflow, /if: github.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /id-token: write/);
  const jobs = workflow.split('\njobs:\n')[1];
  assert.deepEqual([...jobs.matchAll(/^  (\w+):$/gm)].map(match => match[1]), ['build', 'terraform', 'deploy']);
  assert.match(jobs, /  terraform:\n    needs: build\n/);
  assert.match(jobs, /  deploy:\n    needs: terraform\n/);
  assert.ok(!/always\(|continue-on-error/.test(workflow));
  const terraformJob = jobs.split('  terraform:\n')[1].split('  deploy:\n')[0];
  assert.ok(!/environment:|pages: write/.test(terraformJob));
  assert.ok(workflow.indexOf('run: make infra-test') < workflow.indexOf('uses: aws-actions/configure-aws-credentials'));
  assert.ok(workflow.indexOf('uses: aws-actions/configure-aws-credentials') < workflow.indexOf('run: make -f infra/Makefile aws-identity'));
  assert.ok(workflow.indexOf('run: make wedding-upload-apply') < workflow.indexOf('uses: actions/deploy-pages'));
  assert.ok(!/aws-access-key-id|aws-secret-access-key|secrets\./.test(workflow));
  const commands = [...workflow.matchAll(/run: (.+)/g)].map(match => match[1]);
  assert.deepEqual(commands, ['make site-check', 'make infra-test', 'make -f infra/Makefile aws-identity', 'make wedding-upload-plan', 'make wedding-upload-apply']);
});
