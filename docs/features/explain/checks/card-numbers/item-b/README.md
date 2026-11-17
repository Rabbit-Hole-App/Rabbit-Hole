# Item B: arithmetic issues never drop; second repair on the same model; honest failure; archive

Before: a box-plot with wrong fences, still invalid after the one repair, went down the drop/simplify path (dropInvalidDiagrams) and the prose was delivered without the diagram (or the step failed as explanation_missing_visual). A failed chain step recorded only { provider, model, outcome: 'validation_error' }.
After:
- learn-primitives.js: diagramProblem names an arithmetic-tagged issue (zod issue params.code 'arithmetic', from the spec.js issue callback) 'explanation_bad_numbers: ...' with that issue first; numbersIssue(block) finds it and the diagram kind.
- learn-artifact.js: at the drop gate (attempt >= limit) numbersIssue throws explanation_bad_numbers before dropInvalidDiagrams; the repair message gets 'Rewrite every sentence that states these numbers.' for that code only; ARITHMETIC_REPAIRS_SAME_MODEL = 2: when the NEXT provider cannot write the kind (explanation-fast-chain.js canWriteKind, the same predicate forGemini filters with; no next provider counts as cannot) the current model gets one more repair; results carry repairs / repairedAt.
- explanation-fast-chain.js: passes nextCanWrite per step; attempts[] carry outcome 'arithmetic' | 'validation_error', repairs, issues:[first issue], and on success repairs + repairedAt.
- learn-slash.js: validation_error with explanation_bad_numbers -> notice "Couldn't make a reliable card. Try again." (line kept, no detail).
Archive: AR-1 already archives a failed typed card (learn-artifact.js artifactFetch archive(out.result, { steps: out.attempts, error })); only the per-step issue text was missing and now rides in steps[].issues.
Tests: control-plane explanation-fast-chain (21), explanation-visual-fallback (4), web learn-slash (39); see the commit message.
