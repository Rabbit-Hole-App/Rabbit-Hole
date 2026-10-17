# CAD remaining acceptance gaps

Current implementation: **`049f2845`**. [Final handoff](cad-evidence/dev-handoff-2026-10-17.md) supersedes pending statuses in this dated review.
Review: 2026-10-17, implementation `2ff803e878b58de9d5db1071da769f69cbc76ddf`. This is a focused spec reconciliation, not an execution receipt. The coordinator's in-progress resume and later receipts supersede pending statuses below. See [scope](cad-scope.md), [runtime receipt](cad-evidence/runtime-receipt-2026-10-17.md) and [original generated artifact inspection](cad-evidence/first-generated-plate.md).

| Requirement | Classification | Remaining action |
| --- | --- | --- |
| Owner preview and downloads before first autosave / proposed revision Accept | Implemented correction | Mutable owner file reads use source-owner authorization before board refs exist; shared/member/detached scopes remain intact. Six scope/persistence fixture checks passed on the pre-integration correction. Final deployed evidence must identify its own SHA. |
| Explain measurements (§13) | Partial; fixture-verified | Authorized revision-matched recorded kernel measurements and accepted thumbnail are wired to Explain. Arbitrary interactive STEP measurements and actual-model Explain remain unverified. |
| CAD context (§13) | Partial implementation | Selection/Add to chat includes identity, accepted revision, units, brief, parameters and validation. Explain now includes the accepted authorized thumbnail if no explicit image is present; recorded-measurement provenance accompanies it. General Chat still does not automatically attach CAD preview or original private reference provenance. No generic source ingestion is implied. |
| Request-specific geometry proof (§7,17) | Limited checker coverage | Bounds, solids, volume and matching circular edge diameter are supported. Hole count/centres/depth, pocket depth, preserved topology, mating clearance and interference are not established. Report these assertions blocked; a matching circular edge is not a verified through-hole. |
| Four real-model scenarios (§17) | 4 passed at `2ff803e8` | 8 provider requests, $0.117674 ledger cost; fine-grained geometry assertions remain blocked. See final handoff. |
| Saved interactive artifacts and recovery (§10,17) | Final deployed browser 5/5 at `049f2845` | Both real GLBs, scoped downloads, persisted accepted references and reload passed. Full multi-session stress remains unverified. |
| Runtime termination/recovery (§14,17) | Timeout/cancellation 2/2 | Same image: descendant timeout and SIGTERM cleanup passed. Hostile resource exhaustion and full browser cancellation remain unverified. |
| Performance (§16) | Partial measured evidence | Runtime receipt records one 26.359-second geometry build. Original integrated attempt failed at108.661 seconds. Neither establishes a successful warm/cold end-to-end timing distribution; report sample size and latest actual observations without promising latency. |

The following are intentional limitations, not newly discovered failures: detached copied/forked cards permit viewing/download/Explain but cannot edit the original job; accepted assumptions can be refined through the normal CAD Edit action, without a separate editable pre-build form; shared snapshots do not expose live private job history. If these prevent acceptance, treat them as explicit scope gaps rather than marking them verified.

Selected-image wiring is present: the shared context builder passes the first explicitly selected supported image to the authorized image adapter; nearby images and prior Chat state are not implicitly inherited. CAD metadata selection also works through `describeBlock` before the generic object helper. Neither is a missing implementation. Real-model image understanding remains unverified.

This final bounded review added no model requests, runtime executions or deployments. It ran only the two focused cancellation regressions against the original and corrected source; inspection fixtures above remain prior evidence, not actual-model coverage. Main and production remain untouched.
