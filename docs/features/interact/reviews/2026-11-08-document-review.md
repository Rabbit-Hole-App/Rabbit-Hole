# Interact documentation review — 2026-11-08

**Scope:** restructure and review the specification; create a reusable slash-command template; publish Markdown on `chatgpt/tutor`. This receipt proves documentation review only. It does not certify implementation, tests, real generation, dev deployment or production activation.

| Source | Pinned identity |
| --- | --- |
| Original `interact.md` | Version 11; 134,902 bytes; SHA-256 `5da15323c322da2777c8629639e18b5828e5e67b4bc79e5a4e883d3d1bf56b4a` |
| Target branch inspected | `1f4f6953850c0ed2011a4f2ffc0cd156119e7f33` |
| Prior source map | `34a63b7d2322d0bb70a086612f4bfb749776496a` |
| Earlier implementation audit | `80eb86183de67e2baabaa4b8edb58b4d932e40bc`; historical results retained, not rerun |
| Teaching reference | `tutor-scene-examples.md`, version 5; unchanged checked-in snapshot |

## Review findings and changes

| Finding | Correction | Affected requirements |
| --- | --- | --- |
| Historical implementation audit appeared before the target plan and used present tense, including production/test claims. | Preserve it in full in the explicitly historical appendix; open the active document with target contract, source status and navigation. | All; no boxes checked. |
| Workflow and reference lists were repeated; shared contracts were buried at the start of the HOW checklist. | One canonical workflow, reference manifest, UI/control section, contract/prompt section and code map. Keep the complete roadmap and detailed HOW steps. | All 183 source checkboxes retained. |
| No stable subtask identities or complete per-commit checkoff process. | Assign stable R/C IDs, link roadmap groups to HOW groups, define complete-range review receipts, evidence reuse and reopening. Keep UUID task ledger external. | Section 11; all outcomes. |
| Browser command requested local Playwright despite current repository rule. | Use verified `npm run build` in `packages/web`; write/register browser checks for approved CI/designated execution. Distinguish selection, execution and result. | INT-09-C07 and group setup. |
| Pre-approval description-fit requirement depended implicitly on later card assembly. | Add early trusted text-shell measurement with actual styles, bounded revision feedback and receipt. Render outage cannot be silently treated as fit. | INT-06-C17; INT-02 dependency. |
| Up to two supporting Programs plus main conflicts with two-active-Worker page ceiling if each holds a host. | Sequential validated support snapshots through existing pool, caching/fencing and explicit resource/preview tests. | INT-04-C14; INT-06-C18. |
| New DesignRevision interface lacked a named exported schema; marker/reference/hash details were underspecified. | Add explicit schema export and closure details; validate realistic payload sizes instead of silently truncating. | INT-01-C12/C13. |
| Composition could be interpreted as a transformation after rendered review. | Compile deterministic complete-card composition before capture and use the same accepted composition at delivery. | Section 3; existing INT-05/06 tasks retained. |
| Shared runner appeared only after job integration. | Establish runner/effect interfaces early; finish CLI integration later. Add effect replay crash-boundary tests. | INT-07B-C01/C12; execution order. |
| Complete-card/checkpoint evidence could exceed image budget without declared coverage handling. | Require coverage accounting, explicit incompleteness and bounded captures; no silent dropped required observations. | INT-05-C13. |
| Standalone script/harness could be interpreted as unmetered provider access or browser approval bypass. | Make admission/identity and trusted harness-only approval explicit. | INT-07B-C11; INT-08-C25. |
| Code map was from a different revision; candidate adapter and UI.md missing on target branch. | Inspect branch source/tree, label missing files and historical source pointers, preserve branch without rebase. | Sections 1/6. |
| Teaching prompt instructions accessible only through Chat link. | Check in the exact full examples snapshot and use relative links from the prompt inventory/benchmark tasks. | REF-01; INT-02 / INT-08. |

## Removed duplication and retained detail

Removed repeated introductory workflow summaries and duplicate reference lists from the active document after moving their requirements into sections 2/3/7. The original code audit, renderer/control inventory, source inputs, policy limits, persistence and historical test evidence remain complete in the historical appendix. The canonical physical-example table was moved from the end of the HOW checklist into the example section without reducing it.

No source roadmap/checklist obligation was removed or checked. **183 original checkboxes → 183 stable mapped requirements, plus 10 explicit gap-closing tasks = 193 open checkboxes.** Of the original task bodies, 180 remain verbatim; 3 have the targeted corrections below. A shorter active file reflects moving historical material to its own appendix, not compressing implementation tasks.

Amended task bodies: `INT-07B-C01`, `INT-08-C02`, `INT-09-C07`. Changes are limited to local-versus-approved browser execution, early shared-runner integration order, and making teaching-reference links local. Dependency/setup/schema prose corrections are recorded above. All other task clauses remain intact.

## Source review limitations

The branch tree and selected job/brief/player/manifest/proposal sources were read at the pinned target SHA. They retain the short-brief/fixed-timeline paths and lack the proposed new-flow modules. The source-map audit and target branch are divergent; this was not a full implementation review of all intervening commits. No feature-completion inference is made from unchanged file hashes.

No runtime files, production configuration, migrations, providers, workflows or HTML were changed by this task. No model calls, runtime unit suites, browser checks or deployment were executed. External HTML references remain external and explicitly labeled; existing checked-in review/card-shell HTML remains linked. The original example snapshot intentionally retains older prose, with the active specification identifying every applicable copy/order override.

## Documentation verification

The local verification script checks all 183 source-task mappings and documented edits, all 193 unique open IDs, roadmap/group links, same-section navigation between template and instance, relative-file and explicit-anchor targets, balanced Markdown fences, and byte-for-byte preservation of the teaching example. Executed `python restructure/validate_docs.py` in the documentation workspace: 183 original task bodies verified (including the three explicitly corrected bodies); 193 unique open IDs; five Markdown files; 12 relative-file links and 71 anchor links checked; zero errors. This is a documentation check, not a runtime test. This receipt is not an implementation `through_sha`; the first actual implementation review must establish its own baseline and complete commit range.

## Publication-base delta review

The target branch advanced during this task from `1f4f6953850c0ed2011a4f2ffc0cd156119e7f33` to `11f9205a45964834cd4fc1671f4becf43b2c658a`. The intervening commit changes only `docs/features/explain-on-canvas/handoff/curriculum-scene-analysis.md` to record additional hand-authored AI teaching examples and their pending acceptance. It changes none of this task's output paths or inspected runtime source. That commit is preserved as the publication parent; it does not establish completion of the proposed scene-plan pipeline.

## Complete source-task migration map

Source line numbers refer to the imported version 11 document and allow every original obligation to be traced. New IDs are permanent after this commit; future tasks append IDs rather than renumbering these rows.

| Original line | Stable requirement ID | Preservation |
| --- | --- | --- |
| 289 | `INT-01-R01` | Preserved verbatim |
| 290 | `INT-01-R02` | Preserved verbatim |
| 291 | `INT-01-R03` | Preserved verbatim |
| 292 | `INT-01-R04` | Preserved verbatim |
| 293 | `INT-01-R05` | Preserved verbatim |
| 294 | `INT-01-R06` | Preserved verbatim |
| 298 | `INT-02-R01` | Preserved verbatim |
| 299 | `INT-02-R02` | Preserved verbatim |
| 300 | `INT-02-R03` | Preserved verbatim |
| 301 | `INT-02-R04` | Preserved verbatim |
| 302 | `INT-02-R05` | Preserved verbatim |
| 306 | `INT-03-R01` | Preserved verbatim |
| 307 | `INT-03-R02` | Preserved verbatim |
| 308 | `INT-03-R03` | Preserved verbatim |
| 309 | `INT-03-R04` | Preserved verbatim |
| 310 | `INT-03-R05` | Preserved verbatim |
| 314 | `INT-04-R01` | Preserved verbatim |
| 315 | `INT-04-R02` | Preserved verbatim |
| 316 | `INT-04-R03` | Preserved verbatim |
| 317 | `INT-04-R04` | Preserved verbatim |
| 318 | `INT-04-R05` | Preserved verbatim |
| 322 | `INT-05-R01` | Preserved verbatim |
| 323 | `INT-05-R02` | Preserved verbatim |
| 324 | `INT-05-R03` | Preserved verbatim |
| 325 | `INT-05-R04` | Preserved verbatim |
| 326 | `INT-05-R05` | Preserved verbatim |
| 330 | `INT-06-R01` | Preserved verbatim |
| 331 | `INT-06-R02` | Preserved verbatim |
| 332 | `INT-06-R03` | Preserved verbatim |
| 333 | `INT-06-R04` | Preserved verbatim |
| 334 | `INT-06-R05` | Preserved verbatim |
| 338 | `INT-07-R01` | Preserved verbatim |
| 339 | `INT-07-R02` | Preserved verbatim |
| 340 | `INT-07-R03` | Preserved verbatim |
| 341 | `INT-07-R04` | Preserved verbatim |
| 342 | `INT-07-R05` | Preserved verbatim |
| 346 | `INT-08-R01` | Preserved verbatim |
| 347 | `INT-08-R02` | Preserved verbatim |
| 348 | `INT-08-R03` | Preserved verbatim |
| 349 | `INT-08-R04` | Preserved verbatim |
| 350 | `INT-08-R05` | Preserved verbatim |
| 351 | `INT-08-R06` | Preserved verbatim |
| 352 | `INT-08-R07` | Preserved verbatim |
| 356 | `INT-09-R01` | Preserved verbatim |
| 357 | `INT-09-R02` | Preserved verbatim |
| 358 | `INT-09-R03` | Preserved verbatim |
| 359 | `INT-09-R04` | Preserved verbatim |
| 360 | `INT-09-R05` | Preserved verbatim |
| 565 | `INT-01-C01` | Preserved verbatim |
| 566 | `INT-01-C02` | Preserved verbatim |
| 567 | `INT-01-C03` | Preserved verbatim |
| 568 | `INT-01-C04` | Preserved verbatim |
| 569 | `INT-01-C05` | Preserved verbatim |
| 570 | `INT-01-C06` | Preserved verbatim |
| 571 | `INT-01-C07` | Preserved verbatim |
| 572 | `INT-01-C08` | Preserved verbatim |
| 573 | `INT-01-C09` | Preserved verbatim |
| 574 | `INT-01-C10` | Preserved verbatim |
| 575 | `INT-01-C11` | Preserved verbatim |
| 583 | `INT-07A-C01` | Preserved verbatim |
| 584 | `INT-07A-C02` | Preserved verbatim |
| 585 | `INT-07A-C03` | Preserved verbatim |
| 586 | `INT-07A-C04` | Preserved verbatim |
| 587 | `INT-07A-C05` | Preserved verbatim |
| 588 | `INT-07A-C06` | Preserved verbatim |
| 589 | `INT-07A-C07` | Preserved verbatim |
| 590 | `INT-07A-C08` | Preserved verbatim |
| 591 | `INT-07A-C09` | Preserved verbatim |
| 592 | `INT-07A-C10` | Preserved verbatim |
| 593 | `INT-07A-C11` | Preserved verbatim |
| 594 | `INT-07A-C12` | Preserved verbatim |
| 602 | `INT-02-C01` | Preserved verbatim |
| 603 | `INT-02-C02` | Preserved verbatim |
| 604 | `INT-02-C03` | Preserved verbatim |
| 605 | `INT-02-C04` | Preserved verbatim |
| 606 | `INT-02-C05` | Preserved verbatim |
| 607 | `INT-02-C06` | Preserved verbatim |
| 608 | `INT-02-C07` | Preserved verbatim |
| 609 | `INT-02-C08` | Preserved verbatim |
| 610 | `INT-02-C09` | Preserved verbatim |
| 611 | `INT-02-C10` | Preserved verbatim |
| 612 | `INT-02-C11` | Preserved verbatim |
| 613 | `INT-02-C12` | Preserved verbatim |
| 614 | `INT-02-C13` | Preserved verbatim |
| 615 | `INT-02-C14` | Preserved verbatim |
| 616 | `INT-02-C15` | Preserved verbatim |
| 622 | `INT-03-C01` | Preserved verbatim |
| 623 | `INT-03-C02` | Preserved verbatim |
| 624 | `INT-03-C03` | Preserved verbatim |
| 625 | `INT-03-C04` | Preserved verbatim |
| 626 | `INT-03-C05` | Preserved verbatim |
| 627 | `INT-03-C06` | Preserved verbatim |
| 628 | `INT-03-C07` | Preserved verbatim |
| 629 | `INT-03-C08` | Preserved verbatim |
| 630 | `INT-03-C09` | Preserved verbatim |
| 631 | `INT-03-C10` | Preserved verbatim |
| 632 | `INT-03-C11` | Preserved verbatim |
| 640 | `INT-04-C01` | Preserved verbatim |
| 641 | `INT-04-C02` | Preserved verbatim |
| 642 | `INT-04-C03` | Preserved verbatim |
| 643 | `INT-04-C04` | Preserved verbatim |
| 644 | `INT-04-C05` | Preserved verbatim |
| 645 | `INT-04-C06` | Preserved verbatim |
| 646 | `INT-04-C07` | Preserved verbatim |
| 647 | `INT-04-C08` | Preserved verbatim |
| 648 | `INT-04-C09` | Preserved verbatim |
| 649 | `INT-04-C10` | Preserved verbatim |
| 650 | `INT-04-C11` | Preserved verbatim |
| 651 | `INT-04-C12` | Preserved verbatim |
| 652 | `INT-04-C13` | Preserved verbatim |
| 660 | `INT-06-C01` | Preserved verbatim |
| 661 | `INT-06-C02` | Preserved verbatim |
| 662 | `INT-06-C03` | Preserved verbatim |
| 663 | `INT-06-C04` | Preserved verbatim |
| 664 | `INT-06-C05` | Preserved verbatim |
| 665 | `INT-06-C06` | Preserved verbatim |
| 666 | `INT-06-C07` | Preserved verbatim |
| 667 | `INT-06-C08` | Preserved verbatim |
| 668 | `INT-06-C09` | Preserved verbatim |
| 669 | `INT-06-C10` | Preserved verbatim |
| 670 | `INT-06-C11` | Preserved verbatim |
| 671 | `INT-06-C12` | Preserved verbatim |
| 672 | `INT-06-C13` | Preserved verbatim |
| 673 | `INT-06-C14` | Preserved verbatim |
| 674 | `INT-06-C15` | Preserved verbatim |
| 675 | `INT-06-C16` | Preserved verbatim |
| 683 | `INT-05-C01` | Preserved verbatim |
| 684 | `INT-05-C02` | Preserved verbatim |
| 685 | `INT-05-C03` | Preserved verbatim |
| 686 | `INT-05-C04` | Preserved verbatim |
| 687 | `INT-05-C05` | Preserved verbatim |
| 688 | `INT-05-C06` | Preserved verbatim |
| 689 | `INT-05-C07` | Preserved verbatim |
| 690 | `INT-05-C08` | Preserved verbatim |
| 691 | `INT-05-C09` | Preserved verbatim |
| 692 | `INT-05-C10` | Preserved verbatim |
| 693 | `INT-05-C11` | Preserved verbatim |
| 694 | `INT-05-C12` | Preserved verbatim |
| 702 | `INT-07B-C01` | Preserved with correction noted below |
| 703 | `INT-07B-C02` | Preserved verbatim |
| 704 | `INT-07B-C03` | Preserved verbatim |
| 705 | `INT-07B-C04` | Preserved verbatim |
| 706 | `INT-07B-C05` | Preserved verbatim |
| 707 | `INT-07B-C06` | Preserved verbatim |
| 708 | `INT-07B-C07` | Preserved verbatim |
| 709 | `INT-07B-C08` | Preserved verbatim |
| 710 | `INT-07B-C09` | Preserved verbatim |
| 711 | `INT-07B-C10` | Preserved verbatim |
| 719 | `INT-08-C01` | Preserved verbatim |
| 720 | `INT-08-C02` | Preserved with correction noted below |
| 721 | `INT-08-C03` | Preserved verbatim |
| 722 | `INT-08-C04` | Preserved verbatim |
| 723 | `INT-08-C05` | Preserved verbatim |
| 724 | `INT-08-C06` | Preserved verbatim |
| 725 | `INT-08-C07` | Preserved verbatim |
| 726 | `INT-08-C08` | Preserved verbatim |
| 727 | `INT-08-C09` | Preserved verbatim |
| 728 | `INT-08-C10` | Preserved verbatim |
| 729 | `INT-08-C11` | Preserved verbatim |
| 730 | `INT-08-C12` | Preserved verbatim |
| 731 | `INT-08-C13` | Preserved verbatim |
| 732 | `INT-08-C14` | Preserved verbatim |
| 733 | `INT-08-C15` | Preserved verbatim |
| 734 | `INT-08-C16` | Preserved verbatim |
| 735 | `INT-08-C17` | Preserved verbatim |
| 736 | `INT-08-C18` | Preserved verbatim |
| 737 | `INT-08-C19` | Preserved verbatim |
| 738 | `INT-08-C20` | Preserved verbatim |
| 739 | `INT-08-C21` | Preserved verbatim |
| 740 | `INT-08-C22` | Preserved verbatim |
| 741 | `INT-08-C23` | Preserved verbatim |
| 742 | `INT-08-C24` | Preserved verbatim |
| 758 | `INT-09-C01` | Preserved verbatim |
| 759 | `INT-09-C02` | Preserved verbatim |
| 760 | `INT-09-C03` | Preserved verbatim |
| 761 | `INT-09-C04` | Preserved verbatim |
| 762 | `INT-09-C05` | Preserved verbatim |
| 763 | `INT-09-C06` | Preserved verbatim |
| 764 | `INT-09-C07` | Preserved with correction noted below |
| 765 | `INT-09-C08` | Preserved verbatim |
| 766 | `INT-09-C09` | Preserved verbatim |
| 767 | `INT-09-C10` | Preserved verbatim |
| 768 | `INT-09-C11` | Preserved verbatim |
