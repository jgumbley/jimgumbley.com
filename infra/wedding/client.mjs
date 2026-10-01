import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { openAsBlob } from 'node:fs';
import { basename, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hashToken, media } from './signer.mjs';

const tokenPath = new URL('./.local/guest-token', import.meta.url);
export async function generateToken(directory = new URL('./', import.meta.url)) {
  await mkdir(new URL('./.local/', directory), { recursive: true, mode: 0o700 });
  const token = randomBytes(32).toString('base64url');
  await writeFile(new URL('./.local/guest-token', directory), `${token}\n`, { flag: 'wx', mode: 0o600 });
  await writeFile(new URL('./guest.auto.tfvars.json', directory),
    JSON.stringify({ guest_token_sha256: hashToken(token) }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}

export async function upload({ endpoint, file, token, fetchImpl = fetch }) {
  if (new URL(endpoint).protocol !== 'https:') throw new Error('Signing endpoint must use HTTPS');
  const contentType = media[extname(file).toLowerCase()];
  if (!contentType) throw new Error('Unsupported file type');
  const info = await stat(file);
  if (!info.isFile() || info.size < 1) throw new Error('Upload must be a nonempty regular file');
  const response = await fetchImpl(endpoint, {
    method: 'POST', redirect: 'error',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ filename: basename(file), contentType, size: info.size }),
  });
  if (!response.ok) throw new Error(`Signing request failed (${response.status})`);
  const grant = await response.json();
  if (new URL(grant.url).protocol !== 'https:' || !Number.isFinite(Date.parse(grant.expiresAt)) || Date.parse(grant.expiresAt) <= Date.now())
    throw new Error('Invalid or expired upload grant');
  const form = new FormData();
  for (const [name, value] of Object.entries(grant.fields)) form.append(name, value);
  form.append('file', await openAsBlob(file, { type: contentType }), basename(file));
  const result = await fetchImpl(grant.url, { method: 'POST', body: form, redirect: 'error' });
  if (!result.ok) throw new Error(`S3 upload failed (${result.status})`);
  return grant.fields.key;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv[2] === 'token') {
      await generateToken();
      console.log('Token saved in infra/wedding/.local/guest-token; only its hash was written to Terraform configuration.');
    }
    else if (process.argv[2] === 'upload') {
      const key = await upload({ endpoint: process.env.WEDDING_UPLOAD_URL,
        file: process.env.WEDDING_UPLOAD_FILE, token: (await readFile(tokenPath, 'utf8')).trim() });
      console.log(`Uploaded: ${key}`);
    } else throw new Error('Use make wedding-upload-token or make wedding-upload');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
