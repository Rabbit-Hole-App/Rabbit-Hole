# Image Worker runtime probe

Source tested: `8aed4fdb` (clean tracked source); standalone probe is `image-worker-probe.mjs`. Installed Miniflare 5.20260903.0-alpha/workerd, compatibility date 2026-08-01. No dependency installation, deployment, credentials, provider requests or persistent stack. Outbound Worker fetches rejected by fixture transport; observed zero. Miniflare disposed in finally.

Final run: **4 passed / 0 failed / 0 skipped**. 1024x1024 RGBA scanline decode including actual transparent-pixel count; invalid deflate rejection; actual SQLite-backed Durable Object coordinator admission/publication once despite duplicate run; restarted coordinator started-marker recovery to unknown with held reservation and zero repeated calls. Decoder round-trip wall time 325.491 ms; total probe wall time 471.496 ms. These are host wall measurements including startup, not CPU or peak memory measurements. Host watchdog 30 seconds.

Prior attempts: wrong local import path and sandbox esbuild spawn EPERM prevented runtime execution; installed Miniflare v5 required its exported convertV4MiniflareOptions adapter. First runtime run passed the two decoder scenarios, then failed the normal job assertion because the fake provider omitted required mimeType. Product correctly returned unknown/unvalidated output. Corrected only fixture output; final four passed.

Limits: full FileJobs alarm/router and owner authorization, actual D1/R2 publication, real provider response and segmentation quality are not exercised by this probe. Maximum 4096-square input CPU/memory remains unqualified. Native Worker decoder and DO coordinator/storage evidence are separate from Node-only fixtures.
