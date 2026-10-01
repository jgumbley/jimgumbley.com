import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdir, mkdtemp, writeFile, readFile, stat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHandler, hashToken, media, signPolicy } from './signer.mjs';
import { generateToken, upload } from './client.mjs';

const token = 'a'.repeat(43); // Synthetic test token, never used for deployment.
const start = Date.parse('2030-06-01T12:00:00Z');
const config = {
  BUCKET_NAME: 'test-wedding', AWS_REGION: 'eu-west-2',
  GUEST_TOKEN_SHA256: hashToken(token), CLOSING_AT: '2030-06-01T13:00:00Z',
  PHOTO_MAX_BYTES: '100', VIDEO_MAX_BYTES: '200',
  AWS_ACCESS_KEY_ID: 'TESTACCESSKEY', AWS_SECRET_ACCESS_KEY: 'test-secret', AWS_SESSION_TOKEN: 'test-session',
};
const request = (body = {}, auth = `Bearer ${token}`) => ({
  requestContext: { http: { method: 'POST' } }, headers: { authorization: auth },
  body: JSON.stringify({ filename: 'photo.jpg', contentType: 'image/jpeg', size: 10, ...body }),
});
const issue = async (body, time = start) => createHandler(config, () => time)(request(body));

// Independent S3 POST contract emulator. This does not call the production signer
// to verify signatures or policies, and is not a substitute for a live AWS test.
async function acceptPost(grant, form, time) {
  const fields = Object.fromEntries([...form].filter(([key]) => key !== 'file'));
  const policy = JSON.parse(Buffer.from(fields.policy, 'base64').toString());
  const [, date, region, service, terminator] = fields['x-amz-credential'].split('/');
  let key = Buffer.from(`AWS4${config.AWS_SECRET_ACCESS_KEY}`);
  for (const part of [date, region, service, terminator]) key = createHmac('sha256', key).update(part).digest();
  assert.equal(fields['x-amz-signature'], createHmac('sha256', key).update(fields.policy).digest('hex'), 'signature');
  assert.equal(fields['x-amz-security-token'], config.AWS_SESSION_TOKEN);
  assert.ok(time < Date.parse(policy.expiration), 'expired policy');
  assert.ok(time < Date.parse(config.CLOSING_AT), 'bucket closed');
  assert.equal(new URL(grant.url).hostname, `${config.BUCKET_NAME}.s3.${config.AWS_REGION}.amazonaws.com`);
  const blob = form.get('file');
  assert.ok(blob instanceof Blob);
  const bytes = await blob.arrayBuffer();
  for (const condition of policy.conditions) {
    if (Array.isArray(condition)) {
      assert.equal(condition[0], 'content-length-range');
      assert.ok(bytes.byteLength >= condition[1] && bytes.byteLength <= condition[2], 'object size');
    } else for (const [name, value] of Object.entries(condition)) {
      assert.equal(name === 'bucket' ? config.BUCKET_NAME : fields[name], value, `policy field ${name}`);
    }
  }
  for (const name of Object.keys(fields)) {
    if (['policy', 'x-amz-signature'].includes(name)) continue;
    assert.ok(policy.conditions.some(condition => condition[name] === fields[name]), `unconstrained ${name}`);
  }
  return new Response(null, { status: 204 });
}
function formFor(grant, size = 10) {
  const form = new FormData();
  for (const [name, value] of Object.entries(grant.fields)) form.set(name, value);
  form.set('file', new Blob([Buffer.alloc(size)]), 'photo.jpg');
  return form;
}

test('all supported photo and video formats produce usable signed POSTs', async () => {
  const keys = new Set();
  for (const [extension, contentType] of Object.entries(media)) {
    const result = await issue({ filename: `guest${extension.toUpperCase()}`, contentType });
    assert.equal(result.statusCode, 200);
    const grant = JSON.parse(result.body);
    assert.equal(grant.expiresAt, new Date(start + 300_000).toISOString());
    assert.match(grant.fields.key, /^uploads\/[a-f0-9-]+\.[a-z0-9]+$/);
    keys.add(grant.fields.key);
    await acceptPost(grant, formFor(grant), start);
  }
  assert.equal(keys.size, Object.keys(media).length);
});

test('invalid and missing tokens are denied before issuing grants', async () => {
  for (const auth of ['', 'Bearer wrong', `Bearer ${'b'.repeat(43)}`, `Basic ${token}`]) {
    const response = await createHandler(config, () => start)(request({}, auth));
    assert.equal(response.statusCode, 403);
    assert.ok(!response.body.includes('policy'));
  }
});

test('unsupported types, mismatched extensions and unsafe filenames are rejected', async () => {
  for (const body of [
    { filename: 'x.gif', contentType: 'image/gif' }, { filename: 'x.svg', contentType: 'image/svg+xml' },
    { contentType: 'text/html' }, { filename: 'x.mp4' }, { filename: '../x.jpg' },
    { filename: 'x.jpg\n' }, { filename: 'x' }, { filename: 'x.constructor' },
  ]) assert.equal((await issue(body)).statusCode, 415);
});

test('photo and video limits and malformed sizes are enforced', async () => {
  assert.equal((await issue({ size: 100 })).statusCode, 200);
  assert.equal((await issue({ size: 101 })).statusCode, 413);
  assert.equal((await issue({ filename: 'x.mov', contentType: 'video/quicktime', size: 200 })).statusCode, 200);
  assert.equal((await issue({ filename: 'x.mp4', contentType: 'video/mp4', size: 201 })).statusCode, 413);
  for (const size of [0, -1, 1.5, '10', null]) assert.equal((await issue({ size })).statusCode, 400);
});

test('S3 contract rejects oversized actual files and tampered fields or policy', async () => {
  const grant = JSON.parse((await issue()).body);
  await assert.rejects(acceptPost(grant, formFor(grant, 101), start), /object size/);
  await assert.rejects(acceptPost(grant, formFor(grant, 9), start), /object size/);
  for (const [name, value] of [['key', 'uploads/other.jpg'], ['Content-Type', 'text/html'], ['x-amz-server-side-encryption', 'none']]) {
    const form = formFor(grant);
    form.set(name, value);
    await assert.rejects(acceptPost(grant, form, start), /policy field/);
  }
  const form = formFor(grant);
  const policy = JSON.parse(Buffer.from(grant.fields.policy, 'base64'));
  policy.expiration = '2031-01-01T00:00:00Z';
  form.set('policy', Buffer.from(JSON.stringify(policy)).toString('base64'));
  await assert.rejects(acceptPost(grant, form, start), /signature/);
});

test('expired grants fail, including at the exact expiration instant', async () => {
  const grant = JSON.parse((await issue()).body);
  await acceptPost(grant, formFor(grant), start + 299_999);
  await assert.rejects(acceptPost(grant, formFor(grant), start + 300_000), /expired/);
  await assert.rejects(acceptPost(grant, formFor(grant), start + 301_000), /expired/);
});

test('closing caps grants and rejects both signing and object uploads', async () => {
  const closing = Date.parse(config.CLOSING_AT);
  const grant = JSON.parse((await issue({}, closing - 1000)).body);
  assert.equal(Date.parse(grant.expiresAt), closing);
  await acceptPost(grant, formFor(grant), closing - 1);
  for (const time of [closing, closing + 1]) {
    assert.equal((await issue({}, time)).statusCode, 410);
    await assert.rejects(acceptPost(grant, formFor(grant), time), /expired/);
  }
  // Even a correctly signed grant extending past closing cannot bypass bucket policy.
  const policy = JSON.parse(Buffer.from(grant.fields.policy, 'base64'));
  policy.expiration = new Date(closing + 300_000).toISOString();
  grant.fields.policy = Buffer.from(JSON.stringify(policy)).toString('base64');
  grant.fields['x-amz-signature'] = signPolicy(config.AWS_SECRET_ACCESS_KEY, '20300601', config.AWS_REGION, grant.fields.policy);
  await assert.rejects(acceptPost(grant, formFor(grant), closing), /bucket closed/);
});

test('malformed requests and configuration fail explicitly', async () => {
  const handler = createHandler(config, () => start);
  assert.equal((await handler({ ...request(), body: '{' })).statusCode, 400);
  assert.equal((await handler({ ...request(), body: 'null' })).statusCode, 400);
  assert.equal((await handler({ ...request(), requestContext: { http: { method: 'GET' } } })).statusCode, 405);
  assert.equal((await handler({ ...request(), body: Buffer.from(request().body).toString('base64'), isBase64Encoded: true })).statusCode, 200);
  for (const invalid of [{ CLOSING_AT: 'invalid' }, { GUEST_TOKEN_SHA256: token }, { VIDEO_MAX_BYTES: '0' }])
    assert.throws(() => createHandler({ ...config, ...invalid }), /configuration/);
});

test('CLI sends actual file multipart data through signer and POST contract', async t => {
  t.mock.method(Date, 'now', () => start);
  await mkdir(new URL('./.local/', import.meta.url), { recursive: true });
  const folder = await mkdtemp(new URL('./.local/test-', import.meta.url));
  try {
    const file = join(folder, 'photo.JPEG');
    await writeFile(file, Buffer.alloc(10));
    let grant;
    let calls = 0;
    const fetchImpl = async (url, options) => {
      calls++;
      assert.equal(options.redirect, 'error');
      if (calls === 1) {
        assert.equal(url, 'https://signer.example/');
        const response = await createHandler(config, () => start)({ ...request(), body: options.body, headers: options.headers });
        grant = JSON.parse(response.body);
        return new Response(response.body, { status: response.statusCode });
      }
      assert.equal(url, grant.url);
      assert.equal([...options.body.keys()].at(-1), 'file');
      return acceptPost(grant, options.body, start);
    };
    assert.match(await upload({ endpoint: 'https://signer.example/', file, token, fetchImpl }), /^uploads\//);
    assert.equal(calls, 2);
    await assert.rejects(upload({ endpoint: 'http://signer.example/', file, token }), /HTTPS/);
    await assert.rejects(upload({ endpoint: 'https://signer.example/', file, token,
      fetchImpl: async () => new Response(null, { status: 403 }) }), /Signing request failed \(403\)/);
    await assert.rejects(upload({ endpoint: 'https://signer.example/', file, token,
      fetchImpl: async () => Response.json({ ...grant, expiresAt: '2000-01-01T00:00:00Z' }) }), /expired/);
    let count = 0;
    await assert.rejects(upload({ endpoint: 'https://signer.example/', file, token,
      fetchImpl: async () => ++count === 1 ? Response.json(grant) : new Response(null, { status: 403 }) }), /S3 upload failed/);
  } finally { await rm(folder, { recursive: true }); }
});

test('local token generation keeps the raw secret private and out of Terraform', async () => {
  await mkdir(new URL('./.local/', import.meta.url), { recursive: true });
  const folder = await mkdtemp(new URL('./.local/token-test-', import.meta.url));
  const directory = pathToFileURL(`${folder}/`);
  try {
    await generateToken(directory);
    const file = join(folder, '.local/guest-token');
    const generated = (await readFile(file, 'utf8')).trim();
    assert.match(generated, /^[A-Za-z0-9_-]{43}$/);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    assert.equal((await stat(join(folder, '.local'))).mode & 0o777, 0o700);
    const tfvars = await readFile(join(folder, 'guest.auto.tfvars.json'), 'utf8');
    assert.ok(!tfvars.includes(generated));
    assert.deepEqual(JSON.parse(tfvars), { guest_token_sha256: hashToken(generated) });
    const result = await createHandler({ ...config, GUEST_TOKEN_SHA256: hashToken(generated) }, () => start)(request({}, `Bearer ${generated}`));
    assert.equal(result.statusCode, 200);
    await assert.rejects(generateToken(directory), { code: 'EEXIST' });
    assert.equal((await readFile(file, 'utf8')).trim(), generated);
  } finally { await rm(folder, { recursive: true }); }
});
