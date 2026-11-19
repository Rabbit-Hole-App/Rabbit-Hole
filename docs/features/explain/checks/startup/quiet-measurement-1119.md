# Quiet-machine active startup, 2026-11-18 about 9:50 PM PT (all agents stopped, both peer sessions idle, nothing else of ours running)

Method: `wrangler deploy --dry-run --config wrangler.rabbit-hole-prod.jsonc` bundles (C:/s/spec/startup/bundle-*.js), then `wrangler check startup` six alternating runs per pair (C:/s/gen1-prep/ab-startup-lead.mjs); ACTIVE ms = total minus the (idle) self time; local profile, not Cloudflare's CPU. Each pair is its own alternating session; the baseline column drifts a little between pairs (288, 245, 226 ms), so compare within a pair only.

| pair (before -> after) | before: six runs, median | after: six runs, median | difference of medians |
|---|---|---|---|
| main b3b54c3b3 (release 162) -> main 8837d4a19 (release 161 on top) | 361, 326, 288, 265, 273, 263 -> 288 | 380, 330, 284, 219, 254, 214 -> 284 | -4 ms: no change |
| 161 -> feat/start-3 e69e8b95a (reference library on first use) | 256, 219, 218, 228, 250, 245 -> 245 | 148, 151, 152, 160, 147, 159 -> 152 | **-93 ms (-38 %)**; every START-3 run is below every 161 run |
| 161 -> feat/kinds-fit aaa67cee2 (r1+r2+r3) | 221, 244, 226, 226, 241, 226 -> 226 | 271, 310, 246, 251, 235, 318 -> 271 | **+45 ms (+20 %)** |

Bundles: 161 25,560,297 bytes (Total Upload 9075.33 KiB); START-3 25,565,746 bytes (9077.66 KiB); kinds-fit 25,566,423 bytes (9081.09 KiB).

Reading: release 161 added no startup cost on top of 162 (the number the Reviewer asked for: about 285 ms active on a quiet machine, 162 alone measured 265 ms in its own report). START-3 removes about 93 ms. The kinds-fit renderer adds about 45 ms: the worker bundle imports the renderer (it grew +6 KiB and its modules run at import), so Release A as defined (kinds-fit + NUM-2) makes the startup-limit refusal MORE likely, and START-3 (Release B) pays that back and more (net about -48 ms vs 161). Decision for the Reviewer: ship START-3 before or together with kinds-fit, or build the renderer's worker-side import on first use.
