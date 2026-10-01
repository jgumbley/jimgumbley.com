# Wedding guest uploads

Private S3 storage, a JavaScript signing Lambda and a Node.js 22+ local CLI for
JPEG (`.jpg`/`.jpeg`), PNG, WebP, HEIC/HEIF, MP4 and MOV. Uppercase extensions are
accepted. There is no frontend.

Follow [repository infrastructure setup](../README.md) for bootstrap, GitHub
variables, state storage and deployment. Run commands from the repository root:

```sh
make wedding-upload-token
make wedding-upload-test
```

Token generation creates a random 256-bit bearer token in
`infra/wedding/.local/guest-token`, with mode 0600, and writes only its SHA-256
hash to ignored `guest.auto.tfvars.json`. Existing files are never overwritten.
Share the raw token privately; guests place it in the same local token file. Never
put it in Terraform, Git, command arguments, a public URL or website assets.

After deployment, use the `upload_url` from the Actions apply output:

```sh
WEDDING_UPLOAD_URL='https://example.lambda-url.eu-west-1.on.aws/' \
WEDDING_UPLOAD_FILE='./photos/guest.jpg' make wedding-upload
```

The CLI streams one file from disk and prints the uploaded object key. Guests
need no AWS credentials and cannot list, read or delete uploaded objects. An
authorized operator retrieves the files separately.

The signing endpoint compares the token's SHA-256 hash in constant time. It issues
a POST policy for a random object key, exact MIME type, encryption and approved
file size. The policy expires after at most five minutes or at the fixed closing
timestamp, whichever comes first. S3 enforces the actual object size and
independently denies new writes at closing. Defaults are 25 MiB for photos and
1 GiB for videos; limits accept positive integer byte counts up to 5 GiB.

The bucket blocks public access, disables ACLs, requires HTTPS and encrypts with
SSE-S3. The Lambda role has only encrypted upload permission under `uploads/`
before closing, plus permission to write its own logs, within the repository's
runtime permissions boundary. The handler does not log tokens or grants.

The implementation follows AWS's
[POST policy](https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-HTTPPOSTConstructPolicy.html)
and [Signature V4](https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-authentication-HTTPPOST.html)
contracts. MIME/extension checks do not inspect media contents. Grants are reusable
until expiry, including overwriting their assigned key. Rotating the guest token
prevents new grants; existing ones last until expiry. Requests already accepted
by S3 may finish after the closing time.

`make wedding-upload-test` runs offline tests for every accepted format, invalid
tokens, unsupported types, mismatches, size limits, oversized actual bodies,
tampering, expiration, closing, token generation and the CLI flow. Its S3 contract
emulator verifies signatures and form conditions without calling AWS.
`make infra-test` additionally checks Terraform and deployment behavior with
mocked AWS resources.
