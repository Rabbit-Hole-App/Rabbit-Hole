# Acceptance work that is blocked (2026-10-26 about 12:50 PM PT, production main 0b5a8dae)

| # | Feature (ledger id) | Why it cannot be accepted now | Needs | Earliest |
|---|---|---|---|---|
| B1 | Credits Nov 1 cutover (dd97625a) | Legacy accounts keep 5,000 until Oct 31 5:00 PM PDT; the 2,500 state and new renewal text exist only after that | Waiting; then owner item on the 5,000 account | Oct 31 5:00 PM PT (UTC Nov 1 00:00) |
| B2 | Credits out-of-credits refusal, sealing after a refused job (bf3b1551) | Needs an exhausted account or real spend; db4ed119 sealing fix is on a branch, not deployed | Owner decision to spend or an exhausted test account; release of db4ed119 | not derivable |
| B3 | Motion generation, validation heavy cases, activation (733e996d, a19242a8) | Paid; MOTION_GENERATION_PAUSED=1; owner-only; the first job failed (US$1.278, 127.8 credits charged, refund not run); owner decisions D1a, D1b, D2 and the M1-M7 sequence pending; the Fly orchestrator ceiling change (3.50) is config in the repo, its Fly deploy is an owner step | Owner decisions and commands (handoff section 9.4); US$ budget | owner decisions |
| B4 | Motion failure wording on a fresh failure (C16) | Needs a paid job to fail | Same as B3. The existing failed card can be read now (Owner item O09) | after B3 |
| B5 | Chat generation UX job-bound states, Regenerate (b43b5a55, e80a2b45) | Only visible where generation can start: Motion (owner-only, paid) and image (closed) | B3 or image activation | after B3 |
| B6 | Image generation, Ctrl+K image edit, Ctrl+K code run, file converter (125bbcae, 9453f5f0, ba6304f0, 9df97503) | Disabled by design: IMAGE_GENERATE_ENABLED false, no provider keys, no converter app, no loader. Only the "stays disabled" check (O14) is possible | Owner keys, spend approval, production Fly app | owner decisions |
| B7 | CAD generation acceptance, review-first, CAD controls, CAD Focus tools (f9f35fb7, d3a0e047, 083b47cb) | Paid CAD job; executor egress budget 96.3% reserved until Oct 31 5:00 PM PDT; CAD_BRIEF_FIRST false so Show dimensions and parameters have no data; CAD Focus basic is possible only on an existing CAD card (O16) | Budget rollover (after Nov 1), owner O-5, one paid job | Nov 1 5:00 PM PT |
| B8 | Telemetry, owner dashboard, Stars/Weekly analytics, browser errors, Tutor evidence (6c3f8d59, ffe30d90, 2f92d101, 7b808b46, 188a0661) | TELEMETRY_DB not bound in production; producers are no-ops; dashboard 404 to everyone (P34); c21 binding candidate not released; owner secret not set | Owner GO (D4) and the c21 release | owner GO |
| B9 | Weekly Top 5 analytics, Stars analytics screen (82da56fa, 18ac55d1) | No sink: weekly-top:event has no listener, deliverStarEvents has no caller | B8 | after B8 |
| B10 | Comments Stage 4 in full, Editor role, email, embed link, capture UIs (09326803, 29979e11) | Not built; owner decision D5 and O-12 open | Owner decisions, build | owner |
| B11 | Comments Stage 2 nested canvas (A04) and PDF attachments/limits | Needs a nested canvas and a parent-only member, or a PDF flow; unit-only coverage today | Owner time and a third state | optional |
| B12 | Recorded-answer transcription (f181c346, 62c6f327) | No OPENAI_API_KEY: 503 after recording; shown but not working. A defect to decide (key or remove), not acceptable | Owner O-8 | owner |
| B13 | /video and maths animation (c015534a) | Offered but cannot run (no provider keys); preflight branch not released | Owner O-7 | owner |
| B14 | Voice Mode listening (fbf89a40) | LISTENING_PAUSED by owner decision 2026-10-12; only "stays paused" is checkable (O14) | Owner revisit | owner |
| B15 | Security headers (12669016) | Not implemented (probe: HSTS 0 of 39, nosniff 2 of 39, Referrer-Policy 1 of 39) | Config candidate and owner approval | owner approval |
| B16 | Tutor general rubric and visual assessment (f0b2b366) | Both flags unset in every config | Owner O-6 | owner |
| B17 | Handle onboarding screen (eeb537ab) | Shows once per new account | A brand-new account | optional |
| B18 | Study resize, A12: Firefox, WebKit, ToC pane | Never tested; owner has one browser | Other browsers | optional |
| B19 | Anything needing a second login when only one is available (O07, O08, A04, A05, A06) | Needs the other identity (gmail or @amazon.com) and invitation email delivery (never probed) | Owner's second login | owner sitting |
| B20 | Share-link revocation of a real token (A24) | Needs the owner to revoke a real share | Owner action | optional |
| B21 | Webpage card under load, login-gated pages (A19) | Single capture only | Suitable URLs | optional |
| B22 | Deciding which commit is live from the web | Not possible from public probes: pages print no commit/build hash; C17 added no unique string | A served version stamp (not built) or the release receipt | n/a |

Nothing else was found blocked by a missing account that the owner does not already have, except B19 and B17.
