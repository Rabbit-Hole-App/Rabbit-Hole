# Beta 1 release manifest

Stage: **personal beta** (the owner is the only tester; paying-user launch is deferred). Each release ships only after a full attested gate of its exact tree, a green dev deploy, and the owner's release GO plus a GO for every production migration it carries. Pushing Rabbit-Hole-App main triggers production.

Ownership: Parallel owns items, SHAs and gates; Home owns migrations, production and recovery.

## r35: ready for personal testing

| Item | Owner | Branch @ SHA | Status |
|---|---|---|---|
| Equation size ladder S/M/L/XL | UI lane | ui/r35-equation-size @ ac190ef7 | merged |
| Comment "Couldn't send" diagnostics | Comments lead | fix/r35-comment-send @ 3d094820 | merged |
| Evidence correctness (beta item 5) | Learning | fix/beta-evidence @ e55ab81f | merged |
| Release pipeline: attested gates, all-platform lock, verify.yml, 0017 + owner-only archive routes | Home | infra/r34-audit @ 78978863 | merged (not past 78978863: 0016 is r36) |
| Glossary (CONTEXT.md) | Parallel | integration/r35 | merged |
| Home/Library/Explore selected-card pill | UI lane | ui/r35-home-pill @ b8dd15d1 | merged |
| Storage security: board-only asset reads, fork copies only current files, deleted/trashed hole links revoked, atomic saves, all-or-nothing forks (beta items 3, 4) | Storage lane | fix/beta-storage | in progress |
| Rabbit Holes title dropdown + project breadcrumb | Title lane | ui/r35-title-holes | in progress |
| "Learning Boards" rename + Explore filter (Library's) + bigger creator cards | Creator lane | ui/r35-creator-size | in progress |
| Card spacing/footer, project rename + visibility + share, one ⋮ menu | Cards lane | ui/r35-cards-rename | in progress |
| Ask in chat on images and text boxes | Canvas lane | ui/r35-ask-image-text | in progress |
| Library folders (learn 0015) | Folders lane | feat/r35-library-folders | in progress |

Gate: int35 (full, attested format) on the final integrated tree; record and dev-deploys note to be added here.

## r36: next release

Answer routing B (no duplicates, tray, right-panel card conversation); image grounding through the Tutor (beta item 1: Tutor tests on fix/beta-image-context 8ef10192, Learning implements); section progression (Learning, fix/beta-progression; Tutor harness verifies); spend admission (Spend lane + Home 0016 usage_operations); evaluation archive import of Run A, r27 and the aborted attempt (Tutor, archive.mjs).

## Migrations

| # | File | Blob | sha256 | Dev | Prod | Release |
|---|---|---|---|---|---|---|
| 0015 | 0015-library-folders.sql | 5048696c | 69ec5a88… | rehearsed; apply after it merges into r35 | rehearsed read-only (61→65); needs the owner's GO | r35 |
| 0016 | 0016-usage-operations.sql | 61de416c | c4850b37… | rehearsed; apply after the Spend lane acks | needs the owner's GO | r36 |
| 0017 | 0017-tutor-eval-archive.sql | dd964638 | cd213e49… | applied 2026-10-09 | applied 2026-10-09 (owner GO; bookmark 00000020-…-135fc39b) | in r35 via 78978863 |

## Production (r35)

Learn prod has 0001–0014 + 0017 (61 objects). r35 releases only after 0015 is applied on prod. The release job records the previous and new cp/app versions, D1 bookmarks, smoke and outcome as a 90-day artifact; the receipt goes here after release.

## Recovery

Each release's receipt carries the Time Travel bookmarks of both D1s, taken just before deploy.

## Pending owner decisions

- r35 release GO and the 0015 production GO
- Production TUTOR_EVAL_OWNER_USER_ID (prepared)
- Preview invitations (barrier change; with the owner)
- Anthropic workspace limit value for the platform day cap (r36)
