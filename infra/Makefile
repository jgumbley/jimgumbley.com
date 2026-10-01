# Invoke from the repository root, directly or through the root Makefile.
.PHONY: aws-identity
aws-identity:
	aws sts get-caller-identity

.PHONY: bootstrap infra-test wedding-upload-token wedding-upload-test wedding-upload-plan wedding-upload-apply wedding-upload

bootstrap:
	node infra/manage.mjs bootstrap

infra-test: wedding-upload-test
	node --test infra/manage.test.mjs
	node infra/manage.mjs test

wedding-upload-token:
	node infra/wedding/client.mjs token

wedding-upload-test:
	node --test infra/wedding/upload.test.mjs

wedding-upload-plan:
	node infra/manage.mjs plan

wedding-upload-apply:
	node infra/manage.mjs apply

wedding-upload:
	node infra/wedding/client.mjs upload
