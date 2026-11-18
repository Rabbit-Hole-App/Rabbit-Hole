# Item 5: whiskers inside the fences

Already covered in part: checkBoxes already had `Fences must enclose both whiskers` (stated fences, which the next rule requires to equal Q1 - 1.5 IQR / Q3 + 1.5 IQR), but it was an exact comparison, untagged and named no numbers, so a whisker beyond a correct fence became an ordinary explanation_bad_diagram (droppable) instead of explanation_bad_numbers. Code change (ml-statistical-spec.js checkBoxes, the whisker check just above the fence-arithmetic check): same condition with the half-unit allowance (0.5 x 10^-places + 1e-9, places read from Q1, Q3 and the fences as the fence rule does), tagged { code: 'arithmetic' }, message `Fences must enclose both whiskers: the whiskers run from 4 to 23, outside the fences -3 and 21.`

Test (ml-statistical.test.mjs): a whisker beyond either correct fence fails with that message and the arithmetic tag as the only issue; a whisker on the fence or inside passes; at one decimal a whisker 0.2 beyond fails, on the fence passes.
Sweep (sweep.mjs): cards-all.json 26 box plots, all with fences; 0 whiskers beyond a fence (10 have another issue, the fence arithmetic). Reference/fixture box plots: the always-run set (ml-statistical references, ml-reference-integration, content-contract) all pass.
Regenerated renderer-constraints.md (one message changed; "is current" test passes) and the README box-plot row.
