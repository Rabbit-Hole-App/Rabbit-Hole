# Expanded Ctrl+K tools: integration receipt (2026-10-19)

The implementation uses the existing canvas Ctrl+K Edit/Explain preview and explicit Accept flow. This checkpoint adds request-bound repository/code review handoffs, selected-table summaries/plots, exact polynomial derivative comparison, explicitly selected PDF-page reads and recognized-data plots, combined diagram edits/layout, and explicit native image replacement. It preserves the earlier Equation and Code autocomplete work.

## Candidate and environment

Base 806c0c3b plus current main 263f0df3 merged without conflicts. Final tested working-source fingerprint: 18dd72c1b6e2c1b6; manifest evidence/ctrlk-retention-build-manifest.json. Named dev clone https://rabbit-hole-web-dev-ctrlk-tools.tryrabbithole.workers.dev, version a581ef5c-8a78-47cb-a597-c9d00564982b. Dev build7.54s, upload14.16s, triggers0.49s. A subsequent commit records this reviewed source tree; no production verification is implied by this dev receipt.

## Verification

- Final main-inclusive, retention-fixed full unit command passed in 122.701s: Python 31 passed; Node 5646 passed/0failed/38skipped (web 3274/6skipped, control-plane 2001/1skipped, other 371/31skipped).
- Canonical production BUILD_ENV Vite build passed 10.17s, followed by production-bundle-check. It used owned tracked public assets. Production notebook static bridge deployment is a separate prerequisite; the main app build does not deploy that site.
- Legacy integration command completed with 37collected cases skipped plus 3module-level skips, zero executed integration coverage. Initial collection lacked.env/S3_BUCKET; the documented temporary empty keyless file and nonfunctional bucket allowed the unchanged skip guard. Temporary file removed.
- Earlier compute/actions dev checkpoint: table compute7/7, explicit code review handoff1/1, local evidence component3/3; generation was intercepted. Equation focused stale target and64%/156% generated-preview checks2/2. Exact historical receipts remain preserved.
- Source/derivative/combined-diagram run4 passed5/5 on working fingerprint5a58f109aec794b3: derivative originals/provenance/reload, explicit page selection/partial coverage/stale choice refusal/source retention, one-step structural add+layout/oneUndo.
- Source recognized-plot run2 passed6/6 on8107f26e8b8ce9a9: no-page opt-in refuses before generation, recognized cells and uncertainty visible, actual Plotly preview, exact computed arrays and page provenance persist/reload. The seeded PDF card preview was not a verified PDF viewer; storage/authorized HEAD and source receipt were verified. Recognition and partial-page coverage were fixtures, not real model-quality evidence.
- Image replacement on18dd72c1b6e2c1b6: run2 passed table/code/equation including explicit output, unchanged original before Accept, detached retained asset, oneUndo/Redo, actual native DOM reload and authorized original-source HEAD. It then failed with unresolved fetch transport failure in diagram and interrupted2cases. Run4 passed diagram and stale-source refusal, then dependency-case editor opening timed out. Isolated run5 then passed dependency refusal1/1, preserving both linked endpoints. Thus all six distinct cases passed across runs2/4/5 on the same candidate; the earlier failed runs were not relabeled as a single6/6 run.
- Autocomplete added actual clipboard copy/paste, shared Fork, Library Trash/Restore checks3/3 on5a58f109aec794b3/versiona871e8eb; original clipboard restored. These complement earlier CodeMirror/component/native history checks rather than replacing them.

## Failures retained and corrected

Source run1 exposed a real render-order bug: eager PDF targets used board before initialization. The declaration moved earlier. Run2 fixture omitted native fresh:false normalization; run3 diagram fixture incorrectly repeated targetIds inside input. Source-plot run1 used the wrong ghost selector while the graph visibly rendered. These fixture failures remain recorded separately.

Replacement run1 exposed a real context bug: the ordinary withSource helper attached a newly retained original. New withRetainedSource keeps provenance-only sources detached and preserves any existing user attachment choice; normal explicit import behavior remains unchanged. Its focused 11/11 tests and the final full unit command passed. A subset harness attempt also failed from an undeclared selected variable; it produced no assertions/result JSON and its log is preserved.

## Supported subsets and unavailable paths

See [capability status](ctrlk-capability-status.md). Exact polynomial arithmetic supports only its bounded rational univariate grammar, not general CAS. Units are explicit declarations, not inferred or independently checked. PDF source UI selects one page per selected modern PDF and reads available extracted text only; partial coverage remains visible. Recognized values may be wrong even with an empty uncertainty list. Image replacement supports one editable modern saved image with no groups/incident links; source stays retained and native diagram bounds may differ from the image. No outside-mask pixel-preservation guarantee or recognition correctness claim is made.

JavaScript deployment remains blocked: Cloudflare rejected the dev Dynamic Workers loader with10195 (paid-plan entitlement required). No upgrade or cloud jobs ran. Baseline loader is absent; temporary enabled config was moved to evidence/wrangler.ctrlk-pilot.jsonc.disabled and is excluded from release. Python/notebook execution is unsupported. Image generation/background removal remain disabled and real-provider quality/spend verification is not established. CAD authorization does not authorize these providers. Repository evidence remains explicit owner-repository/commit scope, not arbitrary web/attached-source lookup. The complete brief is not declared fully verified while these runtime/provider prerequisites remain unresolved.
