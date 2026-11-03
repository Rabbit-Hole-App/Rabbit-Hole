# Signup email preferences

Owner decision, 2026-11-03 (verbatim): "both email subscription checkboxes should be checked by default for new signups: Rabbit Hole
Updates, Newsletter. Keep them independent and optional: users can uncheck either or both and still create an account. Save each
preference exactly as submitted, and let users change them later in Settings or unsubscribe. Preserve existing users' saved preferences
and unsubscribes: do not automatically switch them back on. Record how the preferences were obtained accurately. Preselected boxes must not
be recorded as affirmative opt-in; where affirmative consent is required, obtain it before sending marketing."

Backend design (owner, same day): separate preferences linked to the authenticated account; the contact address resolved server-side from
the authentication records, never from the client and never the internal `user@...rabbithole.invalid` principal; nothing is saved by showing
the boxes; changing one preference leaves the other alone; unrelated profile edits never reset either.

**This change sends no email and builds no delivery.** It stores the choices and provides the one gate a future sender must call.

## Where it lives

- **Sign-up.** Accounts are created at the first sign-in (`auth.js userFor`; there are no passwords), so the form is the existing
  "Choose your handle" step (`HandleGate.jsx`, docs/features/user-handles.md): two checkboxes between the handle field and Continue,
  both checked, neither required. Continue saves the handle and the two choices in one `PUT /api/profile`; an unchecked box never blocks it.
  Nothing travels through the OAuth or emailed-link redirect, so no personal data is in a URL, a cookie or `state`.
- **Settings.** Settings > Privacy & security > Email: one switch per category, each saving only its own category. A choice that was only
  pre-selected shows **Confirm** where an active yes is required.
- **Unsubscribe.** `GET/POST /unsubscribe?token=` (control plane, `email-preferences-store.js`): a signed link for one person and one
  category. GET shows a button and changes nothing (a mail scanner opening it is harmless); POST (the button, or a mail client's one-click)
  turns that category off. The route is served by the control plane because only it holds `MASTER_KEY`.

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
| `disclosure_version` | the wording shown (`v1`), NULL for an unsubscribe link |
| `changed_at` | epoch seconds, per preference |

| `method` | When | `affirmative` |
|---|---|---|
| `signup_preselected` | shown checked, submitted unchanged | 0 |
| `signup_user_checked` | the person unchecked then checked it again | 1 if on |
| `signup_user_unchecked` | the person unchecked it | 0 |
| `settings_user_set` | switched in Settings (or Confirm) | 1 if on |
| `unsubscribe_link` | the signed link | 0 |

The client sends, per box, `enabled` and whether the person `touched` it; the server never infers it. Onboarding is **insert-only**: a
choice already recorded (Settings, an unsubscribe, an earlier Continue) is never overwritten by defaults shown again. The mailing address is
not stored here; it is resolved at send time. `email_suppressions` (address, reason) is the never-mail list: nothing writes it yet.

## The deliverable address, per provider

`deliverableEmail` (`email-preferences.js`) uses `user_identities.provider_email` only from a provider whose address the auth code verifies:

| Sign-in | What `auth.js` stores | Deliverable |
|---|---|---|
| Emailed link | the address itself, proven by the single-use link | yes |
| Google | the email only when `email_verified` is true (scope `openid email`); otherwise null | yes when stored |
| GitHub | the public profile email from `GET /user` (no scope, no verified flag); often null | **no: pending** |
| Test/mock | follows the provider it imitates | as above |

A preference with no deliverable address is saved and shown, but is **pending**: `marketingRecipient` refuses it (`no_verified_email`) and Settings
says nothing is sent yet. GitHub stays pending until sign-in asks GitHub for the primary verified email (owner decision below).

## The one sender gate

`marketingRecipient(env, userId, category)` returns `{ send: true, address }` or `{ send: false, reason }`, checking in order: unknown category,
no preference, opted out, affirmative consent where `AFFIRMATIVE_REQUIRED` says so, a verified address, suppression. A future sender must call it
and send to no other address.

## Existing people

No migration or code path writes a preference for anyone. Repeat sign-ins do not touch the table. The onboarding defaults arriving for a person
who already has a row change nothing. A person with no row stays "Not set" and `marketingRecipient` refuses them. Tested in
`test/email-preferences.test.js`.

## Owner decisions needed

1. **Affirmative consent per category.** Default `AFFIRMATIVE_REQUIRED = { updates: false, newsletter: true }`: Newsletter is marketing and needs an
   active yes; Updates is treated as product news. Change the constant to require it for both.
2. **Descriptions.** The product had none. Proposed v1: "Product news: new features and changes to Rabbit Hole." and "Our newsletter: articles and
   ideas about learning with Rabbit Hole." Any wording change is a new version in `DISCLOSURES`, never an edit in place.
3. **GitHub.** Add the `user:email` scope and read the primary verified address, or leave GitHub-only people pending.
4. **Privacy Policy** (`packages/web/src/landing/support.js` is not edited here). It does not mention email choices today, and says Resend handles
   "sign-in and invitation emails". Proposed additions, for approval:
   - Under Account information: "**Email choices**: if you choose Rabbit Hole Updates or the Newsletter (both optional, and you can create an account
     without either), we keep each choice, when you made it, how (when you created your account, in Settings or through an unsubscribe link) and which
     wording you saw. We use your address for what you chose, plus emails you need to use Rabbit Hole such as sign-in links. You can change a choice in
     Settings or unsubscribe at any time."
   - Under GitHub: "We send Updates or Newsletter email only to an address we can confirm is yours: a Google-verified address, or the address you sign in
     with by email link. An address GitHub shows publicly is not used until we can confirm it."
   - Under Resend: add "and, once we send them, Rabbit Hole Updates and Newsletter emails".
   - Do not publish these before the first send is real.
5. **Release order** (below).

## Production steps (owner-run; nothing here touches production)

1. `C:/s/spec/signup-prefs/apply-prod-migration.cmd`: applies `0028` to `rabbit-hole-prod` with `d1 migrations apply` (the main D1 records its migrations;
   the release job requires `d1_migrations` to name exactly the repository's files). Typed phrase `APPLY PROD`; it refuses unless 0028 is the only pending
   migration. Additive: two tables, no data touched, re-runnable.
2. Then the main push. If the push comes first, the release job blocks with "not applied 0028" and changes nothing (`scripts/prod-release.mjs schemaBlockers`);
   apply the migration and re-run it. If code were deployed by hand before the migration, profile reads still work, but Continue returns "Your email choices could
   not be saved" until it is applied (the choice is never silently dropped). The reverse order, migration first, is harmless: two empty tables.
3. Dev: the same migration on the shared `rabbit-hole-dev` D1 (`C:/s/spec/signup-prefs/apply-dev-migration.cmd`) before a dev clone shows the feature.

## Checklist for @yuvish_demo (the owner's production test account)

@yuvish_demo already has a handle, so it never meets the Choose your handle step: it has no preference recorded. **The four sign-up combinations can
only be exercised on production by creating new accounts; they are covered by `signup-email-preferences-check.mjs` in CI on test accounts.** On
@yuvish_demo, after the migration and release:

1. Open Settings > Privacy & security > Email. Both switches are off and read "Not set." (nothing was switched on for an existing person).
2. Read the rows (`C:/s/spec/signup-prefs/read-prod-email-prefs.cmd`, read-only): none yet.
3. Turn on both; read the rows: two with `source settings`, `method settings_user_set`, `affirmative 1`, `disclosure_version v1`. The Newsletter shows no Confirm.
4. Turn off only Newsletter: Updates unchanged. Turn on only Newsletter and off Updates; then both off. After each, reload Settings (it must show the same state) and read
   the rows: the other category's row and `changed_at` do not move.
5. If the account signs in with GitHub and shows no public email, it reads "...no verified email address on your account": pending, as designed.

## Tests

- `packages/control-plane/test/email-preferences.test.js`: the four combinations and every unchecked/rechecked variant, no row on display, persistence on a second read, account
  isolation (body identity ignored), a session with no account id, Settings one-at-a-time and Confirm, unrelated profile edits, defaults never overriding a choice,
  existing choices and unsubscribes untouched by the migration and repeat sign-ins, the additive migration, independent unsubscribe and its refusals, deliverable address per
  provider and pending, the sender gate, and code shipped before the migration.
- `packages/web/src/signup-email-choices.test.mjs`: the rendered step (both checked, named, described, optional, before Continue), independence, and what Continue sends.
- `packages/web/e2e/signup-email-preferences-check.mjs` (CI, local stack): the four combinations through the real step, reload, stored rows, Settings, an existing person,
  isolation, an unrelated edit and the unsubscribe link.

## Not covered

Sending any email; bounce or complaint handling (nothing writes `email_suppressions`); a history of earlier choices (only the current value and how it was obtained are kept);
re-asking existing people; exporting or deleting these rows with an account closure (closure is manual today); a GitHub verified-email lookup.
