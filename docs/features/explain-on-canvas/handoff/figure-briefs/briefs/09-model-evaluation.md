# 09 · Model Evaluation

[Curriculum lesson](https://raw.githubusercontent.com/rohitg00/ai-engineering-from-scratch/e7db050e64bde3be17a9381476f748da26d85692/phases/02-ml-fundamentals/09-model-evaluation/docs/en.md) · [Source inventory](../09-model-evaluation/manifest.json)

## Matching figures

| Figure | Teaching point |
| --- | --- |
| [The Illustrated Transformer · 34](../illustrated-transformer/briefs.md#figure-34) | Training compares the model's next-token distribution with the observed target token. |
| [The Illustrated Transformer · 36](../illustrated-transformer/briefs.md#figure-36) | Assigning greater probability to observed next tokens reduces their cross-entropy loss. |
| [The Illustrated BERT, ELMo, and co. · 27](../illustrated-bert/briefs.md#figure-27) | Layer selection and layer combination can change the quality of frozen text features for a downstream task. |
| [The Illustrated Word2vec · 48](../illustrated-word2vec/briefs.md#figure-48) | If every training pair is positive, a constant affirmative answer can appear perfect while learning no contrast. |
| [The Illustrated Stable Diffusion · 23](../illustrated-stable-diffusion/briefs.md#figure-23) | Evaluating the text encoder requires comparing both visual fidelity and alignment with the prompt. |
| [3.1. Linear Regression · 01](../d2l-linear-regression/briefs.md#figure-01) | A fitted line makes a prediction at each observed input, and the vertical residuals show what squared error measures. |
| [3.6. Generalization · 01](../d2l-generalization/briefs.md#figure-01) | Increasing model complexity can keep lowering training error even after held-out error has started to rise. |
| [3.7. Weight Decay · 01](../d2l-weight-decay/briefs.md#figure-01) | Without a penalty, better fit to the training examples can leave held-out error essentially unchanged. |
| [3.7. Weight Decay · 02](../d2l-weight-decay/briefs.md#figure-02) | A model can drive training error down by orders of magnitude without learning a rule that transfers to new examples. |
| [3.7. Weight Decay · 03](../d2l-weight-decay/briefs.md#figure-03) | A noisy but persistent decline in training loss gives little evidence of improvement when validation loss stays flat. |
| [3.7. Weight Decay · 04](../d2l-weight-decay/briefs.md#figure-04) | Later training epochs reduce in-sample error while leaving the unpenalized model's validation error nearly at its starting level. |
| [3.7. Weight Decay · 05](../d2l-weight-decay/briefs.md#figure-05) | Weight decay can trade a higher training loss for better progress on held-out examples. |
| [3.7. Weight Decay · 06](../d2l-weight-decay/briefs.md#figure-06) | With a nonzero weight penalty, both loss traces can fall rather than the validation trace staying flat. |
| [3.7. Weight Decay · 07](../d2l-weight-decay/briefs.md#figure-07) | Shrinking the fitted coefficients can improve held-out loss even while the training and validation curves remain separated. |
| [3.7. Weight Decay · 08](../d2l-weight-decay/briefs.md#figure-08) | Individual training-loss jumps are compatible with a sustained decline in held-out loss under a weight penalty. |
| [3.7. Weight Decay · 09](../d2l-weight-decay/briefs.md#figure-09) | A built-in weight-decay implementation can reproduce the qualitative training and validation pattern of a hand-written penalty. |
| [3.7. Weight Decay · 10](../d2l-weight-decay/briefs.md#figure-10) | A concise penalty implementation can reduce held-out loss even though validation remains above training loss. |
| [3.7. Weight Decay · 11](../d2l-weight-decay/briefs.md#figure-11) | Similar held-out trends across implementations matter more than matching their noisy training traces. |
| [3.7. Weight Decay · 12](../d2l-weight-decay/briefs.md#figure-12) | Both training and validation losses can settle toward separate levels after a weight penalty is applied. |
| [5.6. Dropout · 02](../d2l-dropout/briefs.md#figure-02) | During dropout training the held-out loss can track the training loss while held-out accuracy improves. |
| [5.6. Dropout · 03](../d2l-dropout/briefs.md#figure-03) | A drop in validation loss and a rise in validation accuracy measure different aspects of the same dropout run. |
| [5.6. Dropout · 04](../d2l-dropout/briefs.md#figure-04) | Held-out accuracy can level off even as the dropout model's training loss still edges downward. |
| [5.6. Dropout · 05](../d2l-dropout/briefs.md#figure-05) | Improvement after the first few dropout epochs can be slower than the rapid changes at the beginning. |
| [5.6. Dropout · 06](../d2l-dropout/briefs.md#figure-06) | Built-in dropout can yield similar paired loss trends to an explicit dropout mask. |
| [5.6. Dropout · 07](../d2l-dropout/briefs.md#figure-07) | A compact dropout implementation should still be checked on held-out data rather than judged from training loss alone. |
| [5.6. Dropout · 08](../d2l-dropout/briefs.md#figure-08) | Lower validation loss can continue after most of the gain in validation accuracy has already occurred. |
| [5.6. Dropout · 09](../d2l-dropout/briefs.md#figure-09) | Noisy validation metrics in a dropout run can still indicate an overall improving model when compared over several epochs. |
| [12.11. Learning Rate Scheduling · 01](../d2l-lr-scheduler/briefs.md#figure-01) | A fixed learning rate can keep improving the training metric after held-out accuracy levels off. |
| [12.11. Learning Rate Scheduling · 02](../d2l-lr-scheduler/briefs.md#figure-02) | The fixed-rate training run separates progress on seen examples from gains on examples the model has not seen. |
| [12.11. Learning Rate Scheduling · 03](../d2l-lr-scheduler/briefs.md#figure-03) | A declining training loss and a rising training accuracy do not imply a matching improvement on held-out data. |
| [12.11. Learning Rate Scheduling · 07](../d2l-lr-scheduler/briefs.md#figure-07) | Applying a shrinking step-size policy can change both the smoothness of training and the gap to held-out performance. |
| [12.11. Learning Rate Scheduling · 08](../d2l-lr-scheduler/briefs.md#figure-08) | A decaying schedule should be assessed on held-out outcomes as well as progress on the training set. |
| [12.11. Learning Rate Scheduling · 09](../d2l-lr-scheduler/briefs.md#figure-09) | The reported decay experiment shows one possible validation trajectory rather than a guarantee of better generalization. |
| [12.11. Learning Rate Scheduling · 16](../d2l-lr-scheduler/briefs.md#figure-16) | A model can continue improving after a planned drop, which is why schedules are evaluated over the whole run. |
| [12.11. Learning Rate Scheduling · 17](../d2l-lr-scheduler/briefs.md#figure-17) | Planned reductions provide smaller late updates even when a run's metrics fluctuate. |
| [12.11. Learning Rate Scheduling · 18](../d2l-lr-scheduler/briefs.md#figure-18) | A late improvement with milestone decay is an observed outcome of the example, and must be checked on unseen data. |
| [12.11. Learning Rate Scheduling · 22](../d2l-lr-scheduler/briefs.md#figure-22) | A smooth cosine rate curve still needs a separate performance plot to judge what happened during training. |
| [12.11. Learning Rate Scheduling · 23](../d2l-lr-scheduler/briefs.md#figure-23) | Cosine annealing can give different train and held-out behavior even as the learning rate approaches a floor. |
| [12.11. Learning Rate Scheduling · 24](../d2l-lr-scheduler/briefs.md#figure-24) | The late metric region lets a learner compare whether a cosine-scheduled run kept improving on held-out examples. |
| [12.11. Learning Rate Scheduling · 28](../d2l-lr-scheduler/briefs.md#figure-28) | The first few epochs show whether warmup gave the model a better start in this example. |
| [12.11. Learning Rate Scheduling · 29](../d2l-lr-scheduler/briefs.md#figure-29) | Training curves reveal the effect of the warmup phase separately from the later outcome. |
| [12.11. Learning Rate Scheduling · 30](../d2l-lr-scheduler/briefs.md#figure-30) | The warmup example tests initial learning behavior and does not make a claim that every later checkpoint improves. |
| [7.6. Convolutional Neural Networks (LeNet) · 03](../d2l-lenet/briefs.md#figure-03) | Loss and held-out accuracy track different aspects of training progress. |
| [7.6. Convolutional Neural Networks (LeNet) · 04](../d2l-lenet/briefs.md#figure-04) | Loss and held-out accuracy track different aspects of training progress. |
| [7.6. Convolutional Neural Networks (LeNet) · 05](../d2l-lenet/briefs.md#figure-05) | Loss and held-out accuracy track different aspects of training progress. |
| [7.6. Convolutional Neural Networks (LeNet) · 06](../d2l-lenet/briefs.md#figure-06) | Loss and held-out accuracy track different aspects of training progress. |
| [9.1. Working with Sequences · 07](../d2l-sequence/briefs.md#figure-07) | Training and validation loss distinguish fitting progress from performance on reserved observations. |
| [9.1. Working with Sequences · 08](../d2l-sequence/briefs.md#figure-08) | Training and validation loss distinguish fitting progress from performance on reserved observations. |
| [9.1. Working with Sequences · 09](../d2l-sequence/briefs.md#figure-09) | Training and validation loss distinguish fitting progress from performance on reserved observations. |
| [9.1. Working with Sequences · 10](../d2l-sequence/briefs.md#figure-10) | Training and validation loss distinguish fitting progress from performance on reserved observations. |
| [11.4. The Bahdanau Attention Mechanism · 03](../d2l-bahdanau-attention/briefs.md#figure-03) | Training loss can keep falling after an attention-equipped model stops improving on held-out examples. |
| [11.4. The Bahdanau Attention Mechanism · 04](../d2l-bahdanau-attention/briefs.md#figure-04) | Training loss can keep falling after an attention-equipped model stops improving on held-out examples. |
| [11.4. The Bahdanau Attention Mechanism · 05](../d2l-bahdanau-attention/briefs.md#figure-05) | Training loss can keep falling after an attention-equipped model stops improving on held-out examples. |
| [11.4. The Bahdanau Attention Mechanism · 06](../d2l-bahdanau-attention/briefs.md#figure-06) | Training loss can keep falling after an attention-equipped model stops improving on held-out examples. |
| [11.7. The Transformer Architecture · 02](../d2l-transformer/briefs.md#figure-02) | A falling training objective can coexist with a worse held-out objective during Transformer training. |
| [11.7. The Transformer Architecture · 03](../d2l-transformer/briefs.md#figure-03) | A falling training objective can coexist with a worse held-out objective during Transformer training. |
| [11.7. The Transformer Architecture · 04](../d2l-transformer/briefs.md#figure-04) | A falling training objective can coexist with a worse held-out objective during Transformer training. |
| [11.7. The Transformer Architecture · 05](../d2l-transformer/briefs.md#figure-05) | A falling training objective can coexist with a worse held-out objective during Transformer training. |
