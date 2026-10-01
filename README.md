# ~   jgumbley.com    ~

Static source of my unnecessary vanity website.

AWS infrastructure is managed under [infra/](infra/README.md), including its own
Makefile. Run `make infra-test` for local checks and `make bootstrap` for the
one-time repository setup. GitHub Actions then deploys wedding upload
infrastructure from `main` using OIDC; the guest upload client is local.

Run `make site` to rebuild the complete site in ignored `_site/`. Requires
Python 3 with venv support; Python dependencies are installed automatically.
`make site-check` also checks the output and wedding site (requires Node.js).
`make preview` rebuilds and serves `_site/` at http://localhost:8000.
`make clean-site` removes the output; `make clean` also removes virtual environments.

Edit the root homepage, CSS, JavaScript and original assets directly. Blog sources
are in `blogsrc/`; wedding sources and reviewed assets are in `weddingsrc/`.
`make html` and `make wedding` rebuild their respective `_site/` subdirectories;
`make wedding-check` builds and validates the wedding site. `make wedding-assets`
regenerates the reviewed PNG assets from the SVG masters. Generated blog and
wedding output is no longer committed. Public paths, including `/blog/`,
`/wedding/`, `/pics/` and `/wedding-preview.png`, are preserved.

Every push to `main` runs one pipeline: build and test, Terraform plan/apply, then
deploy only `_site/` through the official GitHub Pages actions. Each stage requires
the previous stage to succeed. Configure the AWS and wedding variables described
in [infra/](infra/README.md) before pushing. There is no pull request workflow.

In repository **Settings → Pages → Build and deployment**, change **Source**
from **Deploy from a branch** to **GitHub Actions**, preserving the existing
custom-domain and HTTPS configuration. This migration requires no DNS changes
or account-level domain verification. Allow `main` to deploy to the `github-pages`
environment if deployment branch restrictions are configured.

The build retains the existing `CNAME` unchanged in `_site/`. Actions publishing
uses the existing Pages domain configuration rather than reading that file.
After the first deployment, verify the homepage, `/blog/` and `/wedding/` at
https://www.jimgumbley.com.
See [GitHub's custom workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
