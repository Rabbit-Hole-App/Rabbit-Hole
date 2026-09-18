# Interactive Technical Learning Visual Library

## Purpose
Build a reusable library of technical teaching components, animations, interactions, and templates that the lesson agent can compose like LEGO blocks.

The lesson agent should choose components and configure them. It must not invent raw React, SVG, GSAP, D3, Plotly, Three.js, or tldraw code per lesson.

Core model:

```text
Course content / repo / paper
        ↓
Lesson planner
        ↓
Teaching storyboard
        ↓
Choose existing components + interactions + animation actions
        ↓
Validated scene specification
        ↓
Deterministic renderer
        ↓
Adaptive learning canvas
```

The lesson model is the storyboard director.  
The component library is the visual vocabulary.  
The motion engine is the choreography layer.  
The renderer guarantees quality.

---

# Tier 1 — Base Visual Primitives

Tier 1 components are the smallest reusable pieces. They should be polished, theme-aware, semantic, accessible, and deterministic.

## Text and annotation

Build:

- `Heading`
- `Subheading`
- `TextLabel`
- `Caption`
- `Paragraph`
- `Callout`
- `DefinitionCard`
- `HintCard`
- `WarningCard`
- `QuestionCard`
- `AnswerCard`
- `Badge`
- `Tag`
- `Footnote`
- `SourceReference`
- `RepoReference`
- `PaperReference`
- `Equation`
- `InlineEquation`
- `CodeSnippet`

Every component should support semantic metadata such as:

```ts
semanticId?: string
conceptId?: string
```

## Basic geometry

Build:

- `Box`
- `RoundedBox`
- `Circle`
- `Dot`
- `Line`
- `Arrow`
- `CurvedArrow`
- `BidirectionalArrow`
- `Brace`
- `Bracket`
- `Divider`
- `Region`
- `HighlightRegion`
- `MaskRegion`
- `BoundingBox`
- `AnchorPoint`
- `Handle`

Arrow semantics should include:

```text
flow
residual
optional
causal
blocked
prediction
observed
feedback
dependency
```

## Sequence primitives

Build:

- `Token`
- `TokenRow`
- `TokenGrid`
- `Sequence`
- `SequenceWindow`
- `SequenceCursor`
- `StepMarker`

Support:

- select
- highlight
- dim
- append
- remove
- shift context window
- mark current position

## Vector, matrix, tensor primitives

Build:

- `Scalar`
- `Vector`
- `VectorStack`
- `Matrix`
- `MatrixCell`
- `Tensor`
- `TensorShape`
- `TensorSlice`
- `TensorGrid`
- `Heatmap`
- `DimensionLabel`
- `ShapeBadge`

Important transformations include:

```text
[B,T,C]
→
[B,H,T,D]
```

## Process primitives

Build:

- `ProcessNode`
- `InputNode`
- `OutputNode`
- `ModuleNode`
- `DecisionNode`
- `MemoryNode`
- `ToolNode`
- `EnvironmentNode`
- `Pipeline`
- `Stage`
- `Branch`
- `Merge`
- `Split`
- `Loop`

## Image / spatial primitives

Build:

- `ImageFrame`
- `ImageRegion`
- `ImageOverlay`
- `Patch`
- `PatchGrid`
- `Point`
- `Keypoint`
- `Polyline`
- `TrajectoryPath`
- `CoordinateFrame2D`

---

# Tier 1 — Animation Action Vocabulary

Do not expose raw GSAP/Motion APIs to the lesson-generation agent.

## Visibility

- `appear`
- `disappear`
- `fadeIn`
- `fadeOut`
- `reveal`
- `hide`
- `pulse`
- `blink`

## Movement

- `move`
- `translate`
- `moveAlongPath`
- `rotate`
- `scale`
- `pan`
- `zoom`
- `focus`
- `follow`

## Drawing

- `drawLine`
- `drawArrow`
- `drawPath`
- `tracePath`
- `erasePath`
- `underline`
- `circle`
- `boxHighlight`

## Emphasis

- `highlight`
- `unhighlight`
- `dim`
- `spotlight`
- `outline`
- `pulse`
- `compare`

## Structural transformations

- `split`
- `merge`
- `duplicate`
- `group`
- `ungroup`
- `stack`
- `unstack`
- `expand`
- `collapse`
- `reshape`
- `transpose`
- `flatten`
- `partition`
- `concatenate`

## Data transformations

- `map`
- `filter`
- `mask`
- `normalize`
- `softmax`
- `project`
- `sample`
- `sort`
- `aggregate`
- `weight`
- `route`
- `selectTopK`

## Sequence actions

- `append`
- `remove`
- `shiftWindow`
- `advanceStep`
- `rewindStep`
- `iterate`
- `loop`
- `branch`

## Matrix/tensor actions

- `highlightRow`
- `highlightColumn`
- `highlightCell`
- `multiplyMatrices`
- `transposeMatrix`
- `reshapeTensor`
- `splitHeads`
- `mergeHeads`
- `maskUpperTriangle`
- `broadcast`
- `sliceTensor`

---

# Tier 1 — Interaction Vocabulary

Supported interaction primitives:

- `click`
- `tap`
- `hover`
- `select`
- `multiSelect`
- `drag`
- `drop`
- `pull`
- `resize`
- `rotateHandle`
- `scrub`
- `toggle`
- `slider`
- `stepper`
- `dropdown`
- `type`
- `draw`
- `circle`
- `connect`
- `disconnect`
- `reorder`

Map every interaction to a semantic action, for example:

```text
drag vector endpoint
→ set_vector

toggle causal mask
→ set_mask_enabled

click query token
→ set_query_index

drop module
→ place_pipeline_component
```

---

# Tier 2 — LLM / NLP Components

Build:

- `TokenizerVisualizer`
- `EmbeddingTable`
- `EmbeddingVector`
- `TransformerBlock`
- `QKVBlock`
- `AttentionHead`
- `AttentionMatrix`
- `CausalMask`
- `AttentionExplainer`
- `MultiHeadAttention`
- `ResidualConnection`
- `LayerNormBlock`
- `MLPBlock`
- `ContextWindow`
- `LogitsDistribution`
- `KVCacheVisualizer`
- `LoRAExplainer`
- `MoERouter`

## Example: `AttentionExplainer`

### Props

```ts
type AttentionExplainerProps = {
  tokens: string[]
  queryIndex: number
  attentionWeights?: number[][]
  maskEnabled: boolean
  showQKV?: boolean
  mode: "passive" | "interactive" | "activity"
}
```

### Render

- token row
- selected query
- attention arrows
- blocked future positions
- optional matrix
- optional Q/K/V stage

### Animations

- highlight query
- reveal valid keys
- draw attention arrows
- sweep causal mask
- transition scores to probabilities
- highlight V contribution

### Interactions

- click token
- toggle mask
- select matrix cell
- next/previous step
- replay

### Events

```ts
onQueryChange(index)
onMaskToggle(enabled)
onCellSelect(queryIndex, keyIndex)
onStepChange(step)
```

### Tutor context

```json
{
  "component": "AttentionExplainer",
  "queryIndex": 2,
  "queryToken": "l",
  "maskEnabled": true,
  "selectedCell": {
    "query": 2,
    "key": 1
  }
}
```

The lesson agent configures the component. It does not draw arrows itself.

---

# Tier 2 — VLM Components

Build:

- `ImagePatchGrid`
- `VisionEncoder`
- `VisualTokenRow`
- `ProjectorBlock`
- `MultimodalTokenSequence`
- `CrossAttentionExplainer`
- `GroundingOverlay`
- `ImageRegionExplorer`

Examples:

```text
Image
→ patches
→ vision encoder
→ visual tokens
→ projector
→ LLM
```

and:

```text
text token
↔
image region
```

---

# Tier 2 — Computer Vision Components

Build:

- `ConvolutionExplorer`
- `FeatureMapViewer`
- `BoundingBoxExplorer`
- `IoUExplorer`
- `NMSExplorer`
- `FeaturePyramid`
- `SegmentationOverlay`
- `ObjectQueryVisualizer`
- `OpticalFlowField`
- `KeypointViewer`
- `PoseSkeleton`

## Example: `IoUExplorer`

Learner drags a predicted box.

The component updates:

```text
intersection
union
IoU
```

Then an activity can ask:

> Move the box until IoU > 0.7.

---

# Tier 2 — World Model Components

Build:

- `ObservationCard`
- `LatentState`
- `DynamicsModel`
- `StateTransition`
- `BranchingFutures`
- `TrajectoryViewer`
- `CandidateTrajectory`
- `GoalState`
- `PlannerVisualizer`
- `PredictionVsReality`
- `ActionSequence`

Example:

```text
Current state
├→ action A → future A
├→ action B → future B
└→ action C → future C
```

---

# Tier 2 — Robotics / Physical AI Components

Build:

- `RobotArm2D`
- `RobotArm3D`
- `JointVisualizer`
- `CoordinateFrame`
- `TransformExplorer`
- `CameraFrustum`
- `SensorPipeline`
- `ActionVector`
- `PolicyVisualizer`
- `ControlLoop`
- `TrajectoryViewer3D`
- `TargetPose`

Use Three.js / R3F for 3D components.

---

# Tier 2 — Agent / Large Action Model Components

Build:

- `AgentLoop`
- `ToolCallVisualizer`
- `PlannerExecutor`
- `MemoryVisualizer`
- `ActionCandidateViewer`
- `VerifierLoop`
- `EnvironmentState`
- `RewardNode`

Example:

```text
Observe
→ Plan
→ Tool Call / Action
→ Environment Change
→ New Observation
```

---

# Tier 2 — Training / Optimization Components

Build:

- `TrainingLoop`
- `LossLandscape2D`
- `GradientFlow`
- `ParameterState`
- `LearningRateExplorer`
- `CheckpointTimeline`
- `FrozenVsTrainable`
- `OptimizerStep`

---

# Tier 3 — Composite Teaching Components

These should be the primary units used by the lesson-generation agent.

Build:

- `FlowDiagram`
- `CompareDiagram`
- `SplitMergeDiagram`
- `MatrixOperationExplainer`
- `MaskingExplainer`
- `TensorReshapeExplainer`
- `SequenceGrowthExplainer`
- `ModelArchitectureExplorer`
- `CodeToVisual`
- `ParameterExplorer`
- `BeforeAfterExplorer`
- `ObservePredictCompare`
- `BranchingFutureExplorer`
- `AgentLoopExplorer`
- `SensorToActionExplorer`
- `LatentTransitionExplorer`
- `TrajectoryComparison`
- `ZoomIntoComponent`
- `StepThroughAlgorithm`
- `DebugTheSystem`

---

# Tier 3 — Teaching Activity Patterns

Build reusable activity wrappers:

## `PredictThenReveal`

Learner predicts before animation reveals the result.

## `ManipulateThenExplain`

Learner changes a value/object and then explains the result.

## `BuildThenTest`

Learner completes real code or configuration, runs it, and sees the visual update.

## `BreakThenDiagnose`

Learner intentionally disables/breaks something and diagnoses the consequence.

## `SelectThenTeach`

Learner selects/circles an object; tutor inserts targeted explanation.

## `ExplainBack`

Learner explains the mechanism in their own words.

## `TransferChallenge`

Same concept, different data/context.

---

# Passive Animation Examples

## Example 1 — Q/K Matrix Construction

Use:

```text
MatrixOperationExplainer
```

Sequence:

```text
Q appears
↓
K appears
↓
K transposes
↓
Q × Kᵀ
↓
score matrix appears
```

Actions:

```text
appear
transpose
multiplyMatrices
reveal
```

## Example 2 — VLM Patch Flow

```text
Image
↓
patch grid
↓
patches detach
↓
vision encoder
↓
visual token row
↓
projector
↓
LLM
```

## Example 3 — Residual Connection

```text
x
↓
transform(x)

x moves around residual path
↓
+
↓
updated x
```

---

# Interactive Visualization Examples

## Example 1 — Causal Attention

Use:

```text
AttentionExplainer
```

Learner:

- selects query token
- toggles mask
- selects matrix cell
- steps through score → mask → softmax → values

Tutor knows exact selected state.

## Example 2 — IoU

Use:

```text
IoUExplorer
```

Learner drags boxes and sees IoU update.

## Example 3 — World Model Planner

Use:

```text
BranchingFutureExplorer
```

Learner chooses a candidate action before costs are revealed.

## Example 4 — Robot Coordinate Transform

Use:

```text
TransformExplorer
```

Learner moves frame B and watches coordinates update.

---

# Rendering Modes

Every major component should declare supported modes:

```text
passive
interactive
activity
```

## Passive

Short deterministic explanation.

Supports:

- play
- pause
- replay
- optionally scrub

## Interactive

Learner explores freely.

## Activity

Interaction is tied to a learning objective, answer, or check.

Preferred progression:

```text
animated when teaching
→ interactive when exploring
→ adaptive when checking understanding
```

Avoid GIFs for core learning components because they have:

- no semantic state
- no selection
- no tutor context
- no adaptation

---

# Visual Style System

Define one shared design language.

## Typography roles

- display
- heading
- subheading
- body
- caption
- annotation
- code
- equation

## Spacing scale

Use a fixed scale such as:

```text
4
8
12
16
24
32
48
64
96
```

## Semantic visual roles

- input
- output
- active
- selected
- prediction
- observed
- blocked
- warning
- success
- learner
- tutor
- code

Actual colors must come from design tokens. The lesson agent should not pick arbitrary colors.

---

# Motion Timing Grammar

Use named timings:

```text
instant  = 0ms
fast     = 180ms
normal   = 350ms
slow     = 700ms
explain  = 1100ms
```

Rules:

- animate one major teaching change at a time
- avoid unnecessary simultaneous motion
- preserve object identity
- pause after meaningful transformations
- avoid visual noise
- support reduced motion

---

# Renderer Stack

Recommended mapping:

| Need | Tool |
|---|---|
| Core technical 2D visuals | React + SVG |
| Scripted/choreographed animation | GSAP |
| Direct manipulation / gestures | Motion + Pointer Events |
| Geometry/scales where useful | D3 |
| Scientific plots / heatmaps | Plotly |
| Architecture / graph layouts | React Flow + ELK |
| 3D | Three.js / React Three Fiber |
| Freehand annotation | tldraw |
| Equations | KaTeX |
| Code | Shiki |
| Video export | Remotion |

Preferred pattern:

```text
D3
→ geometry/calculation when needed

React/SVG
→ render

GSAP
→ scripted explanation

Motion
→ learner manipulation
```

---

# Scene Specification

The lesson agent should emit validated scene JSON.

Example:

```json
{
  "id": "multihead-intro",
  "template": "split_merge",
  "mode": "passive",
  "conceptIds": ["attention.multihead"],

  "objects": [
    {
      "id": "embedding",
      "component": "Vector",
      "label": "Embedding",
      "data": {
        "dimension": 64
      }
    },
    {
      "id": "head1",
      "component": "Vector"
    },
    {
      "id": "head2",
      "component": "Vector"
    }
  ],

  "actions": [
    {
      "action": "appear",
      "target": "embedding",
      "timing": "normal"
    },
    {
      "action": "split",
      "target": "embedding",
      "into": ["head1", "head2"],
      "timing": "slow"
    }
  ]
}
```

The lesson agent should not provide raw pixel coordinates for standard templates.

---

# Teaching Template Registry

Implement these first:

- `flow`
- `compare`
- `before_after`
- `split_merge`
- `matrix_operation`
- `masking`
- `sequence_growth`
- `tensor_reshape`
- `step_algorithm`
- `branching_futures`
- `observe_predict_compare`
- `agent_loop`
- `sensor_to_action`
- `latent_transition`
- `zoom_into_component`
- `code_to_visual`
- `parameter_explorer`
- `debug_system`

Each template should define:

- accepted component types
- layout
- semantic slots
- max content
- supported actions
- supported interaction modes
- default timing

---

# Tutor Integration Contract

Every component must expose semantic context.

```ts
type TutorContext = {
  componentId: string
  componentType: string
  conceptIds: string[]
  selectedObject?: {
    id: string
    type: string
    label?: string
  }
  state: unknown
  currentStep?: string
  provenance?: "illustrative" | "calculated" | "recorded" | "live"
}
```

Examples of useful context:

- selected token
- selected attention cell
- box coordinates
- current IoU
- selected trajectory
- robot pose
- current parameter values
- current animation step

When the learner circles or selects something, send semantic context to the tutor rather than pixels alone.

---

# Provenance Rules

Every technical visual should identify whether its result is:

```text
illustrative
calculated
recorded
live
```

Never animate a plausible fake scientific/model result and present it as measured output.

---

# Component QA Harness

Build an internal component lab where developers can select:

```text
component
template
mode
test data
viewport
theme
reduced motion
```

Each component should have:

- minimal example
- realistic example
- maximum-content example
- invalid-input example
- narrow viewport example
- reduced-motion example

---

# Gold-Standard Reference Scenes

Create at least 20 manually reviewed scenes.

## LLM

1. Tokenization
2. Embedding lookup
3. Q × Kᵀ
4. Causal mask
5. Softmax + V
6. Multi-head split/merge
7. Residual connection
8. Generation loop

## VLM

9. Image patchification
10. Vision encoder → projector → LLM
11. Multimodal token sequence

## CV

12. Convolution window
13. Bounding-box IoU
14. NMS

## World models

15. Current state + action → predicted state
16. Branching candidate futures
17. Predicted vs actual rollout

## Robotics

18. Coordinate transform
19. Sensor → perception → policy → action
20. Robot trajectory

Use these as:

- visual regression references
- few-shot examples for the lesson agent
- design-quality benchmarks

---

# Automated Visual QA

For passive animations capture:

```text
0%
25%
50%
75%
100%
```

Check for:

- overlap
- clipping
- arrows through labels
- unreadable text
- off-canvas objects
- missing references
- invalid numeric state

Flag or repair bad scenes instead of silently accepting them.

---

# Accessibility

Every interactive component should support:

- keyboard alternative where reasonable
- visible focus
- readable labels
- sufficient contrast
- reduced-motion behavior
- textual description/summary
- non-drag alternative for required drag tasks

---

# Performance Rules

- pause animations offscreen
- do not write every animation frame to global state
- persist only semantic committed changes
- lazy-load expensive adapters
- avoid LLM calls while dragging
- dispose Three.js resources properly
- keep simultaneous motion limited

---

# Agent Output Contract

The lesson-generation agent should choose:

```text
learning objective
↓
teaching template
↓
components
↓
semantic content/data
↓
mode
↓
animation actions
↓
interaction
↓
knowledge check
```

Example:

```json
{
  "objective": "Explain causal masking",
  "template": "masking",
  "mode": "activity",

  "components": [
    {
      "id": "attention",
      "type": "AttentionExplainer",
      "props": {
        "tokens": ["H", "e", "l", "l"],
        "queryIndex": 2,
        "maskEnabled": true
      }
    }
  ],

  "check": {
    "type": "select_allowed_positions",
    "queryIndex": 2
  }
}
```

---

# Agent Restrictions

Do not allow the lesson-generation agent to emit:

- custom React components
- raw GSAP timelines
- custom SVG markup
- arbitrary D3 code
- arbitrary JavaScript
- custom Three.js code
- arbitrary tldraw editor commands
- fabricated model output
- freeform pixel layout for standard templates

If a required concept cannot be represented by existing components, return:

```text
NEW_COMPONENT_REQUIRED
```

---

# Implementation Phases

## Tier 1 implementation first

Build:

1. `TokenRow`
2. `Vector`
3. `Matrix`
4. `Tensor`
5. `Heatmap`
6. `Arrow`
7. `ImageFrame`
8. `BoundingBox`
9. common animation action engine
10. semantic interaction event system

## Tier 2 high-value components

Build next:

1. `AttentionExplainer`
2. `TransformerBlock`
3. `ImagePatchGrid`
4. `BoundingBoxExplorer`
5. `IoUExplorer`
6. `TrajectoryViewer`
7. `FlowDiagram`
8. `TensorReshapeExplainer`
9. `CodeToVisual`

## Tier 3 composition layer

Then implement:

- teaching templates
- adaptive activity wrappers
- tutor-context bridge
- scene validator
- gold-standard scene library
- visual QA harness

---

# First Acceptance Test

Build three scenes with the same system.

## Scene A — LLM

```text
Q/K/V
→ QKᵀ
→ causal mask
→ softmax
→ ×V
→ output
```

Must support:

- passive playback
- query selection
- mask toggle
- tutor context

## Scene B — VLM

```text
Image
→ patches
→ vision encoder
→ visual tokens
→ projector
→ LLM
```

Must support:

- patch selection
- progressive reveal
- semantic node selection
- tutor context

## Scene C — World Model

```text
Observation
+
candidate actions
↓
predicted futures
↓
compare costs
↓
selected action
```

Must support:

- branching futures
- learner candidate selection
- reveal actual/predicted cost
- tutor context

If all three are created through component configuration + scene JSON without custom one-off rendering code, the architecture is working.

---

# Definition of Done for Every Component

Every component must document:

## Props
What semantic data it accepts.

## Render
What appears visually.

## Modes
Which are supported:

```text
passive
interactive
activity
```

## Animations
Supported motion actions.

## Interactions
What the learner can manipulate.

## Semantic Events
What meaningful events it emits.

## Tutor Context
What state is exposed to the tutor.

## Validation
What invalid states are rejected.

## Accessibility
Keyboard and reduced-motion behavior.

## Tests
Unit, interaction, and visual regression coverage.

---

# Guiding Mental Model

The library should make it possible for the lesson agent to request:

> Explain causal attention.

and translate that into:

```text
AttentionExplainer
+
masking template
+
validated token data
+
known animation actions
+
knowledge check
```

rather than generating a new SVG animation from scratch.

The mental model is:

> **Components are LEGO pieces.**  
> **Teaching templates are LEGO arrangements.**  
> **Animation actions are the motion vocabulary.**  
> **Interaction modes turn visuals into activities.**  
> **The lesson agent chooses and configures them.**  
> **The renderer guarantees quality, consistency, and tutor context.**
