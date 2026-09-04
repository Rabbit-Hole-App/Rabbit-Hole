# Source provenance

Every deploy records where the code came from, so nobody confuses what's deployed with what's on main.

## CLI

At deploy time, if the directory is inside a git repo, capture: remote URL (origin, normalized to `https://github.com/org/repo`), branch, short and full commit SHA, and whether the working tree is dirty. Send them with the deploy.

Print `✓ source: github.com/acme/tools @ main a3f8e21` and, if dirty, `⚠ uncommitted changes deployed — commit before sharing`. If not a git repo, send nothing and print `source: not a git repo`.

## Control plane

Store `repo_url`, `branch`, `commit_sha`, `dirty`, `deployed_by`, `deployed_at` on a `deploys` table — one row per deploy, so history is kept — and the latest on the app row. `GET /api/apps/<slug>/deploys` returns the history.

## Repo visibility

Don't assume. On deploy, the control plane hits `https://api.github.com/repos/<org>/<repo>` unauthenticated; 200 means public, 404 means private or nonexistent, anything else stores unknown. Store `repo_public`. Never store a token.

## Runbook

A line at the top, under the generated-by line: `> Deployed from github.com/acme/tools @ a3f8e21 (main).` If dirty, the line ends with `Deployed with uncommitted changes.`

## Deferred (user: "do not do the web UI yet")

- Web UI on `/apps/<slug>`: source line under the title, commit linked to the GitHub tree at the deployed SHA (public repos), `private repo` label otherwise, Deploys tab, runbook Files table linked at the SHA.
- Drift: "N commits behind <branch>" from GitHub compare, public repos only, cached hourly.

## Skipped

- GitLab — GitHub only for visibility and links. <!-- ponytail: normalize handles any host; add GitLab visibility check when a GitLab repo shows up -->
- Auto-deploy on push — provenance is recorded, not acted on. <!-- ponytail: needs webhooks + stored tokens; separate feature if ever -->
- Private-repo linking via tokens — private repos get plain SHAs, never a stored token. <!-- ponytail: deliberate; tokens in the control plane are a new threat class -->
