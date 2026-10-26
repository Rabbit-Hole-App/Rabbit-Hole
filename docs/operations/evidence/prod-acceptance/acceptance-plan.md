# Production acceptance plan: live features without an acceptance receipt

Written 2026-10-26 about 12:15 PM PT by the prod-acceptance lane. Production main is **0b5a8dae** (release run 40383706342, deployed 19:08:22Z = 12:08 PM PT, config-only Motion ceiling US$3.50 on top of 0bd390ed/C17; build hash 622a36f361bce43e, identical to C17's, so the web bundle and every feature below are unchanged since C17 run 40373219295, 10:58 AM PT). Basis: `C:/s/spec/day-1021/reconciled-task-board.md` (99 rows, PRODUCTION-ACCEPTED: 0 Yes, 6 Partial, 92 No, 1 Unknown), `feature-inventory.md`, `acceptance-matrix.md`, `owner-prod-checklist.md`, `docs/operations/evidence/owner-observations.md` (branch docs/deployment-handoff) and `packages/web/wrangler.rabbit-hole-prod.jsonc` on main. Nothing in this file is an acceptance. A feature is accepted only when a receipt (section 3) exists.

## 1. How to read this

Verifier tags
- **PROBE** = INTEGRATOR-READ-ONLY public probe: unauthenticated GET or HEAD to https://digrabbithole.com, User-Agent `rabbit-hole-acceptance/1`, no cookie. Run with `node C:/s/spec/prod-acceptance/probe.mjs`; results in `probe-receipts.md` and `probes.json` (39 probes; first run 12:07-12:09 PM PT straddled the 12:08 deploy, final run 12:47-12:48 PM PT after it; the receipts file is the final run). A probe proves a route, status, header or JSON shape. It never proves a signed-in flow.
- **BROWSER** = OWNER BROWSER click-path on https://digrabbithole.com, signed in, existing UI only (Apps list and sidebar, the canvas, Chat, Library, Explore, Settings). Items O01 to O16 in `owner-checklist.md` (ids below as "Owner item").
- **CMD** = OWNER COMMAND (a production step only the owner may run). Only the Motion refund and the time-gated Nov 1 check need one.

Receipt fields for every acceptance (what `owner-receipt.mjs` writes): date and time PT; production build/SHA seen (expected main 0b5a8dae, build 622a36f361bce43e; the served pages do not print it, so this is the release receipt value, not a probe result); account used (gmail or @amazon.com); what was seen (exact text, count, status); screenshot path or "none"; verifier tag; PASS, FAIL or SKIP.

Constraints that shape every plan: no demo page (every step uses an existing screen); no paid generation (Motion Generate, image, CAD job and /video are never pressed); users see credits only; a second login is needed where marked; `acceptance 1026` is the single throwaway canvas.

## 2. Public-probe baseline (what 39 GETs showed at 12:47-12:48 PM PT, after the 0b5a8dae deploy)

All 35 probes with an expected status met it; 4 were recorded without an expectation (P36 405, P37 401, P38 405, P39 401). Raw table: `probe-receipts.md`.

| Fact observed | Probe | Feature it concerns |
|---|---|---|
| `/` 200 with entry `/static/landing-BCnw9OO1.js`; app shell entry `/static/app-C2iNWCe7.js`, 37 modulepreloads. Build id served: every HTML probe records its entry chunk; exactly these two distinct entries were served, the same two as in the 12:07 run before the deploy completed (consistent with an identical build hash 622a36f361bce43e) | P01 P03-P05 | all (code is served) |
| `/api/learn/usage` 401 `{"error":"Sign in to see your AI usage."}` | P15 | Credits |
| `/api/learn/stars` 401, `/stars/analytics` 401, `/creators/yudhisteer/stars` 200 `starred_count 0`, `/creators/nobody_zz9/stars` 404, public Explore list `star_count` 0 on both canvases | P16-P20 | Stars |
| Weekly Top 5 200, `weekly-top-v1`, America/Los_Angeles, week 2026-10-26T07:00Z to 2026-11-02T08:00Z (the Nov 1 DST change handled: PDT start, PST end), `star_history_since null`, both lists empty, query string ignored | P21 P22 | Weekly Top 5, Stars |
| Comments inbox/unread 401 `sign_in`; unknown shared canvas, threads and attachment link 404 | P23-P27 | Comments |
| Owner dashboard API `/api/owner/telemetry/access` plain 404; client sink GET 405 "POST required" | P34 P36 | Telemetry |
| Transcribe 401, image-proposals GET 405, file-jobs 401 | P37-P39 | gated features |
| Every response carries CSP `frame-ancestors 'self'` and `X-Frame-Options`; Referrer-Policy only on /sign-in; no HSTS on any; X-Content-Type-Options on 2 of 39 | all | Security headers (not shipped) |
| All 24 marker strings for credits, Settings, stars, weekly, comments, focus, CAD Focus, Start, chat generation, Motion notice, webpage card and Voice paused were found in the 636 served JS chunks (638 referenced; `/static/spark_rs_bg.js` and `/static/elk-api.js` answered 404, names that look like chunks but are probably not loaded files) | scan | code shipped, not behavior |

Observations worth the owner's attention (not acceptance results): the signed-out API still answers with the legacy wording "run small login first" (P09, P37, P39); the shell and the 404 page title is the legacy "small deploy" (P03, P11, P30, P32); `/e/<token>` and `/@handle` carry no `og:` or `twitter:` tags, so link previews show the shell title (P30, P32); unknown handle and unknown share token still return HTTP 200 (the page decides) (P31, P33); no sitemap.

Limits that no probe can remove: the served HTML does not show a commit or build hash (the hash is computed at release time). C17's changes (Study resize, Chat restore) add no unique user-visible string, so the bundle cannot tell 0bd390ed from 7b105a4b; only the release receipt ties the build to the SHA.

## 3. Per-feature plans

Ledger ids are the first 8 characters. "Owner item" points to `owner-checklist.md`. Each plan lists: accepted means, verifier, steps (existing UI only), evidence, cannot verify without.

### A01 Credits meter and usage panel (dd97625a; C2 29070833, credits-finish in C16)
- **Accepted means:** a signed-in person sees "N AI credits every month", used, remaining, a bar and "Renews on October 31, 5:00 PM PDT" in the gauge and in Settings > AI usage, with no dollar sign; N is 2,500 (no October usage) or 5,000 (used AI in October).
- **Verifier:** BROWSER (Owner item O01). PROBE only shows the signed-out route (P15). The credits-only usage API (no dollar fields for users, matrix gap 5) cannot be read signed out.
- **Steps:** 1 Open a canvas you own. 2 Click the AI credits gauge in the top bar and read it. 3 Open Settings > AI usage and compare. 4 Check no `$` anywhere on both. 5 Optional DevTools Network: open `/api/learn/usage` and note whether `currency`, `allowanceMicros` appear in the JSON (gap 5: say so, do not paste values).
- **Evidence:** N, remaining, used, exact renewal text, login used (gmail or amazon: the two logins can differ, 5,000 versus 2,500), screenshot.
- **Cannot verify without:** an account that has never used AI (the 2,500 case) and one that did in October (5,000); out-of-credits refusal wording (needs an exhausted account or spend).

### A02 Credits Nov 1 cutover (dd97625a)
- **Accepted means:** after Oct 31 5:00 PM PDT the legacy 5,000 account shows 2,500 and the renewal line moves to the next period.
- **Verifier:** BROWSER, time-gated; cannot start before 2026-10-31 5:00 PM PT (UTC 2026-11-01 00:00).
- **Steps:** 1 After the cutover open the gauge on the 5,000 account. 2 Read N and the renewal text. 3 Open Settings > AI usage. 4 Repeat on the other login. 5 Integrator probes P15 and P21 (the weekly week string must still be Oct 26 to Nov 2 until Nov 2 00:00 PST).
- **Evidence:** date PT, N before/after, renewal text.
- **Cannot verify without:** waiting for the date. Listed in blocked.md.

### A03 Comments Stage 1: own comments, invite, resolve, public comments, freshness (4c0f5e09; C1 889ed230)
- **Accepted means:** a comment posts with a pin, a reply lands, Resolve hides thread and pin, no email shows on any message.
- **Verifier:** BROWSER (Owner items O06, O07). PROBE confirms only auth shape (P23-P27).
- **Steps:** 1 In `acceptance 1026` right-click a card > Add comment, type text, Send. 2 See the pin. 3 Reply. 4 Resolve. 5 Share > invite the second login (Owner item O07 continues).
- **Evidence:** what each of steps 2-4 showed; second login used.
- **Cannot verify without:** a second login and working email delivery for the invitation code (email delivery is not probed anywhere).

### A04 Comments Stage 2: nested Rabbit Hole canvases (45043e6d; C6 59bb544c)
- **Accepted means:** a nested canvas has its own comments; someone who is a member of the parent only sees nothing in it.
- **Verifier:** BROWSER with two accounts; not in `owner-checklist.md` because it needs a nested canvas and a third state (parent-only member). Optional item.
- **Steps:** 1 Open a canvas that contains a nested Rabbit Hole. 2 Open the nested canvas and add a comment. 3 As the second account (member of the parent only) open the nested canvas and the Comments panel. 4 Expect no access to the nested comments. 5 Add the second account to the nested canvas and expect to see them.
- **Evidence:** screenshot of each state.
- **Cannot verify without:** an existing nested canvas and a parent-only member; the unit tests (cp 2526) are the only coverage until then. Not asked of the owner in the first sitting.

### A05 Comments Stage 3: reactions, edit history, attachments (dd8a8fef; C6)
- **Accepted means:** a reaction chip, "edited" history and a PNG attachment appear for both people without a reload; deleting the comment removes the picture and its link for both.
- **Verifier:** BROWSER, two accounts (Owner item O07).
- **Steps:** 1 Second account replies in your thread. 2 React with an emoji from the picker. 3 Edit your comment and click "edited". 4 Attach a small PNG with the paperclip; open the thread as the second account. 5 Delete the comment; reload both. 6 Remove the second account under Share > People with access; reload the picture link.
- **Evidence:** which of steps 2-6 needed a reload; whether the removed account could still open the link.
- **Cannot verify without:** two logins. PDF attachments, the 10 MB, 5-per-comment and 200 MB limits are unit-only and not asked.

### A06 Comments Stage 4: inbox, follow/mute, mentions, public thread from my words (09326803; C6)
- **Accepted means:** the Library inbox lists a thread with news and its reason; Mute removes it; an @mention reaches the mentioned person; "Share in a new public thread" copies only your own words.
- **Verifier:** BROWSER, two accounts (Owner item O07 covers mention and mute). Public-thread publishing is optional.
- **Steps:** 1 Second account @mentions you. 2 Open Library: the inbox row shows the reason. 3 Open the thread Notifications control and choose Mute: the row leaves. 4 In a members thread open "Share in a new public thread" on one of your own comments and read the preview. 5 Cancel without publishing.
- **Evidence:** inbox row text, state after Mute.
- **Cannot verify without:** two logins; Stage 4 has an open owner decision (D5, public mentions) and unbuilt pieces (Editor role, email, embed link), so full Stage 4 cannot be accepted. See blocked.md.

### A07 Stars (18ac55d1; inside C6, migration 0028)
- **Accepted means:** a star persists across reload, shows in Library > Stars, unstar removes it, and the public count follows.
- **Verifier:** BROWSER (Owner item O04) plus PROBE before and after: P18 (`starred_count`), P20 (`star_count`), P21 (`star_history_since` becomes non-null and stays so after unstar by design).
- **Steps:** 1 Probe P20/P21 first (baseline recorded: both star_counts 0, star_history_since null). 2 Explore > press Star on a published canvas. 3 Reload. 4 Library > Stars lists it. 5 Unstar, reload. 6 Integrator re-probes and records the new star_count and star_history_since with the time.
- **Evidence:** counts before/during/after, probe times.
- **Cannot verify without:** nothing beyond one account. The creator analytics screen and star events to telemetry are no-ops in production (no sink bound), not accepted.

### A08 Weekly Top 5 (82da56fa; C7 8bda70a2, week fix in C15)
- **Accepted means:** a canvas starred by someone other than its owner appears in Explore > Canvases as rank 1 with its weekly star count; the creator appears with 1 supporter; no private or personal data; the week label matches Pacific time.
- **Verifier:** BROWSER with second account (Owner item O08); PROBE P21 to read `canvases.entries` after.
- **Steps:** 1 Second account stars your published canvas. 2 Wait 60 s. 3 Explore > Canvases: "Top canvases this week". 4 Creators tab: supporter count. 5 Search any word: the section hides; clear: it returns. 6 Integrator probes P21 and confirms the same row appears in `entries` with no email or id.
- **Evidence:** rank, counts, week label (now Oct 26 to Nov 1), time starred and time seen.
- **Cannot verify without:** a second login. Analytics events are a no-op (no sink) and are not accepted by this plan.

### A09 Focus and its adapters: notebook, PDF, image, table, explanation, 3D (61a13b25 and WP2-WP5)
- **Accepted means:** Focus fills the working area in place; Escape or Back to canvas restores card, zoom and selection exactly; no unsaved-change notice.
- **Verifier:** BROWSER (Owner item O05, per card type); PROBE only shows the string "Back to canvas" is shipped.
- **Steps:** 1 Select a notebook card, click Focus. 2 Escape. 3 Repeat for a PDF card. 4 Repeat for an image card. 5 Right-click > Focus once. 6 Confirm no unsaved-change notice each time.
- **Evidence:** which card types were tried and result per type.
- **Cannot verify without:** a canvas with each card type; any type not present is SKIP, not PASS.

### A10 CAD Focus (083b47cb; C9 d31bab82)
- **Accepted means:** a CAD card focuses with Interact and Fit view in the Focus header; Escape restores.
- **Verifier:** BROWSER (Owner item O16) only if a CAD card already exists.
- **Steps:** 1 Open a canvas with a CAD card. 2 Select, Focus. 3 Check the header tools. 4 Escape.
- **Evidence:** tools shown.
- **Cannot verify without:** an existing CAD card. Creating one is a paid CAD job and the executor budget is 96.3% reserved until Nov 1 5:00 PM PDT. "Show dimensions" and parameter tools have data only with CAD_BRIEF_FIRST, which is off, so they cannot be accepted. See blocked.md.

### A11 Study map defaults and compact pinned header (6da6e34c, 4f11cd74; f6b93035)
- **Accepted means:** Study opens with both maps hidden, View toggles show them and the choice is kept for that canvas; the pinned-reference header is compact.
- **Verifier:** BROWSER (folded into Owner item O02).
- **Steps:** 1 Open a canvas, View > Study, pick the reference card. 2 Look: minimap and hole map hidden. 3 View > show one; reload; still shown. 4 Look at the header height.
- **Evidence:** screenshot of the Study header (the header pixel saving was never measured).
- **Cannot verify without:** nothing special.

### A12 Study resize persistence (5b60a856; C17 0bd390ed)
- **Accepted means:** a notebook (or any resized card) keeps its size after an immediate reload, a reload after the save, and a sign-out and in, with the right panel open.
- **Verifier:** BROWSER (Owner item O02). Not probe-checkable.
- **Steps:** 1 Open a canvas with a notebook card; keep the right panel open. 2 View > Study, pick the reference, working view Canvas. 3 Drag the notebook's bottom-right corner bigger. 4 Reload at once. 5 Resize again, wait 3 s, reload. 6 Sign out, sign in, look.
- **Evidence:** size before/after each reload; browser.
- **Cannot verify without:** a canvas with a notebook card (otherwise SKIP). Firefox and Safari and the ToC pane were never tested.

### A13 Chat restore: typed draft, context edits, explicit mode (69439cbe, 7959cd39; G4 and C17)
- **Accepted means:** text typed while a saved thread restores is not wiped; attached context and an explicit mode choice survive the restore; a new chat starts Auto with no leftover attachments.
- **Verifier:** BROWSER (Owner item O03). Do not press Send.
- **Steps:** 1 Open a canvas that has a saved thread. 2 Reload and type `draft 1026` the moment the composer shows. 3 Wait 10 s. 4 Add a card to chat context and choose a mode before the thread appears if you can. 5 Start a new chat: Auto, no pills.
- **Evidence:** composer content at 10 s; what happened to the pills and mode.
- **Cannot verify without:** timing is manual; the race may not reproduce on a fast link. A PASS means "not seen to fail", state that. The owner decision for this behavior is also still unrecorded (board row 69439cbe).

### A14 Chat generation UX (b43b5a55 and the three bugs; C16 7b105a4b)
- **Accepted means:** slash-command and artifact answers use the generation card flow: no "Explore next" on them, no "Add as card" on command responses, real status instead of a silent wait.
- **Verifier:** BROWSER (partly Owner item O09). PROBE: the strings "Charge not confirmed yet" and "No credits charged" are shipped.
- **Steps:** 1 In Chat type `/motion`, send. 2 Read the answer: no "Explore next" suggestion row, no "Add as card" button. 3 Do not press Generate. 4 Check the credits gauge did not change.
- **Evidence:** exact text and the absent controls.
- **Cannot verify without:** a flow that can actually start: Motion is owner-only and paused, image is closed. "Starting" and job-bound states, Regenerate behavior and the failure wording on a fresh job cannot be seen without a paid generation. See blocked.md.

### A15 Motion: routing and failure messaging (69b00255; 733e996d; failed owner job 61f70171)
- **Accepted means (routing, no spend):** `/motion` shows the Motion proposal (acceptance account) or "Motion generation is temporarily unavailable while ..." (other account), starts nothing and charges nothing. **Failure messaging:** the failed 10-25 card says it failed and states its charge line honestly.
- **Verifier:** BROWSER (Owner item O09). OWNER COMMAND for the refund of the failed job (dry run said 127.8157 credits, 0 refunded): the exact command is in the handoff section 9.4 and `motion-deploy.sh`; this lane does not restate it.
- **Steps:** 1 Chat: `/motion` and send. 2 Read the answer, do not press Generate. 3 Open the canvas that holds job 61f70171. 4 Read the card: failed, and the charge text. 5 Compare the card text with the usage ledger line the owner sees under Settings > AI usage.
- **Evidence:** exact notice text; exact charge line on the failed card; whether it reads "No credits charged" (a mismatch while 127.8 credits were charged).
- **Cannot verify without:** a refund run (owner command), then a re-read of the card. Motion generation itself (validation, 15 s job, activation) is NOT acceptable here: paid, paused, and waiting on owner decisions D1a, D1b, D2. See blocked.md.

### A16 Start a rabbit hole dialog (3d8fdee7; G4 dfab2e55)
- **Accepted means:** the dialog takes files, links and one repository in one draft; Add to canvas places cards; "Start with a blank canvas" opens an empty canvas and imports nothing.
- **Verifier:** BROWSER (Owner item O11).
- **Steps:** 1 Open Start a rabbit hole. 2 Add a small .md file and a link. 3 Read the summary line. 4 Choose Add to canvas only and start. 5 Open the dialog again and click Start with a blank canvas.
- **Evidence:** summary text, cards created, gauge before/after.
- **Cannot verify without:** unknown whether "Use as context" calls a model (unverified; read the gauge before choosing it). A repository import needs a real repository and is not in the first sitting.

### A17 Cards, creators, handle screen and Explore dot grid (2f608983, f33493f1, eeb537ab, 76c1db0e; G4)
- **Accepted means:** Size 0 and 1 cards are consistent with 340-character descriptions; the creators list is wide with the badge beside the @handle; Explore has the dot grid; the choose-your-handle screen looks right.
- **Verifier:** BROWSER (Owner item O13). PROBE P28-P30 show the public data these pages read.
- **Steps:** 1 Explore: dot grid, card Sizes 0 and 1. 2 Creators tab. 3 Open /@yudhisteer: header, avatar, badge. 4 One screenshot at phone width.
- **Evidence:** screenshots; anything squeezed.
- **Cannot verify without:** a brand-new account for the handle screen (SKIP; it only shows once).

### A18 Settings (L11 e89d99f0)
- **Accepted means:** every Settings page opens; a changed preference persists; AI usage matches the gauge.
- **Verifier:** BROWSER (Owner item O12). PROBE: the string "AI usage" is shipped.
- **Steps:** 1 Open Settings. 2 Visit each page. 3 Change the theme. 4 Reload. 5 Compare AI usage with O01.
- **Evidence:** pages visited, preference, result.
- **Cannot verify without:** the L11 receipt lists unverified: the enforced:true Settings path, Safari, Firefox, screen reader; those stay unverified.

### A19 Webpage card (no ledger row; release/webcard merged to main, BROWSER binding in prod config)
- **Accepted means:** pasting one https URL offers "Paste as text" or "Add webpage card"; the card captures a screenshot, locks and unlocks scrolling and refreshes.
- **Verifier:** BROWSER (Owner item O10). The only existing receipt is the dev record (webcard-blockers.md); no production receipt exists.
- **Steps:** 1 In `acceptance 1026` paste https://example.com. 2 Pick Add webpage card. 3 Wait about 10 s. 4 Lock scrolling, scroll, Unlock. 5 Refresh. 6 Reload and look again.
- **Evidence:** seconds to capture, card states, any failure text ("The capture failed").
- **Cannot verify without:** Workers Paid Browser Rendering limits under load; a capture of a login-gated or blocked page (states "Login required", "Hidden") needs a suitable URL and is optional.

### A20 G3 batch UI and canvas file drop (98d7ae03; 73d184a8)
- **Accepted means:** the G3 changes (contrast, small card, Sloppiness, file-drop) show no regression in ordinary use.
- **Verifier:** BROWSER, folded into A16/A17; one extra step: drop a small image onto `acceptance 1026`.
- **Steps:** 1 Drag a small PNG onto the canvas. 2 A card appears. 3 Reload; it persists.
- **Evidence:** result.
- **Cannot verify without:** the original "Network connection lost" cause of the file-drop flake is not established; this does not test it.

### A21 Telemetry and owner dashboard (6c3f8d59 and children; code dark)
- **Accepted means:** nothing observable yet. Production has no TELEMETRY_DB binding; producers are no-ops; the dashboard answers 404 to everyone.
- **Verifier:** PROBE only, as a negative control: P34 (404), P36 (405 on GET).
- **Steps:** 1 Run probes P34 and P36 after any telemetry release. 2 Do not call POST.
- **Evidence:** status codes; time.
- **Cannot verify without:** the c21 binding release, the owner secret and identity, and real events. Not acceptable now. See blocked.md.

### A22 Deployed-disabled features stay disabled and say so (125bbcae, 9453f5f0, ba6304f0, 9df97503, fbf89a40, f181c346, c015534a)
- **Accepted means (negative acceptance):** /generate-image, Ctrl+K image edit, Ctrl+K code run, file converter, Voice listening and recorded-answer transcription are not usable and give an honest message; nothing starts a spend.
- **Verifier:** BROWSER (Owner item O14, no confirm of anything). PROBE: P37, P38, P39 show the routes refuse signed out; the "Voice mode is paused" string is shipped.
- **Steps:** 1 Chat: type /generate-image and read the answer. 2 Open the slash picker and check it is not listed. 3 Click the Tutor microphone and read. 4 Look at /video in the picker but do not confirm it.
- **Evidence:** exact texts.
- **Cannot verify without:** note the known reverse mismatches: /video and maths animation are offered but cannot run (no provider key), and the recorded-answer mic answers 503 after recording. Those are defects, not acceptance. Do not record or confirm them.

### A23 Security headers (12669016)
- **Accepted means:** HSTS, X-Content-Type-Options and Referrer-Policy on app and API responses.
- **Verifier:** PROBE.
- **Steps:** 1 `node probe.mjs` and read the "Security-relevant headers" table. 2 Expect strict-transport-security on every response once shipped.
- **Evidence:** the table.
- **Cannot verify without:** the header change does not exist on main (HSTS 0 of 39, nosniff 2 of 39, Referrer-Policy 1 of 39). Nothing to accept; it is an open task needing owner approval for config.

### A24 Public pages: Explore, profiles, share links (G4, earlier)
- **Accepted means:** public Explore and profile data contain no private fields; share links serve.
- **Verifier:** PROBE P20, P28-P33 plus BROWSER O13.
- **Steps:** 1 P20, P28, P29 JSON key lists (no email, id or token other than the public url). 2 P30, P32 shell 200. 3 Owner opens a /e/ link in a private window.
- **Evidence:** key lists, statuses.
- **Cannot verify without:** revocation of a real token needs the owner to revoke a share (not in this sitting).

### A25 Rows with no user-visible production behavior (CI, docs, harness, hygiene)
- **Rows:** 22a717ca, b8696a17, 545e6fde, 416a96bc, f33be77a, f259cced, a07b0257, 7775a72c, aa678b42, 29a46467, 05ea6f82, ea81a551, e651b7fa, 1cb74dc3 (parent), 68865019, 9957d765, a940a2a8, 2c188ed7, ba3f3177, b2d961d6, 081f5be6, 2e500153.
- **Accepted means:** these have no production click-path. Close them on their CI or doc evidence, or on the receipts of the user-facing rows above (1cb74dc3 stays open until O13 and O16 receipts exist).
- **Verifier:** none; the integrator decides closure. Not an owner task.

### A26 Features with earlier production receipts (not in this lane)
/explain v2 (L10), codebase assessment, Jev grading (JEV), render fairness (rfair), /3d scene (L9), repository import, slash-command cleanup (L7). Receipts exist under `C:/s/spec/day-1021/release-*-receipt.md`; not re-accepted here.

## 4. Counts

- Feature plans: 26 entries (A01-A26). 20 have a user-facing acceptance path (A01-A20): 19 doable now, 1 time-gated (A02). A04 and A06 (full) are optional and outside the owner checklist. Negative, probe-only or non-acceptable entries: A21-A26.
- Owner browser items: 16 (O01-O16): 2 need the second login (O07, O08), 1 is conditional on an existing CAD card (O16), 1 is cleanup (O15).
- Probes run: 39 (35 with an expected status, all met; 4 recorded without an expectation), plus 636 static chunks scanned for 24 markers (24 found).
- Owner commands: 1 now (Motion refund of job 61f70171, from the handoff), 1 time-gated (Nov 1 cutover check).
