# Standalone Curriculum API experiment — 2026-09-16

Status: implemented and exercised locally; not integrated into the app. The saved
course was not modified. [Actual returned outline](curriculum-outline-generated.md).

Latest follow-up: [refined response](curriculum-outline-refined.md), with the
three targeted corrections reviewed below. The earlier response is retained.
The subsequent [response with illustrative examples](curriculum-outline-with-examples.md)
is also retained, with its separate review at the end of this report.

## Inputs and method

- Existing brief: conceptual learners, new to the topic, understand the principles
  and run the app, 20 minutes.
- General clarification: explain the underlying method and necessary foundations;
  propose scope for approval rather than silently removing it to fit the clock.
- Minimal app description already supplied in the conversation: one-image
  YOLOv8n CPU job, confidence input, annotated image and label/confidence JSON.
- Public reference notes from [Ultralytics YOLOv8 documentation](https://docs.ultralytics.com/models/yolov8/).
- No raw app source, runbook, sessions, images, logs, credentials, account IDs, or
  actual bucket paths were transmitted. Automatic approval review rejected the
  original runbook payload; the reduced payload was subsequently approved.
- Signed-in Claude Max subscription via Claude Code, with tools, customizations,
  and session persistence disabled. One generation call per API request. This is
  prompt refinement, not model-weight fine-tuning or a hosted subscription service.

## What happened

The first generic request produced a structurally valid conceptual outline. Two
subsequent requests included explicitly named owner topics; one failed without
retained diagnostics, and the next failed because it exceeded the small bullet
and scope-note count limits. Those requests are not evidence of automatic topic
discovery. The owner clarified that no particular algorithm is mandatory.

The final prompt remains domain-independent: identify the core method, work
backward to necessary knowledge, and choose the shortest explanatory path suited
to the audience. It does not prescribe any named algorithms. The final input
contains no desired syllabus or mandatory topic list. Small formatting overruns
no longer discard otherwise valid outlines.

Final real HTTP call: **200**, **46.594 seconds**, main response model
**claude-opus-5**. It produced four modules and eight lessons. CLI telemetry also
reported a small auxiliary Haiku call; model usage is now retained separately
rather than labelling the answer with the first model key. These telemetry cost
estimates are not a claim about subscription billing.

The response includes classification, image representations, convolutional
features, multi-scale features, the detection head, post-processing, pretrained
weights, and the application. It chose not to include logistic regression and
flagged the duration as needing more time.

## Review before any app integration

This is a scope candidate, not an approved curriculum. Remaining issues:

- Training and learned weights appear after architecture; review whether a
  beginner needs an earlier introduction to learned parameters and inference.
- Calling confidence threshold an "accuracy dial" is misleading: it controls
  filtering and error tradeoffs, not measured accuracy directly.
- "Location information is not persisted" must be scoped to boxes.json. The
  annotated image still retains visual location information. "Only record"
  also exceeds the evidence available in a partial app description.
- The architectural/preprocessing topics describe the standard model family;
  deployment-specific settings were not inspected in this experiment.

Six focused tests passed: authorization/origin/size checks, request forwarding
and structured response, duration conflicts, provider/validation failure recovery,
one-call concurrency, rejection of lesson-delivery content, and tolerance of a
minor presentation overrun (some tests cover more than one condition). Syntax
checks passed. Tests use a scheduling fixture for contract checks; they do not
prove curriculum quality across domains. Only one subject received real model
evaluation, and the owner has not yet approved its scope.

Reproduce with the commands and request contract in
[Curriculum Agent](../features/curriculum-agent.md#standalone-outline-experiment-not-connected-to-the-app).

## Targeted prompt refinement and repeat run

The owner requested fixes for ordering, imprecise descriptions of controls, and
claims extending beyond an output's evidence. Only general prompt rules changed:

1. Introduce a mechanism's necessary concepts and parameter meanings before its
   architectural organization; inspect prerequisites at topic level.
2. Distinguish the operation a control directly changes from possible downstream
   effects, and avoid guaranteed improvements or misleading outcome metaphors.
3. Scope claims to the evidenced artifact/operation and representation. Missing
   fields in one file do not establish system-wide absence. Uncertainty must
   qualify the actual assertion, not just appear in separate notes.

The same call checks these conditions before returning. No separate judge was
added, and no algorithm, curriculum unit, app identifier, or file name was added
to the general prompt. The runner also saves the exact system prompt in its JSON
artifact for reproducibility.

Repeat call: HTTP **200**, **53.758 seconds**, main model **claude-opus-5** using
the same subscription adapter. Four modules, eight lessons. Deep equality of
the before/after request inputs passed; the topic list was not supplied. The six
focused API tests and JavaScript syntax checks passed.

Manual review of the actual response against the three observed regressions:

| Criterion | Earlier response | Repeat response | Result |
|---|---|---|---|
| Necessary foundations precede architecture | Learned weights and training/inference in Module 3, after architecture in Module 2 | Module 1 explains learned parameters and training/inference; architectural components appear in Module 3 | Corrected in this sample |
| Control described by direct operation | Threshold called an accuracy dial | Threshold directly filters candidates; downstream error effects vary by image and are not guaranteed improvements | Corrected in this sample |
| Missing information scoped to its output | Location not persisted; image called the only record | Positions visible in annotated.jpg; coordinate-field absence explicitly limited to boxes.json | Corrected in this sample |

The duration remains flagged as needing more time. The exact returned prose is
saved unchanged in the linked Markdown file, including remaining weaknesses:
it broadly says models need fixed input shapes, and assumes an ability to run
a job even though running the app is part of the course goal. Those statements
need review; passing the three targeted checks is not an endorsement of every
claim or proof of generalization. This is one repeat sample on one app, not a
blinded benchmark or measured learning outcome. No app integration or deployment
was performed.

## Adding varied input/output examples

The owner requested examples spanning subjects, goals, and time constraints.
Four authored synthetic examples were added to the runtime system prompt:

| Subject | Learner and goal | Time | Scope decision illustrated |
|---|---|---|---|
| Sensor smoothing | Beginner interpreting averages | 20 minutes | Arithmetic foundations; omit general filter-design theory |
| Same sensor viewer | Experienced signal-processing engineer using the viewer | 10 minutes | Skip known foundations; focus on the relevant application behavior |
| Shortest-path planning | Beginner explaining the algorithm and its correctness | 20 minutes | Flag the depth/time conflict rather than remove prerequisites |
| Document search | Writer interpreting semantic matches | 30 minutes | Qualitative overview; training and architecture unnecessary for this stated goal |

Examples are labelled illustrative, not mandatory syllabuses or measured course
durations. None covers computer vision. The prompt explicitly says to generalize
the scope decisions, not copy the subjects. All seven contract tests passed,
including validating the example outputs with the real API response validator.

The same YOLO request was rerun, confirmed by deep equality of input JSON. HTTP
**200**, **61.067 seconds**, main model **claude-opus-5**. The actual response and
all scope notes are saved unchanged in the linked Markdown file. It retained
the three targeted improvements: weights before architecture, conditional
threshold effects, and file-scoped coordinate absence with visual positions in
the annotated image.

Remaining content issues in this sample: the fixed-input-size generalization
persists, and saying objects outside the class list are not reported is too
absolute (an unfamiliar object can receive an incorrect known label). The
45–60 minute estimate is explicitly the model's planning judgment, not a tested
duration. One run cannot establish that examples improved quality overall or
that the agent generalizes to other subjects. This candidate is not approved
for app integration. No app or saved course was changed.
