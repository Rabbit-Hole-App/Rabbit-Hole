# Learn teaching planner: dev smoke test

Date: 2026-09-17. App: `yolo-s3-job`, regular Cloudflare dev.
Version: `a329c791-6208-4780-933b-ce76c3683eb2`.

## Results

| Request | Chosen depth | Chosen tools | Result |
|---|---|---|---|
| Explain why sigmoid(0) is 0.5 in one or two sentences; no external assets | quick | none | Definition, substitution, short explanation; review 1 passed; rendered in browser |
| Derive sigmoid's derivative; learner knows chain rule; no graphs/assets | technical | none | Seven equation blocks derive sigmoid(x)(1-sigmoid(x)); review 1 passed |
| Beginner exploration of sigmoid steepness with an editable slider; no calculus/video/3D | conceptual | interactive_plot | Desmos slope and center sliders; review 1 passed |

Three of three requests chose the expected depth and tool category. Each used
the real deployed planner, generator, schema validation, and evaluator. The first
was exercised through the UI; the other two used the authenticated dev endpoint.
The UI chat reply was a fixture so this isolates canvas planning rather than
claiming end-to-end chat generation coverage. No paid video or Blender generation
was requested. The existing graph interaction behavior is covered separately in
[graph verification](../features/learn-graphs.md).

The Explain on canvas button computed to background `rgb(35, 131, 226)`
(`#2383e2`) and white text, using the existing primary component. The browser
rendered the first approved explanation and reported no page errors.

61 focused automated tests passed, including new history/brief/schema bounds,
context retention through review and revision, inspectable planning output, and
existing canvas/research/asset flows. A test assertion initially inspected escaped
JSON with a regex; it was corrected to parse the structured review context.

The first browser attempt failed in Playwright's response-body capture while the
app was reviewing. Its model outcome was not captured. The corrected harness
reads a cloned fetch stream; the three results above are from that completed run.

## Review and limitations

The calculations are correct. The quick answer adds a symmetry observation, and
the interactive answer adds a center slider beyond the requested slope slider.
Those are mild scope expansions worth including in future calibration; automated
review passed them. This verifies the working depth/tool decision path, not perfect
brevity or teaching quality. Assumed knowledge remains a declared assumption,
not verified learner mastery. Deep-dive behavior and cross-topic generalization
were not measured in this three-case smoke test.

Local evidence: `.small/learn-teaching-check.json`,
`.small/learn-teaching-check.log`, `.small/learn-teaching-browser.png`,
`.small/learn-teaching-tests.log`.

Implementation: [Learn teaching planner](../features/learn-teaching-planner.md).
