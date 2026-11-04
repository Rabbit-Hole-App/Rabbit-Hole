# Whiteboard: fix log

One entry per fixed defect or corrected fact, `FX-WB-nnn`.

### FX-WB-001: the roadmap and three repo files said production Motion has no durable job store

- Found: W0.1, 4 November 2026, `GET /health` on `rabbit-hole-motion-renderer` (`job_store.mounted: true`, `dir: /data/motion-jobs`, `required: true`) and `fly machine list` / `fly volumes list` (machine created 2026-10-26, volume `motion_jobs`, 1 GB).
- Cause: `fly.prod.toml`'s header ("PREPARED, not deployed"), `fly.prod-durable.toml:4` ("fly.prod.toml (no volume) stays what production runs today") and `deploy-config.test.mjs` described `fly.prod-durable.toml` as unapplied. Production runs it.
- Fix: the three places now say which file production runs. The files' contents are unchanged. The whiteboard app has no volume, as the roadmap says, so a restarted whiteboard renderer answers 404 for a render it does not remember.
- Note for W1: the renderer has `GET /render/by-key/<key>`, which tells a caller whether a key is known before it re-posts.
