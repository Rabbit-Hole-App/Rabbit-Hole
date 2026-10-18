# Equations on the canvas

Owner request, r29 (2026-10-08): an Equation tool beside Text, so a learner can build an equation visually without knowing LaTeX, type or paste LaTeX if they do, and ask about it in chat.

## What the learner does

1. **Equation (Σ)** sits in the left toolbar, right after Text.
2. A click on the canvas places an equation there, already being edited: a field with the caret in it, and a compact palette above it. The palette keeps its size at any zoom. It opens under the equation when there is no room above it on the canvas.
3. The palette has six tabs:

   | Tab | Inserts |
   |---|---|
   | Fraction | fraction, power, subscript, subscript with power |
   | Root | square root, nth root |
   | Greek | 20 letters, lower and upper case |
   | Sum | sum and product with limits, integrals (definite, indefinite, double, contour), limit |
   | Matrix | 2×2 and 3×3 matrices, a 2×2 in square brackets, a determinant, parentheses, brackets, braces, absolute value |
   | LaTeX | the equation's source as plain text, to type or edit |

   A button wraps what is selected, or the term just before the caret: `x` then Power gives `x^□`. Tab moves between the empty slots.
4. The equation renders as it is built. A typed `a/b` becomes a fraction, and pasted LaTeX (`\frac{a}{b}`) becomes the equation it describes.
5. A click anywhere off the equation and its palette finishes editing, and so does Esc. The palette is gone whenever no equation is being edited. A double-click reopens the equation with its source.
6. Selected, an equation moves by dragging, scales its type from the corner handle, and is removed with Delete. Copy, paste, Duplicate (Ctrl+D or the menu), undo and redo work as they do for a text box. An equation left empty is removed when editing finishes.
7. **Size ladder** (owner, r35: "For the equation do you think we need like the shapes has above them: H1, H2, H3, Text?"). A selected equation shows an **S M L XL** ladder where a text box shows its H1-to-Text one: the same pill, above its left edge. These are sizes, not headings, because an equation has no heading level.
   - S, M and L are the text ladder's H3, H2 and H1 sizes (19, 24, 32 px), so an equation sits level with text of that rank. M is the default (today's 24). XL is twice M (48).
   - A level sets the equation's `size`, so it saves, reloads, copies and duplicates with it. Undo and redo cover it.
   - The corner handle still scales the type freely. A size it leaves between levels is custom, and the ladder then presses no level, so it never claims a size the equation is not at. A handle that lands exactly on a level's size shows that level. One click snaps a custom size to a level.
   - The ladder never shows while the LaTeX is edited; the palette is there then.
8. **Ask in chat.**
   - Selecting an equation puts its pill above the composer, showing the LaTeX (canvas-card-selection.md). A question sent while it is selected carries the LaTeX as its context.
   - Right-click → **Ask in chat** arms the same pill and writes "Can you explain this equation?" into the composer. It never sends.
   - The answer lands where any question does: the conversation panel on a canvas with one, never a linked canvas card.
   - Right-click → **Copy LaTeX** puts the source on the system clipboard.

## Keyboard

While an equation is being edited, every key belongs to it, and the canvas and the page stand down: Delete and Backspace, Ctrl+A, Ctrl+C/V/X, Ctrl+D, Ctrl+G, Ctrl+Z/Y, zoom, C (comment), `/` (search) and `?` (shortcuts).

The guard is one function, `typingIn` (canvas-equation.js). It covers a text box, an input, and MathLive's `<math-field>`, which keeps its own input in a shadow root, so the page sees the field itself as `document.activeElement`. AdaptiveCanvas's key, paste and focus-return handlers and LearnPage's `/` and `?` all read it.

## Stored

An equation is a canvas item, saved with the board like a text box:

```js
{ id, kind: 'equation', x, y, latex, size }
```

- `latex` is the editable source. It is what is saved (localStorage, then `learn_boards.state_json`), copied, duplicated, forked and asked about.
- The picture is rendered from `latex` by KaTeX (MathText.jsx) every time; it is never stored.
- `size` is the type size in px (default 24). The size ladder's levels are sizes (S 19, M 24, L 32, XL 48), so a level needs no field of its own.
- No schema change, no new route.

MathLive's own macros are expanded before saving (a typed `dx` is `\mathrm{d}x`, not `\differentialD x`), and empty slots are dropped, so the stored source is LaTeX that KaTeX and the model read.

On a shared canvas, the server words a selected equation, and the board text, from its `latex` (control-plane `learn-shared-ask.js`, kind `Equation`).

## Libraries and bundle

- **MathLive** (MIT, `mathlive` in packages/web) is the editor. It is imported only by `EquationEditor.jsx`, which AdaptiveCanvas loads lazily the first time an equation is edited.
- Measured against integration/r28 (`vite build`, 2026-10-08):
  - the app entry grows by 218 B (51 B gzipped);
  - the canvas chunk grows by 5.5 kB (1.8 kB gzipped), for the item, the tool and the guards;
  - the new `EquationEditor` chunk is 803 kB (219 kB gzipped). It is fetched only on the first edit, and no other chunk contains MathLive.
- MathLive draws with KaTeX's fonts, which KaTeX's stylesheet (MathText.jsx, already in the main bundle) declares, so `fontsDirectory = null` and nothing more is fetched.
- Sounds, the virtual keyboard and MathLive's menu are off; the palette is the one way to build.
- **KaTeX**, already a dependency, renders the equation when it is not being edited.

## Not built

- Equations inside an Explain Back sketch. With the sketch as the draw target, the Equation tool places nothing.
- Colour and opacity for equations. They draw in the default ink, dark-mode aware.
- An equation in a group's snapshot image. The group's Ask carries its LaTeX as text.
- A linked answer card for Ask in chat on an equation. The answer lands in the conversation, as for a selected card.
- `ponytail:` on a touch device MathLive's virtual keyboard is off as well. Turn on `mathVirtualKeyboardPolicy: 'auto'` if phones need to edit equations.

## Tests

- Web unit: `packages/web/src/canvas-equation.test.mjs`. It covers the item, the palette rendering in KaTeX, the source through save and duplicate, undo, Ask in chat and the shortcut guard.
- Control plane: `packages/control-plane/test/shared-canvas-ask.test.js` (a selected equation on a shared board).
- Browser: `packages/web/e2e/equation-check.mjs`, on the local stack only. It checks:
  - the tool, the palette, a fraction, a subscript and a 2×2 matrix, and pasted LaTeX;
  - click-out rendering and double-click reopening;
  - move, resize, delete and duplicate, with undo and redo;
  - keys inside the equation never reaching the canvas;
  - the pill, Ask's prefill, and Send carrying the LaTeX;
  - save and reload, including a fresh profile from the server copy;
  - no model call.


## Plain-language generation integration checkpoint

Toolbar Generate and Ctrl+K use the existing authenticated, signed `/api/learn/inline/decide` and `/api/learn/inline/generate` path. Generated output is bounded LaTeX, optional label and assumptions; safe KaTeX validation establishes renderer compatibility, not mathematical correctness. The toolbar retains all manual palette tabs. New equation placement stays local until accepted/manual completion; generated replacements preserve identity, position, style and connections and refuse changed originals. Accepted results use the existing canvas edit transaction and Undo/persistence path. Manual preview LaTeX changes are local.

Implementation checkpoint only: 56 focused tests pass and changed JSX compiles. Actual app/browser coverage, deployment and real-model quality checks are pending; component fixtures are not those checks. No provider calls were made in this integration. Real-model verification requires its separately approved budget.


### Dev preview evidence: `cc9fed07`

Deployed to https://rabbit-hole-web-dev-ctrlk-tools.tryrabbithole.workers.dev (version `5c659c0d-9f1e-4d94-8b06-230c517912d5`). Build 11.74s, upload 10.59s, triggers 0.82s. The focused actual-app fixture check passes **7 / 7**, with **0 failed, 0 skipped, 0 interrupted**, in 15.873s. Six fixture generations, zero actual provider requests and zero browser exceptions. Screenshots and receipts: `e2e/shots/equation-inline-run3/` (`toolbar-prompt.png`, `toolbar-preview.png`, `native-equations.png`, `results.json`).

Verified toolbar opening/typing makes no request or saved insertion; preview plus local LaTeX editing, native Insert, one Undo/Redo and reload; Ctrl+K Edit preserves exact identity/position/style; Explain leaves its equation unchanged; selected text remains intact when a separate equation is created; empty-selection creation, invalid LaTeX refusal, clarification and closing without insertion. This is deterministic generation coverage, not mathematical or real-model verification.

Earlier attempts are preserved: run1 **3 passed / 1 failed / 0 skipped / 3 interrupted** due to a fixture missing the existing `fresh:false` restore normalization; run2 **5 passed / 1 failed / 0 skipped / 1 interrupted** because a fixed background click hit the toolbar after camera movement. The final harness uses a measured unobstructed canvas point and retains exact source/identity assertions; application code was unchanged between runs.

Remaining verification: the full existing manual equation palette/history regression, integrated stale/late-response/read-only/spend-limit scenarios and zoom/long-equation behavior. Pure replacement guards and isolated component cancellation/read-only checks pass at their original helper SHAs; they are not substitutes for these app checks. Real-model mathematical quality awaits an explicitly approved budget.


### Existing manual regression: same cc9fed07 bundle

Local frontend 5174 reused the unchanged keyless stack on 9091/9093. Run1 stopped before assertions because the legacy harness did not strip quotes around its named test secret. Run2 passed all **14 functional checks**, with **0 failed / 0 skipped / 1 interrupted**: the final provider-ledger assertion tried the frontend origin, which returned HTML. Separate immediate reads of both actual stack ledgers returned **0 provider hits**. This supplemental evidence does not turn the interrupted harness assertion into a pass. Screenshots remain under `e2e/shots/equation-manual-run2/`.

The passing checks cover Fraction, subscript, Matrix, pasted LaTeX, click-out/reopen, shortcut isolation, move/resize/delete Undo/Redo, duplicate, size ladder, Chat context, server reload and a fresh browser profile. The harness now supports the explicit local-only `TRIPWIRE_APP` origin and authentication preflight; its two placement assertions intentionally require an unsaved visible draft until completion. Remaining checks are integrated stale/late/read-only/spend-limit behavior, zoom/long formulas and approved real-model quality verification.
