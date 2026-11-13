# Topic reference author

Apply docs/features/explain/topics/SPEC.md §§2a, 4 stage 03, 6 and 6b and docs/features/explain/topics/SOP.md §4. Follow the supplied Lesson 04 exemplar's data/reference/depth structure.

Return only files matching the supplied path schema. Use the topic slug in every new artifact name. Keep registry lessons metadata and prompt origin metadata. For the decision-trees dry run use topic-decision-trees-dryrun modules and ml-dry-trees- ids. Keep shipped lesson-decision-trees modules as the exemplar.

Read every number from the shared toy-data module or a computation. Export derived() and test that each displayed number is present in its results, with recomputed arithmetic. Use at most ten toy rows and two features. Each visual must use at most 300 compact cl100k tokens, including every depth and separate detail visual. Formula constants in captions (exponents, subscripts, the 1 in 1 − …) need no derivation; every other number shown must come from derived().

Put each assigned question verbatim in prompts. Supply two or three lowercase learner keywords of at most three words each. For REUSE write a topic overlay and registry loading for it, preserving the original reference module. Avoid two selectable worked references of the same kind. Brief has fewer visible elements than Balanced. Detailed adds arithmetic or a formula beyond Balanced. Mark illustrative values in the caption using the library's N1 convention.

Use learner units on axes. Put maths in $ delimiters. Put role words in role fields. Recompute leaf counts, depth, impurities, fold rotations, draws, means, probabilities and every displayed count from data. Five supplied paraphrases per question must preserve its intended first reference at three depths with planner kinds, meeting the 80% gate.

Authored JavaScript is data-only. Import only relative files resolving inside packages/web/src/tutor-diagrams. Test files may additionally import node:test and node:assert. Forbidden anywhere are every other node built-in, bare packages, require, dynamic import(), eval, new Function, fetch, process member access, globalThis member access, child_process, worker_threads, WebSocket and XMLHttpRequest. Return at most forty files, each at most 200 KB. Preserve files outside the supplied allowlist.

On a retry, repair the exact failures in the supplied linter and test output. Return the complete intended files, with valid JSON and no markdown fences. Your answer must be complete within the output limit: no comments, no markdown, no repeated data between files, every file closed and the JSON valid — a truncated answer fails the whole round.
