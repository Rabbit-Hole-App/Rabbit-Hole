# Quickstart curriculum: karpathy/nanoGPT

Status: user-supplied curriculum draft, awaiting course approval. No lessons or assets generated from this document.

Repository: [karpathy/nanoGPT](https://github.com/karpathy/nanoGPT).
Source snapshot: `3adf61e154c3fe3fca428ad6bc3818b27a3b8291`.
Core lessons: approximately 50 minutes. Optional notebooks: approximately 69 minutes, excluding setup and variable training time.

This outline is supplied by the owner for the first iteration. Later, Curriculum Agent will create a reviewable outline. Learn Agent expands only a selected, approved lesson into a separate Markdown plan before rendering or asset generation.

- [Lesson 1 material plan](lesson-01-plan.md)
- [Proposed review workflow](../../features/learn-lesson-plans.md)

## Lesson 1: What nanoGPT does — ~6 min

- What a language model predicts
- Text → tokens → next-token prediction
- What nanoGPT is trying to implement
- Difference between training and generation

### Repo focus

- `README.md`
- `data/shakespeare_char/prepare.py`
- `config/train_shakespeare_char.py`

The official quickstart uses Tiny Shakespeare, converts it into `train.bin` and `val.bin`, then trains a small character-level GPT with `config/train_shakespeare_char.py`.

### Mini quiz — 2 questions

1. What is the model predicting at each position?
2. What are `train.bin` and `val.bin` used for?

### Flashcards — 4

- token
- vocabulary
- context window
- next-token prediction

### Homework notebook — optional ~5 min

- Load Tiny Shakespeare
- Inspect characters/tokens
- Print a few encoded sequences
- Compare text with token IDs

## Lesson 2: GPT architecture overview — ~7 min

- Token embeddings
- Positional embeddings
- Transformer blocks
- Final normalization
- Language-model head
- End-to-end architecture

### Repo focus

- `model.py`
- `GPTConfig`
- `GPT`
- `Block`

nanoGPT intentionally concentrates the GPT model definition in `model.py`, while `train.py` contains the training loop.

### Mini quiz — 3 questions

1. Why do tokens need embeddings?
2. Why does position information matter?
3. What does the language-model head output?

### Flashcards — 5

- embedding
- positional embedding
- transformer block
- hidden dimension
- logits

### Homework notebook — optional ~7 min

- Instantiate a tiny `GPTConfig`
- Print the model
- Inspect parameter count
- Change `n_layer`, `n_head`, `n_embd`
- Observe parameter-count changes

## Lesson 3: Self-attention — ~8 min

- Query, key, value intuition
- Attention scores
- Softmax
- Causal masking
- Multi-head attention
- Why a token cannot see future tokens

### Repo focus

- `model.py`
- `CausalSelfAttention`
- Attention projections
- Causal attention path

### Interactive canvas

- Token nodes
- Attention edges
- Slider for attention weights
- Step through causal masking

### Mini quiz — 3 questions

1. Why is the attention mask causal?
2. What do Q and K determine?
3. What information comes from V?

### Flashcards — 6

- query
- key
- value
- attention score
- causal mask
- attention head

### Homework notebook — optional ~10 min

- Create a tiny attention matrix
- Apply a causal mask
- Visualize the matrix
- Change one query/key vector and observe attention changes

## Lesson 4: Transformer block — ~6 min

- Attention is only one part of the block
- MLP
- LayerNorm
- Residual connections
- Why GPT stacks many blocks

### Repo focus

- `model.py`
- `MLP`
- `Block`
- `Block.forward()`

### Mini quiz — 2 questions

1. What does the MLP contribute that attention does not?
2. Why are residual connections useful?

### Flashcards — 5

- MLP
- GELU
- residual connection
- LayerNorm
- transformer block

### Homework notebook — optional ~7 min

- Feed a random tensor through one `Block`
- Print input/output shapes
- Verify that dimensionality stays compatible across the residual path

## Lesson 5: Forward pass and loss — ~6 min

- Token IDs enter the model
- Hidden states are produced
- Hidden states become vocabulary logits
- Targets represent the next tokens
- Cross-entropy measures prediction error

### Repo focus

- `model.py`
- `GPT.forward()`
- Token embeddings
- Language-model head
- Loss computation

### Mini quiz — 3 questions

1. What does one logit vector represent?
2. Why are targets shifted relative to inputs?
3. What does lower cross-entropy mean?

### Flashcards — 5

- logits
- target
- cross-entropy
- vocabulary dimension
- forward pass

### Homework notebook — optional ~8 min

- Create a tiny input batch
- Run a forward pass
- Inspect logits shape
- Inspect loss
- Change one target token and compare loss

## Lesson 6: Training nanoGPT — ~7 min

- Sample batches
- Forward pass
- Compute loss
- Backpropagation
- Optimizer step
- Repeat
- Validation/checkpoints

### Repo focus

- `train.py`
- `get_batch`
- Training loop
- AdamW setup
- Checkpointing
- Learning-rate schedule

`train.py` exposes model size, batch size, context length, learning rate, warmup, decay, gradient accumulation, clipping, and DDP settings directly, which makes it especially good for teaching the training loop.

### Mini quiz — 3 questions

1. What does `loss.backward()` conceptually do?
2. Why use gradient accumulation?
3. Why evaluate on validation data?

### Flashcards — 6

- gradient
- optimizer
- AdamW
- gradient accumulation
- checkpoint
- validation loss

### Homework notebook — optional ~10 min

- Run a tiny training loop for ~50–100 steps
- Log train loss
- Plot loss with Plotly
- Change learning rate
- Compare training behavior

## Lesson 7: Generation and sampling — ~5 min

- Start from a prompt
- Predict next-token probabilities
- Sample one token
- Append it
- Repeat
- Temperature
- Top-k

### Repo focus

- `sample.py`
- `GPT.generate()`
- Checkpoint loading
- Encoding/decoding

The repo's `sample.py` is specifically the small entry point for sampling from a trained model.

### Mini quiz — 2 questions

1. What happens when temperature increases?
2. Why is generation autoregressive?

### Flashcards — 5

- sampling
- autoregressive
- temperature
- top-k
- context

### Homework notebook — optional ~7 min

- Generate with several temperatures
- Compare outputs
- Change `top_k`
- Record which settings produce more random vs conservative text

## Lesson 8: Final nanoGPT mental model — ~5 min

- Trace one piece of text through the entire system
- Dataset → tokens
- Tokens → embeddings
- Embeddings → transformer
- Transformer → logits
- Loss → optimization
- Prompt → generated tokens

### Repo focus

- `data/shakespeare_char/prepare.py`
- `model.py`
- `train.py`
- `sample.py`

### Final quiz — 5 questions

1. Put the training stages in order.
2. Identify where attention happens.
3. Identify where loss is computed.
4. Explain where generation differs from training.
5. Predict what changing `block_size` affects.

### Flashcards — 6 recap cards

- tokenization
- attention
- transformer block
- logits
- optimization
- sampling

### Final homework notebook — optional ~15 min

- Train a tiny Shakespeare model
- Generate text
- Change one hyperparameter
- Compare before/after
- Answer: what changed, why, and where in the repo did that behavior come from?

## Source and review notes

The owner's outline above is preserved; Lessons 2–8 have not yet been expanded or independently reviewed as lesson materials. Notebook runtimes require validation when implemented.

Lesson 1 preparation and configuration were checked against the pinned [preparation script](https://github.com/karpathy/nanoGPT/blob/3adf61e154c3fe3fca428ad6bc3818b27a3b8291/data/shakespeare_char/prepare.py), [training configuration](https://github.com/karpathy/nanoGPT/blob/3adf61e154c3fe3fca428ad6bc3818b27a3b8291/config/train_shakespeare_char.py), and [README quickstart](https://github.com/karpathy/nanoGPT/blob/3adf61e154c3fe3fca428ad6bc3818b27a3b8291/README.md#quick-start). The README now describes nanoGPT as a historical/deprecated project; this course deliberately studies that code snapshot.
