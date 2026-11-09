# 03 · Logistic Regression

[Curriculum lesson](https://raw.githubusercontent.com/rohitg00/ai-engineering-from-scratch/e7db050e64bde3be17a9381476f748da26d85692/phases/02-ml-fundamentals/03-logistic-regression/docs/en.md) · [Source inventory](../03-logistic-regression/manifest.json)

## Matching figures

| Figure | Teaching point |
| --- | --- |
| [The Illustrated Transformer · 12](../illustrated-transformer/briefs.md#figure-12) | Scaling and softmax convert raw matches into a comparable distribution over positions. |
| [The Illustrated Transformer · 31](../illustrated-transformer/briefs.md#figure-31) | A learned projection produces one score for each vocabulary entry and softmax turns those scores into next-token probabilities. |
| [The Illustrated Transformer · 34](../illustrated-transformer/briefs.md#figure-34) | Training compares the model's next-token distribution with the observed target token. |
| [The Illustrated Transformer · 35](../illustrated-transformer/briefs.md#figure-35) | A target sentence supplies a different next-token label at each prefix position during training. |
| [The Illustrated Transformer · 36](../illustrated-transformer/briefs.md#figure-36) | Assigning greater probability to observed next tokens reduces their cross-entropy loss. |
| [The Illustrated BERT, ELMo, and co. · 03](../illustrated-bert/briefs.md#figure-03) | A BERT encoder can supply a text representation to a small classifier. |
| [The Illustrated BERT, ELMo, and co. · 10](../illustrated-bert/briefs.md#figure-10) | A classification head converts one contextual vector into scores for the task classes. |
| [The Illustrated BERT, ELMo, and co. · 24](../illustrated-bert/briefs.md#figure-24) | The original BERT training setup includes deciding whether a second passage follows a first passage. |
| [The Illustrated GPT-2 · 02](../illustrated-gpt2/briefs.md#figure-02) | Keyboard suggestions illustrate the same basic next-token task as a language model. |
| [The Illustrated GPT-2 · 25](../illustrated-gpt2/briefs.md#figure-25) | The output layer projects a hidden vector to one score per token in the vocabulary. |
| [The Illustrated GPT-2 · 26](../illustrated-gpt2/briefs.md#figure-26) | A single forward pass yields competing scores for possible next tokens. |
| [The Illustrated GPT-2 · 27](../illustrated-gpt2/briefs.md#figure-27) | Greedy selection and sampling can choose different next tokens from the same distribution. |
| [The Illustrated GPT-2 · 39](../illustrated-gpt2/briefs.md#figure-39) | Rowwise softmax gives blocked future keys zero probability while visible weights still sum to one. |
| [The Illustrated Word2vec · 20](../illustrated-word2vec/briefs.md#figure-20) | The model predicts a distribution over vocabulary items before a word is selected. |
| [The Illustrated Word2vec · 46](../illustrated-word2vec/briefs.md#figure-46) | A pair classifier assigns one score to a proposed center and neighbor. |
| [The Illustrated Word2vec · 56](../illustrated-word2vec/briefs.md#figure-56) | A sigmoid converts a pair's real-valued compatibility score to a number between zero and one. |
| [The Illustrated Word2vec · 57](../illustrated-word2vec/briefs.md#figure-57) | Positive and negative labels determine the direction of each pair's score error. |
| [4.1. Softmax Regression · 01](../d2l-softmax-regression/briefs.md#figure-01) | Multiclass linear classification gives every class its own weighted combination of the same input features before normalizing the scores. |
| [5.1. Multilayer Perceptrons · 01](../d2l-mlp/briefs.md#figure-01) | A hidden layer lets each output depend on nonlinear features learned from the same original inputs. |
| [5.1. Multilayer Perceptrons · 02](../d2l-mlp/briefs.md#figure-02) | ReLU maps negative inputs to zero and leaves positive inputs unchanged. |
| [5.1. Multilayer Perceptrons · 03](../d2l-mlp/briefs.md#figure-03) | The rectifier begins passing input linearly once the input crosses zero. |
| [5.1. Multilayer Perceptrons · 04](../d2l-mlp/briefs.md#figure-04) | ReLU adds nonlinearity with a change in slope even though both pieces are straight. |
| [5.1. Multilayer Perceptrons · 05](../d2l-mlp/briefs.md#figure-05) | A positive response survives rectification while a negative response is clipped away. |
| [5.1. Multilayer Perceptrons · 06](../d2l-mlp/briefs.md#figure-06) | The ReLU derivative is zero to the left of the corner and one to the right. |
| [5.1. Multilayer Perceptrons · 07](../d2l-mlp/briefs.md#figure-07) | Backpropagation through a negative preactivation sends no local gradient, while a positive preactivation passes it through unchanged. |
| [5.1. Multilayer Perceptrons · 08](../d2l-mlp/briefs.md#figure-08) | The rectifier's two slope regions become two flat levels in the derivative plot. |
| [5.1. Multilayer Perceptrons · 09](../d2l-mlp/briefs.md#figure-09) | The derivative jumps abruptly where ReLU switches from clipping an input to passing it through. |
| [5.1. Multilayer Perceptrons · 10](../d2l-mlp/briefs.md#figure-10) | Sigmoid compresses an unbounded score into a number between zero and one. |
| [5.1. Multilayer Perceptrons · 11](../d2l-mlp/briefs.md#figure-11) | Scores far below and above zero yield very different sigmoid outputs that approach opposite limits. |
| [5.1. Multilayer Perceptrons · 12](../d2l-mlp/briefs.md#figure-12) | Sigmoid changes fastest near the middle and produces almost constant outputs in either tail. |
| [5.1. Multilayer Perceptrons · 13](../d2l-mlp/briefs.md#figure-13) | A zero raw score maps to one half, while positive and negative scores move toward the upper and lower limits. |
| [5.1. Multilayer Perceptrons · 14](../d2l-mlp/briefs.md#figure-14) | Sigmoid's derivative peaks at zero input and shrinks as the activation saturates. |
| [5.1. Multilayer Perceptrons · 15](../d2l-mlp/briefs.md#figure-15) | The same change in preactivation affects sigmoid much less in a tail than near its center. |
| [5.1. Multilayer Perceptrons · 16](../d2l-mlp/briefs.md#figure-16) | A backward gradient is multiplied by a small local sigmoid derivative when the corresponding score is extreme. |
| [5.1. Multilayer Perceptrons · 17](../d2l-mlp/briefs.md#figure-17) | Even at its steepest point, sigmoid's local slope is only one quarter. |
| [5.1. Multilayer Perceptrons · 18](../d2l-mlp/briefs.md#figure-18) | Tanh is nearly linear around zero but compresses large magnitudes toward one in either direction. |
| [5.1. Multilayer Perceptrons · 19](../d2l-mlp/briefs.md#figure-19) | Unlike sigmoid, tanh's bounded range retains the sign of the input and is centered at zero. |
| [5.1. Multilayer Perceptrons · 20](../d2l-mlp/briefs.md#figure-20) | Equal positive and negative tanh inputs give outputs with the same magnitude and opposite sign. |
| [5.1. Multilayer Perceptrons · 21](../d2l-mlp/briefs.md#figure-21) | Increasing a large positive input changes tanh very little once its output nears the upper limit. |
| [5.1. Multilayer Perceptrons · 22](../d2l-mlp/briefs.md#figure-22) | Tanh's local slope reaches one at zero and fades toward zero in both saturated regions. |
| [5.1. Multilayer Perceptrons · 23](../d2l-mlp/briefs.md#figure-23) | Tanh can pass a strong local gradient near zero while attenuating gradients at extreme inputs. |
| [5.1. Multilayer Perceptrons · 24](../d2l-mlp/briefs.md#figure-24) | The slope of tanh has the same value for inputs with opposite signs. |
| [5.1. Multilayer Perceptrons · 25](../d2l-mlp/briefs.md#figure-25) | The narrow high-sensitivity region of tanh contrasts with its broad, low-gradient tails. |
