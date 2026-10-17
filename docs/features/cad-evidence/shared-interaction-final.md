# Shared CAD interaction follow-up

Deployed implementation **08becb70f90b1596999a0a4173043186e44ccdca**: **6 passed / 0 failed / 0 skipped / 0 interrupted**. [Exact result and gesture hashes](shared-interaction-final.json).

- Anonymous access requires sign-in. A distinct signed-in nonowner sees both stored CAD models without edit, accept, cancel or new-export controls.
- For STEP, GLB and thumbnail: anonymous direct and share-scoped reads return401; nonowner direct reads return404; authorized nonowner share-scoped reads return200 with nonempty artifacts.
- Shared nonowner and owner rotation, pan and zoom each change the settled rendered model pixels while retaining the canvas card's screen position and size. Six before/after image hashes and framing snapshots are recorded.
- Shared Expand opens the existing read-only model panel. Escape exits interaction; no saved card/geometry changes or CAD mutation requests occur. All browser non-read requests are blocked; no model/executor call was made.
- Screenshots of shared interaction, expanded panel and owner interaction were inspected. Shared/owner models render visibly with no unintended canvas menu. The expanded-panel screenshot captures its initial loading frame; the check proves panel accessibility and canvas creation, not completed expanded rendering.

The fix separates read-only CAD activation from editable selection, then stops native wheel and context-menu propagation while the CAD viewer is interacting. It preserves ordinary canvas interaction outside the active viewer and existing mutation permission restrictions.

Historical results are retained separately:

| Deployed SHA | Passed | Failed | Skipped | Interrupted | Finding |
| --- | ---: | ---: | ---: | ---: | --- |
|049f284549596f10f7aa904710340edc030ea827|2|1|0|3|Shared selection never mounted Interact; nonowner/access controls passed.|
|091abcebac139ae825cfc676a87893b6c6333fb2|2|1|0|3|Activation, rotation and pan worked, but wheel also moved the canvas; right-button pan opened the canvas menu.|
|08becb70f90b1596999a0a4173043186e44ccdca|6|0|0|0|All focused assertions passed after native event isolation.|

Earlier exploratory share probes had separate harness corrections for login redirection and canvas-surface hit testing; they are preserved locally and are not substituted for the baseline above. Evidence directories are cad-shared-interaction-baseline, cad-shared-interaction-fixed and cad-shared-interaction-native-fixed in the acceptance worktree. This follow-up uses existing generated models and does not rerun or extend model-quality verification.
