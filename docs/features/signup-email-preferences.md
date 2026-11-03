# Signup email preferences

Owner decision, 2026-11-03 (verbatim): "both email subscription checkboxes should be checked by default for new signups: Rabbit Hole
Updates, Newsletter. Keep them independent and optional: users can uncheck either or both and still create an account. Save each
preference exactly as submitted, and let users change them later in Settings or unsubscribe. Preserve existing users' saved preferences
and unsubscribes: do not automatically switch them back on. Record how the preferences were obtained accurately. Preselected boxes must not
be recorded as affirmative opt-in; where affirmative consent is required, obtain it before sending marketing."

Backend design (owner, same day): separate preferences linked to the authenticated account; the contact address resolved server-side from
the authentication records, never from the client and never the internal `user@...rabbithole.invalid` principal; nothing is saved by showing
the boxes; changing one preference leaves the other alone; unrelated profile edits never reset either.

Later owner decisions, 2026-11-03: **affirmative consent is required for BOTH categories for now** (Rabbit Hole Updates is not exempt because it
is product news); **the Newsletter is the founder's tech and AI newsletter**, not only articles about learning with Rabbit Hole (disclosure version
v2); **the Privacy Policy states what is stored now**, because collection starts with this release; **GitHub-only addresses stay pending**; the
handle claim and the preference pair must **recover cleanly** from a failure between them.

**This change sends no email and builds no delivery.** It stores the choices and provides the one gate a future sender must call.
**Essential account and security email is separate**: sign-in links, invitations and budget alerts never read these choices and are never gated
by them (`sendDecision` and `marketingRecipient` are for the two optional categories only; `test/email-preferences.test.js` asserts that `auth.js`,
`cad-budget-alert.js` and `canvas-members.js` do not reference them).

## Where it lives

- **Sign-up.** Accounts are created at the first sign-in (`auth.js userFor`; there are no passwords), so the form is the existing
  "Choose your handle" step (`HandleGate.jsx`, docs/features/user-handles.md): two checkboxes between the handle field and Continue,
  both checked, neither required. Continue saves the handle and the two choices in one `PUT /api/profile`; an unchecked box never blocks it.
  Nothing travels through the OAuth or emailed-link redirect, so no personal data is in a URL, a cookie or `state`.
- **Settings.** Settings > Privacy & security > Email: one switch per category, each saving only its own category. A choice that was only
  pre-selected shows **Confirm** (both categories need an active yes), which records it as `settings_user_set`, affirmative.
  A note under the heading says plainly that these emails are not sent yet and the choices are saved for future messages. Every string a person sees is listed
  in `C:/s/spec/signup-prefs/user-visible-strings.md`.
- **Unsubscribe.** `GET/POST /unsubscribe?token=` (control plane, `email-preferences-store.js`): a signed link for one person and one
  category. GET shows a button and changes nothing (a mail scanner opening it is harmless); POST (the button, or a mail client's one-click)
  turns that category off. The route is served by the control plane because only it holds `MASTER_KEY`.
- **Privacy Policy.** `packages/web/src/landing/support.js` has an "Email choices" section: what is stored, who can see it, how to change or
  unsubscribe, and that no email is sent yet. The exact text and its sources: `C:/s/spec/signup-prefs/policy-wording.md`.

## Wording and versions

| Version | Rabbit Hole Updates | Newsletter | State |
|---|---|---|---|
| v1 | Product news: new features and changes to Rabbit Hole. | Our newsletter: articles and ideas about learning with Rabbit Hole. | never released; kept so a CI or dev row naming it stays readable |
| v2 | Product news: new features and changes to Rabbit Hole. | The founder’s newsletter about tech and AI. | current |

`DISCLOSURES` and `DISCLOSURE_VERSION` in `email-preferences.js` hold them. A wording change is a new version, never an edit in place. Each stored
preference names the version shown; a stale page that showed v1 is recorded as v1.

## Data (main D1, migration `0028-email-preferences.sql`)

`user_email_preferences`, one row per account and category; **no row = no preference recorded = not subscribed**.

| Column | Meaning |
|---|---|
| `user_id` | `users.id` of the signed-in session, never a request body |
| `category` | `updates` (Rabbit Hole Updates) or `newsletter` |
| `enabled` | 1 or 0, exactly as submitted |
| `source` | `onboarding`, `settings` or `unsubscribe` |
| `method` | how it was obtained, below |
| `affirmative` | 1 only for an active yes |
| `disclosure_version` | the wording shown, NULL for an unsubscribe link |
| `changed_at` | epoch seconds, per preference |

| `method` | When | `affirmative` |
|---|---|---|
| `signup_preselected` | shown checked, submitted unchanged | 0 |
| `signup_user_checked` | the person unchecked then checked it again | 1 if on |
| `signup_user_unchecked` | the person unchecked it | 0 |
| `settings_user_set` | switched in Settings (or Confirm) | 1 if on |
| `unsubscribe_link` | the signed link | 0 |

The client sends, per box, `enabled` and whether the person `touched` it; the server never infers it. The mailing address is not stored here;
it is resolved at send time. `email_suppressions` (address, reason) is the never-mail list: nothing writes it yet.

## Saving and recovery

The pair is **one statement** (`saveEmailPreferences`: a multi-row `INSERT ... ON CONFLICT`), so both categories are saved or neither. The handle is
claimed first (a taken handle changes nothing), then the pair, so a failure between them leaves a claimed handle and no choices; the answer is a 503
("Your email choices could not be saved. Try again."), never a silent drop. The retry recovers because the handle is already the account's own (no
conflict with itself; another account claiming it is still refused with 409) and the pair is written again with the values the retry carries.

The overwrite rule: an **onboarding** request replaces a stored row only while that row's `source` is `onboarding` (or there is no row). A Settings
change or an unsubscribe made since is never overwritten by a stale or repeated onboarding request. Settings and the unsubscribe link always replace
their own category. Tested: (a) failure after the claim, retry saves; (b) a failure on the second category leaves neither; (c) a retry with changed
values stores the changed values; (d) a reload after each shows the stored values; (e) own handle again succeeds, another account is refused; (f) a later
Settings change or unsubscribe survives a stale retry; (g) unrelated profile edits never reset either; (h) people with no row stay "no preference recorded".

## The deliverable address, per provider

`deliverableEmail` (`email-preferences.js`) uses `user_identities.provider_email` only from a provider whose address the auth code verifies:

| Sign-in | What `auth.js` stores | Deliverable |
|---|---|---|
| Emailed link | the address itself, proven by the single-use link | yes |
| Google | the email only when `email_verified` is true (scope `openid email`); otherwise null | yes when stored |
| GitHub | the public profile email from `GET /user` (no scope, no verified flag); often null | **no: pending** (kept for this release) |
| Test/mock | follows the provider it imitates | as above |

A preference with no deliverable address is saved and shown, but is **pending**: `marketingRecipient` refuses it (`no_verified_email`) and Settings
says nothing is sent yet. GitHub stays pending until sign-in asks GitHub for the primary verified email (a later owner decision).

## The one sender gate

`marketingRecipient(env, userId, category)` returns `{ send: true, address }` or `{ send: false, reason }`, checking in order: unknown category,
no preference, opted out, affirmative consent (`AFFIRMATIVE_REQUIRED = { updates: true, newsletter: true }`), a verified address, suppression. A
preselected, unchanged box is refused for both categories (`needs_affirmative_consent`). A future sender of Updates or Newsletter email must call it
and send to no other address.

## Existing people

No migration or code path writes a preference for anyone. Repeat sign-ins do not touch the table. A person with no row stays "Not set" and
`marketingRecipient` refuses them. A person with an unsubscribe or a Settings choice keeps it against any onboarding request. Tested in
`test/email-preferences.test.js`.

## Owner decisions still open

1. **GitHub.** Add the `user:email` scope and read the primary verified address, or leave GitHub-only people pending (current).
2. **Newsletter description.** "The founder’s newsletter about tech and AI." is a proposal; say what it contains if the page should (a new version).
3. **Effective date.** The Privacy Policy keeps "Effective date: November 3, 2026"; move it if the release goes live after that day (Pacific time).
4. **Re-asking.** People who sign up with the boxes checked and never confirm stay non-affirmative; a Confirm prompt exists only in Settings.

## Production steps (owner-run; nothing here touches production)

The release preflight refuses a production schema that differs from the repository's in either direction, so the order is fixed:

1. The feedback release goes live first.
2. **Then** `C:/s/spec/signup-prefs/apply-prod-migration.cmd`: applies `0028` to `rabbit-hole-prod` with `d1 migrations apply` (the main D1 records its
   migrations; `scripts/prod-release.mjs schemaBlockers` requires `d1_migrations` to name exactly the repository's files and the live schema to equal
   `schema.sql`). Pinned file hash, typed phrase `APPLY PROD`; it refuses unless 0028 is the only pending migration. Additive: two tables, no data
   touched, re-runnable.
3. **Then** the newsletter release (`C:/s/spec/release-queue/release.cmd 36-newsletter`). If it runs before step 2 the preflight blocks it with "not
   applied 0028" and changes nothing; apply the migration and run it again. If 0028 were applied before the feedback release, the feedback release's
   preflight would refuse the extra tables. If code were deployed by hand before the migration, profile reads still work but Continue returns "Your email
   choices could not be saved" until it is applied.
4. Dev: 0028 is applied to `rabbit-hole-dev` (2026-11-03).

## Checklist for @yuvish_demo (the owner's production test account)

@yuvish_demo already has a handle, so it never meets the Choose your handle step: it has no preference recorded. **The four sign-up combinations can
only be exercised on production by creating new accounts; they are covered by `signup-email-preferences-check.mjs` in CI on test accounts.** On
@yuvish_demo, after the migration and the newsletter release, in Settings > Privacy & security > Email:

1. Both switches are off and read "Not set." (nothing was switched on for an existing person). `read-prod-email-prefs.cmd` (read-only) shows no rows.
2. **Both on:** turn both on. Rows: two, `source settings`, `method settings_user_set`, `affirmative 1`, `disclosure_version v2`. Neither shows Confirm.
3. **Only Updates:** turn Newsletter off. Updates unchanged (same `changed_at`); Newsletter row `enabled 0`, `settings_user_set`, `affirmative 0`.
4. **Only Newsletter:** turn Updates off and Newsletter on. The other category's row does not move.
5. **Both off:** turn both off. Rows `enabled 0`, `affirmative 0`.
6. After each step reload Settings: it must show the same state, and `read-prod-email-prefs.cmd` the same rows.
7. If the account signs in with GitHub and shows no public email, the rows read "no verified email address on your account": pending, as designed.

The "pre-selected" and Confirm states (a box left checked at sign-up) appear only for a new account that pressed Continue with a box untouched; check that
once with a fresh test account: its two rows read `source onboarding`, `method signup_preselected`, `affirmative 0`, and Settings shows Confirm on both.

## Tests

- `packages/control-plane/test/email-preferences.test.js`: the four combinations and every unchecked/rechecked variant, no row on display, persistence on a
  second read, account isolation (body identity ignored), a session with no account id, Settings one-at-a-time and Confirm for both categories, unrelated
  profile edits, a stale onboarding request never overwriting a later choice, existing choices and unsubscribes untouched by the migration and repeat
  sign-ins, the additive migration, independent unsubscribe and its refusals, deliverable address per provider and pending, the sender gate (both
  categories need an active yes), essential email not gated, the versioned wording, code shipped before the migration, and the recovery cases above.
- `packages/web/src/signup-email-choices.test.mjs`: the rendered step (both checked, named, described, optional, before Continue), independence, and what
  Continue sends.
- `packages/web/e2e/signup-email-preferences-check.mjs` (CI, local stack): the four combinations through the real step, reload, stored rows, Settings,
  an existing person, isolation, an unrelated edit and the unsubscribe link.

## Not covered

Sending any email; bounce or complaint handling (nothing writes `email_suppressions`); a history of earlier choices (only the current value and how it was
obtained are kept); re-asking existing people; exporting or deleting these rows with an account closure (closure is manual today); a GitHub
verified-email lookup; atomicity between the Learn D1 (handle) and the main D1 (choices), which is a retry, not a transaction.
