# Usage analytics (PostHog)

Owner brief 2026-11-02: basic usage tracking for the production release. The owner is Rabbit Hole's only user; existing
activity is internal testing, not customer traction. This is an engagement view only. RH's accounting (`usage_actions`,
credits) and operational telemetry (`docs/features/telemetry.md`) stay authoritative and are not changed or fed from here.

It answers: who signed up and signed in, and when; how often each account returns; estimated active minutes per account;
which main features they use. No RH analytics UI is built; the views live in PostHog.

## Consent

Owner requirement 2026-11-02. Nothing optional happens before the visitor accepts: no identifier is created or read, no pageview, feature,
active-time or identify event is sent or queued for later, and the server sends no `rh_signed_in`.

- `src/analytics-consent.js` holds the choice per browser: `localStorage` `rh_analytics_consent` is `accepted` or `rejected`. Missing or
  unreadable means off. Its storage event reaches other tabs. Do Not Track or Global Privacy Control overrides it.
- Version 2 of the choice also covers Creator Analytics (`rh_analytics_consent_version`, cookie `rh_analytics_consent_v=2`; creator-analytics-contract.md). An earlier acceptance keeps PostHog running and the banner asks again.
  The words live in `src/analytics-copy.js` (owner decision 2026-11-03). First visit: "We use analytics to understand how Rabbit Hole is used and improve it, and to show creators how their public learning boards are used." An earlier acceptance (`consentState` is `outdated`): "You accepted analytics before. We now also measure how public learning boards are used, so their creators can see it. That stays off until you accept this update. Rejecting turns all optional analytics off." Buttons ("Accept analytics", "Reject optional") and the Privacy Policy link are unchanged; in the update state neither button is pressed.
  Settings, Privacy & security, shows the same four states (none, rejected, accepted, outdated). Outdated reads "Existing product analytics accepted. Public-board measurement is awaiting your acceptance..." and its accept button is "Accept update".
- A cookie `rh_analytics_consent=accepted` exists only while accepted. It holds no identifier and is how a sign-in request tells the
  control plane (the Privacy Policy lists it with `rh_analytics_consent_v`, which public-board measurement also requires); without it `captureSignIn` sends nothing. A sign-in in another browser, or before accepting, is therefore not recorded.
- `src/analytics-banner.js` is plain DOM for the app and the public pages, bottom right, not modal, and takes focus only when opened from a
  preferences link. It does not appear in a build without analytics, or for a browser sending DNT or GPC.
- Change it with "Analytics preferences" in the public footer (`landing/footer-links.js`) or Settings > Privacy & security.
- Withdrawal stops collection in every tab, drops queued and accrued data, aborts sends in flight, cancels retries, removes the `rh_ph_*` keys
  and deletes the cookie. Nothing else is cleared: sign-in, drafts, recovery and accounting are untouched. It does not delete events already sent.
- Internal accounts need Accept too: until the owner accepts in his browser, his activity is not collected and identify does not run.

## Where it runs

- PostHog project "Rabbit Hole Project" (ID 644462), US ingestion `https://us.i.posthog.com`, public project token (`phc_`).
- Browser: `packages/web/src/usage-analytics.js`, a small adapter with no SDK (nothing loads from PostHog; no autocapture
  and no session recording exist to switch off). Installed by `main.jsx` (the app, not inside an embedding site) and by
  `src/landing/analytics.js` (the public pages). Configuration comes from the build: `VITE_POSTHOG_TOKEN`,
  `VITE_POSTHOG_HOST`, `VITE_ANALYTICS_ENV` (`src/analytics-config.js`). Unset means off.
- Server: `packages/control-plane/src/product-analytics.js` sends the sign-in event from `auth.js`, configured by the
  `rabbit-hole-cp` vars `POSTHOG_PROJECT_TOKEN`, `POSTHOG_HOST`, `ANALYTICS_INTERNAL_USER_IDS`. Unset means off.
- Only the production release sets them: `scripts/prod-release.mjs` `BUILD_ENV` (the page build in the release workflow)
  and `packages/control-plane/wrangler.rabbit-hole-prod.jsonc` vars. CI, `deploy-dev` and the shared dev worker build
  without them, so CI and dev traffic never reach PostHog. A personal API key (`phx_`) never goes in any build or config;
  `production-bundle-check.mjs` fails on one, and in the release's `prepare` (`EXPECT_ANALYTICS=1`) fails unless the built
  bundle carries the release token and host.

## Identity

- The PostHog identity is `users.id` (32 hex characters), read from `GET /api/me` (`user_id`, already returned to the
  signed-in browser). `/auth/session` and its display contract are unchanged. The adapter refuses any identity that is not
  32 hex characters, so an email, a handle or a `.rabbithole.invalid` principal can never become one.
- New sign-ins and returning sessions alike: every app load asks `/api/me` and identifies; an already identified account
  sends no second `$identify`.
- Anonymous visits (public pages, sign-in) carry a random anonymous id in `localStorage`; the first identify merges that
  anonymous visit into the account (`$anon_distinct_id`).
- Logout lands on the sign-in page, which clears an identified account (new anonymous id, new session). A `401` from
  `/api/me` does the same; an outage does not. Identity lives in `localStorage` and is read on every event, so a logout or
  account change in one tab reaches every other tab.
- A different account on the same browser is never merged: the stored identity is cleared before the new account is
  identified. Accounts are never merged by email (auth.js already keeps a Google, GitHub and email sign-in for one
  address as separate users).
- Per-account lookup: `distinct_id` is the account id. The public handle is not sent; to label an account, look the id up
  in `rabbit-hole-prod` (`users`, `user_handles` via `LEARN_DB`).

## Events

| Event | Sent by | When | Properties (besides the common ones) |
|---|---|---|---|
| `rh_signed_in` | control plane | A verified sign-in: OAuth callback or spent email link, after the session is minted. A reload or restored session is not a sign-in. | `provider`, `new_account` (true only when this sign-in created the account), `$set.rh_internal`, `$set_once.rh_account_created_at` (`users.created_at`) |
| `$identify` | browser | First time an account is seen on this browser | `$anon_distinct_id`, `$set.rh_internal` |
| `$pageview` | browser | Each page load and each in-app navigation to a different sanitized path | `$current_url`, `$pathname`, `$host`; first view of a load also `$referrer`, `$referring_domain` |
| `rh_active_time` | browser | Each minute of active time, and the remainder when the tab hides or unloads | `active_seconds`, `idle_threshold_seconds` (60) |
| `rh_canvas_created` | browser | Start / the bar / Project hub created a canvas (`agent/commands.js` `create_canvas`) | `source: start` |
| `rh_canvas_opened` | browser | A canvas loaded (`LearnPage.jsx` board load) | |
| `rh_tutor_used` | browser | The Tutor planner answered a turn (`learn-tutor.js` `runTurn`) | |
| `rh_planning_requested` | browser | A paid plan: an /explain brief (`startExplain`), or CAD when the brief step returns `awaiting_approval` | `feature`, `action_id` |
| `rh_generation_requested` | browser | Generation started: Explain Generate or edit, CAD build, image job, Motion video | `feature` (`explain`, `cad`, `image`, `motion`), `action_id` |
| `rh_generation_completed` | browser | That job reached ready | `feature`, `action_id` |
| `rh_generation_failed` | browser | That job ended failed, cancelled, refused or stopped (Explain: only after generation began) | `feature`, `action_id`, `reason`; Explain also `stage` (where it stopped) and `stop_reason` (for example `deadline`), tokens from the job view only |
| `rh_share_changed` | browser | A canvas's sharing was saved (canvas Share panel, Home card Share dialog) | `access` (`private`, `link`, `public`) |
| `rh_canvas_forked` | browser | A fork was made (a replayed reply is not a second fork) | |

Common properties on browser events: `distinct_id`, `$session_id` (UUIDv7), `$window_id`, `$lib: rh-web`, `$browser`,
`$device_type`, `rh_env`, `rh_internal`. `action_id` is a 16-hex hash of the job or generation id, never the raw id.
Job outcomes count only when the card last knew the job as running (Motion, CAD, Explain), so opening an old card reports
nothing, and terminal job events carry a per-browser once-key (Motion: per attempt, so a retry counts again), so a card that polls or
reloads and sees the same finished job again does not count it twice. Event `uuid`s are fixed per event, so a delivery retry is the same event to PostHog.

Planning is never reported as generation: the /explain brief is `rh_planning_requested`, and an Explain job that fails
while still planning is not `rh_generation_failed`.

## Visits and active time

- Visits are PostHog sessions: `$session_id` follows PostHog's own rules (a new id after 30 minutes without an event, or
  after 24 hours), shared by the tabs of one browser.
- Session duration (first to last event of a session) and estimated active minutes are separate numbers.
- Estimated active time: counted only while the tab is visible and focused, and only up to 60 seconds after the last
  real input (pointer down, key, wheel, touch). The `scroll` event is not input: it also fires when a streaming answer
  scrolls itself, so dragging a scrollbar with no other input can go uncounted. Hidden, unfocused and idle time count nothing; network activity
  (heartbeats, model polling) is never input. A gap longer than 10 seconds between steps earns nothing, so a suspended
  device adds nothing. Only the focused tab of a browser counts, so two tabs never double-count. It is an engagement estimate, not
  proof of attention or learning.
- Accrued time belongs to the account and session it accrued in. Before a logout or account change (here or seen from another
  tab) and when its session ends, it is reported under that owner with the time it was last earned, and an account change
  clears the input window, so one account's input never earns time for the next. A remainder under a second is dropped.
- Batches go out every 5 seconds (and with `keepalive` on hide/unload), each batch at most 3 times, queue capped at 100.

## Privacy

- Never sent: prompt or message text, answers, file contents, canvas titles or content, tokens, auth query strings,
  share or invitation URLs, emails, handles, profile fields. Paths go through `routeTemplate` (ids, tokens and handles
  become placeholders), queries and fragments are dropped, another site's referrer is reduced to its origin.
- Every feature property is allowlisted per event and must be a lowercase word, a non-negative integer or a boolean.
- Do Not Track or Global Privacy Control turns analytics off in that browser, and the server skips `rh_signed_in` when the
  sign-in request carries either.
- Failures never block sign-in, the canvas or generation: every call is fire-and-forget and swallows its errors.

## Internal and test traffic

- `ANALYTICS_INTERNAL_USER_IDS` lists the owner's accounts by `users.id`, both confirmed by him (2026-11-02): `dda2350771a4066e3080c605ba092e0a` (Google, his Gmail, created 2026-10-03) and
  `edf6bd0c9cd0dcdcb7ef4c9f2c49f337` (Google, westcliff.edu, created 2026-10-24). `/api/me` returns `analytics_internal: true`
  for them, so their browser events carry `rh_internal: true`, and identify and the sign-in event set two person properties:
  `rh_internal` and `$internal_or_test_user`.
- `rh_env` is `production` only on the production build and control plane; dev builds that opt in send `dev`.
- Customer view: `rh_env = production` and `rh_internal` not true, in its own SQL, so it never depends on a cohort.
  Verification view: `rh_env = production`, internal included.
- The project's "Filter out internal and test users" setting is unchanged: it excludes cohort 612497 ("Internal / Test users"),
  person property `$internal_or_test_user` exact `true`, the property PostHog's own `setInternalOrTestUser` sets. It was
  empty because nothing set that property; identify and sign-in now do. The cohort recalculates on PostHog's schedule, so the
  filter can lag a new mark. It says nothing about environment: only the views' `rh_env` clause excludes dev events.
- Saved views: [verification](https://us.posthog.com/project/644462/insights/xdElDuqk) and
  [customer](https://us.posthog.com/project/644462/insights/il1obVOX).

## Views (PostHog SQL insights)

Per-account activity (verification view; for the customer view add `AND toString(properties.rh_internal) != 'true'`):

```sql
SELECT distinct_id AS account_id,
       max(timestamp) AS latest_activity,
       uniqExactIf(`$session_id`, event != 'rh_signed_in') AS visits,
       countIf(event = 'rh_signed_in') AS sign_ins,
       round(sumIf(toFloat(properties.active_seconds), event = 'rh_active_time') / 60, 1) AS est_active_minutes,
       any(toString(properties.rh_internal)) AS internal
FROM events
WHERE {filters} AND properties.rh_env = 'production' AND match(distinct_id, '^[0-9a-f]{32}$')
GROUP BY account_id ORDER BY latest_activity DESC
```

Session duration per account (separate from active minutes):

```sql
SELECT distinct_id AS account_id, count() AS visits, round(sum(seconds) / 60, 1) AS session_minutes
FROM (SELECT distinct_id, `$session_id`, dateDiff('second', min(timestamp), max(timestamp)) AS seconds
      FROM events WHERE {filters} AND properties.rh_env = 'production' AND match(distinct_id, '^[0-9a-f]{32}$') AND `$session_id` != ''
      GROUP BY distinct_id, `$session_id`)
GROUP BY account_id ORDER BY session_minutes DESC
```

`{filters}` gives each insight its date range and the "filter out internal and test users" toggle.

## Verification

`src/usage-analytics.test.mjs` covers the logic with a fake window. `e2e/usage-analytics-check.mjs` drives the real entries
(`startAppAnalytics`, `landing/analytics.js`, configured through `VITE_*` as in a release) in Chromium with a test token, a fake
clock and a stubbed `/batch/` on an `.invalid` host, so no event can reach PostHog. It does not load the whole app, and Playwright
emulates focus, so its hidden and unfocused states are set on the document rather than made by a real window.

## Incidents (2026-11-02)

Both happened while building this and are recorded at the owner's request.

- Credentials: the Cloudflare keys were loaded with `eval "$(grep ...)"` from `small-deploy/.env`, which breaks the rule against
  sourcing that file. Nothing was printed.
- Production read: `rabbit-hole-prod` was read directly with `wrangler d1 execute` (read-only, `users` and `user_identities`, 2
  rows including provider emails) outside a launcher.

Going forward: credentials by line match only, with `C:/s/spec/day-1021/with-cf.mjs` for Cloudflare; no production read except
through an owner launcher or a rule approved in main's `CLAUDE.md`.

## Collection start and history

Collection starts when the release carrying this change is live; no earlier sessions or active time are reconstructed.
The release receipt records the time. `rh_account_created_at` is the real `users.created_at`, so accounts made before
collection still show when they were created.

## Release and rollback

- Turn off quickly: a release with `VITE_POSTHOG_TOKEN` and `POSTHOG_PROJECT_TOKEN` removed (the adapter and the server
  helper do nothing without them), or a Worker rollback to the previous version pair. Data already in PostHog stays there.

## Known gaps (ponytail)

- ponytail: canvases created from a repository, a Dive, Duplicate or a Home card menu are not `rh_canvas_created`; only
  Start / the bar / Project hub. The Motion brief (a paid plan in Chat) is not `rh_planning_requested`; it is never
  counted as generation either. CAD's approve-after-brief (flagged step) is not `rh_generation_requested`. Inline image
  edits and 3D scenes are not tracked.
- ponytail: once-keys are per browser; a finished job first seen on a second device counts once there too.
- Anonymous events from before an identify join the account only through PostHog's merge; anonymous visitors who never
  sign in are not accounts and do not appear in the per-account views.
