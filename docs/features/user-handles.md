# Public handles (@handle)

Owner requirement, 2026-10-06. Every Rabbit Hole user has a unique public handle, shown as `@handle`. It is the canonical creator identity on canvases and projects. The display name stays optional, and the handle is authoritative.

## Contract

- **Format:** the field is `handle` and it renders as `@<handle>`. It is mandatory for every user and globally unique.
- **Case:** uniqueness ignores case. A handle is stored in canonical lowercase, so `@Yudhisteer` and `@yudhisteer` are one handle.
- **Syntax:** 3-30 characters of `a-z`, `0-9` and `_`, starting with a letter or digit.
  - One leading `@` is accepted as typed.
  - Surrounding whitespace is refused, never trimmed.
  - There are no spaces, no emails, no slashes and no URL characters.
- **Reserved:** `RESERVED_HANDLES` in `packages/control-plane/src/handle.js` holds generic product and system words: admin, api, auth, explore, home, rabbit, rabbithole, support, system and the like. Extend that list only, never per person.
- **Never public:** a handle is never derived from an email. No email, user id or provider id is ever shown in place of a missing handle. No handle means no creator line.

## Persistence

- Learn migration `0008-user-handles.sql`: `user_handles (email PRIMARY KEY REFERENCES user_profiles(email) ON DELETE CASCADE, handle TEXT NOT NULL UNIQUE COLLATE NOCASE)`.
  - It is a narrow one-to-one extension of `user_profiles`, holding handle identity only.
  - No row means no handle yet.
  - It is additive and re-runnable, and applies to LEARN_DB only. It runs on local test databases only until a deploy GO.
  - Deploy order: 0004, 0005, 0006, 0007, 0008.
- It lives in LEARN_DB because profiles live there already, and because every canvas, share, fork and publication row is a LEARN_DB row keyed by the owner's email. The Learn routes never read the main D1 (`users`, `user_identities`), so a handle must be joined from LEARN_DB.
- Canvases never copy a handle. Every read resolves it by reference: `HANDLE_OF(email)` in `canvases.js`. A changed handle therefore shows everywhere at once, and no canvas row is rewritten.

## API

- `GET /api/profile` returns `{ name, avatar, handle }`: one profile joined from `user_profiles` and `user_handles`.
- `PUT /api/profile { handle }` claims or changes the handle.
  - The server normalizes the input and checks the syntax and the reserved list.
  - One statement upserts the handle, and the UNIQUE (NOCASE) index is the authority: of two simultaneous claims, exactly one wins.
  - The loser gets `409 { error: "@x is taken. Choose another.", taken: true }` and nothing else in that request changes.
  - The client's hints are advisory only.

## Where @handle shows

- **Shared canvas header:** "Shared by Display Name · @handle", or "Shared by @handle". With no handle there is no line. The shared response's `creator` replaces the former `owner` email, which is no longer sent.
- **Home and Library cards:** canvases and projects, nested holes included, show the owner's handle (`owner_handle` and `owner_name` on rows).
- **Fork provenance:** "Forked from 'Title' · @alice" (`forked_from_handle`). The fork is the forker's own.
  - The fork's `forked_from` record no longer stores the source owner's email (`creator: null`).
  - The Start Rabbit Hole `source` likewise stores no creator email.
- **Explore cards and the public canvas** will show `@handle` (docs/features/explore-publish.md). Publishing requires a handle.

## Choosing a handle

- `HandleGate` (web) sits in front of every Rabbit Hole page. A signed-in person with no handle sees "Choose your handle" in place, before anything else. This covers new accounts (first-time setup) and existing ones (next signed-in entry).
- The URL is untouched. Once the handle is claimed, the same page renders, so a deep link resumes: share, sign in, choose a handle, then the share; or Fork, Start Rabbit Hole and Publish the same way.
- Signed-out visitors, or a build with no profile service, see no change.
- Settings > Profile > Handle changes the handle, with the same server rules.

## Test sessions

`/test/session` works only in test mode with its secret. It gives a test person a random test handle (`t_` plus 12 hex), or the one the check names, so browser checks land on their page. `handle: null` keeps none, to test the step itself. An existing handle is kept.
