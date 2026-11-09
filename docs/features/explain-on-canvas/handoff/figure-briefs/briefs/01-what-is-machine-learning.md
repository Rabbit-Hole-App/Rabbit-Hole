# 01 · What Is Machine Learning

[Curriculum lesson](https://raw.githubusercontent.com/rohitg00/ai-engineering-from-scratch/e7db050e64bde3be17a9381476f748da26d85692/phases/02-ml-fundamentals/01-what-is-machine-learning/docs/en.md) · [Source inventory](../01-what-is-machine-learning/manifest.json)

## Matching figures

| Figure | Teaching point |
| --- | --- |
| [The Illustrated Transformer · 01](../illustrated-transformer/briefs.md#figure-01) | A sequence-to-sequence Transformer can translate a source sentence into a target sentence. |
| [The Illustrated Transformer · 02](../illustrated-transformer/briefs.md#figure-02) | The encoder prepares source representations that the decoder can consult while producing the target. |
| [The Illustrated Transformer · 35](../illustrated-transformer/briefs.md#figure-35) | A target sentence supplies a different next-token label at each prefix position during training. |
| [The Illustrated BERT, ELMo, and co. · 01](../illustrated-bert/briefs.md#figure-01) | BERT belongs to a line of work that combines reusable language representations with Transformer encoders. |
| [The Illustrated BERT, ELMo, and co. · 02](../illustrated-bert/briefs.md#figure-02) | BERT pretrains on a large text corpus and then adapts to a specific task. |
| [The Illustrated BERT, ELMo, and co. · 03](../illustrated-bert/briefs.md#figure-03) | A BERT encoder can supply a text representation to a small classifier. |
| [The Illustrated BERT, ELMo, and co. · 04](../illustrated-bert/briefs.md#figure-04) | Supervised task adaptation needs examples paired with their correct classes. |
| [The Illustrated BERT, ELMo, and co. · 09](../illustrated-bert/briefs.md#figure-09) | A classifier can read the contextual output at the designated summary token. |
| [The Illustrated BERT, ELMo, and co. · 11](../illustrated-bert/briefs.md#figure-11) | A visual backbone can pass a learned vector to a classifier just as a text encoder does. |
| [The Illustrated BERT, ELMo, and co. · 16](../illustrated-bert/briefs.md#figure-16) | A next-token objective can teach a recurrent text model useful internal representations. |
| [The Illustrated BERT, ELMo, and co. · 20](../illustrated-bert/briefs.md#figure-20) | A causal language model learns by predicting each next token from earlier tokens. |
| [The Illustrated BERT, ELMo, and co. · 21](../illustrated-bert/briefs.md#figure-21) | A pretrained decoder representation can be adapted to a labelled classification task. |
| [The Illustrated BERT, ELMo, and co. · 23](../illustrated-bert/briefs.md#figure-23) | Masked language modelling recovers a selected missing token from the rest of a bidirectional context. |
| [The Illustrated BERT, ELMo, and co. · 24](../illustrated-bert/briefs.md#figure-24) | The original BERT training setup includes deciding whether a second passage follows a first passage. |
| [The Illustrated BERT, ELMo, and co. · 25](../illustrated-bert/briefs.md#figure-25) | Different BERT tasks read different positions in the same encoder outputs or attach different task heads. |
| [The Illustrated GPT-2 · 01](../illustrated-gpt2/briefs.md#figure-01) | GPT-2 continues a text prompt by generating plausible new text. |
| [The Illustrated GPT-2 · 02](../illustrated-gpt2/briefs.md#figure-02) | Keyboard suggestions illustrate the same basic next-token task as a language model. |
| [The Illustrated GPT-2 · 36](../illustrated-gpt2/briefs.md#figure-36) | A next-token training example aligns each prefix with its immediate continuation. |
| [The Illustrated GPT-2 · 60](../illustrated-gpt2/briefs.md#figure-60) | A document and its lead summary can provide a paired example for supervised summarization. |
| [The Illustrated Word2vec · 23](../illustrated-word2vec/briefs.md#figure-23) | A sliding context window creates supervised examples from ordinary text. |
| [The Illustrated Word2vec · 27](../illustrated-word2vec/briefs.md#figure-27) | Collecting the windows yields a table of context features and target words. |
| [The Illustrated Word2vec · 39](../illustrated-word2vec/briefs.md#figure-39) | The model learns from the input and observed neighbor recorded in each skip-gram row. |
| [The Illustrated Word2vec · 47](../illustrated-word2vec/briefs.md#figure-47) | The binary objective changes the dataset from one target word to a pair plus a label. |
| [The Illustrated Stable Diffusion · 14](../illustrated-stable-diffusion/briefs.md#figure-14) | A denoiser's training table pairs each noisy state and timestep with the known noise used to create that example. |
| [3.1. Linear Regression · 06](../d2l-linear-regression/briefs.md#figure-06) | An ordinary linear predictor can be drawn as one output unit with a connection from each input feature. |
| [3.1. Linear Regression · 07](../d2l-linear-regression/briefs.md#figure-07) | A biological neuron is the analogy for receiving and combining signals before passing a result onward. |
| [5.1. Multilayer Perceptrons · 01](../d2l-mlp/briefs.md#figure-01) | A hidden layer lets each output depend on nonlinear features learned from the same original inputs. |
