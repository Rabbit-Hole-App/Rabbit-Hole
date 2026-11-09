# Review of batch 01 (Claude, 2026-11-09)

Read from the repo: every `card.md`, the spec and every `card.png` (the 10 cards as the learner sees them at 440 px). The cards were generated once on the clean-up build (76d4486c6), Balanced, and not touched. Nothing here was fixed before this review.

Columns: **kind** = the planned and drawn kind against the expected shape; **complete** = the content the expected shape names is on the visual; **labels** = placeholders, duplicates, maths outside `$...$`; **numbers** = values on the visual against the prose; **points** = a sentence before or after the visual tells the reader what to look for; **voice** = Balanced (concrete case, mechanism, proper terms explained in half a sentence).

| # | Card | Kind | Complete | Labels | Numbers | Points at visual | Balanced voice | Verdict |
|---|---|---|---|---|---|---|---|---|
| 01 | public-key encryption | yes (sequence) | **no**: the decrypt-with-private-key step is missing | ok | n/a | no | ok | fix |
| 02 | hash table | yes (flow) | yes (hash, slot, collision branch); the collision branch ends at "Handle collision" with no result | ok | n/a | no | ok | ship |
| 03 | positional encoding | **no** (transformation; expected a plot of sinusoids) | **no**: no sinusoid is drawn | **6 bare maths** (`P_0`, `P_1`, `P_2`) and an auto "Item mappings Before 1 / After 1" block that repeats the lists | n/a | no | ok | wrong |
| 04 | k-means | acceptable (cycle; expected a scatter) | partial: four steps, no points or centroids; "Repeat until assignments stabilize" is a step node plus the loop arrow | ok | n/a | no | ok | fix |
| 05 | supply and demand | yes (coordinate-plot) | partial: the equilibrium point is a marker with no annotation | ok | **correct** (crosses at 4 units and 6 USD, as the prose says) | partly (caption) | ok | ship, annotate the point |
| 06 | Big-O | yes (coordinate-plot) | **no**: O(1) and O(log n) missing; a table repeats the plot | ok (`$O(n)$`) | O(n^2) at 5 is 25, correct, but only 3 sample points: a polyline, not a curve | no | ok | fix |
| 07 | bill becomes law | yes (flow, decisions) | partial: the veto-override branch the prose names is not drawn; one "floor vote" decision for two chambers | ok | n/a | no | ok | fix |
| 08 | call stack | **no** (tree; expected layers or block-stack) | **no**: a chain of three boxes, no push or pop, the base case unmarked | ok | n/a | no | ok | wrong |
| 09 | database index | acceptable (tree) | **no**: it is a binary search tree labelled "B-Tree" (one key per node, two children); the scan-versus-index contrast is absent | ok | the prose's "thousands to just a few steps" is not on the visual | no | ok | fix |
| 10 | confusion matrix | yes (matrix) | partial: the four cells and axes are right; precision and recall are not derived | ok | n/a | no | ok | fix |

Totals: kind right or acceptable 8 of 10 (wrong: 03, 08); complete 2 of 10 (02, 05 nearly); ship 2 (02, 05); fix 6; wrong 2. No picture on any card (0 of 10, as expected for diagram-only subjects).

## Defects and the layer that fixes each

| Defect | Cards | Layer |
|---|---|---|
| The prose never tells the reader what to look for in the visual | all ten | author prompt: already queued in the prose pass (one line under `# Card layout`) |
| The card title is clipped with an ellipsis ("Positional Encoding in Transform...") | 03, 05, 07 | UI: in progress (title wraps up to two lines) |
| The decisive step of the concept is not drawn (decrypt with private key, push and pop and the base case, the veto override, precision and recall) | 01, 07, 08, 10 | author prompt: one line, "draw the step that makes the mechanism work" |
| A sequence cannot show an actor's own step, so the server's `simplified_sequence` silently deleted the receiver's decrypt step | 01 | renderer or schema (a note on an actor); until then the author prompt line above; the correction should not drop a step without saying so |
| Kind chosen where the expected shape carries data: periodic functions (positional encoding), clusters (k-means), a stack (call stack) | 03, 04, 08 | planner criteria: "a periodic or wave function or a quantity over position is a coordinate-plot; a set of points and centroids is a scatter coordinate-plot; a stack of frames is layers" |
| Follow-up questions start with a comma (",What happens if...") | 07, three of three | server correction: strip leading punctuation and spaces from question text |
| Maths outside `$...$` in labels | 03 (six) | author prompt (existing rule) and the bare-maths smell; counted already, not a new rule |
| A curve drawn with three points | 06 | server: the formula sampler (`EXPLANATION_FORMULA_SAMPLER`, off) or the author rule "7-12 points" the author ignored |
| Three "No" edges end on one node with overlapping lines | 07 | renderer: edge routing; not in this pass |
| A B-tree drawn as a binary tree | 09 | author prompt or reference (a B-tree reference): batch 2 |
| The equilibrium point is not annotated | 05 | author prompt: the plot contract clause in the prose pass (annotated point) |

## Recurring across the ten

1. **No card points at its visual (10 of 10).** The single cheapest gain, already queued.
2. **The decisive step is missing on four cards (01, 07, 08, 10).** The visual shows the frame of the mechanism and not the step that makes it work.
3. **Three of the ten kinds follow the wording and not the data** (03, 04, 08): the question is about a function, a point set and a stack.
4. **Three titles are clipped (03, 05, 07).**
5. **One repair silently lost content (01):** the server simplified a sequence by dropping a step and logged only `simplified_sequence`.
6. **Gemini wrote a leading comma into every follow-up question on one card (07).** A server strip fixes it.

## One change per layer, for the fix pass

- planner criteria: the three kind sentences above (planner bench offline first; 03, 04, 08 must flip to plot, scatter plot and layers with no other flip);
- author prompt: one line, "draw the step that makes the mechanism work" (the prose-pass lines stay their own commits);
- server correction: strip leading punctuation and white space from question text, test from card 07's own questions;
- renderer: none in this pass (sequence self-step and edge routing are batch-2 candidates);
- reference or keyword: none in this pass (B-tree, call stack and fit-quality references are batch-2 candidates).
