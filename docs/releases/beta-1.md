# Beta 1 release manifest

Stage: **personal beta** (the owner is the only tester; paying-user launch is deferred). Each release ships only after a full attested gate of its exact tree, a green dev deploy, and the owner's release GO plus a GO for every production migration it carries. Pushing Rabbit-Hole-App main triggers production.

Ownership: Parallel owns items, SHAs and gates; Home owns migrations, production and recovery.

## r35: assembled, awaiting integrated verification

| Item | Owner | Branch @ SHA | Status |
|---|---|---|---|
| Equation size ladder S/M/L/XL | UI lane | ui/r35-equation-size @ ac190ef7 | merged |
| Comment "Couldn't send" diagnostics | Comments lead | fix/r35-comment-send @ 3d094820 | merged |
| Evidence correctness (beta item 5) | Learning | fix/beta-evidence @ e55ab81f | merged |
| Release pipeline: attested gates, all-platform lock, verify.yml, 0017 + owner-only archive routes | Home | infra/r34-audit @ 78978863 | merged (not past 78978863: 0016 is r36) |
| Glossary (CONTEXT.md) | Parallel | integration/r35 | merged |
| Home/Library/Explore selected-card pill | UI lane | ui/r35-home-pill @ b8dd15d1 | merged |
| Storage security: board-only asset reads, fork copies only current files, deleted/trashed hole links revoked, atomic saves, all-or-nothing forks (beta items 3, 4) | Storage lane | fix/beta-storage @ 4e6477dde2d5a134b7ffcfa10821589632b577d2 | assembled with reviewed working-tree follow-ups; integrated gate pending |
| Rabbit Holes title dropdown + project breadcrumb | Title lane | ui/r35-title-holes @ 0651f2e0166ee55acc9a32e6f3ab24b055632865 | assembled with reviewed working-tree follow-ups; integrated gate pending |
| "Learning Boards" rename + Explore filter (Library's) + bigger creator cards | Creator lane | ui/r35-creator-size @ 99714efb0133fe9d04d64f748f580847bc237e7c | assembled with reviewed working-tree follow-ups; integrated gate pending |
| Card spacing/footer, project rename + visibility + share, one ⋮ menu | Cards lane | ui/r35-cards-rename @ 0378d2c391112541a176ddc7f5dbe092f6109f86 | assembled with reviewed working-tree follow-ups; integrated gate pending |
| Ask in chat on images and text boxes | Canvas lane | ui/r35-ask-image-text @ c77ad6f999b22e4af35c41810b2c94874f0cceec | assembled with reviewed working-tree follow-ups; integrated gate pending |
| Library folders (learn 0015) | Folders lane | feat/r35-library-folders @ 2542d1a1954f346a08a141e085cac237760f1ca1 | assembled with reviewed working-tree follow-ups; integrated gate pending |

The original isolated Home timing change (95e0ade9ef00001e874d9c3c472d0533a361d8fd)
was committed as 455bcaa0838b200f35ced28e2fdc49640093e148 after its full unit pass.
Home follow-up 78c029866832b22257c00a6d008057eb9637e238 adds strict Linux process-state checks and dev Worker nodejs_compat; local full units and the runtime crypto probe pass. Linux CI remains required on the integrated commit.

Integration resolves the shared project menu across Map, Main Learn and nested Learn;
retains project scope through Explore type changes; and publishes fork rows only after
their referenced assets have copied. Regression coverage includes failed copies,
rollback, concurrent replay and lost publication acknowledgements. Original lane
worktrees remain intact; captured patches and source hashes live outside Git in the
shared coordination evidence.

Gate: int35 (full, attested format) against the final committed candidate, including
the Library folders, share-revocation and project-menu browser checks. No integrated
pass or preview deployment is claimed yet. Record and dev-deploys note will identify
the tested commit and tree; later changes require renewed verification.

## r36: next release

Answer routing B (no duplicates, tray, right-panel card conversation); image grounding through the Tutor (beta item 1: Tutor tests on fix/beta-image-context a5d670b8337f00468219b52f559265b4a69524cc, Learning implements); section progression (Learning, fix/beta-progression @ 76d66c327be31a7aee750631b7b250c4a739572c; Tutor independent checks 14/14, integrated browser pending); spend admission (Spend lane + Home 0016 usage_operations); evaluation archive contract 6f5256b5b07156c6bf9c8d21b47c492ecf9063fc plus importer, deployed owner routes/access and historical import of Run A, r27 and the aborted attempt. Image implementation and its independent browser verification, routing full/browser verification, and production spend/0016 approvals remain separate dependencies.

## Migrations

| # | File | Blob | sha256 | Dev | Prod | Release |
|---|---|---|---|---|---|---|
| 0015 | 0015-library-folders.sql | 5048696c | 69ec5a88… | read-only check 2026-10-10: all four folder schema objects absent; application awaits approval | rehearsed read-only (61→65); needs the owner's GO | r35 |
| 0016 | 0016-usage-operations.sql | 61de416c | c4850b37… | rehearsed; apply after the Spend lane acks | needs the owner's GO | r36 |
| 0017 | 0017-tutor-eval-archive.sql | dd964638 | cd213e49… | applied 2026-10-09 | applied 2026-10-09 (owner GO; bookmark 00000020-…-135fc39b) | in r35 via 78978863 |

## Production (r35)

Learn prod has 0001–0014 + 0017 (61 objects). r35 releases only after 0015 is applied on prod. The release job records the previous and new cp/app versions, D1 bookmarks, smoke and outcome as a 90-day artifact; the receipt goes here after release.

## Recovery

Each release's receipt carries the Time Travel bookmarks of both D1s, taken just before deploy.

## Pending owner decisions

- 0015 dev migration approval; r35 release GO and the 0015 production GO
- Production TUTOR_EVAL_OWNER_USER_ID (prepared)
- Preview invitations (barrier change; with the owner)
- Anthropic workspace limit value for the platform day cap (r36)
