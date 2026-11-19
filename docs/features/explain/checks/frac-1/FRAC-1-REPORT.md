# FRAC-1: inline fractions in card prose (feat/frac-1 313b7034a, one commit on main a88949c27; 2026-11-19)

The lead wrote this from the lane agent's text. Web only; no validator, planner or request-side change (hashes unchanged); no new dependency.

DECISION: a top-level inline fraction renders in a/b form, not on a display line. A display line would split the sentence mid-clause, and the card tokenizer builds display blocks at tokenize time (shared with the validators and hashes). The real cards read fine in a/b: softmax `e^{z_i}/(\sum_j e^{z_j})`, silhouette `(b - a)/(\max(a, b))`, top-k `42/70 = 0.6`.

RULES (new packages/web/src/inline-fractions.js, `slashFractions`): only inline math, only a `\frac`, `\dfrac` or `\tfrac` at brace depth 0; a single-symbol argument (a number, a letter, a `\command`, or one with ^/_ groups such as `e^{s_i}` or `p_i`) gets no brackets, any compound argument is bracketed; nested fractions convert recursively (`\frac{\frac{a}{b}}{c}` becomes `(a/b)/c`). Left as KaTeX draws them: display math ($$ and \[ \]), a fraction inside braces (`\sqrt{..}`, `\text{..}`, exponent groups), a fraction right after ^ or _. Left untouched: unfinished or unbalanced input (streaming) and `\fracture`.

FILES: Md.jsx (2 lines: the transform applies only where Md renders an inline math token, before KaTeX), inline-fractions.js and inline-fractions.test.mjs (new, 7 tests), md-render.test.mjs (1 new test), math-typeset.test.mjs (one assertion changed: it expected the stacked `mfrac` for the inline softmax in a challenge prompt and now expects the a/b annotation). NOT touched: MathText.jsx and every display or canvas equation path (a user-authored canvas equation and the `mathOnly` learner answer are unchanged).

EVIDENCE (real Md in explain mode, headless Chrome, 408 px text column, 14 px Arial approximating the card font, 2x): before.png shows the bug (tiny numerator, squeezed denominator, pushed line); after.png shows softmax, silhouette and 42/70 at body size on even lines, and the control card unchanged (`\sqrt{\frac{a}{b}}` and the `$$` display softmax stay stacked). Sentences are real cards from the R2 bench results (idx 23, 43, 7, 124). Render script shot.mjs.

TESTS: touched module and renderer files 36 pass, 0 fail; full web unit run `node --test "src/**/*.test.mjs"`: 7420 tests, 7392 pass, 0 fail, 27 skipped, 1 todo.

NOT CHECKED: no Vite production build or browser run against the real Inter font and card CSS (Arial approximation); a long inline fraction is wider in a/b form (the sum of the two arguments, not the max) and KaTeX inline math does not wrap, so a very long one can overflow the 408 px column (none of the sampled cards did; the temperature formula, idx 46, was not rendered). Ships as its own small release or with LBL-1 (the Reviewer's order).

POLISH (Reviewer, optional): feat/frac-1 tip 9fe11e26fe06a4fed5919eb02f64fab7d1fa3413 (on 313b7034a): a single \command(...) argument (one function call, no brackets inside) counts as one symbol and gets no extra brackets: the silhouette sentence now prints (b - a)/\max(a, b); compound arguments keep their brackets ((\max(a,b) + 1)/2). Touched tests 36 pass; full web unit run 7420 tests, 7392 pass, 0 fail, 27 skipped. after.png re-rendered.
