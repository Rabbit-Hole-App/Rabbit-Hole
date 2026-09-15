# Coaching: product, ideas, tasks, and results

Coaching helps builders and colleagues understand how an app was built through
the app's Agent tab. This release adds an inspection UI with sample data around
the existing chat. Capture and extraction are not connected in this UI release.

The [Coaching benchmark protocol](coaching-benchmark.md) and
[measured pilot results](../testing/coaching-benchmark-results.md) compare source,
session, and extracted-decision context in a separate evaluation harness. These
experiments do not connect extraction to the app or change the sample UI.

This is the central Coaching document. Keep proposed work, task status, and
links to supporting specifications and measured results here as we build.
The brainstorm below is proposed work, not an approved implementation or a
claim that the sample inspection tabs already feed Chat.

## Why we are building Coaching

The builder already explained choices and corrected their coding agent while
making the app. A colleague should be able to recover that judgment without
finding the builder or learning the repository first. The builder should also
be able to recover their own reasoning later.

Both people use Small's existing Coach Agent interface. Coaching connects what
was intended, what was deployed, and what happened when the app ran. Its core
questions are:

- What does this app do, and how should I use it?
- Why was it built this way? What alternatives were rejected?
- What happened in this run, and what should I try next?
- What depends on this choice, and what is still unknown?

An answer must distinguish a recorded reason, an observed result, and an
inference. A plausible explanation is not evidence of the builder's intention.

## What exists and what we have tested

| Area | Status | Specification and evidence |
| --- | --- | --- |
| Inspection UI | Sessions, Sources, Capture, and Decisions are sample views. Their contents do not feed Chat. Existing chat controls and evidence navigation are preserved. | [Views](#views), [shared presentation](#shared-presentation), and [release verification](#release-and-verification) below |
| Context experiment 1 | Completed: 30 questions comparing sources, session context, and extracted decisions. Five excerpts came from one real session, not five independent sessions. | [Protocol](coaching-benchmark.md), [measured results](../testing/coaching-benchmark-results.md) |
| Context experiment 2 | Completed: five distinct sessions, 30 questions, 60 answers. Decisions plus retrieval did not meet the declared success rule. | [Protocol](coaching-retrieval-benchmark.md), [measured results](../testing/coaching-retrieval-results.md) |
| Evaluation harness | Offline preparation, capture, answering, grading, and reporting exist. Subscription runs do not imply a production model integration. | [Harness and reproduction commands](../../tests/evals/coaching/README.md), [tests](../../tests/evals/coaching/test_bench.py) |
| Private AWS app/run chat | Enabled on dev and live with job definitions and run evidence. Real dev Bedrock answers, follow-up, and separate histories passed. It does not include builder sessions or design decisions. | [Bedrock chat specification and verification](byoc-bedrock-chat.md) |
| Private AWS dev | Separate installation with test apps and sample Coaching tabs. Future Amazon Coaching work is tested here before approved live promotion. | [Dev installation and deployment](byoc-dev.md) |

Experiment 2 scored **12/30 strict passes for Session and 11/30 for Decisions
plus retrieval**. Retrieval reduced answering input by 7.4%, but used 13.8%
more total input after extraction. Unsupported answers were judged in 7 cases
for Retrieval versus 4 for Session. JSON-format failures affected 27 of 60
answers. The separately labeled content diagnostic scored 22/30 and 21/30.
These are provisional automated judgments from related work in one repository.
They do not establish human usefulness or a production-ready retrieval design.

Implication: keep full visible session context as a measured baseline. Test
retrieval improvements against it; do not assume smaller context gives better
answers. Keep answer-format failures separate from factual quality while still
counting them against a declared strict result.

## Ideas from Glen

[Glen](https://www.tryglen.com/) advertises continuous capture from coding agents
and company tools, automatic context injection, a shared transcript library,
permission-aware recall, and explanations of why code exists. These are their
published claims; we have not tested their product or verified their agent-clone
mechanism. The lessons below are our proposed application of those ideas.

| Idea | Application to Small |
| --- | --- |
| Relevant context arrives automatically | Chat knows the selected app, deployment, and run. The user can inspect what was included without assembling the context manually. |
| Preserve the original evidence | Extracted decisions link back to the precise conversation and deployed source that support them. |
| Connect knowledge to the user's work | Explain a failed run using operational evidence, and explain design choices using the builder's recorded reasoning. |
| Carry knowledge forward | Associate decisions with versions and identify changed or unresolved anchors before reusing old reasoning. |
| Make knowledge shared and permissioned | Colleagues can use approved app knowledge only while they retain access to its supporting material. |
| Learn from questions | Unanswered questions and builder corrections can improve future answers, with explicit review and provenance. |

Our proposed focus is the app the colleague actually uses: its purpose, inputs,
versions, runs, and builder reasoning. Company-wide connectors, shared skills,
and session takeover are later possibilities, not prerequisites for this MVP.

## Proposed tasks

C01's first evidence manifest and six diagnostic questions are prepared below.
Production ingestion and Chat integration remain **not started**. Existing
preview components and benchmark code are reusable starting points. A checked
task should link to its implementation and verification evidence.

| ID | Task | Concrete result | Depends on |
| --- | --- | --- | --- |
| C01 | Define the first app and questions | One dev app, its actual builder session, matching source snapshot, and a frozen question set spanning purpose, usage, reasons, runs, and unknowns. | None |
| C02 | Define the data and permission boundary | Document what can be read, stored, shared, and sent to the selected model, including full visible sessions. Establish deletion and access-revocation behavior before ingestion. | C01 |
| C03 | Connect real Sessions and Sources | Authorized session messages and matching deployed files appear in the existing inspectors with stable IDs and version metadata. | C02 |
| C04 | Connect Capture and decision review | Extraction produces traceable candidates; validation catches unsupported reasons and missing code anchors. The builder can approve, correct, or discard a candidate. | C03 |
| C05 | Assemble context for each question | Select authorized evidence using the current app/run/version and question. Record exactly what the model received and what was omitted. Compare full-session and retrieval approaches. | C03; C04 for decision context |
| C06 | Connect that evidence to Chat | Answer through the existing composer, History, New Chat, and enlarged layout. Explain purpose, use, design, and observed behavior without inventing missing reasoning. | C05 |
| C07 | Open exact evidence from answers | Citation tags open the relevant message group, source lines, decision, or log entry in the shared inspector, with working Back and Minimize. | C03, C06 |
| C08 | Capture gaps and builder corrections | A user can mark an answer wrong or record an unanswered question. A reviewed correction becomes sourced knowledge; an unreviewed chat answer never becomes a fact automatically. | C04, C06 |
| C09 | Handle knowledge across deployments | Preserve historical reasoning, flag changed anchors, and link superseding decisions. Avoid using an old reason as an explanation of a different version. | C03, C04 |
| C10 | Evaluate and review the complete experience | Run the frozen benchmark, audit failures, and have a colleague try the dev app. Link the report and an explicit continue/revise decision here. | C01 for protocol; C06/C07 for end-to-end evaluation |

### C01-C03: real inputs and traceability

- Choose authorized Small development material for the first test. For Amazon
  material, use the private AWS dev installation and its permitted processing
  path; do not send it through shared Small services.
- Resolve the full-session storage and model-processing policy explicitly.
  The earlier local-only proposal and later full-context experiments are not
  interchangeable authorization for production ingestion.
- Preserve session and message IDs, speakers, ordering, timestamps when present,
  source hashes, and deployment/commit associations. Do not manufacture metadata
  missing from a session export or claim access to hidden model reasoning.
- Keep raw input inspection separate from normalized model input. Show redaction,
  omissions, and truncation so debugging explains what the model actually saw.
- Apply access checks before retrieval, answering, and opening citations. A
  citation must not reveal a session that the viewer cannot access.
- Define the import interaction before changing the UI. The removed Add session
  button should not silently reappear as part of backend work.

### C04-C05: useful memory and context

- Candidate decisions include the choice, alternatives, reason or explicit
  unknown, evidence, code anchor, constraints, dependencies, and revisit condition
  when recorded. Missing fields remain missing; extraction does not fill them by
  guessing.
- Keep design reasoning distinct from operational observations. A successful run
  demonstrates behavior, not why the builder originally chose the implementation.
- Full visible sessions, approved decisions, source snapshots, and run evidence
  have different roles. Chat history is conversation context, not an approved
  decision store.
- Preserve corrections and nearby conversation when retrieving. Conflicting
  statements should retain their order and provenance rather than being silently
  merged into a single confident answer.
- Use version and permission filtering before ranking. Record selected IDs,
  context size, omissions, and retrieval time for evaluation and inspection.
- On removal or revoked access, stop using the affected evidence and define how
  dependent answers, summaries, and caches are invalidated. Do not claim deletion
  regenerates every view until that behavior is implemented and tested.

### C06-C09: the colleague's experience

- From the app, explain declared behavior and recorded design reasoning. From a
  run, use that run's deployment and observations; do not silently substitute the
  latest deployment's source.
- Use compact evidence tags after supported claims. Reuse `SourcePreview`,
  `colorLine`, and `ExpandedPageFrame`; retain the existing chat controls and
  sidebar rather than introducing a separate Coaching page.
- Derive Continue exploring suggestions from the user's recent questions and
  stated goal. Prefer useful next questions such as which input to change or
  which recorded constraint matters, without assuming a goal they never stated.
- Show unknowns plainly. The MVP can report gaps in answers before adding the
  persistent gap-and-correction workflow in C08.
- Start version safety with exact deployment association and unresolved-anchor
  warnings. Automatic semantic supersession and dependency warnings in C09 need
  their own evidence and evaluation before being presented as reliable.
- Coaching initially explains and guides. Running jobs, editing code, approving
  grants, or deploying from chat would be a separate scope decision.

## Proposed MVP order and checklist

The first complete experience is: a colleague opens one dev app, asks what it
does, why it was built that way, and how to use it, then opens the supporting
evidence without leaving the normal app interface.

- [x] Prepare C01's app, source/session evidence manifest, and six diagnostic questions: [dev-word-count](#first-app-evidence-manifest-dev-word-count).
- [ ] Confirm C02's session-sharing and model-processing boundary before inference or ingestion.
- [ ] Freeze the C10 evaluation protocol before tuning the implementation.
- [ ] Establish a full-session baseline in the existing evaluation harness.
- [ ] Compare C05's proposed context strategy before adding production memory.
- [ ] Connect C03's real session and versioned source to the existing inspectors.
- [ ] Add C04's candidate extraction, validation, and review.
- [ ] Connect C06 using the measured context strategy.
- [ ] Complete C07's exact citations and dev review.
- [ ] Run C10, record failures and results, and decide the next iteration.
- [ ] After that slice is useful, consider persistent corrections (C08) and
  richer version/supersession handling (C09).

Basic permission enforcement, exact version association, and truthful unknowns
belong in the first slice. Richer memory automation can follow it.

## Next execution plan

This sequence makes the next deliverable concrete. Implementation remains
proposed; writing this plan does not activate ingestion, inference, or deployment.

1. **Prepare one real app's evidence (C01-C02).** Inventory the available dev
   apps and builder sessions, then select one with a verifiable source/version
   match. Prefer Small-owned development material for the first experiment.
   Produce an evidence manifest containing app and deployment identifiers,
   session/message references, source hashes, missing inputs, and the agreed
   processing boundary. Do not silently choose a session that merely mentions
   the app or use synthetic dialogue as its history.
2. **Freeze six diagnostic questions (C01/C10).** Cover purpose, use, one design
   choice, one rejected alternative, one operational observation, and one
   genuinely unknown reason. Record supporting evidence and forbidden claims
   before generating answers. These six questions are development diagnostics;
   they do not replace the separate 30-question held-out comparison.
3. **Measure a simple baseline, then one challenger (C05/C10).** Start with a
   fresh model given the complete permitted visible session and matching source.
   A proposed challenger is a fresh model with bounded, read-only tools to search
   and open the same eligible evidence. It may follow a citation or fetch nearby
   messages before answering. It cannot execute code, browse other projects,
   access scoring rubrics, or change the app. Freeze tool limits and total model
   budgets; count search calls and all intermediate tokens. Fix output-contract
   reliability on development cases before the held-out run. Keep failures in
   the results instead of silently retrying until they pass.
4. **Connect the selected approach to one dev app (C03-C07).** Show its real
   authorized inputs in Sessions/Sources and answer through the existing Chat.
   Connect Capture/Decisions when candidate extraction and review are implemented;
   keep preview fixtures visibly separate until then. Full-session answering must
   not depend on inventing or approving an unnecessary decision record. Evidence
   tags open exact source locations with the existing navigation and layouts.
5. **Check the complete flow (C10).** Test version matching, permission denial,
   missing/removed evidence, failed model requests, and citation destinations.
   Ask a colleague to complete a defined task using the dev app. Report this
   human trial separately from automated answer scores. Link the results here
   before deciding whether to promote or revise the feature.
6. **Add memory improvements only after the first useful flow (C08-C09).**
   Prioritize reviewed corrections and recurring gaps, then stale-decision and
   supersession handling. Defer company-wide connectors, automatic shared skills,
   and action-taking tools.

The first action is **step 1: identify the app, session, and matching source**.
Its deliverable is the evidence manifest and proposed six questions, not another
UI mockup or a new extraction architecture. App selection and any unresolved
data-processing choices must be settled before dependent implementation.

### What we mean by an agent with historical context

Glen's phrase "agent clone" does not establish a technical implementation.
For our experiment, use precise names: **full-session answering** and
**read-only evidence-search agent**. Both start fresh from recorded evidence;
neither copies a model's private state or recreates the original agent's mind.
Simply loading the original conversation is already the full-session baseline,
so renaming it a clone would not create a meaningful third comparison arm.

The search-agent challenger is a proposal to test whether fetching additional
evidence when needed improves on the earlier fixed BM25 selection. It is not a
claim about how Glen works or an assumption that agentic search is better.

## First app evidence manifest: dev-word-count

Prepared 2026-09-11 after the user approved the next evidence-preparation step.
This is a development diagnostic, not a completed model experiment.

| Field | Verified value |
| --- | --- |
| App | `dev-word-count` |
| Interface | [Private AWS dev app](https://dviorrcko52ft.cloudfront.net/apps/dev-word-count) |
| Workspace | `w-small-aws-dev` |
| Current deployment at verification | `d-1789112453520-696d4b54be60`, ready |
| Image digest | `sha256:02e428d46d128af23ede187e1b83012049454cbc6f7f80d3de3efeb19662d417` |
| Source archive SHA-256 | `ab51b208b3ed66c11d4290a761069208d0ed970ebdda582f65a56d501e0f7c00` |
| `job.py` SHA-256 | `13eec9043446be01edb0d5c03f56887aa3d774dedc0a6eb53061568c45c7adc8` |
| `small.toml` SHA-256 | `13dd91a7c969b0ff45916545e6791c603771e2312220397c41cea147236c5ed6` |
| Builder session | Codex `01a0782a-6ed1-7513-84da-e7e9ff746866` |
| Original private dev deployment | `d-1789107898516-5810db9c3213`; the current deployment is a later image-hardening rebuild |
| Current-version recorded run | `r-1789112779853-ed52e9f64414`, finished, exit 0, `report.json` listed |

The current source hashes were computed inside customer AWS and compared with
the local prepared app files. Both match byte for byte. The deployed `job.py`
also matches [the tracked word-count example](../../examples/byoc-word-count/job.py).
The example's tracked configuration uses `aws-word-count`; the deployed
configuration uses `dev-word-count`. Do not treat that name difference as a
byte-identical config match. The matching local configuration is under ignored
`.small/byoc-private/dev-test-apps/dev-word-count/small.toml`.

The session contains the actual command copying the existing example into the
private dev app, not just a later mention of its name. It is a long mixed-work
session: dev setup and later image hardening are separate episodes within it.
Neither a single app-only conversation nor a complete original algorithm-design
discussion has been established. This makes it useful for wiring and unknowns,
but insufficient by itself to validate rich design-reasoning capture.

### Evidence references

The operator-local transcript is
`~/.codex/sessions/2026/09/06/rollout-2026-09-06T12-20-42-01a0782a-6ed1-7513-84da-e7e9ff746866.jsonl`.
Line numbers below refer to original `response_item` records, not duplicate
event notifications, compaction summaries, or this later planning discussion.
They are source locations, not native message UUIDs. The transcript is not
copied into this repository or sent to a model by this preparation step.

| ID | Location | What it establishes |
| --- | --- | --- |
| E1 | Matching `job.py`, lines 5-10 | Whitespace splitting, total count, lowercase distinct count, JSON output, and stdout. |
| E2 | Matching deployed `small.toml`, lines 1-12 | App name, Python entry, AWS job type, required text input/default, and report declaration. |
| E3 | Session line 16702, assistant, 2026-09-11 05:55:59 UTC | Explicit alternatives: use existing apps/data or separate test apps/data; using existing data would execute real jobs. |
| E4 | Session line 16709, user, 2026-09-11 05:58:47 UTC | User chose separate dev test apps while live keeps drift, oof, and overreach. |
| E5 | Session line 16940, tool call `call_7NJ9sd2AnKQTUJmOivTUFZPN` | Prepared `dev-word-count` by copying the existing `byoc-word-count` example. |
| E6 | Session line 17635, tool call `call_6BGcozDdK6VXicmIYVE1Wsot` | Requested the later word-count rebuild; a tool request alone does not prove build success. |
| E7 | `.small/byoc-private/image-proof/dev-verified.json` | Saved rollout verification associates the rebuilt version with a finished run and a listed `report.json`; not a fresh run during this preparation. |
| E8 | AWS metadata/hash comparison performed during this preparation | Confirms the current deployment and its source bytes; source stayed in AWS during this remote check. |

Original record SHA-256 values, hashing UTF-8 JSONL text without its line ending:
E3 `a56f310aeeea92870c1ba60ec9579761525ea7fd0bcd594f04362d13f92da449`;
E4 `2b0ba54fa1e775daf341b7878ae2dfeed109571acab2665b124c3ff74800db2d`;
E5 `0d5a3158eac10f699d22cd262af5fb99fe16b42939e3ce92db16edde28f395b4`.
E7's file SHA-256 is
`c3cc13ac11e98ea49a89c2a06d550b70f5cf365554e06c83980f3f6e8f786262`.
These hashes identify evidence; they do not make the transcript tamper-proof or
turn reported outcomes into independent execution tests.

### Six diagnostic questions and expected evidence

These questions and expected criteria are prepared before any new answers.
They may be used to debug the harness; keep them out of the later held-out score.

| ID | Question | Expected answer and evidence | Claims to reject |
| --- | --- | --- | --- |
| D1: purpose | What does this app do, and what result do I get? | Counts whitespace-separated words and case-insensitive unique tokens; writes `report.json` containing `word_count` and `unique_words`. E1/E2. | Semantic language analysis, punctuation normalization, or external text-service calls. |
| D2: use | What should I enter, and what should `Small small dev works` return? | Enter it in the Text input. Source predicts 4 words and 3 unique words; use Run, then inspect the report. E1/E2. This is a source-derived prediction, not a newly executed result. | Claiming this exact input was run in this preparation, or confusing total count with unique count. |
| D3: design | Why is this test app in a separate dev installation? | The user wanted separate test apps while live retained the business apps. E3/E4/E5. This is the environment decision, not a reason for the counting algorithm. | A claim that word counting technically requires a dedicated AWS account or installation. |
| D4: alternative | Could we have tested against the live apps and their data instead? Why did we choose otherwise? | The assistant offered shared existing apps/data versus separate test apps/data; the user selected separation. Cite E3/E4 and explain the stated real-job execution consequence. | Invented cost, latency, or regulatory studies; claiming the user explained more than their recorded choice. |
| D5: operations | Was this deployed version ever run successfully, and what does the evidence actually prove? | E7 records the specified run finished with exit 0 and `report.json` listed; E8 identifies the matching current deployment. It proves that recorded sample run, not arbitrary inputs, load performance, or today's browser login. | Mixing the original deployment's run with the rebuilt deployment, claiming a fresh run, or treating file existence as proof every result field is correct. |
| D6: unknown | Why use `split()` and lowercase tokens instead of a tokenizer? Was accuracy benchmarked? | E1 shows the implementation. The selected build episode does not record a tokenizer comparison or accuracy benchmark. Say the reason is unknown in this evidence. | Presenting simplicity, speed, or benchmark superiority as the builder's recorded rationale. |

Remaining boundary decisions: which visible session episodes may enter model
context and who may inspect/share them. Bedrock's US model routing was separately
approved for app/run chat; that does not settle builder-session ingestion. The whole
mixed session is not implicitly eligible because one app was selected. Candidate
selection and local inspection are complete; inference, production ingestion,
new UI controls, and deployment were not performed. No secrets, raw customer
job data, hidden reasoning, or retrospective planning messages should be added
to the evaluation evidence without a separate, applicable authorization.

## Next evaluation proposal

Reuse the five-session, 30-question structure, with fresh held-out questions for
claims about improvement. Keep the existing experiments as historical baselines;
do not silently revise their frozen questions or reinterpret their scores.

Compare the same model, evidence eligibility, answer instructions, and output
budget across full-session context and the proposed retrieval strategy. Report
extraction cost separately and included in total usage. For subscription-based
experiments, keep the user's existing subscription preference; production BYOC
inference uses the customer's configured provider, not a personal subscription.

| Measure | What to record |
| --- | --- |
| Answer quality | Required criteria covered, unsupported claims, correct treatment of unknowns, and strict pass count with a fixed denominator. |
| Evidence quality | Citations that resolve, citations that support the claim, omitted decisive corrections, and version mismatches. |
| Output reliability | Format failures, timeouts, and incomplete answers, separately from factual quality. |
| Access and removal | Cross-app/user access denial and inability to retrieve removed evidence. These need deterministic tests, not an LLM judge. |
| Efficiency | Serving and extraction tokens, retrieval time, and end-to-end answer latency. |
| Human usefulness | Whether a colleague completes a defined app task correctly, time needed, and interruptions to the builder. Report separately from model scores. |

Proposed selection rule: a retrieval approach must match or improve strict
quality without increasing unsupported answers before token savings justify
choosing it. No unauthorized evidence or fabricated citation is acceptable in
the deterministic access/citation tests. A small pilot is a decision aid, not
proof of general reliability. Report both wins and failures and agree on any
numeric release thresholds before running the experiment.

Open decisions before implementation: the first app and session, permitted
full-session handling, model and inference region, session import interaction,
who can review knowledge, and the exact evaluation thresholds. None requires
changing the current UI just to review this brainstorm.

## Views

| Tab | Current behavior |
| --- | --- |
| Chat | Original AskPanel: real chat, History, New Chat, attachments, model/source controls, and Open as page. Opens by default and stays mounted while switching preview tabs. |
| Sessions | Full sample coding-agent conversations, including user messages, tool calls, and results. Each User message starts a container containing the subsequent agent and tool messages, with alternating gray and blue backgrounds. Search and filter by speaker. |
| Sources | Sample deployed code, documents, configuration, logs, and access information. Code uses the existing shared syntax highlighter. |
| Capture | Five sample processing stages with readable conversation/code previews, a redaction comparison, prompt sections, candidate decision cards, and validation checks. Original data remains inspectable. |
| Decisions | Sample choices, reasons, alternatives, constraints, evidence, code anchors, gaps, and review status. |

The four inspection tabs show **Sample data / UI only**. They do not import
sessions, run extraction, call models, save decisions, or change approvals.
Their controls only navigate and inspect the handwritten fixtures.
Sessions has no **Add session** button; importing is not connected in this preview.

The [private AWS Bedrock chat](byoc-bedrock-chat.md) uses the same Agent chat UI,
History, New Chat, and enlarged page. Its context is the app's job definition and
recent run evidence. Private app chat and Logs run chat have separate histories;
the four sample inspection tabs do not feed either model call. Private AWS
chat is enabled on private dev and live with the approved US Bedrock profile.

Capture keeps the existing five-step list and inspector. Each step's **Contents**
view presents its sample input or output in a readable format:

- **Read inputs:** conversation excerpts with a link to the full session, and
  complete source files with line numbers and syntax highlighting.
- **Normalize and redact:** preserved message IDs/speakers and a highlighted
  before/after comparison. The redaction example is explicitly a separate
  illustration; the sample conversation contains no secrets to remove.
  The message count is a compact, muted line with its explanation on hover;
  status metadata should not compete with the contents for space.
- **Build model input:** extraction instructions followed by the included
  conversation and source context.
- **Model response:** decision cards with the reason, alternatives, evidence,
  code anchor, and links to the existing conversation/source/decision inspectors.
- **Validate candidates:** sample counts, passed checks, and a decision awaiting
  builder review. These are fixture results, not executed validation.

**Original** retains each step's full sample data and **Metadata** retains its
processing flags. Nested evidence links use the existing Back navigation.
Resize, enlarge, breadcrumbs, and Minimize keep the shared inspector layout.

The inspector's **Metadata** tab shows the selected input's source, type, name,
usage, version, message count, and processing flags. These currently describe
the sample data; real ingestion is not connected.

Conversation message IDs (for example, `m1`, `m4`, and `m7` for the first sample's
User messages) are unique within their session. IDs and timestamps remain visible.
Turn containers keep their original boundaries and colors when search or speaker
filters hide messages. Messages preceding the first User ask form a separate group.

Preserve the existing chat composer, History, New Chat, and navigation when
extending this UI. Adding a view does not authorize removing an existing control.

## Shared presentation

- Answer source footers render as evidence tags. File and run tags open the
  existing source and run views; unfamiliar references stay visible as text.
- Inspectors and evidence panels expand beside the sidebar. Breadcrumbs remain
  visible, and Minimize restores the preceding panel size. Escape first minimizes
  an expanded panel, then closes the normal panel.
- `ExpandedPageFrame` in `packages/web/src/ui.jsx` supplies the existing chat
  page dimensions: 780px maximum content width and 24px padding. Chat and expanded
  inspectors use this same frame.
- `colorLine` in `packages/web/src/code.jsx` is the existing tokenizer shared by
  chat code blocks, file previews, and sample deployed source.
- `SourcePreview` in `packages/web/src/coaching/SourcePreview.jsx` shares the
  complete source viewer between Sources and Capture, including file selection,
  line numbers, anchor highlighting, and syntax colors.
- The enlarged chat page has a Minimize button returning to the app's Agent tab.
- Each sidebar app menu includes Share. It opens that app and its existing
  sharing popover, preserving editor controls and the viewer's read-only view.

## Environments

| URL | Behavior |
| --- | --- |
| https://small-cp.zeroshothq.workers.dev/apps | Existing Agent chat; the four inspection tabs are disabled. |
| https://small-cp-dev.zeroshothq.workers.dev/apps | All five tabs; the four inspection tabs contain sample data. |

Sign in on dev using the same work email used on live. Each host has its own
browser session. For example, Amazon apps require the Amazon login identity.

Dev serves a separate frontend for the existing app experience.
`packages/web/dev-worker.js` serves its own HTML and static assets, and forwards
authentication and existing app requests to `small-cp` through a service binding.
Existing chat and app actions use real shared data and the existing permissions.
The [AWS BYOC preview](byoc-aws.md) additionally handles `/api/byoc/*` with its own
connection-only D1 database and scoped AWS installer credentials. Customer job
data goes directly to AWS. Connected jobs appear in the existing Apps list and
sidebar and reuse the normal app Run and Logs views. Setup is inside Settings →
Connections. AWS Coaching is deferred; native apps retain the existing Agent UI.
This does not change the shared app database or add scheduled jobs.

The `VITE_COACHING_DEV=true` build flag enables the sample tabs. Default builds
leave them disabled. Keep them in dev until the user approves promotion to live.

## Deploy dev

For **customer-hosted AWS**, use the [private AWS dev deployment](byoc-dev.md#build-and-deploy).
It has its own test apps and data. The Cloudflare steps below apply to shared
Small dev and must not be used to host Amazon app data or credentials.

Every requested UI addition or change includes a dev build and deployment for
the user's visual review. Complete these steps before reporting the UI change
as done, then provide its dev page link. This applies even when the same request
also asks for a commit and push. A separate deployment request is unnecessary.

From `packages/web`, in PowerShell:

```powershell
$env:VITE_COACHING_DEV = 'true'
$env:VITE_BYOC_DEV = 'true'
npm run build -- --outDir dist-dev
Remove-Item Env:VITE_COACHING_DEV
Remove-Item Env:VITE_BYOC_DEV
npx wrangler deploy --config wrangler.dev.jsonc
```

Stop if the build fails. The separate `dist-dev` output leaves the live `dist`
artifact untouched. `wrangler.dev.jsonc` deploys only `small-cp-dev`; live deploys
continue using the existing control-plane configuration.
Keep both flags enabled for the dev build so a Coaching UI deployment also
preserves the approved AWS app integration. Default builds disable both previews.

## Release and verification

Private dev `0.1.0-dev.3` and live `0.1.0-pilot.6.2` enable the existing Logs and
Agent chat composers. Both reached `UPDATE_COMPLETE`; nine dev and eight live
browser scenarios passed. A real Bedrock answer used the synthetic dev run's
counts, a follow-up retained context, and app/run histories remained separate.
The live catalog advertises chat on drift, oof, and overreach. See
[activation evidence](byoc-bedrock-chat.md#activation-evidence-2026-09-11).
This activates operational chat, not session extraction or the proposed Coaching
evidence-search experiment. The entries below retain earlier release history.

Shared dev version `859bb0e8-a938-411f-8a81-a4ee5f5a4db3` preserves both preview
flags with private mode off. The new [private AWS dev installation](byoc-dev.md)
enables the same sample inspection tabs in its existing Agent tab, including when
Bedrock is not configured. Its separate build displays a DEV badge. Nine private
browser scenarios passed; no private AWS data or login is routed through shared dev.

Dev version `9e5b5eb6-1c72-40bc-9895-4266c3b4c251` adds the shared UI wiring for
[private AWS Agent chat with Bedrock](byoc-bedrock-chat.md). App chat keeps the
existing History, New Chat, source picker, Open as page, and Minimize chat.
Both preview flags remain enabled; private mode stays off on shared dev.
135 Python BYOC tests, 10 private template tests, and all eight private browser
scenarios passed. Independent review found no blocker. Private release
`0.1.0-pilot.6.1` was packaged locally; Amazon deployment and actual inference
then awaited the region choice. The shared dev deployment does not enable
Bedrock for hosted apps or send Amazon evidence through Cloudflare.

Dev version `f20958cd-0f09-431e-96ff-8a411b2ce2dc` includes the shared components
for [private AWS Logs chat with Bedrock](byoc-bedrock-chat.md). Existing hosted
chat remains available; private run chat is enabled by the AWS installation's
capability response. Both dev preview flags remain enabled and private mode is
off on shared dev. The private browser flow covers answers, follow-ups, History,
New Chat, enlarged runs, and switching runs without retaining the previous chat.
At that stage the Amazon update and real Bedrock answer awaited the region choice;
the later activation is recorded above.

Dev version `91767f6b-a02e-479a-b1dd-648689c68c23` reduces the normalization
status banner to one muted line, with the explanation on hover. The contents
retain their space and existing behavior. The dev build, focused Capture browser
check, and screenshot review passed; both preview flags remain enabled.

Dev version `336c2a48-facc-4db7-a356-4b641f30fde9` publishes the readable
Capture views and removes the disabled **Add session** button from Sessions.
The dev build and all five isolated browser scenarios passed, including evidence
navigation, preserved chat controls, and responsive inspector behavior. The
decision cards and redaction comparison were also reviewed in browser screenshots.
Both preview flags remain enabled; private mode is off. No production or private
AWS deployment was made for this UI change.

The Capture browser check uses the existing app route with synthetic API reads;
it blocks external requests and fails on unexpected requests, including writes
or model calls. After building dev with both preview flags, run from `packages/web`:

```powershell
npx playwright test --config playwright.coaching.config.js
```

It covers the five readable steps, Original/Metadata, evidence navigation,
existing Chat controls, and inspector resizing/enlarge/minimize at 320, 768,
1024, and 1440px. This is an isolated UI check, not a capture/extraction benchmark.

Dev version `38d10e97-19a5-42a9-971f-12f927ec99d2` publishes the shared UI
after adding S3 approval to the separate private AWS installation. Both preview
flags remain enabled and private mode is off on shared dev. Existing connection
controls and the hidden-when-idle S3 panel are preserved. The private AWS build
reuses that Settings panel and identifies its installed account; it is packaged
as `0.1.0-pilot.4`. See [the private S3 proof](byoc-aws.md#private-installation-s3-approval-milestone).
Both builds, the private Settings browser scenario, focused CLI/template/API
checks, and all 31 repository unit tests passed.

Dev version `c402091f-e052-4175-a82f-863378d01ce3` removes the static S3
approved-folder list from AWS connection settings. The section stays hidden
when idle; upgrade, approval, cancellation, and status/error UI remain.
The dev build and all 31 `make test-unit` checks passed. Both preview flags
remain enabled, private mode is off, and the Apps **Type** label is retained.

Dev version `9aee52fd-39da-46b3-9556-6376e743a01c` includes the Apps table
column rename from **Kind** to **Type**, including in `test-ws`. The build succeeded with
both preview flags enabled and private mode disabled. No production promotion.
The label was first deployed as `e4f1e091-4b47-47b7-8e6d-3c99fb4104da`;
this final build also contains the private AWS adapter fix, inactive on shared dev.

Dev version `aeff9ac6-03f3-4bd1-8ed9-f43bfd2ad732` publishes the shared components
for [configurable private AWS grants and uploads](byoc-aws-grants.md). Both
preview flags remain enabled and private mode remains off in shared dev. The
existing Settings approval and Run form are reused; private Cognito traffic
stays on the AWS installation. Six private browser scenarios and both builds
passed. No live Cloudflare promotion.

Dev version `57a96323-3d5f-4a67-b309-360991af744f` publishes the shared UI after
adding the [private Cognito installation mode](byoc-aws.md#private-installation-first-dashboard-milestone).
Both existing preview flags remain enabled; private mode is disabled on this
Cloudflare site, so its login/app flows remain hosted. The Amazon pilot has a
separate AWS URL and sends no Cognito sessions or workspace data to this preview.
The two web builds and focused adapter/auth tests pass. No production promotion.

Dev version `37a0ce41-779c-460a-96b9-655c5849e046` adds **Approve & deploy** and
**Cancel** inside the existing AWS connection settings. Older connections show
a one-time AWS upgrade; new requests appear while Settings stays open. The
`aws-s3-approval` sample app passed the real browser/CLI approval, CSV run, and
denied-folder proof. Both preview flags and prior UI remain intact. Details:
[AWS approval verification](byoc-aws.md#verification). No production or npm release.

Dev version `d1ee690c-1021-40f7-b184-e7a7ac802ce5` adds the
[S3 permission flow](byoc-aws.md#s3-access-acceptance) within the existing AWS
connection settings. Both preview flags stay enabled. The live sample app
`aws-s3-report` uses the shared sidebar, Run form, logs, and output download;
the browser proof passed. Coaching tabs and the existing connection controls
remain intact. No production UI or npm release was made.

The initial dev deployment on 2026-09-08 is version
`0d271549-04c1-4f73-b7fb-a42dbe24a7ec`. Its build succeeded and Wrangler confirmed
deployment. The user reviewed the dev app and approved committing the work.
The original deployment composed the approved UI with main `49c2a3d`; this change
brings that source and the deployment configuration onto main.

<!-- ponytail: browser and test-suite checks were skipped for the initial deployment at the user's request; commit verification is recorded below. -->

Before committing to main, `make test-unit` passed all 31 tests and
`npm run build` succeeded with the inspection flag off. The build reports the
existing large-chunk warnings. The sidebar Share shortcut was reviewed against
the existing navigation and sharing permission flow; no live shares were changed.

Commit `1270e70`, including the sidebar Share shortcut, was subsequently built
with the dev flag enabled and deployed as dev version
`8faca65f-b420-469d-a550-1282711d3afd`. Wrangler confirmed the deployment.

Conversation turn containers were built with the dev flag enabled and deployed
as dev version `52a64522-b2c2-497b-a02c-d6064bc1c209`. The build succeeded;
Wrangler confirmed deployment. Visual review is left to the user as requested.

The Details-to-Metadata label change was built successfully and deployed to dev
as version `09d5d4d3-4d03-4e8e-9b84-80a0f16a1d00`.

The AWS app integration was built with both dev flags and deployed as version
`f8d1a5fd-8465-438f-9c0c-e001b4003357`. The CPU job is available at
`/apps/aws-cpu-proof`; `/aws` redirects to Apps. AWS setup uses the existing
Settings → Connections flow.
The browser check exercised the shared AWS Run/Logs views and verified that a
native app still shows Chat, Sessions, Sources, Capture, and Decisions without
JavaScript page errors.

The AWS privacy tooltip and shared Settings row alignment were built with both
dev flags and deployed as version `6b6cbb42-be11-4d88-af03-9f1e7193ea1a`.
The existing tooltip helper now also opens when a contained control has focus.
Build and whitespace checks passed. The browser check could not launch because
Windows denied process creation; hover/focus and alignment remain for visual review.

The AWS **Connected** action and **Disconnect / Cancel** confirmation modal were
built and deployed as version `b752de5f-9b29-4506-a4a4-f76533ac79d9`. A subsequent
browser check passed for alignment, tooltip hover/focus, Cancel, confirmed
disconnect, and reconnect. Connection writes were stubbed during that check;
the real AWS app remains connected. Eight connection API tests and four web
adapter tests passed.

The multiple-app AWS release was built with both dev flags and deployed as
version `0b7d2218-1191-4edd-88b0-4bad5ba390f9`. One workspace connection now serves
`aws-cpu-proof` and `aws-word-count` in the normal sidebar and Run/Logs UI.
The browser proof verified the second app's actual run and output, preserved
the original app's output, and rejected record IDs used under the wrong app.
The five Coaching tabs and their dev-only inspection behavior are unchanged.

The customer AWS account setup was built with both dev flags and deployed as
version `4b948ace-3d68-43f2-b7f0-d4cdb19e6c28`. Settings → Connections → AWS accepts
a customer account ID and explains approval in AWS followed by verification in
Small. Browser checks passed for the simulated onboarding flow and the existing
connection controls; real reads confirmed both AWS apps still work. A live
installation in a second account remains for its account owner to approve.

Dev version `1a89d7d0-e42a-4cd5-8538-50e24fe12c42` removes the duplicate AWS
installation link. One button opens AWS, with a current-tab fallback when popups
are blocked. Both dev flags were enabled; build and focused browser checks passed.

The CLI workspace follow-up required a separately approved authentication fix in
the shared backend. `small-cp` version `2323101b-89d0-4691-917a-6c567debbd4d`
resolves CLI workspace membership through the existing browser resolver. The
deployment preserved the live frontend assets: no changed assets uploaded, and
all 133 files matched afterward. Dev remains on the version above; AWS/Coaching
preview UI and the updated CLI/skill remain dev-only, with npm publication held.

Dev version `f765560a-87ef-4dbd-a242-175976948644` adds the shared run-log
controls: copy the complete run ID or copy an authenticated run link beside Open
as page. The production build and live worker remain unchanged.

Dev version `958c27d7-8e95-487e-9f9d-600afbe5652d` moves the run-ID and log-link
copy confirmations directly beneath the clicked icons. The shared live worker
was subsequently promoted with explicit approval as version
`ccf915cc-64fa-4236-b06c-eb497e96ecb8`; live `/apps` served the updated
bundle and anonymous `/api/apps` remained `401`.
