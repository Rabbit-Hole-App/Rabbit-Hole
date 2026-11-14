# SOP — Turning a curriculum lesson into worked `/explain` references

Version 1 · 2026-11-09 · written from the Lesson 04 (Decision Trees) run. Owner: Rabbit Hole. Roles: **Owner** (decides, relays, records), **Reviewer** (this advisor: specs, audits, ledger), **Codex** (authors references in `chatgpt/explain-phase02-library`), **Claude Code** (pipeline code, integration, bench, release). One recipient per message; every task carries the branch/SHA it starts from.

Repo home: `docs/features/explain/lessons/SOP.md`.

---

## 0. Why this works (the mechanism the SOP relies on)
- The author model **copies a selected worked reference nearly verbatim** (fc-01/fc-02, batch-02: byte-identical specs). Therefore **reference quality = card quality**, defects included.
- A reference is used only if the **selector reaches it**: exact prompt match (+50) or whole-phrase keyword match. Long paraphrase keywords never fire; short learner phrases do.
- Since release 118 the **reference's kind overrides the planner's kind** when the selector hits (exact prompt or score ≥ 12), so the author sees one consistent instruction.
- References fix **structure**, not facts (factual rate unchanged by references). Facts come from the toy data being exact and from the prose following the visual.

Everything below exists to make those four facts hold for a new lesson.

---

## 1. Per-lesson loop (end to end)

| Phase | Who | Output | Gate to next phase |
|---|---|---|---|
| **P1 Prompts** | Reviewer (Owner approves) | 12 learner prompts, verbatim, in lesson order, each with intended kind + one-line content | Owner says "these are the demo prompts" |
| **P2 Coverage check** | Codex | Table: prompt → first hit with the planner's `requiredKinds` at 3 depths; worked vs `shape-*`; collisions (two same-kind refs) | Reviewer reads the table; marks REUSE / NEW per prompt |
| **P3 Author** | Codex | Shared toy dataset; new references (Balanced first, then Brief/Detailed); prompts verbatim in `prompts`; short keywords; previews; snapshots; token budgets; replay cases; walkthrough doc | Codex's own checks green (replay clean, ≤ 300 tokens, arithmetic tests) |
| **P4 Verify** | Reviewer | Render every changed preview; recompute every stated number and count; check file scope; verdict per figure (ship / fix) | Fix list back to Codex (one commit) or "accepted" |
| **P5 Integrate** | Claude Code | Pull/cherry-pick the data commits into the release candidate; suites; property count ≤ 362; selector replay with `requiredKinds` | Tier-1 smoke green (data-only change) |
| **P6 Pack** | Claude Code | Live run of the 12 bare prompts (no lesson attached), Balanced, one pass; review pack with `reference-408.svg` beside each card; steer column; factual judge | Pack pushed |
| **P7 Audit** | Reviewer | Verdict per card: ship / regenerate / hold; defect → layer (reference / selector / server / author) | Owner gets the record list |
| **P8 Record / release** | Owner | Demo recorded on preview; release per gate tier | — |
| **P9 Learn** | Reviewer | Ledger: what failed, which layer, what rule changes; SOP bump if a rule changed | — |

Typical durations observed: P1 20 min · P2 15 min · P3 2–3 h for 12 refs × 3 depths (Codex ≈ 10 verified refs/h at Balanced) · P4 30–45 min · P5 30 min (suites) · P6 15 min · P7 30 min. **A lesson is half a day when nothing else is in flight.**

---

## 2. P1 — Writing the 12 prompts
- Read the lesson page at the audited revision (`e7db050e…`). Use **its** examples and numbers (6 cats/4 dogs; study hours; (2,2)/(5,5) clusters).
- One prompt per teaching point, in lesson order; learner wording ("how does…", "why does…", "what does … look like"); no jargon the lesson has not introduced.
- Each prompt names what should be **visible**: a quantity that varies, a structure, a comparison. If the natural figure is a wall of text, drop the prompt.
- Target mix for a visually strong demo: ≥ 6 coordinate-plots (curves, steps, boundaries), 1–2 matrices with exact arithmetic, 1 tree/flow/block-stack, 1 grouped bar-chart, 1 sample-set or heatmap if the lesson has one.
- Avoid pictures: no physical objects; keep prompts abstract so the planner routes to diagram.
- Write the intended kind and a one-line content spec per prompt. This table is the spec Codex builds to.

## 3. P2 — Coverage check (Codex, before authoring)
- Run each prompt through `selectDiagramReferences` **with `requiredKinds` as the live path passes them** (the plain replay lies — demo pack 1, 11:32). All three depths.
- Report: first topical hit; worked or shape-only; kind; collisions (two worked refs of the same kind would be sent).
- Reviewer marks each prompt **REUSE** (attach prompt verbatim + short keywords to the existing reference; no duplicate) or **NEW**.
- Collision rule: if a lesson reference and an older reference share a kind for one prompt, the lesson reference gets the exact prompt (it wins the +50) and the older one keeps only its own prompts.

## 4. P3 — Authoring rules (Codex)
- **Shared toy dataset**: ≤ 10 rows, ≤ 2 features, chosen so every split/impurity/probability/gradient/metric in the walkthrough is exact by hand; stated once at the top of the walkthrough; every figure reads from it. A second tiny set is allowed only when the lesson's example needs it (e.g. 2-D boundary clusters, three softmax scores).
- **Exact vs illustrative**: exact toy arithmetic at Detailed; where the toy cannot show the phenomenon (overfitting curve, MDI bias, loss over 1000 epochs), use illustrative values **labelled** under the N1 rule at Brief/Balanced.
- **Every stated count and value is recomputed by a test** from the data (the "16 leaves at depth 5" rule: 2⁴ = 16).
- **Budget**: every visual ≤ 300 compact cl100k tokens, references included. Restate this in every task.
- **Selector**: the demo prompt verbatim in `prompts`; 2–3 short learner keywords (2–3 words, the noun phrase a learner types); long paraphrase phrases may stay but never alone.
- **Labels**: no role words in labels ("Parallel:", "Merge:" leaked into a card); maths inside `$…$`; axis labels in learner units (degrees, not "7.5° units"); decimal axes, not "in 48ths".
- **Depth = technical level, not length**: Brief fewest elements that carry the idea; Balanced the standard figure; Detailed the arithmetic.
- **Files**: `phase02-library/lesson-walkthroughs/NN-<lesson>.md`; `packages/web/src/tutor-diagrams/lesson-<lesson>-*.js`; ids `ml-<lesson>-*`; previews `illustrations/<id>[-brief|-detailed]/{natural,408,960}.svg` + `spec.json`; replay cases; snapshots; token budgets; lesson brief link.
- **Commits**: one concern per commit; lesson files only (so Claude Code can cherry-pick); never mix library-wide work (keyword audits, schema changes) into a lesson commit.
- **Staged pushes**: Balanced for all prompts first; Brief/Detailed second; polish third. Push each as soon as green.

## 5. P4 — Reviewer verification (non-negotiable before any instruction goes out)
- Fetch the commit; `git show --stat`; confirm file scope.
- Render **every** changed preview (rsvg at 408); view them; compare to the prompt's content spec.
- Recompute every number: impurities, means, probabilities, counts, tick values, formula peaks, leaf counts vs depth.
- Check prompts verbatim, keywords short, replay claims plausible (spot-run if possible).
- Verdict per figure: **ship / fix** with the defect and the layer. Fix list goes back as one Codex message.
- Record in the ledger in the same turn.

## 6. P5 — Integration (Claude Code)
- Data-only lesson commits: cherry-pick or fast-forward into the release candidate; **do not pull** a Codex branch that mixes in schema or selector-wide work — cherry-pick the lesson commits.
- Checks: focused suites, SVG snapshots, selector parity, A1 bundle property count ≤ 362, selector replay with `requiredKinds`.
- Tier: data-only → tier 1 smoke. Any schema field, prompt text, planner or selector-wide change → tier 2 (3×).

## 7. P6 — Pack (Claude Code)
- The 12 prompts **bare** (no lesson attached — Codex's "with the lesson attached" check passes trivially), Balanced, one pass, production settings (Gemini primary, planner on, pictures on).
- Pack format: `docs/features/explain/review/demo-<lesson>/` with per card `card.md` (body + pipeline), spec JSON, visual SVG/PNG, `card.png`, **`reference-408.svg`**; `index.md` with references sent (order), steer fired, planner kind, model kind, repaired, time, factual; blank `REVIEW.md` for the Reviewer.
- Expect: intended reference sent 12/12; model kind = reference kind 12/12. Any miss → pipeline lines to the Reviewer before anything else.

## 8. P7 — Audit (Reviewer) and verdict vocabulary
- **ship**: the reference figure (or a faithful variant), numbers right, prose consistent.
- **regenerate**: variance (schema slip repaired into another kind, wrong sibling reference chosen, label-rebuilt card) — rerun once, keep if it comes out as the reference.
- **hold**: a known factual error (reference or prose) — never record it; fix the layer first.
- Defect → layer: reference (Codex) · selector (keywords/prompt) · server (schema coercion, cap) · author prompt (Q1-type) · renderer. Prose contradicting a correct visual is recorded **under the body**, not the visual.

## 9. P8 — Record and release
- Record from the **preview** of the release candidate (same build prod gets). Shipping to main uses the gate: tier 1 for data-only; tier 2 when code touched the model path. Owner may release gate-pending on own authority with a rollback branch prepared; the gate then runs post-release.
- Never record a card with a known factual error.

---

## 10. Optimisation — how to go faster without going worse
- **Pipeline the phases across lessons**: while Codex authors lesson N (P3), the Reviewer writes prompts for N+1 (P1) and Claude Code integrates N−1 (P5–P6). Three lessons in flight, one per role.
- **Batch Claude Code's integration**: integrate two or three lessons' data commits in one tier-1 step; packs can run back to back (15 min each).
- **Reuse before authoring**: the coverage check (P2) is 15 minutes and routinely saves 2–4 references per lesson.
- **Carried verdicts**: cards whose spec+body hash is unchanged from the last judged run are not re-judged.
- **Demo-day rule**: on a day the Owner records, hand Codex only what the demo needs; idle work lands in front of the needed commit and forces cherry-picks.
- **Fetch before you instruct**: `git ls-remote` the agent's branch in the same turn as writing the task (twice today an instruction named a stale SHA).
- **Restate the invariants in every reference task** (budget, exact counts, labels, verbatim prompts) — each omitted rule was broken once today.
- **Stop the agent when there is nothing on the path**: an idle Codex producing out-of-scope commits is negative work during a release.

## 11. Metrics to log per lesson (ledger)
Refs new / reused · Codex authoring time · Reviewer fix count · pack: reference sent n/12, kind match n/12, steer fired, repairs, factual errors, p50/p90 · verdicts ship/regenerate/hold · integration tier and gate result · cost (generation + judge).

## 12. Lesson queue (Phase 02, zero or near-zero coverage first)
04 Decision Trees ✅ (pilot) → 03 Logistic Regression (prompts written 11-09) → 07 Unsupervised (k-means refs partly exist) → 11 Ensembles → 14 Naive Bayes → 16 Anomaly Detection → 18 Feature Selection → 21 Feature Stores / Training-Serving Skew → then 05, 13, 17, 19, 20 (2–6 matched figures each) → finally 01, 02, 06, 08, 09, 10, 12, 15 (adjacent-DL coverage; audit which prompts already hit).

## 13. Message templates
**To Codex (P3)**: branch + base SHA · coverage table result (REUSE/NEW per prompt) · toy dataset constraints · the 12 prompts with kind, content, keywords · the rules block (§4 verbatim) · staged delivery · report format.
**To Claude Code (P5–P6)**: the exact SHAs to cherry-pick (lesson files only) · what NOT to pull · checks + property count · pack spec (bare prompts, format, expectations) · tier.
**To Owner (P7)**: record list / regenerate list / hold list with one-line reasons; prompt wording changes if any.

## 14. Pitfalls log (keep appending)
- Keywords as paraphrases → never fire (L04 pilot).
- Offline replay without `requiredKinds` → false "first pick" (demo pack 1).
- Reference defects propagate verbatim (role prefixes into card 11; depth mislabel into card 08).
- Toy data too small for the phenomenon → 3-point "curve" (depth-overfit v1).
- Budget not restated → 491-token reference.
- Two same-kind references for one prompt → author picks the wrong one (demo 05).
- Idle-work commits on demo day → cherry-picks and a stale-SHA instruction.
