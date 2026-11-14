# bench-coverage: which scene mechanism would each bench prompt need?

155 unique prompts of scripts/explain-bench/sets/*.json (deduplicated by normalized text). Classifier 1: JEV (pickFamily transport, one choice question, seven criteria, 465 calls, threshold ignored; a prompt's JEV bucket is the majority of its repeats, ties by mean probability). Classifier 2: claude-sonnet-5-5, one forced tool call per prompt (the choice and one sentence of reason). Measurement only: no template is built from it. No Opus.

The seven criteria (what the scene shows):

- `curve-sliders`: One quantity as a function of another, drawn as a curve whose shape a few parameters change; no motion over time.
- `scene-over-time`: Something moving or changing continuously with time (a body, a charge, a signal, a population) played or scrubbed on a timeline with a few controls.
- `stepper-states`: A process shown as a sequence of discrete states or steps that the learner advances one at a time (an algorithm, a protocol, a cycle).
- `graph-active-path`: A network of nodes and edges where one path, flow or message is highlighted as it moves through the structure.
- `grid-highlights`: A grid or table of values (a matrix, a board, a confusion table, an image patch) where cells are highlighted, combined or filled.
- `before-after`: Two states of the same thing side by side or toggled (before/after, with and without, two settings) so the difference is the point.
- `none`: Nothing above fits (pure definition, prose comparison, a list, a proof).

## Share per mechanism

| Mechanism | JEV | JEV share | Sonnet | Sonnet share | both agree on it | either says it |
|---|---|---|---|---|---|---|
| curve-sliders | 14 | 9% | 12 | 7.7% | 9 | 17 |
| scene-over-time | 4 | 2.6% | 6 | 3.9% | 4 | 6 |
| stepper-states | 54 | 34.8% | 53 | 34.2% | 44 | 63 |
| graph-active-path | 20 | 12.9% | 15 | 9.7% | 10 | 25 |
| grid-highlights | 17 | 11% | 27 | 17.4% | 14 | 30 |
| before-after | 18 | 11.6% | 16 | 10.3% | 13 | 21 |
| none | 28 | 18.1% | 26 | 16.8% | 17 | 37 |

`none` share: JEV 18.1%, Sonnet 16.8%; both none: 17 prompts (11%).

## Agreement

- JEV majority vs Sonnet, same bucket: **111 of 155 (71.6%)**.
- JEV self-consistency: all repeats gave the same choice for 142 of 155 prompts (91.6%).

| Mechanism | prompts either puts there | both put there | agreement |
|---|---|---|---|
| curve-sliders | 17 | 9 | 52.9% |
| scene-over-time | 6 | 4 | 66.7% |
| stepper-states | 63 | 44 | 69.8% |
| graph-active-path | 25 | 10 | 40% |
| grid-highlights | 30 | 14 | 46.7% |
| before-after | 21 | 13 | 61.9% |
| none | 37 | 17 | 45.9% |

## Five example prompts per bucket

Prompts both classifiers agree on first (the agreed bucket); a bucket with fewer than five agreed prompts is filled from the prompts either puts there (marked J for JEV only, S for Sonnet only).

**curve-sliders**

- what is overfitting?
- what is a learning rate schedule?
- what does softmax do?
- what does the sigmoid activation function do?
- how does Gini impurity change as the fraction of one class goes from 0 to 1, compared with entropy?

**scene-over-time**

- how does a solar eclipse happen?
- how does compound interest grow money over time?
- how do populations grow?
- how did the Roman Empire rise and fall?
- why does the Moon have phases? (S)

**stepper-states**

- what is gradient descent?
- how does tokenization work?
- how does RAG work?
- how does RLHF work?
- how does a diffusion model generate an image?

**graph-active-path**

- what does a neural network look like?
- how does a decision tree make a prediction?
- how does data flow through an ML pipeline?
- what are the layers of a neural network?
- what is a computational graph?

**grid-highlights**

- how does a GPU run matrix multiplications?
- what is the difference between precision and recall?
- what does a bootstrap sample of the training rows look like, and which rows repeat?
- How does a transformer get a match score between words?
- How does a transformer mix the word values after it has attention weights?

**before-after**

- what is quantization?
- mitosis vs meiosis
- what do a caterpillar and a butterfly look like?
- how does a plant cell look different from an animal cell?
- how does a regression tree fit y = sin(x) with a step function at depth 2 versus depth 5?

**none**

- what is a vector database?
- what does a GPU look like?
- what does a data-center rack look like?
- what does a biological neuron look like?
- what is a random forest?

## Prompts both classifiers put in `none` (17)

- [aiml] what is a vector database?
- [aiml] what does a GPU look like?
- [aiml] what does a data-center rack look like?
- [aiml] what does a biological neuron look like?
- [aiml] what is a random forest?
- [baseline] explain a 3D mesh
- [baseline] how is DNA shaped?
- [baseline] what are the parts of a medieval castle?
- [baseline] what is a dodecahedron?
- [baseline] what is a nebula?
- [baseline] explain leaf venation
- [baseline] what does a coral reef look like, and why?
- [baseline] how is a virus different from a bacterium?
- [baseline] what caused World War I?
- [baseline] what is entropy?
- [baseline] compare a stack and a queue
- [smoke] What does an image and caption pair look like in CLIP training data?

## Spend

Sonnet about US$0.559 (tokens at the registry price, US$2 / US$10 per million); JEV calls are fractions of a cent each and are not priced here.
