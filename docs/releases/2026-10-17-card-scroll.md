# October 17, 2026 release receipt: card editing and Full content

Released implementation: `abd5f840cd701b072630e6405f93a78978875acc`, tree `3b76cca77c19df12c6f4ee0a3abaf8d52a7b3d15`.
Production completed October 17 at **11:01:45 Pacific**. Release C, UI/TOC, Imports and Search are included ancestors. This documentation is a subsequent, separate change; it does not change the released implementation identity.

This is the sanitized repository copy of the coordinator's CARD-SCROLL-RECEIPT.md, reconciled with the final gate and deployment artifacts. Local session paths, test-account identifiers, credentials and database recovery bookmarks are omitted. The original deployment artifact retains recovery information; this public receipt is not a recovery credential store.

## Confirmed release evidence

| Evidence | Identity and result |
| --- | --- |
| [Unit/build verification](https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/39050526967) | Exact released SHA; successful |
| [Fast browser CI](https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/39050526881) | Exact released SHA; all six groups passed; Windows-only exclusions are not Linux coverage |
| [Windows release gate](https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/39054145759) | Exact released SHA; 45 required stages passed, 0 final failed stages; shard 7 attempt 2, other parts attempt 1 |
| [Shared preview](https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/39055922969) | Exact released SHA; gate and smoke passed; version `9df0514c-4226-4a75-87df-ad9621d61fad` |
| [Production](https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/39056178155) | Exact released SHA; released; smoke **5 passed / 0 failed / 0 skipped / 0 interrupted** |
| Isolated deployed acceptance | Runtime `e902b16a13655227e70e909f5c1fac2a96c67b5f`, harness `abd5f840`; layout 11, Full editing 8, automatic Scrollable editing 7: **26 passed / 0 failed / 0 skipped / 0 interrupted**; fixture model responses |
| Local unit/build readiness reused | `e902b16a`: **5,150 passed / 0 failed / 38 skipped / 0 cancelled**; production build 13.272 seconds and bundle check 0.782 seconds passed |
| Local integration collection | `e902b16a`: **0 passed / 0 failed / 37 skipped cases + 3 module-level skips / 0 interrupted**; pytest reports 40 skips, not 40 executed tests |

Runtime from `e902b16a` to `abd5f840` is unchanged: only canvas-editing-check.mjs, canvas-search-check.mjs and drop-ui-check.mjs changed. Reused evidence above retains its original SHA; it is not represented as a new exact-abd5 run. Counts from overlapping suites must not be added as unique coverage.

The skipped Python suites cover legacy app deployment, Ask, Fly jobs and AWS examples, not these canvas features. Three module-level skips hide 11 additional test functions. Actual feature-specific integration evidence is the Windows upload gate (41/41 at abd5f840), deployed card layout/editing acceptance (26/26, runtime e902b16a), and the separately attributed Context/bundle/Retry, picker/drop, converter and recovery checks in the [related evidence](2026-10-17-related-evidence.md). Those results are not Python integration-suite passes.

Production build: `32af51ae8a826b88`; control plane version `0fd168d4-852b-4c04-a586-dd6b739e6c5a`; app version `1547d013-ef17-4948-a677-3521f66ff27e`. See the [sanitized production receipt](2026-10-17-abd5f840-production.json), [gate receipt](2026-10-17-abd5f840-gate.json), [migration evidence](2026-10-17-abd5f840-migration.json), and [related lane receipts and verification limits](2026-10-17-related-evidence.md).

### Linux upload exclusion reconciled

The canonical `canvas-file-drop-check.mjs` is Windows-only after repeated Linux Wrangler upload-proxy failures. Fast CI exclusion does not fix that transport failure. The **final Windows gate at abd5f840**, shard 7 attempt 2, records `filedrop exit 0`, **41/41 assertions passed**, provider-tripwire hits 0. Attempt 1 also passed filedrop 41/41; shard 7 was repeated for equation Undo, not upload.

The earlier [Search Windows gate](https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/39019459638) at `e9e9a2fcbd1e0f25b5da97e55f95b5bc8e27cf8c` also passed 41/41. Its raw evidence covers fake 30 MiB refusal and absent object, exact 50 MiB acceptance, over-cap refusal, true no-length 411, and actual 34 MiB upload/checksum/fresh playback/seek. The final result is independently evidenced by the final gate, not borrowed from Search. Board-asset upload behavior remains distinct from file-route checksums and converter acceptance.

### Gate retry retained

Attempt 1 failed equation resize Undo (**14 passed / 1 failed** in that stage); unchanged local diagnosis and unchanged CI attempt 2 each passed **15/15**. No product or assertion change caused that pass. The collector's empty `retried` array does not mean a clean first attempt: its attempts map records shard 7 at 2. Under repository policy this is an unchanged-rerun flake; the cause remains unresolved and needs a focused reproduction next release.

## Shipped card scope

| Card type | Ctrl/Cmd+K Edit | Full content |
| --- | --- | --- |
| Explanation | Title, Markdown body, structured more-section labels/text | Yes, including expanded sections |
| Table | Title, caption, columns, rectangular string-cell rows | Yes |
| Snippet/code sample | Title, brief, code; never executes code | Yes; wrapped display, original code preserved for copying |
| Heading | Existing text field | No new layout mode |
| Image (`type: image`) | No | Yes; aspect ratio preserved |
| Imported file/source-backed card | No source rewriting | Only when the underlying type is in the four-type layout allowlist; does not alter source bytes |
| PDF, video, notebook, repository/code viewer, quiz, flashcards, challenge, interactive graph, conversation exchange | No new structured editing support | No new Full-content support |

These are intentional restrictions, not unresolved defects:

- Edit refuses `fileRef`, `source`, `anchor`, nonempty sources/citations, locked cards, unsafe/malformed structures and unsupported types. Markdown links/reference links and footnote citations in editable prose are conservatively refused; a revision cannot introduce them. Ordinary URL text and code examples are excluded from that citation test. This is not claim-aware citation rewriting.
- Read-only viewers cannot edit or change layout. Layout changes are disabled for locked/multiple selections. Citation/source metadata alone does not prohibit layout on an eligible underlying type.
- Existing native text, shape-label and equation editing stays on its established inline path. Conversation cards are not rewritten in place.
- Target/result limits are 4,000 characters (result measured as serialized JSON); context budget is 8,000 accounted characters including structured representation and metadata. Over-limit targets are refused, not silently rewritten from partial content. Supporting context is bounded; attached sources are listed metadata, not freshly fetched content.
- Accept rechecks permission, lock, existence and content freshness. Identity, references and geometry are preserved in one Undo transaction. Changed snippet code clears stale output and is not executed.
- Full content uses horizontal resizing and natural height without moving neighbours. Scrollable preserves its outer size; switching back restores it. Width baseline is 320, preferred fallback 720 and default maximum 1,200, with measured readability minimum allowed to raise the maximum.

Source contracts: [structured editing](../../packages/web/src/inline-card-edit.js), [layout](../../packages/web/src/card-layout.js), [feature brief](../features/card-scroll.md).

## Remaining items and next actions

| Item | Current status | Next action |
| --- | --- | --- |
| Historical multimedia Target crashes | Unresolved; bounded diagnostics did not reproduce the renderer crash. Native short-FLAC demuxer failure was reproduced, and AAC fallback passed; these are different outcomes. | Reproduce the original mixed-media scenario with renderer/CDP diagnostics and exact fixture/browser identity; fix only after isolating the cause, then rerun that scenario. |
| Linux upload transport | Unresolved platform limitation; Windows gate coverage confirmed above | Investigate Wrangler upload-proxy failure; require three unchanged Linux readiness passes before reclassification. |
| Equation Undo | First attempt failed, unchanged rerun passed; cause unresolved | Focused timing/focus/state reproduction and regression fix in next release. |
| Card Edit model behavior | Fixture wiring/validation/persistence verified; real-model instruction quality and structured-output behavior unverified | Verify subscription authentication and run a separately authorized real-model scenario; no paid fallback without new authorization. |
| TOC model behavior | Request isolation/intentional context verified with canned responses; real-model behavior unverified | Run focused real-model TOC scenario when authorized access is available; retain fixture and real-model evidence separately. |
| Integration collection | 37 skipped cases plus 3 module-level skips; no integration coverage | Provision the required authorized test environment and run applicable tests, recording pass/fail/skip/interrupted separately. |
| Legacy .doc, production converter hosting, Pinned Study | Explicitly deferred | Revisit only on owner request; dev converter acceptance does not establish production converter availability. |

No implementation, migration, deployment, paid call or broad test rerun was performed to prepare this documentation.
