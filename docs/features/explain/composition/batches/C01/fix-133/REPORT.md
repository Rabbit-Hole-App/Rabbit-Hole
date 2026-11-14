# C01 — release133 correctness fix

Four point-carrying, supported single-diagram variants are registered through the existing library convention and share each parent's keywords, prompts and lessons. Their specs reuse the original computed children: linear unit block stack (51 tokens), ReLU features (40), stacked objective parts (50), and masked/rescaled training output (120). [Single receipts](../single-token-budgets.json). All prior panel/single token receipts remain unchanged.

The parent count is exactly **37**, with **37 linked singles**; strict set equality and inheritance assertions are preserved. An actual `prepareArtifactAuthorRequest` regression failed for all four ids before this change and now passes all four. No unsupported panels spec reaches those author requests.

[Full affected suites](full-tests.txt): **1,307 passed, 0 failed, 0 skipped**, covering every tutor-diagram test and all reference-author suites. [Replay](selector-replay.json): **2,865 prior cases, 0 moved**, **12/12** new source checks selecting the linked author variants. No provider calls.

[Snapshot refresh](snapshot-refresh.json): exactly **3 changed entries**, all `ml-regularization-regularized-objective/{320,408,720}`; **0 added, 0 removed**, all other entries byte-identical. Generated using release133's renderer on base **a8ef11d64**. Authored parent specs/data are unchanged; no renderer, schema or tool changes. Historical unrelated dependency/fixture failures stay documented on C02.

Review corrections: the dropout single visibly supplies computed activations, mask and keep probability, the training rescale formula and inference context. The author-only objective single omits the unsupported optional `total`; the unchanged parts still determine the same whole. Both corrections have RED→GREEN regression evidence. [Actual prepared author-schema validation](actual-author-schemas.json): **72/72** source-prompt/depth cases pass.
