# Ladder operator tooling (written overnight, 4 November 2026)

Copies of the operator scripts used to run the SGD ladder gates, for review in the morning. They live outside the repo at `C:/s/spec/animation/release/` and `.../ladder/`; these are snapshots, not wired into CI.

- `run-gates.sh <sha> <preview version> <prompt-files hash> <tag> [golden hash]`: mints fresh Gate 2 test users (announced), then starts Gate 1 (SGD 20 + regression 9) and Gate 2 (controls first, then ten jobs) in the background.
- `explore.sh <golden file> <tag>`: reviews a retuned golden against a live preview with the exploratory control (nothing remembered).
- `fetch-captures.mjs`: downloads every capture PNG of a Gate 2 export from the dev R2 bucket (read-only GETs).
- `post-release-verify.mjs`: read-only production verifier (served commit, flags, Durable Object, bundle, routes).
- `build-c4.sh`, `deploy-preview-release.sh`, `preview-readback.mjs`, `resolve-fixmd.mjs`, `plan-doc-update*.mjs`, `patch-*.mjs`: the incremental candidate build and isolated-preview deploy used for C4..C11.

All of them read credentials BY NAME from the owner's credentials file and print no values. Paths are machine-local (Windows, Git Bash).
