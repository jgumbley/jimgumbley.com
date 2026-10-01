import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export const media = Object.freeze({
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.heic': 'image/heic', '.heif': 'image/heif',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime',
});
export const hashToken = token => createHash('sha256').update(token).digest('hex');
const hmac = (key, value) => createHmac('sha256', key).update(value).digest();

// AWS Signature Version 4 signing for a base64-encoded S3 POST policy.
export function signPolicy(secret, date, region, policy) {
  const key = hmac(hmac(hmac(hmac(`AWS4${secret}`, date), region), 's3'), 'aws4_request');
  return hmac(key, policy).toString('hex');
}

export function createHandler(env, now = Date.now) {
  const closing = Date.parse(env.CLOSING_AT);
  const photoLimit = Number(env.PHOTO_MAX_BYTES);
  const videoLimit = Number(env.VIDEO_MAX_BYTES);
  if (!Number.isFinite(closing) || !/^[a-f0-9]{64}$/.test(env.GUEST_TOKEN_SHA256 ?? '') ||
      ![photoLimit, videoLimit].every(n => Number.isSafeInteger(n) && n > 0 && n <= 5 * 1024 ** 3) ||
      !env.BUCKET_NAME || !env.AWS_REGION) throw new Error('Invalid upload configuration');
  const reply = (statusCode, body) => ({ statusCode,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    body: JSON.stringify(body) });
  return async event => {
    if (event.requestContext?.http?.method !== 'POST') return reply(405, { error: 'POST required' });
    const authorization = event.headers?.authorization ?? '';
    const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization)?.[1];
    if (!token || !timingSafeEqual(Buffer.from(hashToken(token), 'hex'), Buffer.from(env.GUEST_TOKEN_SHA256, 'hex')))
      return reply(403, { error: 'Invalid guest token' });
    const time = now();
    if (time >= closing) return reply(410, { error: 'Uploads are closed' });
    let input;
    try {
      if (typeof event.body !== 'string' || event.body.length > 4096) throw new Error();
      input = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body);
      if (!input || typeof input !== 'object') throw new Error();
    } catch { return reply(400, { error: 'Invalid JSON request' }); }
    const { filename, contentType, size } = input;
    const extension = typeof filename === 'string' && filename.length <= 255 && !/[\\/\x00-\x1f]/.test(filename)
      ? /\.[^.]+$/.exec(filename)?.[0].toLowerCase() : undefined;
    if (!extension || !Object.hasOwn(media, extension) || media[extension] !== contentType)
      return reply(415, { error: 'Unsupported media type or filename' });
    const limit = contentType.startsWith('video/') ? videoLimit : photoLimit;
    if (!Number.isSafeInteger(size) || size < 1) return reply(400, { error: 'Invalid file size' });
    if (size > limit) return reply(413, { error: 'File exceeds size limit' });
    if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY || !env.AWS_SESSION_TOKEN)
      throw new Error('Missing Lambda role credentials');
    const expiresAt = new Date(Math.min(time + 300_000, closing)).toISOString();
    const stamp = new Date(time).toISOString().replace(/[:-]|\.\d{3}/g, '');
    const date = stamp.slice(0, 8);
    const key = `uploads/${randomUUID()}${extension}`;
    const fields = {
      key, 'Content-Type': contentType,
      'x-amz-algorithm': 'AWS4-HMAC-SHA256',
      'x-amz-credential': `${env.AWS_ACCESS_KEY_ID}/${date}/${env.AWS_REGION}/s3/aws4_request`,
      'x-amz-date': stamp, 'x-amz-security-token': env.AWS_SESSION_TOKEN,
      'x-amz-server-side-encryption': 'AES256', success_action_status: '204',
    };
    const policy = { expiration: expiresAt, conditions: [
      { bucket: env.BUCKET_NAME }, ...Object.entries(fields).map(([k, v]) => ({ [k]: v })),
      // Bind the actual object length to the approved size, not just client metadata.
      ['content-length-range', size, size],
    ] };
    fields.policy = Buffer.from(JSON.stringify(policy)).toString('base64');
    fields['x-amz-signature'] = signPolicy(env.AWS_SECRET_ACCESS_KEY, date, env.AWS_REGION, fields.policy);
    return reply(200, { url: `https://${env.BUCKET_NAME}.s3.${env.AWS_REGION}.amazonaws.com`, fields, expiresAt });
  };
}

export const handler = event => createHandler(process.env)(event);
