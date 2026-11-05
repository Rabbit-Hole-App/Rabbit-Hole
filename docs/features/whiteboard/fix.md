# Whiteboard: fix log

One entry per fixed defect or corrected fact, `FX-WB-nnn`.

### FX-WB-001: the roadmap and three repo files said production Motion has no durable job store

- Found: W0.1, 4 November 2026, `GET /health` on `rabbit-hole-motion-renderer` (`job_store.mounted: true`, `dir: /data/motion-jobs`, `required: true`) and `fly machine list` / `fly volumes list` (machine created 2026-10-26, volume `motion_jobs`, 1 GB).
- Cause: `fly.prod.toml`'s header ("PREPARED, not deployed"), `fly.prod-durable.toml:4` ("fly.prod.toml (no volume) stays what production runs today") and `deploy-config.test.mjs` described `fly.prod-durable.toml` as unapplied. Production runs it.
- Fix: the three places now say which file production runs. The files' contents are unchanged. The whiteboard app has no volume, as the roadmap says, so a restarted whiteboard renderer answers 404 for a render it does not remember.
- Note for W1: the renderer has `GET /render/by-key/<key>`, which tells a caller whether a key is known before it re-posts.

### FX-WB-002: the renderer routes changed Motion's measured-code hash

- Found: integration of `feat/w1-render`, 4 November 2026; `control-plane/test/motion-ready-policy.test.js` "this checkout renders with the code that was measured" failed: the hash of the renderer files moved from `02d5069eeb4d` to `deab3fc22359` (LF form; `563755472382` is the CRLF form).
- Cause: W1.4 added 17 lines to `learn-render/motion/service/server.mjs` and 3 to `child.mjs` (one `job.type === 'whiteboard'` branch, the whiteboard route mount, the `whiteboard` field in `/health`). Both files are in `RENDERER_FILES`, which `rendererCodeHashes()` hashes.
- Decision (owner, 4 Nov 2026, "A"): re-pin `MEASURED_RENDERER_CODE_HASH` in `motion-ready-policy.js` to `deab3fc22359`. The additions are inert for Motion: its routes, limits and tests are unchanged (`npm run motion:test` is as green as main: the one failure is the pre-existing shared-ledger test).
- Consequence to remember: Motion's production renderer still reports `02d5069eeb4d`. The roadmap redeploys neither Motion's renderer nor its orchestrator. A future orchestrator deploy from this code would require the renderer to report `deab3fc22359`, so Motion's renderer must be redeployed from the same commit first.
