# Coaching benchmark: first real-excerpt pilot

Generated 2026-09-10T18:12:40+00:00. **Provisional automated evaluation.**

**Highest strict answer score: session, 26/30.** The same thirty questions were asked under three context conditions (ninety answers). This measures answers about historical work, not successful user tasks or the live Chat UI.

| Context | Strict passes | Required facts covered | Answers with unsupported claims | Citation failures | Median request time | Answer cost estimate |
| --- | --- | --- | --- | --- | --- | --- |
| sources | 16/30 (53.3%) | 46/60 (76.7%) | 1/30 | 4/30 | 8.6s | $0.7876 |
| session | 26/30 (86.7%) | 59/60 (98.3%) | 0/30 | 3/30 | 7.67s | $0.9387 |
| records | 22/30 (73.3%) | 54/60 (90.0%) | 2/30 | 1/30 | 7.61s | $0.8419 |

Strict pass = every required criterion met, no forbidden or unsupported factual claim, and valid supporting citations. A missing/truncated/malformed answer or missing grade fails. Citation failures combine local reference validation and model-judged semantic support.

## What this suggests for Coaching

For this pilot, sources plus authorized conversation excerpts performed best. Extracted records helped over sources alone, but did not preserve everything needed to coach the next person. Keep the authorized original evidence accessible alongside decision records in the next prototype. Records plus retrieval of relevant excerpts is the next comparison to test; this run did not evaluate that combination.

The failure rows show specific information lost or mishandled:

- [Memory observations](#s01-q3-memory-observation): records preserved the 512MB failure but omitted that the page loaded before upload/inference failed.
- [Credential probe](#s02-q4-scope-proof): the session preserved the reported own-app 200 / other-app 403 test result; records did not.
- [CLI-only scope](#s05-q1-cli-scope): the user correction was available to the Session arm but its candidate was discarded for lacking a valid code anchor.
- [Unknown rationale](#s03-q3-overwrite-handling): a Records answer supplied a plausible reason for preserving an existing file even though no reason had been recorded.

Improve capture of operational evidence and corrections, preserve explicit unknowns, and fix structured-answer reliability. Evaluate those changes on independent sessions with human review before treating the current scores as a product claim.

### Exploratory content-only check

Eight answers did not produce valid JSON. They remain failures in the primary score above. After observing this format problem, an exploratory score was added: the judge also reads the original unparsed text and checks the same factual rubric and semantic citation support, while ignoring JSON syntax and local machine-citation validation. This is not a replacement primary metric.

| Arm | Rubric-only passes | Valid answer JSON | Input tokens for 30 answers |
| --- | --- | --- | --- |
| sources | 20/30 (66.7%) | 26/30 | 287552 |
| session | 29/30 (96.7%) | 27/30 | 381560 |
| records | 23/30 (76.7%) | 29/30 | 330644 |

## What ran

- **Sources:** selected code and available relevant documentation at the episode's final commit.
- **Session:** exactly those sources plus the selected visible conversation messages.
- **Records:** exactly those sources plus extracted candidates that passed structural anchor/evidence validation. These were not builder-approved or published to an app.
- Requested model: `claude-sonnet-5`. Models reported for the ninety answers: `claude-sonnet-5`.
- Adaptive thinking, high effort; 4096 total output tokens per answer. Identical answer prompt/settings and fresh contexts. No tools, retrieval, chat history, actions, or app API calls.
- Entire selected inputs fit the context window; no token-budget truncation. Input token counts can differ because added context is the variable being tested.
- Labels and questions frozen before inference. Same model grades the three anonymized answers against the original evidence in deterministic shuffled order; arm names are withheld, although content can reveal an arm.
- Original API judges used the provider's JSON-schema output format. Subscription completion requested JSON through the prompt, as did capture/answer calls. Local checks require one valid grade per answer/candidate; valid JSON alone is insufficient. No answer was repaired or regenerated.
- Completed answer grades: 90/90; capture audits: 5/5.
- Corpus SHA256: `fb3acaaeed9d448fe436f27072ad5e334bd3af784be4ec1f57ee4620ca21bfd6`.
- [Frozen corpus](../../tests/evals/coaching/results/2026-09-10-real-excerpts/corpus.json), [run manifest](../../tests/evals/coaching/results/2026-09-10-real-excerpts/manifest.json), [machine-readable scores](../../tests/evals/coaching/results/2026-09-10-real-excerpts/summary.json), [raw requests/responses](../../tests/evals/coaching/results/2026-09-10-real-excerpts/calls).

## Corpus and per-episode results

**Five excerpts from one real Claude Code session, not five independent sessions.** 38 selected visible user/assistant messages; one repository and one builder. Selection excludes unrelated discussion, raw tool payloads and hidden thinking. The session arm is the complete selected excerpt, not the original full conversation. The corpus records source message IDs, transcript line numbers, text hashes, timestamps and code hashes. No customer AWS source/logs/inputs were used.

| Episode | Snapshot | Sources | Session | Records |
| --- | --- | --- | --- | --- |
| s01: WebSocket guard and Gradio memory | `a1bcdd6` | 2/6 | 5/6 | 4/6 |
| s02: Scoped deploy credential fallback | `f9026a7` | 2/6 | 6/6 | 5/6 |
| s03: Automatic small init | `2649258` | 5/6 | 6/6 | 5/6 |
| s04: Deploy provenance and deferred UI | `c0c25e6` | 6/6 | 5/6 | 6/6 |
| s05: Job inputs with CLI-only scope | `d8a36d6` | 1/6 | 4/6 | 2/6 |

Documentation was not withheld to make the baseline weaker. Some historical source comments and specs already contain the reasoning. These are task/component slices of Small, not five deployed customer apps.

## Paired comparisons

| Treatment vs control | Both pass | Treatment only | Control only | Both fail | Lift |
| --- | --- | --- | --- | --- | --- |
| session_vs_sources | 15 | 11 | 1 | 3 | +33.3 pp |
| records_vs_sources | 15 | 7 | 1 | 7 | +20.0 pp |
| records_vs_session | 20 | 2 | 6 | 2 | -13.3 pp |

These are descriptive paired counts. Thirty related questions from one session do not support an independence-based significance claim. No McNemar p-value or population confidence interval is claimed.

## Capture

Reference decisions and answer rubrics were authored by the coding assistant before inference. They are not independently annotated human gold. Recall means coverage of this frozen reference list. Precision means choices the automated audit confirms in the source with structurally valid code anchors; unanchored predictions are false positives and valid additional choices are allowed.

| Episode | Supported choices / predictions | Reference decisions recovered | Stated reasons unsupported | Unknown reasons recovered | Retained after structural checks |
| --- | --- | --- | --- | --- | --- |
| s01 | 6/6 | 2/4 | 0/1 | 0/2 | 6/6 |
| s02 | 7/7 | 3/4 | 0/7 | 0/1 | 5/7 |
| s03 | 6/7 | 4/4 | 2/4 | 1/1 | 6/7 |
| s04 | 5/7 | 3/4 | 3/7 | 0/1 | 5/7 |
| s05 | 6/8 | 2/4 | 2/2 | 2/2 | 6/8 |

Pooled supported-choice precision: **30/35 (85.7%)**. Reference coverage: **14/20 (70.0%)**.
Reason fidelity on matched, reason-bearing references: 2.20/3 across 10 matches.
Reference alternatives recovered: 4/6 (66.7%). Unknown-reason gaps recovered: 3/7 (42.9%).
Unsupported stated reasons: 7/21 (33.3%). Proposed 90% precision gate: missed; 80% reference-coverage gate: missed.

A structural pass checks that a code/config line range exists and quoted evidence is an exact substring of a selected message. It cannot prove the reason is true or the anchor semantically relevant. Semantic support is judged separately. No human approval, annotation agreement, or review-time measurement occurred.

Rejected candidates:
- s02/d3: invalid_evidence.
- s02/d4: invalid_evidence.
- s03/d6: invalid_anchor.
- s04/d1: invalid_anchor.
- s04/d5: invalid_anchor.
- s05/d1: invalid_anchor.
- s05/d7: invalid_anchor.

## Cost and execution

Original metered API run only; subscription usage is separated below.

| Stage | API calls | Input tokens | Output tokens, including thinking | API cost estimate | Median request time |
| --- | --- | --- | --- | --- | --- |
| capture | 5 | 63879 | 16110 | $0.2889 | 22.13s |
| answer | 90 | 999756 | 56862 | $2.5681 | 8.03s |
| judge-capture | 5 | 76833 | 22275 | $0.3764 | 41.36s |
| judge-answer | 30 | 1405824 | 98882 | $3.8005 | 35.49s |

**Metered API estimate: $7.0339 across 130 calls.** There are 139 saved call artifacts including subscription attempts; 0 calls have unknown usage. [Provider pricing](https://platform.claude.com/docs/en/models/sonnet-5/whats-new-sonnet-5): $2/M input and $10/M output; cache write/read rates are included if reported. Estimates use actual provider token counts, not invoice data. Answer costs exclude one-time capture; evaluation judges are not a product-serving cost. Timings are per HTTP request on this machine with up to four requests in flight, not UI end-to-end latency.

Provider stop reasons: `{"end_turn": 131, "error": 4, "max_tokens": 4}`.

### Subscription switch

The initial API run had already completed when the user requested their subscription. Its estimated metered API cost was **$7.0339**. The 9 additional grading attempts used the verified Claude Code Max login with API-key/provider environment overrides removed, safe mode, tools disabled, and no API-key fallback. Claude Code reported $2.0286 in API-equivalent usage; that value describes tokens consumed through the subscription and is not an additional API invoice.

CLI-reported usage, including auxiliary calls: 290764 uncached input tokens, 220821 cache-write tokens, 0 cache-read tokens, and 27632 output tokens. Claude Code also reported auxiliary model usage for `claude-haiku-4-5-20251001`. The answer comparison itself used Sonnet 5 throughout. CLI timings include its wrapper overhead, with at most two CLI processes in flight.

Four original graders hit their 6000-token output cap; a fifth returned JSON that omitted two answer grades. The replacements used the same saved evidence, rubrics and answers through Claude Code, with a 12000-token grading cap. The first subscription attempts failed Claude Code's structured-output tool flow with tools disabled; the next attempts requested ordinary JSON text. Every attempt remains in the artifacts and usage totals. Only grading changed; none of the ninety answers was regenerated. [Selected-grade audit](../../tests/evals/coaching/results/2026-09-10-real-excerpts/grade-selections.json), [switch record](../../tests/evals/coaching/results/2026-09-10-real-excerpts/subscription-switch.json). Future runs default to the subscription.

## Question-level results and failure explanations

Each question was generated from the preselected episode before seeing model outputs. Failures below retain the automated judge's assessment so a human can challenge it.

### s01-q1: websocket reason

Why was a WebSocket path added instead of keeping all requests on the existing HTTP proxy?

| Arm | Result | Reason for failure |
| --- | --- | --- |
| sources | FAIL | Second required element (raw bidirectional tunneling described) is satisfied, but the answer never mentions Gradio/Streamlit opening a socket after page load — the specific historical reason is omitted; the answer only gives a generic technical explanation of why buffered proxying can't support websockets. This is likely because m960 (the message stating the Gradio/Streamlit reason) was not included in this answer's available context, but the omission still means the required criterion is unmet. No forbidden claims made, and the cited code/test lines do support the claims that are made. |
| session | PASS | — |
| records | PASS | — |

### s01-q2: upgrade safety

I want to accept Upgrade: websocket before checking X-Small-Proxy. Is that consistent with the builder's requirement?

| Arm | Result | Reason for failure |
| --- | --- | --- |
| sources | PASS | — |
| session | PASS | — |
| records | PASS | — |

### s01-q3: memory observation

What actually happened when the builder tried 512MB and 1024MB for the Gradio app?

| Arm | Result | Reason for failure |
| --- | --- | --- |
| sources | FAIL | The answer's provided context lacks the message log (m1427/m1436/m1446/m1514) documenting the 512MB/1024MB trials, so it declines to report them, stating no such record exists in view. This is honest given its context but fails to supply the required facts about the 512MB page-load/OOM and 1024MB success. |
| session | PASS | — |
| records | FAIL | Correctly reports the 512MB OOM (code 137, oom_score_adj:0) and the 1024MB floor without overclaiming universality, and citation matches m1446. However, it never mentions that the Gradio page still loaded at 512MB before the upload/inference failed — that detail from the required criterion is omitted. |

### s01-q4: memory choice

The config says 2GB, but was 2GB the smallest memory that worked? Why did it end up at 2GB?

| Arm | Result | Reason for failure |
| --- | --- | --- |
| sources | FAIL | Given context lacked the memory-floor test messages/decisions, so the answer cannot report the observed 1024MB floor or explain the restoration to 2GB per user spec; it honestly admits ignorance but fails both required criteria. No fabricated claims; citation to small.toml supports the config values it does discuss. |
| session | PASS | — |
| records | PASS | — |

### s01-q5: unknown buffer

Why exactly is the pump buffer 65536 bytes? Did the builder benchmark that size against smaller buffers?

| Arm | Result | Reason for failure |
| --- | --- | --- |
| sources | PASS | — |
| session | PASS | — |
| records | PASS | — |

### s01-q6: regression guidance

I am changing the guard's WebSocket handling. What existing behavior should I preserve and what test should I run?

| Arm | Result | Reason for failure |
| --- | --- | --- |
| sources | FAIL | missing, malformed, or truncated answer missing_citation Correctly describes preserving the secret check ahead of WS handling and bidirectional pump forwarding, and points to the same stdlib echo/handshake test with the 403 case. Stays within the code-only context available to it without inventing history. Citations match sources. |
| session | FAIL | missing, malformed, or truncated answer missing_citation Accurately preserves the secret-check-before-tunneling requirement, cites bidirectional pump threads, and correctly describes the stdlib echo/handshake test plus the 403-without-header check. Explicitly flags the reported pass in m1514 as agent-reported rather than independently verified. Citations match sources. |
| records | FAIL | missing, malformed, or truncated answer missing_citation Correctly identifies the secret-check-before-tunneling ordering, the pump-thread bidirectional forwarding, and the stdlib-only handshake/echo test with the 403-without-header regression check. Citations to decisions and code line ranges are accurate. |

### s02-q1: credential reason

What specific problem triggered moving org-wide Fly credentials out of the CLI?

| Arm | Result | Reason for failure |
| --- | --- | --- |
| sources | FAIL | This answer's available_context lacked the messages array (only had code sources), so it could not access m1812's stated rationale. It honestly states it cannot find the specific triggering incident/problem in the available evidence, rather than fabricating one. This means it fails to state the specific problem (any authenticated user gets org-wide credentials) and fails to connect to the second-user urgency, since neither is discoverable from the code alone. It does not violate forbidden claims (no false 'speed' claim, no false claim CLI still gets org token). Its claims about the code are accurate and supported. |
| session | PASS | — |
| records | PASS | — |

### s02-q2: primary versus fallback

Did this snapshot implement the proposed Worker-only tarball build? If not, why and what shipped?

| Arm | Result | Reason for failure |
| --- | --- | --- |
| sources | FAIL | missing, malformed, or truncated answer missing_citation Uses only code context (no decisions/messages available), but accurately quotes the code comment for the tarball/BuildKit rationale and correctly describes that flyctl remains in use via the CLI with a scoped token. No fabricated claims; the 'docs/v3' remark is flagged as absent from the snapshot, not asserted as fact. |
| session | PASS | — |
| records | PASS | — |

### s02-q3: credential debugging

Minting a limited deploy token fails with a dashboard org token. Did the builder already encounter this, and what worked?

| Arm | Result | Reason for failure |
| --- | --- | --- |
| sources | FAIL | Available context for this answer contained no message history, only code, so it correctly avoided fabricating; but it therefore fails to report the earlier org-token failures and fails to identify the user auth token as the working credential (both required criteria unmet). No forbidden claims made and no fabricated history; speculative note about scope failure is explicitly conditional, not stated as fact. Citations accurately support what is claimed about the code. |
| session | PASS | — |
| records | PASS | — |

### s02-q4: scope proof

What did the session report as evidence that the temporary token was limited to one app?

| Arm | Result | Reason for failure |
| --- | --- | --- |
| sources | FAIL | Available context here is code-only (no messages/decisions), so the answer has no access to m2004/m2077 and correctly states no test/observation is present in the snapshot. This honest admission means it does not identify the 200/403 result or describe it as the historical probe, failing both required criteria, though the code citation does support what it does claim (design intent only). |
| session | PASS | — |
| records | FAIL | Available context (decisions + evidence quotes only) does not contain the 200/403 spike result (m2004) or the full m2077 text reporting it. The answer honestly states no such test is recorded in its context, but this means it fails to identify the own-app 200 / other-app 403 evidence and cannot describe it as the historical probe, since it denies its existence. Citations used (d2, d7, m1812, m2077 quote, code) accurately reflect what's in the decision records, so citation_support holds for what is actually claimed. |

### s02-q5: expiry unknown

Why one hour rather than thirty minutes for the deploy token? Is there a recorded experiment choosing that duration?

| Arm | Result | Reason for failure |
| --- | --- | --- |
| sources | PASS | — |
| session | PASS | — |
| records | PASS | — |

### s02-q6: change guardrail

To simplify the fallback, can I return the Worker's org token if scoped-token minting fails?

| Arm | Result | Reason for failure |
| --- | --- | --- |
| sources | PASS | — |
| session | PASS | — |
| records | PASS | — |

### s03-q1: init purpose

What user problem was small init meant to solve, and why does deploy invoke it automatically?

| Arm | Result | Reason for failure |
| --- | --- | --- |
| sources | PASS | — |
| session | PASS | — |
| records | PASS | — |

### s03-q2: secret discovery

How were the initial required secret names discovered? Does it inspect every Python file?

| Arm | Result | Reason for failure |
| --- | --- | --- |
| sources | PASS | — |
| session | PASS | — |
| records | PASS | — |

### s03-q3: overwrite handling

Running init again does not refresh my existing small.toml. Is that a bug, and how do I deliberately regenerate it?

| Arm | Result | Reason for failure |
| --- | --- | --- |
| sources | PASS | — |
| session | PASS | — |
| records | FAIL | Correctly identifies the existing-file check, exit 0, and --force as the overwrite path, with accurate citations to init.js, d2, and SKILL.md. However, it asserts 'user safety (avoiding accidental loss of manual edits)' as if it were the recorded reason for the decision, when decision d2's reason field is null and no rationale beyond the constraint text is actually recorded — this is an invented historical rationale presented as fact rather than clearly flagged as speculation. |

### s03-q4: missing entry

Init cannot find an entry. What should I expect it to write, how does it exit, and what do I do next?

| Arm | Result | Reason for failure |
| --- | --- | --- |
| sources | PASS | — |
| session | PASS | — |
| records | PASS | — |

### s03-q5: release state

At the end of this episode, could a fresh global npm install already use small init?

| Arm | Result | Reason for failure |
| --- | --- | --- |
| sources | FAIL | This answer's available_context omitted the messages/decisions revealing that npm was still at 0.0.4 and needed a manual publish (m2211/d7), so it could not state that specific fact and instead says the publish status is 'not recorded here.' This fails the first required criterion (explicit statement that npm was still 0.0.4 and needed publish), though it does correctly distinguish code-in-repo from published-package availability. It avoids fabricating a false claim of publication, so no forbidden claim is made, and its citations (code showing the feature exists, SKILL.md npm install line) do support what it actually asserts. |
| session | PASS | — |
| records | PASS | — |

### s03-q6: unknown overwrite reason

Was the no-overwrite default chosen because the builder had already lost a config file?

| Arm | Result | Reason for failure |
| --- | --- | --- |
| sources | PASS | — |
| session | PASS | — |
| records | PASS | — |

### s04-q1: provenance purpose

Why record a deploy's commit SHA and dirty flag instead of simply showing the repository's main branch?

| Arm | Result | Reason for failure |
| --- | --- | --- |
| sources | PASS | — |
| session | PASS | — |
| records | PASS | — |

### s04-q2: ui scope correction

The initial request described a Deploys tab and commits-behind label. Did this episode ship those?

| Arm | Result | Reason for failure |
| --- | --- | --- |
| sources | PASS | — |
| session | PASS | — |
| records | PASS | — |

### s04-q3: visibility

Does a 404 from the unauthenticated GitHub repository lookup prove a repository is private? Should we save a GitHub token to fix that?

| Arm | Result | Reason for failure |
| --- | --- | --- |
| sources | PASS | — |
| session | PASS | — |
| records | PASS | — |

### s04-q4: stale provenance

A previously git-backed app is now deployed from a folder outside git. Should its old repo metadata stay on the app?

| Arm | Result | Reason for failure |
| --- | --- | --- |
| sources | PASS | — |
| session | PASS | — |
| records | PASS | — |

### s04-q5: migration observation

Why was the deployed_at ALTER removed from migration 0003 during this episode? Is that evidence that every fresh database already has it?

| Arm | Result | Reason for failure |
| --- | --- | --- |
| sources | PASS | — |
| session | FAIL | missing, malformed, or truncated answer missing_citation Uses m5142 and the migration comment to correctly explain the duplicate-column reasoning and explicitly denies generalizing to every fresh database. Response text is oddly duplicated (a narrative answer followed by an embedded JSON restatement) but content is consistent and not contradictory; no unsupported factual claims. |
| records | PASS | — |

### s04-q6: exact interval unknown

Was the proposed hourly drift cache based on a measured GitHub rate-limit study?

| Arm | Result | Reason for failure |
| --- | --- | --- |
| sources | PASS | — |
| session | PASS | — |
| records | PASS | — |

### s05-q1: cli scope

Was the full job-inputs feature ready after this episode, including runtime and control-plane file handling?

| Arm | Result | Reason for failure |
| --- | --- | --- |
| sources | FAIL | States only the CLI half was implemented and correctly identifies runtime/control-plane as pending (citing docs and code), but never mentions or explains the user's explicit 'cli part only' correction (m5673), so the first clause of the second required criterion is not satisfied. |
| session | PASS | — |
| records | FAIL | Correctly states only the CLI half shipped and cites decisions/docs showing runtime/control-plane as pending, but omits any explanation of the user's explicit CLI-only correction (m5673), so the required criterion is only partially met. |

### s05-q2: threshold validation

My threshold is 2 but the schema's maximum is 1. Should I upload the photo and let the job reject it?

| Arm | Result | Reason for failure |
| --- | --- | --- |
| sources | FAIL | missing, malformed, or truncated answer missing_citation Correctly identifies that CLI-side validate() runs before size cap and before /api/runs is called, matching docs and code line ranges cited. |
| session | FAIL | missing, malformed, or truncated answer missing_citation Correct core claim and citations; cites m5670 (a pre-implementation status message) alongside m5887 to support the 'control-plane/runtime still pending' claim, which is a slightly loose citation choice but not factually wrong given m5887 and the docs also confirm pending status. |
| records | PASS | — |

### s05-q3: input types

Can I add an input with type csv or multiselect to this version?

| Arm | Result | Reason for failure |
| --- | --- | --- |
| sources | FAIL | missing, malformed, or truncated answer missing_citation Satisfies req1 (six types identified, rejection explained) and req2 (recommends type=file for CSV-like input and correctly notes multiselect was deliberately deferred per docs). No unsupported historical claims; the file/text workaround suggestions are clearly qualified as advice, not asserted history. Citations to job-inputs.md and inputs.js accurately support the central factual claims. |
| session | FAIL | Correctly identifies the six types and confirms rejection at init/deploy (req1 satisfied). For the CSV workaround it recommends using type=text with a pattern rather than type=file with accept filtering, and while it does explain multiselect deferral, the CSV portion doesn't match the required file+accept explanation, so req2 fails. No fabricated historical claims; suggestion is clearly qualified as advice. Citations (inputs.js, small.js, job-inputs.md, m5646, m5831) accurately support the six-type enforcement and multiselect-skip claims. |
| records | FAIL | Correctly identifies the six types and rejection (req1 satisfied), and correctly explains multiselect deferral via decision d2 and the doc's Skipped section. However for CSV it suggests using type=text with pattern-parsing rather than type=file with accept filtering, so req2 (which requires the file+accept explanation) is not fully satisfied. No unsupported historical claims — advice is clearly conditional. Citations (inputs.js, decision d2, job-inputs.md) accurately support the stated facts. |

### s05-q4: wire contract

What does the CLI send for a file input, and what does it send when there are only scalars?

| Arm | Result | Reason for failure |
| --- | --- | --- |
| sources | FAIL | Correctly describes both the multipart file case and the plain-JSON scalar-only case with accurate citations, but never states that the control-plane multipart parsing was pending/unimplemented at this snapshot, so the second required element is not satisfied. |
| session | PASS | — |
| records | FAIL | Correctly describes the multipart file case and the plain-JSON scalar-only case with supporting citations, but omits any statement that the control-plane multipart parsing was pending at this snapshot, so the second required element is not satisfied. |

### s05-q5: 100mb unknown

Why exactly is the file cap 100MB? Was that an established R2 service limit?

| Arm | Result | Reason for failure |
| --- | --- | --- |
| sources | FAIL | Correctly identifies the 100MB cap as a client-side, pre-upload, deliberately simple/temporary limit and correctly states no R2-limit rationale is recorded. Adds an uncited general claim about R2's real capacity (not grounded in the available evidence) as supporting color; doesn't affect the core criteria or trigger the forbidden claim. |
| session | PASS | — |
| records | FAIL | Uses decision d4 (with its 'for now' evidence quote) to correctly identify the cap as a temporary, pre-upload limit, and correctly states no R2-limit or benchmark rationale is recorded. Includes an uncited aside about R2's real capacity that isn't sourced from the evidence given, though it doesn't create the forbidden claim. |

### s05-q6: handoff next step

The local input checks pass but a file-input run hits a JSON parse error. What should the next builder investigate first?

| Arm | Result | Reason for failure |
| --- | --- | --- |
| sources | PASS | — |
| session | PASS | — |
| records | PASS | — |

## Limitations and next decision

- This evaluates context strategies with one model; it does not select the best model/provider or prove the existing production extraction/Chat path works.
- One builder, one project, one source session, hand-selected excerpts, one answer per arm/question. No independent human gold, blinded human scoring, repeated-seed stability, or generalization claim.
- The same model extracts, answers and judges. Arm names were hidden, but the judge may infer them from citations and context. Human review of the disagreements remains necessary.
- No real builder approval, permission/tenant isolation, malicious-session stress test, secret-leak guarantee, anchor durability sweep, user task completion, or colleague time-saving study was run (`ponytail:`).
- A rules-based redactor and outbound check ran on the selected material. Absence of a match is not proof that arbitrary private sessions are safe to upload.
- Extraction is lossy: changes in score can reflect omitted observations, unanchored facts, candidate selection, or answer variance. Inspect the question rows before choosing a production design.

Use this pilot to choose the next comparison, not to publish a broad performance claim. Keep the full authorized evidence available during development; promote structured memory only when its measured answers preserve the information colleagues need. A later experiment can test records plus targeted retrieval of authorized excerpts, followed by a user/colleague task study.

## Reproduce

```powershell
python -m pytest tests/evals/coaching/test_bench.py -q -p no:cacheprovider
python tests/evals/coaching/bench.py --dry-run
# Uses the installed Claude Code subscription login; API credentials are not inherited.
python tests/evals/coaching/bench.py --run-dir tests/evals/coaching/results/new-run --phase all
python tests/evals/coaching/bench.py --run-dir tests/evals/coaching/results/2026-09-10-real-excerpts --phase report
```

`--phase report` uses saved responses only and needs no API key/network. Resuming a run reuses a response only if its exact request hash matches; changed corpus/settings require a new directory. Failed responses are retained. Explicit `--phase finish-grading` records replacement grades through the subscription with an audit map; it never replaces answers.
