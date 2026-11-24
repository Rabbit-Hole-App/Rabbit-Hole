# /explain: same question, same JSON

Version 0.28 (2026-11-19). This document holds approved tasks only. Brainstorm, proposals and open questions are not written here.

| Step | Approved by the owner | Ordered from an agent |
|---|---|---|
| **MVP1: does the same prompt give different values?** | Yes | **Yes: Claude Code, first** |
| Task 3, the full build of Fix A and Fix B | Yes | After MVP1 is approved |
| Task 1. The system prompt in one file per section | Yes | After MVP1 is approved |
| Task 2. Send only the chosen kind's text | Yes | After MVP1 is approved |
| Task 4. The shared diagram template (`explanation-diagram-template`) | Yes | After MVP1 is approved |
| Task 5. The reference's function and the server step | Yes | After MVP1 is approved |

## Sprint: MVP1 first (owner, 2026-11-19 15:30)

This is a sprint. MVP1 answers one question before anything else is built: **with Fix A and Fix B, does the same prompt give different values?**

Claude Code does this first and pushes the result. No CI, no tests, no release. If the owner approves the result, the rest is built.

### What to do

1. **Branch.** `feat/same-json-ab` from main `ab40f5dc9`.
2. **Two text changes**, exactly as written under "The two fixes" in task 3:
   - Fix A: the one sentence of the explanation author's number rule. The explanation card only: the same rule in `ARTIFACT_SYSTEM` (`packages/control-plane/src/agents/learn-artifact.js:24`) keeps today's wording, so the explanation text at `packages/control-plane/src/learn-primitives.js:395` gets its own constant. `packages/control-plane/src/learn-artifact.js:152` looks the rule up to add `INPUTS_RULE`; point it at the new constant.
   - Fix B: the stored-reference heading in `packages/control-plane/src/explanation-references.js:179`. Its first words stay.
3. **Ask the same prompt five times, before and after.**
   - BEFORE = main `ab40f5dc9`. AFTER = the branch.
   - As production: profile `google-low`, Balanced depth, planner on, a fresh request seed for every ask.
   - Five prompts, five asks each, in each arm: 50 runs.
   - Prompt 1 is fixed: "Does top-k filtering affect the reported probability of the chosen token?"
   - Prompts 2 to 5: the first documented prompt of four other stored references that hold numbers, one each of coordinate-plot, heatmap, bar-chart and token-links. Claude Code picks them and lists their ids.
   - Use the GEN-1 R3 bench harness.
4. **Push the result** to `film/evidence` under `docs/features/explain/checks/same-json/mvp1/`, and push the branch as it is.

### What the result holds

- `results.jsonl`: one line per run with the arm, the prompt, the request seed, the reference shown, and the complete card as delivered (title, every visual's spec, body).
- `RESULT.md`: for each prompt, the five BEFORE cards and the five AFTER cards, one line each: title, labels, values. Under each prompt: how many different sets of values out of five, BEFORE and AFTER.
- One picture per prompt: a BEFORE row and an AFTER row, the five cards side by side.

### What is not done in MVP1

- No CI run, no tests written or updated, no offline guard, no merge, no release.
- Claude Code does not judge whether the numbers are right. The Reviewer recomputes them from `results.jsonl`.

### Cost and rules

Paid: about US$0.20; stop line US$0.50 settled; approved by the Reviewer. Three provider errors in a row stop the run. Keys by name from the environment, never printed or committed. No production read of any kind. If the harness refuses an action, stop and report it.

### After the push

The Reviewer reads the result and recomputes the numbers. The owner approves or not. Only after approval is the rest built: the full build of task 3 (tests, guard, the larger measurement), then tasks 1, 2, 4 and 5.

## The problem

A learner who asks the same question twice gets the same card: Gemini returns the same JSON, so the same picture is drawn. The owner wants a second ask to give a different, still correct, card.

Example: "Does top-k filtering affect the reported probability of the chosen token?" returned the same grouped bar chart (42/28/16/8/6 and 60/40/0/0/0) on three runs out of three.

## Why it happens (read and run on main `ab40f5dc9`)

1. **The request is the same both times.** Built twice with two different request seeds, the whole request to Gemini is identical, character for character. The seed changes the request in only two cases: the matched reference is one of the 15 (of 492) whose numbers are drawn per request, or no stored reference matches the question and three examples are picked by the seed.
2. **The request contains the finished answer.** The stored reference for the question is pasted into the system text under `# Examples`, with its numbers.
3. **The number rule orders the copy.** Under `# Numbers and maths`: "a diagram may use only the checked values of a selected reference".
4. **The answer schema allows one diagram kind.** For the top-k request Gemini may write only a bar chart.

Randomness is not the cause: Gemini already runs at its default temperature.

## Task 1 (owner, 2026-11-19): the system text in one file per section

The system text sent to the author model is put together from separate files, one per section, so each section can be read and changed without touching the others. The assembled result is called **explanation-system-prompt**. It is not a file kept in the repo: parts 4 to 7 differ from card to card, so it is assembled for each request.

Why first: today the text is built from strings spread over seven code files. To see what the model is told you have to run the code (the 16,278-character text for the top-k question was produced that way). The sections that cause the problem cannot be worked on one at a time until each is its own file.

### The parts, in the order they are sent

Sizes are from the top-k question at Balanced depth, main `ab40f5dc9`. The last column is how it is today; task 2 changes part 4.

| # | Part | File | Size (characters) | Changes per request today? | Where it lives today |
|---|---|---|---:|---|---|
| 1 | Opening instructions | `explanation-opening.md` | 440 | No | `agents/learn-artifact.js`, `learn-primitives.js` |
| 2 | `# Card layout` | `explanation-card-layout.md` | 3,852 | No | `learn-primitives.js` |
| 3 | `# Numbers and maths` | `explanation-numbers-and-maths.md` | 940 | No | `learn-primitives.js`, `agents/learn-artifact.js` (the number rule) |
| 4 | `# Diagram kinds and their fields` | `explanation-diagram-kinds.md` | 6,985 | No (task 2: yes) | `learn-primitives.js`, `explanation-references.js` |
| 5 | `# Depth` | `explanation-depth.md` | about 1,040 | Yes: by the learner's Depth | `chat-depth.js` |
| 6 | `# Visuals for this card` | `explanation-visuals.md` | 699 | Yes: written from the plan for this card; a fixed rules block when there is no plan | `explanation-planner.js`, `learn-primitives.js` |
| 7 | `# Examples` | `explanation-examples.md` | about 1,130 | Yes: a heading, then one JSON line per example chosen for this question | `explanation-references.js` |
| 8 | `# Output format` | `explanation-output-format.md` | about 1,010 | No | `explanation-interactions.js`, `explanation-fast-chain.js` |

Between parts 4 and 5 there is one line without a heading: "Based on the rules above, this card:". It marks where the fixed text ends and the per-card text starts.

Pieces that exist in the code but are not in the top-k request: a block for plotting a function from its formula (after part 6; switched off in production), instructions for reading an image the learner attached, and a suffix other commands add.

### What "a file per section" means for each part

- **Parts 1, 2, 3, 8** are plain text. Each becomes one file, sent as written.
- **Part 4** is one file in task 1 (`explanation-diagram-kinds.md`), sent as written. Task 2 replaces it with a folder of the same name.
- **Part 5** is one paragraph per Depth (Brief, Balanced, Detailed) and three lines every Depth gets; one of those carries the Depth's prose budget as a number. One file; code picks the paragraph and fills the number.
- **Part 6** is a sentence built from the plan ("This card's visuals: 1) a bar-chart diagram. …"). The file holds the wording with marked slots; code fills the slots. The no-plan rules block is a second text in the same file.
- **Part 7** is data, not prose. The file holds only the heading text (there are two today: one for stored references, one for seeded examples). The JSON lines keep coming from the reference library. Only examples chosen for this question are sent, never the library: a shape example of the planned kind (another subject), then at most two stored references matched to the question by its words; when no stored reference matches, three examples of the planned kind on other subjects, picked by the request's seed.

### Assembly

explanation-system-prompt = part 1, then parts 2 to 8 in this order, joined the way they are joined today.

Decided by the Reviewer (plumbing):

- The files are Markdown, in one folder in the repo, with the names in the table above: `explanation-` and the section's name. The number is the order of sending and is not in the file name.
- They are read when the app is built, not when a request arrives.
- Fixed parts stay first and per-request parts last, as today.

### Rule for the move

Task 1 changes no card. The assembled text must be the same, character for character, as today's for every reference prompt; the existing request-hash check proves it. Wording changes come after the move.

## Task 2 (owner, 2026-11-19): send only the chosen kind's text

Owner: "we cannot send every kind to the system prompt every time, else what is the purpose of JEV".

### What JEV does today (read in `explanation-planner.js`)

One small-model call before the author, 1.2 seconds at most. It is sent a one-line description of all 24 diagram kinds and answers seven questions; the kind is fixed when its probability is 0.6 or more, otherwise the top two kinds are offered. The server uses the answer for four things:

1. `# Visuals for this card` tells the author the kind as a fact ("This card's visuals: 1) a bar-chart diagram").
2. The answer schema is cut down to that kind (or the two offered kinds), so the author cannot write another.
3. A generic shape example of that kind is put first under `# Examples`.
4. A stored reference that matches the question replaces the planner's kind with its own.

So the choice of kind is already made and enforced before the author runs.

### The fault

Part 4 is not cut down with the schema. For the top-k request it is 6,985 characters: 17 kinds with their fields, and 6 more named in a closing block (heatmap, sample-set, histogram, box-plot, token-links, block-stack). The card may use one. On the two bench runs the planner gave a kind on 413 of 425 requests, so this is the normal case.

Per-kind share of today's text (characters): coordinate-plot 1,111; flow 803; figure 501; relationship 374; sequence 281; transformation 272; bar-chart 264; number-line 229; cycle 167; comparison 156; t-account 148; tree 136; waterfall 126; argument 125; matrix 76; timeline 61; layers 47. Shared lines about 500. The closing block is about 1,700 and holds more per-kind sentences.

### The six rules

1. **One entry per kind.** Part 4 is written as one entry per kind plus a few shared lines (what a diagram spec is, label lengths, no invented fields). An entry holds everything today's text says about that kind, wherever it sits now (the list, the label line, the closing block).
2. **A planned card gets only its own entries.** It is sent the shared lines and the entries for the kinds its answer schema allows. The list is the same one that cuts the schema, so text and schema cannot disagree. Kinds the schema allows inside a comparison's panels or a transformation's states count.
3. **Two offered kinds: both entries.**
4. **No plan: every entry, as today.** JEV failed or timed out, so the author picks the kind itself. Accepted by the owner for now.
5. **No pointing at a kind the card cannot use.** A sentence that sends the author to another kind ("use a bar-chart, not a line", "use cycle or relationship for a loop") is left out when that other kind is not allowed on the card.

6. **A picture-only card has no diagram anywhere (owner, 13:02).** When the plan is a picture and no diagram, the card gets no kind entries and its answer format offers no diagram. The picture goes to Recraft, as it does today: the author writes the picture's description, the server sends it to Recraft. Today such a card is told "(no diagram)" but is still sent the full kinds text and may write a diagram of nine kinds, which the server keeps. A diagram is never the fallback on such a card (owner, 13:03): if Recraft fails three times the picture is removed and the card has no visual.

Effect on the top-k request: part 4 goes from 6,985 to about 900 characters; the whole system text from 16,278 to about 10,200.

### Files

Part 4 becomes a folder, `explanation-diagram-kinds/`: one small file per kind, named `explanation-kind-` and the kind (`explanation-kind-bar-chart.md`), and `explanation-kinds-shared.md` for the shared lines. A sentence under rule 5 is marked in its entry with the kind it points to, so code can leave it out.

Decided by the Reviewer (plumbing): entries are sent in one fixed order (today's order), so two cards with the same kinds get the same text.

### What it does not do

It does not make a second ask give a different card. It removes text the author cannot use.

### To check before release

- This changes the request of every planned card. Before and after on the bench: valid first time, right kind, right numbers.
- The three new entries are new text: cards of tensor, token-links and block-stack are compared before and after on their own.
- The no-plan text must not change: with every entry sent, part 4 reads as it does today apart from the order of its sentences. If the regrouping changes cards without a plan, that is measured too.
- Reuse of the fixed start: parts 1 to 3 stay identical on every request. The code does not record whether Gemini reuses anything, so no saving is known to be lost.

### Three kinds get a written entry (owner, 13:04)

Part 4 describes 17 kinds with their fields. Three kinds are not described that way today: tensor is not mentioned at all, and token-links and block-stack have one sentence each. The owner decided they get a proper entry like the others. This is the one place task 2 adds text. The wording of the three entries is not approved yet.

## Task 3 (owner, 2026-11-19): Fix A and Fix B, so Gemini writes its own values

Owner's direction (13:36): Gemini should change the title, the axis labels and the numbers of the example itself. Changing them before the prompt, reference by reference, is backwards.

Facts read and run on main `ab40f5dc9`:

- **Gemini never sees the reference's files.** It sees only the JSON line under `# Examples`.
- **Gemini writes the whole diagram.** Its answer is structured output against a strict JSON schema (`explanation-fast-chain.js:153`): title, caption, labels and every value. The schema limits the kind and the lengths, not the values. Nothing technical stops it from changing them.
- **It does not change them because the prompt tells it not to.** The number rule (part 3) allows "only the checked values of a selected reference"; the examples heading (part 7) says to use the reference's structure; and nothing in the request differs between two asks.
- **The server recomputes results in eight cases only** (`derived.js:254–263`): box-plot fences, softmax in a transformation, token-links weights, histogram proportions, heatmap range, sample-set members, coordinate-plot annotations, and a bar chart whose two series are labelled score and probability.
- **Top-k is not one of the eight.** Run through the card checks (`artifactBlock`, `explanationProblem`): a top-k chart with a wrong renormalised series (50/30/20 where 40/33/27 is right) is accepted, and so is a "Full softmax" series that adds up to 120 %. Other checks in the full route were not run.

So letting Gemini change the numbers works wherever the numbers do not depend on each other, and wherever one of the eight rules covers the dependence. Elsewhere a wrong number would reach the learner unchecked.

### The two fixes

Ordered by the owner at 13:47 ("so lets do Fix A and B"). They are built on today's strings, without waiting for tasks 1 and 2.

**Fix A: the number rule** (part 3, `explanation-numbers-and-maths.md`; today `agents/learn-artifact.js:16`). One sentence changes; the rest of the rule stays.

- Today: "Otherwise a diagram may use only the checked values of a selected reference, and its title or caption must say 'illustrative', or values you compute exactly from a formula the prose states, labelled 'worked example'."
- New: "Otherwise build a small worked example of your own: choose simple input values, compute every other number exactly from them, and say 'illustrative' in the title or caption. Do not reuse the values of an example."

**Fix B: the examples heading** (part 7, `explanation-examples.md`; today `explanation-references.js:179`), the form used when a stored reference is shown.

- Today: "Approved diagram references (examples, not source facts). Use their supported structure and layout when appropriate. Adapt labels and relationships to the learner's question. Do not copy example prose, force a reference, or exceed this card's visual count."
- New: "Approved diagram references (examples, not source facts). An example on this card's subject shows a correct structure: keep its structure and its facts. Write your own version of what is illustrative in it: the example items, their names, the input values and the title. Do not copy an example's values, labels or prose, force a reference, or exceed this card's visual count."

"Keep its facts" is there for diagrams without numbers (the steps of an algorithm, the parts of a model): there the labels are the content and must not be reinvented.

Tests quote both strings (for example `explanation-prompt-cleanup.test.js`), so they change with them.

### Full build order for A and B (for Claude Code, after MVP1)

**This full order runs only after MVP1 is approved.** Owner's order of 13:47. Own lane: it does not block release 167 and is not part of it. Nothing is released until the Reviewer has read the evidence.

**Branch.** `feat/same-json-ab` from main `ab40f5dc9`.

**Fix A.**
- Replace the one sentence quoted under Fix A above with the new sentence. The sentences before and after it stay.
- Scope: the explanation card's author only. `NUMBER_RULE` is also in `ARTIFACT_SYSTEM` (`agents/learn-artifact.js:24`) for the other card commands; that keeps today's wording. So the explanation text at `learn-primitives.js:395` gets its own constant.
- Trap: `learn-artifact.js:152` finds `NUMBER_RULE` in the text to add `INPUTS_RULE` on seeded requests. It must find the new explanation rule, or `INPUTS_RULE` silently stops being added. Add a test that a seeded request still carries `INPUTS_RULE` right after the number rule.
- Do not change `INPUTS_RULE` or `SEEDED_EXAMPLES_HEADING`.

**Fix B.**
- Replace the heading quoted under Fix B above (the non-seeded branch of `diagramReferenceContext`, `explanation-references.js:179`) with the new heading.
- Its first words stay ("Approved diagram references"), so `REFERENCE_MARK` and the `# Examples` first line are untouched.

**Guard, offline, before any paid run.** For every reference prompt (the loop of the `full-hashes` script), the assembled Gemini system text on the branch differs from main in exactly those two sentences and nowhere else. Report the count. Update the tests that quote the two strings.

**Measurement.** Paid; approved by the Reviewer: estimate about US$1, stop line US$1.80 settled; three provider errors in a row stop the run. Reuse the GEN-1 R3 bench harness.
- Arms: BEFORE = main `ab40f5dc9`, AFTER = the branch. Profile `google-low`, Balanced depth, planner on, a fresh request seed per ask, as production does.
- Set 1, reference prompts, five asks each per arm: 24 references asked by their own first documented prompt. `ml-sampling-top-k` must be one. The rest: at least 3 each of bar-chart, coordinate-plot, heatmap and matrix; 2 each of histogram, token-links and box-plot; then 5 without numbers (flow, relationship, tree, block-stack, comparison). The chosen ids go in `plan.json`.
- Set 2, guards, three asks each per arm: 3 questions where the learner gives the numbers (from the existing numeric bench set) and 3 questions with no stored reference.
- Recorded per run in `results.jsonl`: everything the R3 bench recorded, plus the complete card as delivered (title, every visual's spec, body). These are bench prompts, so the text may be stored.
- `REPORT.md`, per question and arm: different cards out of five (same kind, same labels and same values count as the same card), different value sets, different label sets, delivered, valid first time, repairs, kind as planned; totals per set.
- Sheets: one PNG per question, a BEFORE row and an AFTER row, the five cards side by side at 408 px.
- Claude Code does not judge the numbers beyond what the validator flags. The Reviewer recomputes them from `results.jsonl`, reads every AFTER card as a learner's card, and on kinds without numbers checks that the facts are the reference's.

**Evidence.** On `film/evidence` under `docs/features/explain/checks/same-json/ab/`: `plan.json`, `results.jsonl`, `REPORT.md`, `sheets/`. Report back the branch commit and the evidence commit.

**Rules.** Keys by name from the environment, never printed or committed. No production read of any kind. If the harness refuses an action, stop and report it.

**Pass line.** Reference prompts stop returning five identical cards; no wrong number that today's card does not have; delivered and valid-first-time not worse; the learner's own numbers still used exactly.

**Held.** GEN-1 R3 stays held. Codex has no work from this section.

## Task 4 (owner, 2026-11-19): the shared diagram template

Name: `explanation-diagram-template`. One template that every diagram kind and every example fits. It is today's diagram JSON with one shared block added, not a second format.

Basis: the inventory of what exists (`claude/explanation-diagram-inventory.md` and `.csv`): 25 kinds, 1,343 stored diagram JSONs, 545 fields. Only `kind`, `title` and `caption` are in all 25 kinds.

### The template

```json
{
  "version": 1,
  "diagram": {
    "kind": "…",
    "title": "…",
    "caption": "…",
    "variables": [ … ],

    "…": "the kind's own drawing fields"
  }
}
```

| Part | Fields | Status |
|---|---|---|
| Shared, in every kind | `kind`, `title`, `caption` | Exists today |
| Shared, in every kind | `variables` | New, optional |
| Per kind | bars, nodes and edges, boxes, cells and so on | Unchanged |

### The `variables` block

One entry per number that matters, with the same shape in every kind.

| Field | What it says | Values |
|---|---|---|
| `name` | What the number is called | text |
| `role` | Who sets it | `input` or `result` |
| `type` | The kind of number | `int` or `float` |
| `min`, `max` | Its limits | numbers |
| `at` | Where it is drawn | a place in the kind's drawing fields, such as `series[0].values` |
| `value` | Its value when it is not drawn | a number |

Each entry has either `at` or `value`, never both.

### Example: the top-k reference

The title, caption, categories and the two series stay as they are today. Added:

```json
"variables": [
  { "name": "full", "role": "input", "type": "float",
    "min": 1, "max": 90, "at": "series[0].values" },
  { "name": "k", "role": "input", "type": "int",
    "min": 1, "max": 4, "value": 2 },
  { "name": "renormalized", "role": "result", "type": "float",
    "min": 0, "max": 100, "at": "series[1].values" },
  { "name": "keptShare", "role": "result", "type": "float",
    "min": 1, "max": 100, "value": 70 }
]
```

### Rules

- The numbers stay where the renderer reads them. `variables` names, types and limits them; it does not move them.
- The block is optional. A diagram without numbers leaves it out.
- It is defined once, beside `title` and `caption`, so every kind accepts it.
- `unit` is not part of the block. It stays where each kind has it today.
- The version stays 1: no existing JSON becomes invalid.

### Order of work (owner)

1. Write the template.
2. Prove it works for all: the 1,343 existing diagram JSONs pass it with no JSON edited, and every picture is drawn as before.
3. Only after that, add the numbers to the references.

## Task 5 (owner, 2026-11-19): the reference's function and the server step

When: after task 4 is proven on all 1,343 existing diagram JSONs.

Purpose: Gemini chooses the inputs of a diagram; the numbers that follow from them are computed by code, so they are right.

### Part 1: the function

- A reference whose diagram has results gets one function, in its own calculation file. It is not in the JSON, and Gemini does not see it.
- It takes the inputs and returns the results, under the same names as the `variables` block of task 4.
- It is ordinary code and handles any number of items.
- No general evaluator for formulas or lists is built.

For top-k, from the calculation that already exists in `ml-sampling-top-k-data.js`:

```js
export function topK({ full, k }) {
  const order = full.map((_, i) => i)
    .sort((i, j) => full[j] - full[i]);
  const kept = new Set(order.slice(0, k));
  const keptShare = full.reduce(
    (total, value, i) => total + (kept.has(i) ? value : 0), 0);
  const renormalized = full.map((value, i) =>
    kept.has(i) ? Math.round((value / keptShare) * 100) : 0);
  return { renormalized, keptShare };
}
```

Run by the Reviewer: 42/28/16/8/6 with k = 2 gives 60/40/0/0/0 and 70, as today; it also works with six items.

### Part 2: the server step

It runs where the server already corrects diagrams (`learn-artifact.js:296`), after Gemini's answer has been built into a card and before the card is checked. It applies to a card made from a reference that has a function.

1. Read the inputs from the card through `variables`.
2. Check each input's `type`, `min` and `max`.
3. Run the reference's function on them.
4. Overwrite the results on the card with the function's results.
5. Check each result's `min` and `max`.

Rules decided by the owner:

- A result that differs from the function's is overwritten. A retry loop may be added later if needed.
- A result written inside a sentence (a title, a caption, the prose) is written as a placeholder that the server fills from the card. The mechanism exists (`explanation-tokens.js:1–3`).

### Part 3: top-k first

Top-k is the first reference to get its function. It is measured, and the owner approves the result before anything else is done. A reference without a function is untouched.

### Part 4: the other references (after part 3 is approved)

1. List the other references first: which references on main have results that follow from inputs.
2. Then the owner decides which ones to do.

Counted on main `ab40f5dc9`, as a starting point for that list: of 492 references, 192 have no number in any diagram; 125 have numbers and are built from a calculation file (26 files; top-k is one; an upper figure, counted per file); 175 have numbers typed by hand and have not been read.

### Rule: main only, checked at every merge

The list and the counts are for main only. Every merge to main is checked. For each reference the merge adds or changes, the check answers two things:

1. Does it need a function or not?
2. If yes, its numbers: they are checked with its function.
