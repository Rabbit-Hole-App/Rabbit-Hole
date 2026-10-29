# Review copy of the /explain release tooling (not part of the product)

Copied from the integrator's operator directory (C:/s/spec/...) so the code can be reviewed. Not wired into CI, never run from here.
Share tokens and the Cloudflare account id are redacted. Pins are as of the copy time.

- explain-sandbox/prod/: production release launcher (release, generation-off, kill, emergency), read-back, isolation harness.
- explain-sandbox/genuine/: genuine-run driver and deployed shared-page checks.
- explain-sandbox/launcher/: dev deploy launcher. day-1021/: gate and release helpers used by both launchers.
