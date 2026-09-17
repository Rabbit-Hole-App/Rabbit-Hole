# Lesson 1 material plan: What nanoGPT does

Status: draft for owner review. Authored in this coding session as the initial example of the future Learn Agent artifact; not generated through the application's Learn Agent. Pages 1–2 are authorized for a regular-dev rendering preview. No generated media; notebook not executed.

Course: [nanoGPT Quickstart](quickstart-curriculum.md).
Lesson ID: `nanogpt-quickstart-01`. Plan revision: 4.
Source commit: `3adf61e154c3fe3fca428ad6bc3818b27a3b8291`.
Curriculum approval: pending. Plan approval: pending.

## Brief

Objectives:

- `predict-next`: identify the observed next-character target from the available prefix.
- `represent-text`: distinguish token IDs from probabilities and reverse a character encoding.
- `training-vs-generation`: distinguish parameter updates from extending generated text.

### Planned evidence of understanding

| Check ID | Objective | Learner action | Evidence |
|---|---|---|---|
| `quiz-1` | `predict-next` | Existing Quiz Question 1: identify the next-character prediction task | Choice and correctness |
| `encode-text` | `represent-text` | Page 2: encode `lo H` using the toy vocabulary | Four IDs and correctness; expected `[2, 3, 4, 0]` |
| `generation-weights` | `training-vs-generation` | Page 4: answer whether a longer generated answer implies changed parameters | Yes/no choice and correctness; expected No |

The three rows above are the objective-linked checks. Page 3's prefix selection
is practice alongside Quiz Question 1. Quiz Question 2 is supplementary
repository-artifact review, not a fourth core objective. Preserve both questions.
Page 2 uses a new short string rather than copying the displayed Hello encoding.

These are build requirements, not currently recorded events. On explicit answer
submission retain learner/course/lesson/plan revision, check ID, objective ID,
attempt number, response, correctness and whether the answer was already
revealed. Page 3 also records zero-based position so the two l characters remain
distinct. Keep first-attempt and eventual-correct results separate. A reveal
without an answer is reviewed, not correctly answered; skipping or advancing
playback is not completion. Save progress per learner and revision and restore
it on reload. Reset affects only that learner's attempts. Keep the existing
two-question quiz; do not add a long final quiz to duplicate these checks.

For the planned progress display, distinguish guided-page playback, three
objective checks, and optional review activities. Required participation is
reaching the guided explanation's end and submitting the three core checks.
Record correctness separately; completing participation does not imply mastery.
Reveals or skipped checks remain unattempted until an answer is submitted.
Further explanations, Quiz Question 2, flashcards and notebook are
optional and must not block lesson completion or navigation to Lesson 2.
Track their own activity states without folding them into the required lesson
completion denominator. Any course-level Quickstart completion rule must retain
that distinction; never silently require all four activity types.

Audience assumption for review: learners comfortable with basic Python strings, lists and dictionaries, without prior transformer knowledge. The owner has not yet confirmed this assumption.

The six page budgets total 360 seconds of guided explanation. Time spent paused
on a check, reading, reviewing cards or experimenting in the notebook is
additional. These are design estimates, not measured completion times. Do not
advertise the whole lesson or its completion requirements as a six-minute task.

Teaching direction: use the owner's requested Andrew Ng-inspired progression:
motivate a concrete problem, build intuition, work through a small example,
introduce and explain notation only when it helps, check understanding, then
connect to the next concept. Apply this to narration and Further explanations.
Use original wording, not an impersonation or quotations from his courses.
The running example is `Hello`; the repository's actual Shakespeare vocabulary
is distinct from our explicitly invented teaching vocabulary.

Page progression: problem → representation → training examples → learning versus
generation → repository implementation → synthesis. Checks are short pause
points; additional reading and exercises are self-paced rather than packed into
the estimated six-minute canvas sequence.

Defer embeddings, attention, loss equations, optimization mechanics and sampling controls to later lessons. A token is a character in this particular example; other language models can use different token units.

Further explanations are full supporting lesson material, not prose-only recaps.
They can repeat canvas assets, show a static version of a canvas sequence, or add
equations, code, diagrams, images, video and interactive examples. Each planned
asset states its content, placement and purpose before anything is generated.
For this lesson, exact diagrams and code are appropriate; media is not added
solely to demonstrate an available tool.

## Timing

- **Guided explanation:** ~6 min
- **Quiz and review:** self-paced
- **Optional notebook:** ~5 min, pending testing

Playback estimate only; answering checks and optional reading add time.

## Page 1 — What are we trying to teach a computer? (~45 seconds)

### Canvas text

- Heading: **What does a language model predict?**
- Character tiles: `H`, `e`, `l`, `l`, `?`.
- Main caption: **Given the text so far, predict the next token.**
- Prediction box: **Possible next characters**, containing `o`, a space tile, and **other vocabulary characters**.
- Closing caption: **A prediction assigns probabilities; it does not guarantee the next character.**
- Check: **Do we need to predict the whole sentence at once?** Answer after a pause: **No. Predict one token, then repeat.**
- Transition: **How can we represent this text as numbers?**

### Assets

**Diagram to draw:** five character tiles, one prediction box, and a connecting arrow. The prediction box represents possible next characters, not measured model output.

**Further explanations:** reuse the prefix tiles in a static two-step illustration: `Hell → Hello → Hello[space]`. Label the selected characters “illustrative choices,” with no invented scores. This visual appears after the first worked example and shows that the selected character becomes part of the next input. Alt text: “Append o to Hell, then use Hello to predict another character.”

**Images, videos, plots or external assets:** none. An exact text-and-shapes diagram makes the character sequence easier to follow than a generated picture.

### Drawing sequence

1. Title: **What does a language model predict?**
2. Draw a row of character tiles: `H`, `e`, `l`, `l`, `?`.
3. Ask what could follow and leave a short thinking pause. Then show **Given the text so far, predict the next token.**
4. Draw an arrow from the visible prefix to a box labeled **Possible next characters** containing `o`, a space tile, and **other vocabulary characters**.
5. Reveal: **A prediction assigns probabilities; it does not guarantee the next character.**
6. Ask the check, reveal its answer, then show the transition to numerical representation.

This is an invented teaching example, not a prediction from a trained nanoGPT checkpoint. Do not display invented confidence scores.

### Spoken or written explanation

“Hi, and welcome to lesson one! Let's start with a tiny puzzle. Suppose you see H, e, l, l. What might come next? You might suggest o — turning hell into hello, which is much friendlier. You used patterns you have seen before. We want a computer to learn patterns from examples too. Its task is to estimate the next token — one character in this example. It assigns probabilities to possible continuations; it does not know a guaranteed answer. We can build longer text by choosing one character and repeating. Nice — but computers don't read letters, they crunch numbers. So, next question: how do we give the computer this text as numbers?”

### Further explanations

#### Start with a small problem

Imagine building a text-completion tool. Asking it to write a whole paragraph sounds difficult. A smaller question is easier to state: given the text already available, which character could come next? If we can answer that question repeatedly, we have a way to extend a piece of text.

Look at `Hell`. You may expect `o` because you recognize the beginning of `Hello`. That is a useful intuition, but it is not a rule that the next character must be `o`. The same letters can occur in other contexts. We want a predictor that can learn from examples, rather than a handwritten instruction saying “always append o after Hell.”

#### Work through one continuation

Suppose the selection step chooses `o`. The text becomes `Hello`. Now ask the same question again, this time using `Hello` as the available text. Perhaps a space is selected next. We have performed two small prediction-and-selection steps, not predicted an entire sentence in a single step.

**Supporting visual — reuse the canvas tiles here:** `Hell → Hello → Hello[space]`. Highlight only the newly appended character at each step. These are invented choices to explain the process, not outputs from a trained checkpoint.

#### Make the intuition precise, without formulas yet

A token is a unit of text. In our example, it is one character. A vocabulary is the set of token types available to the model. A prediction assigns a probability to each possible next token in that vocabulary; together those probabilities form a distribution and sum to one.

This separates two operations: predicting possible continuations and selecting one to append. A plausible alternative does not have to disappear just because another character is more likely. We have not run a model here, so no numerical probability is claimed. Page 3 will introduce notation once we can point to the inputs and the target it describes.

#### Try a prediction of your own

If `o` was selected, does the next step still use `Hell`? Pause before reading on.

No. It uses the extended text `Hello`. That small change is what lets repeated next-token prediction build a sequence. It also explains why the context matters: later predictions depend on earlier selections. A likely continuation is not necessarily a true statement; this task predicts text, not a guarantee of factual correctness.

We now have a clear goal. Next we need a way to represent characters as numbers while preserving their identity and order.

### References and further reading

This page introduces a general language-modeling concept. The `Hell` prefix is a teaching example, not an observed nanoGPT run. No paper figure, measured probability or external media is used.

Optional source link below the explanation: [nanoGPT README quickstart](https://github.com/karpathy/nanoGPT/blob/3adf61e154c3fe3fca428ad6bc3818b27a3b8291/README.md#quick-start), for the character-level training context. In the app, show this as a source pill.

**Online explanation — start here:** [Hugging Face: Transformers are language models](https://huggingface.co/learn/llm-course/en/chapter1/4#transformers-are-language-models). Read the causal language-modeling example to connect a prefix with a next-token prediction. It also contrasts this with predicting a masked token. The rest of the architecture chapter can wait until later lessons.

**Research paper — optional deeper reading:** [A Neural Probabilistic Language Model — Bengio, Ducharme, Vincent and Jauvin, 2003](https://www.jmlr.org/papers/v3/bengio03a.html). Start with the abstract and introduction for the motivation behind learning probabilities of language sequences and generalizing beyond seen examples. This is historical background using word representations, not a description of nanoGPT's transformer architecture.

## Page 2 — How do we represent text as numbers? (~60 seconds)

### Canvas text

- Heading: **Text → tokens → integer IDs**.
- Example string: `Hello`.
- Toy vocabulary: `H → 0`, `e → 1`, `l → 2`, `o → 3`, `[space] → 4`.
- Encoded sequence: `[0, 1, 2, 2, 3]`.
- Note: **Same character, same ID. Spaces have IDs too.**
- Reverse arrow label: **decode**.
- Footnote: **Toy IDs for this example. Actual IDs depend on the dataset vocabulary.**
- Explain: **An ID is a label, not an importance score.**
- Short encoding check below the canvas: **Encode `lo H` using this toy vocabulary. Include the space.** Expected IDs: `[2, 3, 4, 0]`, revealed only after submission.
- Transition: **What should the model learn from these IDs?**

### Assets

**Diagram to draw:** a row of five character tiles, a five-entry vocabulary key, and an aligned row of five integer tiles. Highlight both `l` tiles together and connect them to ID `2`. A return arrow illustrates decoding.

**Further explanations:** reuse the mapping as a static lookup card beside the runnable Python example. Then extend the canvas example to `Hello Hello`, highlighting the space ID `4`. Caption: “Repeated text reuses the vocabulary; it does not create new IDs.” Alt text: “The same five IDs represent eleven character positions, including the space.”

**Images, videos, plots or external assets:** none. The mappings must be exact, so use structured text and diagram shapes.

### Drawing sequence

1. Title: **Text → tokens → integer IDs**.
2. Bring back `Hello` from the previous page and split it into five tiles.
3. Reveal the toy vocabulary one entry at a time: `H → 0`, `e → 1`, `l → 2`, `o → 3`, `[space] → 4`.
4. Connect characters to `[0, 1, 2, 2, 3]`. Highlight the repeated `l` and ID `2` together.
5. Add a reverse arrow labeled **decode** back to the string.
6. Footnote: **Toy IDs for this example. Actual IDs depend on the dataset vocabulary.**
7. Explain that IDs are labels; invite the encoding check below the canvas, then transition to learning from this sequence.

Check `encode-text`: provide a four-ID text field and Check answer. Accept comma
or space separators, with optional square brackets. Record a valid submitted
answer before showing feedback. Expected: `[2, 3, 4, 0]`. Explain the lookup
l → 2, o → 3, space → 4, H → 0, and decode it back to `lo H`. Invalid formatting
is not a scored attempt. Retry preserves first-attempt correctness and records
that the solution was already revealed. Playback and this check are independent.
The two-page dev preview stores first/latest attempts, count and eventual success
per account/workspace/app/pinned source/plan revision in this browser only.

### Spoken or written explanation

“Welcome back! On the last page we predicted the next character. Now for the cliffhanger: how does Hello become numbers? Simple: we assign each character its own ID. H becomes zero, e becomes one, and both l characters become two — identical twins, same ID. This lookup is called encoding. Reverse it and we recover Hello: that is decoding. And don't read too much into the numbers — a larger ID does not mean a more important character. We have changed the representation; the model has not learned anything yet. So, what prediction task can we build from this sequence of IDs? Your turn: try the encoding exercise below the canvas.”

### Further explanations

#### Why assign numbers at all?

The prediction task starts with text, but the model takes numerical inputs. We need a consistent way to identify each character without losing its place in the sequence. A dictionary is enough for this first step: choose an ID for each token type, then look up those IDs from left to right.

First decide what counts as a token; here it is a character. Then define the vocabulary. `Hello` has five positions but four distinct character types, because `l` occurs twice. Our toy vocabulary also includes a space for the extension below. That makes five vocabulary entries, even though the first string does not use every entry.

#### Work through the mapping in both directions

**Reuse the canvas lookup card beside this code.** Predict the list of IDs before running it. Each lookup uses the same dictionary, so the repeated `l` must produce the same number:

```python
text = "Hello"
character_to_id = {"H": 0, "e": 1, "l": 2, "o": 3, " ": 4}
id_to_character = {index: char for char, index in character_to_id.items()}

ids = [character_to_id[char] for char in text]
restored = "".join(id_to_character[index] for index in ids)

print(ids)       # [0, 1, 2, 2, 3]
print(restored)  # Hello
assert restored == text
```

The first comprehension builds a list of IDs. The reverse dictionary lets the second comprehension recover each character; `join` puts those characters back into a string. The assertion checks the round trip. This is a standalone example, not the actual Shakespeare vocabulary.

Now change `text` to `Hello Hello`. The space contributes ID `4`; the other five IDs repeat. **Insert the extended static mapping here.** Removing the space would reconstruct a different string, `HelloHello`, so whitespace is part of the data rather than decoration.

#### IDs are labels, not measurements

Would giving `l` ID `20` make it more likely? No. IDs identify entries; they do not measure importance or probability. We could consistently rename the IDs and still represent the same strings. Once a model is trained with one mapping, however, changing only the dictionary would point to the wrong learned entries. Encoding, model vocabulary entries and decoding must stay aligned.

An ID is also not an embedding. An ID identifies a token; an embedding is a learned vector associated with that ID. Think of the ID as selecting an entry, while the vector contains values that training can adjust. Lesson 2 will show where those vectors enter GPT.

#### What if the character is missing?

Try encoding `Hello!`. Our toy dictionary has no entry for `!`, so this lookup raises a `KeyError`; it does not invent a new ID. A vocabulary built from a dataset covers that dataset's characters, but a later prompt can introduce an unseen character. Other tokenizers can handle this differently. The important habit is to check what the actual mapping supports.

#### How this connects to nanoGPT

The preparation script collects the dataset's distinct characters, orders them, and builds lookup dictionaries in both directions. The notebook lets you inspect the actual IDs rather than guessing that they match this toy example. Character tokens make that relationship visible, but they also mean a long word occupies several token positions. A subword tokenizer can group multiple characters into one token, so token counts and context lengths must always be interpreted with the tokenizer in mind.

We can now represent the text and recover it. Next we use its order to construct a prediction task: which ID should follow each available prefix?

### References and further reading

Repository connection: open [prepare.py, lines 21–32](https://github.com/karpathy/nanoGPT/blob/3adf61e154c3fe3fca428ad6bc3818b27a3b8291/data/shakespeare_char/prepare.py#L21-L32) beside chat. Use a source pill and highlight this range. The toy vocabulary above is intentionally smaller than the repository's dataset vocabulary.

**Code to show below the canvas:**

```python
chars = sorted(list(set(data)))
vocab_size = len(chars)
```

Source: `prepare.py:22–23`. Accompanying text: “The script gathers the distinct characters and counts them. The following lines build the character-to-ID and ID-to-character lookups.”

**Online explanation — start here:** [Hugging Face: Tokenizers](https://huggingface.co/learn/llm-course/en/chapter2/4). Read Character-based, Encoding, and Decoding. These sections connect text units, vocabulary IDs and reconstruction, and compare character tokens with word and subword tokens. The library examples illustrate a broader approach; this lesson's nanoGPT example uses its own simple character lookup.

**Research paper — optional extension:** [Neural Machine Translation of Rare Words with Subword Units — Sennrich, Haddow and Birch, 2016](https://aclanthology.org/P16-1162/). Read the abstract for why splitting words into smaller units helps handle rare words. This extends the vocabulary discussion beyond character tokens; it is not required for the notebook and does not describe the Shakespeare character tokenizer used here.

## Page 3 — How does text give us training examples? (~65 seconds)

### Canvas text

- Heading: **Use the prefix to predict what follows**.
- Example sequence: `H`, `e`, `l`, `l`, `o`, labeled with positions 1–5.
- Prompt: **Choose a position, then choose its observed next character.**
- Prediction positions: 1–4. Position 5 note: **No recorded next character in this example.**
- Answer choices: `H`, `e`, `l`, `o`. Action: **Check answer**.
- Reveal the selected target after answering; show the full shifted row at recap.
- Arrow label: **next character**.
- Before answering at position 3: **Available prefix: Hel. What followed it in Hello?**
- After answering: **Observed target: l.**
- Captions: **Context = tokens available for this prediction.** **Context window = maximum number of input tokens considered at once.**
- Check: **After Hel, what is the observed target in Hello?** Answer: **l, using only Hel as context.**
- Transition: **How can comparing with that target improve a model?**

### Assets

**Canvas interaction — `prefix-target`:** reuse the character tiles as position
controls. The learner selects one of positions 1–4. Highlight the selected
position and prefix; dim future tile outlines and mask their characters until
submission, including in accessible labels. Dimming readable letters would give
away the answer. This checks observed alignment, not model probabilities; the
learner has already seen the full example.

| Selected position | Available prefix | Observed target |
|---|---|---|
| 1: H | H | e |
| 2: e | He | l |
| 3: first l | Hel | l |
| 4: second l | Hell | o |

Use position indices, not character values. Position 5 is labeled as having no
recorded successor; do not invent an end-of-sequence token. Changing position
clears an unsubmitted answer but retains prior attempts. Arrow keys move among
positions; Enter/Space selects. Choices and Check answer are keyboard-operable,
with visible focus and feedback announced without relying on color.

After submission, record the attempt and reveal the target and associated arrow.
For position 3, correct feedback: “Yes. After Hel, Hello contains another l.”
Incorrect: “You selected [choice]. After Hel the next character in this example
is l; the final o comes one position later.” Use the actual prefix/target for
other positions. Offer Retry, Try another position and Continue; mark trials
after a solution reveal as such. One answered trial is participation, not proof
of mastery of all positions. Support Skip and returning later.

After the interaction show both aligned rows as a recap. They represent observed
training text, not generated predictions. No additional media asset is needed.

**Further explanations diagram:** a two-panel static context-window illustration from `Hello Hello`, using a toy window of four. Show `Hell → o`, then `ello → [space]`, with the excluded first `H` outside the second window. Mark this window size as illustrative, not the quickstart setting. Alt text: “After appending o, the four-character window contains ello and excludes the first H.” Also reuse the aligned rows beside the code and probability notation.

Use structured tiles and arrows for both diagrams. No photo or generated video is needed; all characters and alignments must be exact. These diagrams are planned assets, not yet rendered.

### Drawing sequence

1. Title: **Use the prefix to predict what follows**.
2. Show Hello with numbered positions. Demonstrate position 1 as an explicitly unscored example.
3. Pause for the learner to choose a position and submit an answer. Do not reveal the answer on a timer.
4. Give feedback and reveal the associated arrow only after submission. Offer another position, Continue or Skip.
5. On Continue or Skip, reveal the complete input row H e l l and target row e l l o, one associated arrow at a time. Mark later trials as following a reveal.
6. Add the context and context-window captions, then transition to how comparison improves the model. Extra learner interaction time is outside the clip-duration estimate.

### Spoken or written explanation

Before interaction: “We have the sequence Hello. How can it supply its own answers? After H, the observed next character is e. Now choose a position yourself. Look at the prefix and choose the character that followed it in this example.”

After submission or Skip: “Shifting by one position pairs inputs with targets. The predictor may use the prefix, but seeing future characters would give away the answer. Now we can compare a prediction with a target. How does that comparison help the model learn?” Do not narrate a pending answer before submission.

### Further explanations

#### Why the target row is shifted

We do not need someone to label every next character separately: the original text already tells us what followed. The trick is to use one part as the available input and its one-position-shifted counterpart as the answer for comparison. “Target” means that observed answer, not a character generated by the model.

Take the five-character string `Hello`. Four input positions can be paired with four next-character targets. The rows have the same length, but the target row begins one character later. At the third input position, the model has seen `Hel` and is being asked to predict the next `l`. Seeing the current `l` is allowed; seeing the following `l` as an input to that position would reveal the answer.

This small Python example constructs the alignment without a model:

```python
text = "Hello"
inputs, targets = text[:-1], text[1:]
for position, target in enumerate(targets):
    prefix = inputs[:position + 1]
    print(f"{prefix!r} -> {target!r}")
assert len(inputs) == len(targets) == 4
```

Expected pairs: `H → e`, `He → l`, `Hel → l`, and `Hell → o`. The two consecutive `l` characters create different prediction examples because their prefixes differ. Do not confuse identical characters with identical positions.

#### Give the example a compact mathematical name

Now that we can point to the prefix and its target, write:

$$P(x_{t+1} \mid x_1, x_2, \ldots, x_t)$$

Here $x_t$ is the token at position $t$, $x_{t+1}$ is the next token, and the bar means “given.” $P$ denotes probability. For the fourth input position in our example, the probability assigned to the observed target can be written $P(o \mid H,e,l,l)$. The letters here stand for their corresponding tokens; in code we supply their IDs. This is the familiar question “how likely is o after Hell?” written compactly, not a new prediction task.

The model predicts a distribution over the whole vocabulary. The particular observed target picks out one entry of that distribution for evaluation. We have no measured values to insert into this expression yet.

#### Several predictions, without looking ahead

Training can evaluate all four positions together. That does not give every position permission to use every input token. The dependency remains causal: a position can use itself and preceding positions, while later inputs are unavailable to it. Lesson 3 explains how a causal mask enforces that rule. Here, the important distinction is between computing multiple predictions together and allowing future information to leak into a prediction.

The targets are available to the training procedure for comparison. They are not extra context that the model is allowed to inspect before predicting them. Otherwise it could copy the answers instead of learning how prefixes relate to continuations.

#### Context length is not output length

**Insert the planned two-panel sliding-window diagram here.** Caption: “The sequence can grow while each prediction uses a bounded window.”

In the toy diagram, each prediction uses at most four input characters. The complete generated string can nevertheless contain many more than four characters. Distinguish the stored text from the portion supplied to one model call. Cropping the input window does not mean deleting those earlier characters from the displayed output.

The Shakespeare quickstart configuration uses `block_size = 256`; this is a configuration choice, not a universal GPT limit. Because this example uses character tokens, it counts characters, including spaces and line breaks. A different tokenizer would make the same token count correspond to a different amount of text.

#### Check the boundary

At the `Hel` position, could we let the predictor read the final `o` because it appears in the same training string? No: it is future information for that position. Keeping targets for comparison is different from making them available as input. With that boundary clear, we can ask how the comparison changes the model during training.

### References and further reading

**Repository — shifted targets:** [train.py:110–125, get_batch](https://github.com/karpathy/nanoGPT/blob/3adf61e154c3fe3fca428ad6bc3818b27a3b8291/train.py#L110-L125). Compare the input slice with the slice starting one position later. The lesson's string example isolates that relationship without introducing tensor batching.

Source pill: [config/train_shakespeare_char.py, lines 15–22](https://github.com/karpathy/nanoGPT/blob/3adf61e154c3fe3fca428ad6bc3818b27a3b8291/config/train_shakespeare_char.py#L15-L22). Explain only the dataset and context setting here; defer architecture dimensions.

**Online refresher:** [Hugging Face: causal language modeling](https://huggingface.co/learn/llm-course/en/chapter1/4#transformers-are-language-models). Revisit the next-token example if “targets” and “future inputs” still feel like the same thing. The distinction to retain is what the predictor sees versus what its answer is compared with.

## Page 4 — What changes during training? (~60 seconds)

### Canvas text

- Heading: **Same prediction task, different use**.
- Training: **Known text → predict → compare with observed next token → update parameters**.
- Generation: **Prompt → predict → select token → append token**.
- Training caption: **Learned parameters change**.
- Generation caption: **Text grows; learned parameters stay fixed**.
- Side note: **Validation compares with known targets, without updating parameters**.
- Definition: **Learned parameters = adjustable numerical values inside the model**.
- Check: **Does a longer generated answer mean the parameters changed?** Answer: **No. The generated text changed; the learned parameters stayed fixed.**
- Transition: **Where do training and generation live in nanoGPT?**

### Assets

**Canvas diagrams:** two clearly labeled process lanes. Training loops back to another example after an update. Generation loops the extended prompt back to prediction. Use the same prediction-box appearance in both lanes to emphasize the shared task.

**Further explanations visual:** reuse the two lanes with annotations marking what changes. Add a three-row comparison of training, validation and generation, followed by a two-step trace `Hell → Hello → Hello[space]`. Label the trace “invented continuation, not a checkpoint result.” Do not imply that the next token is always the highest-probability one. Alt text: “A selected character is appended before the next prediction; the learned parameters do not change.”

No video generation. Staged arrows already show the repeated process precisely and can be paused; a photorealistic clip would add no useful information.

### Drawing sequence

1. Title: **Same prediction task, different use**.
2. Define parameters as adjustable numerical values. Build the training lane using `Hell` and observed target `o`: **Known text → predict → compare with observed next token → update parameters**. Loop to the next training example.
3. Generation lane: **Prompt → predict → select token → append token**. Loop the longer prefix into prediction.
4. Under training: **Learned parameters change**.
5. Under generation: **Text grows; learned parameters stay fixed**.
6. Add the validation side note after both main lanes are complete.
7. Pause for check `generation-weights`, with Yes / No and Check answer. Record the choice before feedback. Correct: “No. The generated text changed; the learned parameters stayed fixed.” Incorrect: “Appending tokens changes the generated sequence, not the learned parameters. Once the context window is full, each prediction uses a shifted, bounded input.” Offer Retry or Skip, then transition to the repository mapping.

### Spoken or written explanation

“Our example tells us that o followed Hell. During training, we compare the model's prediction with that observed target. The comparison guides changes to adjustable numbers inside the model, called parameters. Generation does something different: keep those parameters fixed, select a token, append it and predict again. The text changes, but that is not a training update. Validation also keeps parameters fixed while comparing predictions with known answers. Let's see where these activities happen in nanoGPT.”

### Further explanations

#### How can an example improve a prediction?

Return to `Hell` with observed target `o`. Suppose a model assigns little probability to `o`. We have a signal that this example was poorly predicted. Learning uses comparisons across examples to adjust numerical parameters inside the model. Think of those parameters as adjustable settings, not dictionary entries containing complete answers. We are not measuring a particular checkpoint here, so the comparison is qualitative.

A loss measures prediction error; gradients indicate how changes to parameters affect that loss, and an optimizer applies updates. We will study those mechanisms later. For now, the causal connection is enough: examples provide targets, targets make error measurable, and updates try to improve predictions across examples. One update is not a guarantee that every example improves.

#### Compare the three activities

**Reuse the canvas lanes here**, annotating training's parameter update and generation's growing text. Then read the comparison:

| Activity | Known next-token targets? | Learned parameters updated? | Main result |
|---|---|---|---|
| Training | Yes | Yes | Adjusted model parameters |
| Validation | Yes | No | A measurement on held-out examples |
| Generation | Not required | No | An extended token sequence |

Validation answers a different question using the current parameters. It measures predictions on examples held out from the training updates. This comparison can reveal that improvement on training text is not transferring to other text. Validation itself is not another round of parameter learning.

#### Walk through generation twice

**Insert the planned generation trace here.** Start with the invented prompt `Hell`. Suppose the selection step chooses `o`. Append it, giving `Hello`. Predict again with that extended prefix; suppose a space is selected next. The displayed text is now `Hello` followed by a space.

These are illustrative choices, not measured outputs. The distribution is recomputed for the new context, and selection can involve sampling. Generating twice from the same prompt can therefore give different results without any intervening training. Lesson 7 introduces temperature and top-k; neither needs to be mastered to understand this loop.

#### Changing context is not the same as learning weights

Write the conceptual predictor as $P_{\theta}(x_{t+1} \mid x_1, \ldots, x_t)$. The symbol $\theta$ stands for the learned parameters. Training changes $\theta$. Ordinary generation keeps $\theta$ fixed while the prefix changes. Both changes can alter a prediction, but they occur for different reasons.

This helps explain why adding an instruction or example to a prompt can change the answer without retraining. The model receives different input. It does not follow that a standalone generation call permanently records that input in its learned parameters.

#### The boundary in this repository

The generation method repeatedly obtains next-token scores, selects a token and appends it. It limits each model call to the allowed context length. The training script has a separate parameter-update loop. Do not infer that a generated answer has been compared against a correct answer simply because it sounds confident; that comparison belongs to a different workflow.

**Pause and explain:** Two generations from the same prompt differ. Must the parameters have changed between them? No: selecting different tokens can lead to different later contexts with the same parameters. We now know what changes in each workflow. Next we will locate those workflows in the repository.

### References and further reading

**Repository — generation:** [model.py, GPT.generate](https://github.com/karpathy/nanoGPT/blob/3adf61e154c3fe3fca428ad6bc3818b27a3b8291/model.py#L283-L302). Follow the loop and append operation; save sampling controls for Lesson 7.

**Repository — validation:** [train.py:204–217, estimate_loss](https://github.com/karpathy/nanoGPT/blob/3adf61e154c3fe3fca428ad6bc3818b27a3b8291/train.py#L204-L217). This evaluates losses separately from parameter updates.

**Online extension:** [PyTorch: Optimizing Model Parameters](https://docs.pytorch.org/tutorials/beginner/basics/optimization_tutorial.html). Compare the training and test loops. Focus on which loop performs updates; the tutorial's dataset and task differ from this character language model.

## Page 5 — How does nanoGPT implement this workflow? (~60 seconds)

### Canvas text

- Heading: **nanoGPT makes the training and generation pipeline concrete**.
- Initial view: **Prepare data → Train a model → Generate text**.
- Reveal inside Prepare data: **Tiny Shakespeare text → prepare.py → train.bin / val.bin**.
- Reveal inside Train a model: **train.py**, **model checkpoint**.
- Reveal inside Generate text: **sample.py → generated text**; the checkpoint supplies learned state.
- Token-file labels: **train.bin: learning examples**; **val.bin: held-out evaluation examples**.
- Training input: **config/train_shakespeare_char.py → settings**.
- Model definition label beside training and sampling: **model.py: the GPT implementation**.
- Closing caption: **Data files are examples. A checkpoint stores learned state.**
- Check: **Does train.bin contain the learned weights?** Answer: **No. It contains encoded examples.**
- Transition: **Can you trace one string through this entire workflow?**

### Assets

**Canvas diagram:** start with only three group containers and two connecting
arrows: Prepare data → Train a model → Generate text. Reveal filenames inside
the active group while explaining its role. Keep group positions stable and
earlier groups visible but quiet. Configuration is a small settings annotation
inside Train a model, not a fourth stage. Add model.py as a shared implementation
label only once training and generation are clear. Put the detailed connections
in Further explanations. Preserve all existing pinned source links.

**Further explanations visual:** a static three-card comparison: “Data: encoded examples,” “Code: how computation works,” “Checkpoint: saved learned state.” Use file icons and text, not screenshots of imaginary files. Alt text: “Token files, Python source, and a saved checkpoint play different roles in one pipeline.”

No external media or generated video. These exact repository relationships are clearer as a structured diagram.

### Drawing sequence

1. Title: **nanoGPT makes the training and generation pipeline concrete**.
2. Show only **Prepare data → Train a model → Generate text**, explaining the three purposes before filenames.
3. Emphasize Prepare data; reveal the text, prepare.py and token files inside it.
4. Emphasize Train a model; reveal train.py, checkpoint and the small configuration annotation. Explain training versus evaluation without drawing all branches.
5. Emphasize Generate text; reveal sample.py and generated text, showing that it uses saved learned state.
6. Add the shared model.py label. Offer the detailed static diagram in Further explanations rather than expanding every connection automatically.
7. Ask which artifact stores examples and which stores learned state; reveal the answer, then transition to the recap.

### Spoken or written explanation

“We know the steps; now let's locate them in nanoGPT. Preparation turns text into token IDs. Training uses those examples to adjust parameters. A checkpoint saves learned state. Sampling loads a model and extends a prompt. The files now have a reason to exist: train.bin holds examples, not learned weights. The quickstart uses Shakespeare rather than our tiny Hello example, but the roles are the same.”

### Further explanations

#### Turn the conceptual workflow into a reading map

Suppose you want to move from our `Hello` example to training on a real text collection. You need more than a prediction formula: you need prepared data, a model implementation, a training procedure and a way to use the result. nanoGPT makes those responsibilities visible in a few files. Read the diagram from left to right before opening any source file.

**Reuse and expand the three-group diagram here.** Keep the same group positions,
adding the train.bin / val.bin branches, a validation arrow labeled “evaluate,”
the configuration settings connection and model.py uses links to training and
sampling. This static version leaves time to inspect the detail. Alt text:
“Preparation writes training and validation data; training updates a model while
validation evaluates it. Generation uses saved model state. Configuration
supplies settings; model.py supplies the shared implementation.”

#### Separate the examples, the computation and the learned result

**Insert the planned data/code/checkpoint comparison here.** A Python implementation describes operations and how components connect. Learned parameters are numerical values adjusted during training. A checkpoint saves model state so that another process can reconstruct the trained model. The training data supplies examples; it is neither the implementation nor the learned parameters.

This distinction explains why downloading the repository alone is not the same as obtaining a trained Shakespeare model. Source code can initialize a model, but an untrained initialization has not learned the patterns in that dataset. For useful sampling you need suitable learned weights, whether trained yourself or loaded from an appropriate checkpoint.

#### What preparation produces

The character preparation script separates the text into training and validation portions, encodes them, and writes binary token arrays. It also saves vocabulary metadata so the IDs can be interpreted consistently. The binary files are compact data artifacts, not readable prose documents and not generated answers. Encoding preserves the sequence; it does not perform learning.

The two files support different questions: “Which examples guide parameter changes?” and “How well does the current model predict held-out examples?” Keeping validation separate helps detect a model that fits training examples better than it generalizes. A favorable validation result still does not prove that the model will perform well on every other kind of text.

#### Where the configuration fits

The quickstart configuration selects settings for this training example, including its dataset and context length. Settings specify how an experiment should run; learned weights are the values produced by learning. Changing a setting in a source file does not retroactively retrain an existing checkpoint.

For this lesson, follow file responsibilities rather than memorizing every option. Later lessons will inspect the model structure and training controls when those details answer a concrete question.

#### A useful reading route

Start with the README to understand the intended workflow. Then inspect preparation to see what the data becomes. Follow `train.py` for how examples are used, `model.py` for the prediction computation, and `sample.py` for turning a prompt into generated text. This route gives each file a purpose before you read its details.

As a check, imagine someone sends only `train.bin`. You have examples, but not necessarily the matching vocabulary metadata, configuration, implementation and learned checkpoint required to reproduce their generation. Ask which artifact is missing instead of treating all files as interchangeable.

**Check your reasoning:** If you edit the configuration after saving a checkpoint, have you changed its learned weights? No. You have changed instructions for an experiment, not applied a training update to that saved model. We can now explain both the conceptual stages and where they live. The final page asks you to connect them yourself.

### References and further reading

Sources: [README quickstart](https://github.com/karpathy/nanoGPT/blob/3adf61e154c3fe3fca428ad6bc3818b27a3b8291/README.md#quick-start), [prepare.py, lines 34–48](https://github.com/karpathy/nanoGPT/blob/3adf61e154c3fe3fca428ad6bc3818b27a3b8291/data/shakespeare_char/prepare.py#L34-L48).

**Repository — vocabulary metadata:** [prepare.py:50–56](https://github.com/karpathy/nanoGPT/blob/3adf61e154c3fe3fca428ad6bc3818b27a3b8291/data/shakespeare_char/prepare.py#L50-L56). See which lookup information is saved alongside the token arrays.

**Online companion:** [PyTorch: Optimizing Model Parameters](https://docs.pytorch.org/tutorials/beginner/basics/optimization_tutorial.html). The training and evaluation loops provide a second example of separating parameter updates from measurement. Its classification example is not nanoGPT; detailed optimizer mechanics belong to Lesson 6.

## Page 6 — Check your mental model (~70 seconds)

### Canvas text

- Heading: **Text in, next-token predictions out**.
- Recap: **Text → IDs → model → next-token prediction**.
- **Check 1: What does one position predict?**
- Answer, revealed after a pause: **A distribution over the next token, using its available prefix.**
- **Check 2: Why keep training and validation data separate?**
- Answer, revealed after a pause: **To evaluate predictions on examples not used for the training updates.**
- Closing: **Try the quiz, review the cards, or inspect text and IDs in the notebook.**

### Assets

**Canvas diagram:** one four-stage recap with two question cards and separately revealed answer cards. Keep answers hidden until their reveal points. Use the existing Quiz, Flashcards and Notebook navigation; do not draw nonfunctional buttons as part of the diagram.

**Further explanations:** reuse `Hello` and the vocabulary from Page 2 in a complete annotated trace. Add one compact misconception table. No new tokenizer or external media is necessary for this retrieval check.

### Drawing sequence

1. Title: **Text in, next-token predictions out**.
2. Compact recap: **Text → IDs → model → next-token prediction**.
3. Display **Check 1: What does one position predict?** Pause for the learner, then reveal its answer.
4. Display **Check 2: Why keep training and validation data separate?** Pause for the learner, then reveal its answer.
5. Link to the Quiz and optional **Notebook: text and token IDs** using existing lesson navigation.

### Spoken or written explanation

“Let's put the pieces together. Take Hello. How do we encode it, and what should each position predict? Pause and explain before checking the diagram. Training compares with the observed next character and changes parameters. Generation keeps them fixed and extends a prompt. The repository gives each step a home. We understand the task now. In Lesson 2, we will open the model and see how token IDs become useful predictions.”

### Further explanations

#### Explain the whole task using one tiny example

Before reading the walkthrough, try to explain the path from `Hello` to training examples in your own words. Name what changes during training and what changes during generation. This is a retrieval exercise: the goal is to connect the steps, not repeat their labels.

**Reuse the annotated trace here.** With our toy mapping, `Hello` becomes `[0, 1, 2, 2, 3]`. The first four IDs form the input `[0, 1, 2, 2]`; shifting one place gives targets `[1, 2, 2, 3]`. At the third position, the available characters are `Hel`, and the observed next character is `l`, ID `2`.

The model predicts a distribution over its vocabulary. Training compares that prediction with the target and uses the error to guide parameter updates. The ID `2` identifies the target; it is not a probability of two. When generating from `Hell`, there is no required answer supplied for comparison: the system selects a token, appends it, and continues with unchanged learned parameters.

Now locate those roles: preparation creates token data, training learns parameters, a checkpoint saves model state, and sampling uses a model to extend a prompt. The actual Shakespeare IDs come from its dataset vocabulary and need not match our five-entry example.

#### Diagnose common mix-ups

| If you hear… | Replace it with… |
|---|---|
| “The token ID is its probability.” | An ID is a lookup label; a probability is a prediction that depends on context. |
| “train.bin is the trained model.” | It stores encoded examples; learned model state is saved in a checkpoint. |
| “The model predicts the whole answer in one step.” | Generation repeatedly predicts, selects and appends a token. |
| “A longer prompt updates the weights.” | A prompt changes the context; ordinary generation keeps weights fixed. |
| “Validation trains on a second file.” | Validation measures predictions without performing the training updates. |

Try explaining one correction without looking at the right column. If the explanation is difficult, revisit the relevant page rather than memorizing its wording.

#### What to do before Lesson 2

Take the two-question quiz to check the task and the data artifacts. Use the four flashcards for the vocabulary: token, vocabulary, context window, and next-token prediction. If the difference between characters and IDs still feels abstract, open the optional notebook. It lets you inspect and change an encoding example without training a neural network.

The notebook deliberately ends before prediction. Successfully encoding and decoding a string proves that the lookup is consistent; it does not demonstrate a trained model or meaningful generated text. When you change a preview length or start position, the underlying vocabulary stays the same.

#### The next question

We now know what goes into the model and what it is asked to predict. We have not yet explained how it converts IDs into useful scores. Lesson 2 opens that box: embeddings, transformer blocks, normalization and the output head. You do not need to explain attention or derive a loss equation to complete this lesson.

### References and further reading

**Repository reading route:** [prepare.py](https://github.com/karpathy/nanoGPT/blob/3adf61e154c3fe3fca428ad6bc3818b27a3b8291/data/shakespeare_char/prepare.py), [quickstart configuration](https://github.com/karpathy/nanoGPT/blob/3adf61e154c3fe3fca428ad6bc3818b27a3b8291/config/train_shakespeare_char.py), and [README quickstart](https://github.com/karpathy/nanoGPT/blob/3adf61e154c3fe3fca428ad6bc3818b27a3b8291/README.md#quick-start). Be able to state each file's responsibility before exploring its details.

**Optional refresher:** [Hugging Face: Tokenizers](https://huggingface.co/learn/llm-course/en/chapter2/4). Revisit encoding and decoding if the worked example was unclear. The papers linked on Pages 1–2 are optional background, not prerequisites for the quiz or the next lesson.

## Asset and interaction manifest

| ID | Primitive | Purpose | Planned content / source |
|---|---|---|---|
| next-character | Text, tiles, arrows | Establish the task | Page 1's explicitly illustrative prefix |
| encoding-map | Text, tiles, arrows | Make encoding reversible | Page 2's toy character mapping |
| continuation-reading | Reused character tiles | Make repeated prediction concrete | Page 1 Further explanations: Hell → Hello → Hello[space] |
| encoding-extension-reading | Reused lookup card and extra tiles | Show vocabulary reuse and spaces | Page 2 Further explanations: Hello Hello with space ID 4 |
| shifted-targets | Two aligned rows, highlights | Explain next-token targets | Page 3's Hello example |
| repository-pipeline | Boxes and arrows | Connect concept to repository | Page 5's verified quickstart stages |
| train-vs-generate | Two flow diagrams | Separate parameter learning from text extension | Page 4 |
| recap | Text and arrows | Recall the task | Page 6 |
| context-window-reading | Static two-panel tile diagram | Extend Page 3 with a bounded-window example | Further explanations: Hell → o, ello → [space]; toy window of four |
| artifact-comparison-reading | Three illustrated cards | Distinguish data, code and learned state | Further explanations on Page 5; file icons and exact labels |
| generation-trace-reading | Two-step text diagram | Reuse Page 4's generation loop with a concrete example | Further explanations: Hell → Hello → Hello[space]; invented continuation |
| prefix-target | Position selection, answer submission and feedback | Let the learner apply prefix/target alignment | Page 3; reuses character tiles; objective predict-next |
| repository-details-reading | Expanded static three-group diagram | Preserve detail without crowding the initial view | Page 5 Further explanations; existing source links retained |

Use existing tldraw text/diagram primitives. Group meaningfully related shapes with semantic IDs and source metadata. Connectors appear with their associated explanation, not all at once. Source pills open the highlighted file in the resizable right panel, keeping chat available.

No photos, generative video, 3D assets, extracted paper figures or quantitative plots are proposed: none improves this lesson's explanation enough to justify the extra work. Verified papers and online explanations are linked as optional further reading, without importing or generating assets. No mathematical derivation is needed. This is a decision for this lesson, not a restriction on future lessons.

## Quiz — exact content

### Question 1

You use `Hello` as a training example. At the position where the available prefix is `Hel`, what should the model predict?

- A. The entire next paragraph at once.
- B. A distribution over the next character; the observed target in this example is `l`.
- C. The integer ID of the current character without using context.

Correct: **B**.
**Before answering:** picture the two aligned rows and mark where the available prefix ends. No calculation or remembered file name is needed.

**Why B is right:** the model estimates possible next characters from `Hel`. The actual next character in `Hello` is the second `l`, so that is the training target. A different context could produce a different distribution, even with the same last input character.

**If you chose A:** one position predicts the next token, not the rest of the paragraph. A generation loop builds longer text by repeating prediction and selection. Revisit Page 1's two-step continuation.

**If you chose C:** an ID is the representation of a character. Looking it up does not estimate which character follows the prefix. Compare Page 2's encoding with Page 3's shifted targets.

**Transfer check:** after `Hell`, which observed character is the target? `o`. The task stays the same; the available prefix and target change.
Objective: identify next-token prediction.

### Question 2

You have prepared the text and obtained `train.bin` and `val.bin`. A colleague says, “The trained model is in train.bin; val.bin is a backup.” Which correction is right?

- A. Storing trained model weights and generated answers.
- B. Keeping identical copies of the same data for faster generation.
- C. Storing encoded training examples and held-out validation examples.

Correct: **C**.
**Why C is right:** both files hold encoded examples. Training examples guide parameter updates; validation examples let us measure predictions without those updates. Saved learned state belongs in a checkpoint.

**If you chose A:** this mixes up data, learned state and generated text. Use Page 5's three artifact cards to identify the role of each before memorizing filenames.

**If you chose B:** a validation set is useful because its examples are held out from the training updates. An identical backup would not serve that purpose.

**Transfer check:** does measuring validation loss by itself train the model? No. Comparing against targets is not sufficient; a parameter-update step is what changes learned weights. See Page 4's two lanes.
Objective: distinguish dataset artifacts from the model and explain evaluation.

## Flashcards — exact fronts and backs

| Front | Back |
|---|---|
| Token: how many token positions are in Hello in this character example? | Five: H, e, l, l, o. A token is one text unit; here each character is one unit. The repeated l occupies two positions. A space would count too. |
| Vocabulary: do the two l characters in Hello need different IDs? | No. A vocabulary lists token types with a consistent ID for each. Both l positions use ID 2 in our toy mapping; five positions do not require five distinct types. IDs identify entries, not probabilities. |
| Context window: with a toy four-character limit, what part of Hello is used for the next prediction? | ello, the most recent four characters in this cropping example. The context window limits the input to a model call; it does not limit the total length of displayed generated text. |
| Next-token prediction: after Hell, does the model directly return an entire paragraph? | No. It estimates a distribution over the next token. A generation step selects one, appends it, then predicts again. For example, selecting o makes Hello the next prefix. |

Use the existing flip interaction and Got it / Not yet controls. Ask learners to
answer the concrete question before flipping; the back supplies the concept and
its reasoning. The cards practice retrieval rather than copying definitions.

## Optional notebook — Text and token IDs (~5 minutes)

Clean draft export: [lesson-01-notebook.ipynb](lesson-01-notebook.ipynb).
It preserves raw code, splitting the five review sections into seven Jupyter
cells (three code and four Markdown). All six Python fences in this lesson
compile, allowing top-level await for the Pyodide download cell. No escaped
underscores, emphasized keywords or nonbreaking-space indentation were found in
the source. The export round-trips the three notebook code cells exactly. These
checks do not establish browser execution; that release requirement stays open.

Editable learner copy with Reset to this approved baseline. No training, GPU, model download or checkpoint required. Browser notebook dependency: Pyodide's existing `pyodide.http.pyfetch`; remaining operations use Python built-ins.

### Cell 1 — Markdown

“Can we turn text into numbers without losing it? We will begin with Hello, then use the same idea on Tiny Shakespeare. Before running each cell, predict what will happen. Run it, change one thing, and explain the result. This notebook explores representation; it does not train a neural network.”

Predict: `Hello` contains five positions. How many distinct characters does it contain? Four, because `l` repeats. We will check that distinction in code.

### Cell 2 — Code: predict and test the toy mapping

Before running: predict the encoded list and whether decoding will return exactly `Hello`. Use the lookup card from Page 2.

```python
toy_to_id = {"H": 0, "e": 1, "l": 2, "o": 3, " ": 4}
toy_to_character = {index: char for char, index in toy_to_id.items()}
example = "Hello"
example_ids = [toy_to_id[char] for char in example]
restored = "".join(toy_to_character[index] for index in example_ids)
print("Text:", repr(example))
print("IDs:", example_ids)
print("Restored:", repr(restored))
assert restored == example
```

Expected: `[0, 1, 2, 2, 3]` and the restored string `Hello`. Both `l` positions use `2`. Change `example` to `Hello Hello`, predict where `4` appears, and run again. It appears at the space; the same character IDs are reused.

### Cell 3 — Code: build the real dataset vocabulary

The toy mapping was chosen for readability. Now let the dataset determine the characters. Predict: must its ID for `l` equal `2`? No—the mapping can differ. This cell downloads the text, so it needs a network connection.

```python
from pyodide.http import pyfetch

url = "https://raw.githubusercontent.com/karpathy/char-rnn/master/data/tinyshakespeare/input.txt"
response = await pyfetch(url)
if not response.ok:
    raise RuntimeError(f"Dataset download failed: HTTP {response.status}. Retry this cell.")
text = await response.string()
print("Characters:", len(text))
print(repr(text[:120]))
characters = sorted(set(text))
character_to_id = dict(zip(characters, range(len(characters))))
id_to_character = dict(enumerate(characters))
print("Vocabulary size:", len(characters))
print([(repr(c), character_to_id[c]) for c in characters[:12]])
```

Expected: nonempty text, a vocabulary size, and distinct IDs including whitespace. `set` collects distinct characters; sorting gives a consistent order; the dictionaries map in both directions. Exact dataset values are not claimed as executed results. Before publication, pin/cache the dataset and record its hash; this URL currently follows the upstream preparation script's mutable dataset URL.

### Cell 4 — Code: inspect several sequences

Predict: when a character occurs in two different snippets, should its ID change? No. The dictionary stays fixed; only the sequence being encoded changes. Run this cell and use the printed character/ID pairs to check your prediction.

```python
def encode(value):
    unknown = set(value) - set(character_to_id)
    if unknown:
        raise ValueError(f"Characters absent from this vocabulary: {sorted(unknown)!r}")
    return [character_to_id[c] for c in value]

def decode(ids):
    return "".join(id_to_character[i] for i in ids)

for start in (0, 40, 80):
    snippet = text[start:start + 16]
    ids = encode(snippet)
    print("Text:", repr(snippet))
    print("IDs: ", ids)
    print("Pairs:", list(zip(map(repr, snippet), ids)))
    assert decode(ids) == snippet
```

Expected: three text/ID comparisons and successful round trips. These slices are short only to make the output readable.

Then change the start positions or preview length. Explain why different snippets give different lists, yet the same character keeps the same ID. This is the difference between changing the input and changing the representation scheme.

### Cell 5 — Markdown: try it

1. Return to the toy example. Predict what happens with `Hello!`, then try it: the toy dictionary has no `!`, so its direct lookup raises `KeyError`. An ID cannot be silently invented while keeping the trained vocabulary unchanged. Restore the valid example afterward.
2. Choose a character actually present in the downloaded text. Find its ID in two snippets. Explain why it stays the same even when the surrounding text differs.
3. Has any cell learned to predict the next character? No. We constructed and tested reversible lookups. Prediction requires a model; learning requires parameter updates.

**Finish by explaining:** “Encoding changes the representation of text; it does not learn which token should come next.” If the round-trip assertion fails after an edit, check that encoding and decoding use matching dictionaries. Reset returns your copy to the baseline; your experiments must not change another learner's notebook.

## Review and build checks

- [x] Six pages cover only Lesson 1's requested concepts.
- [x] Two quiz questions and four flashcards have explicit answers.
- [x] Notebook cells and expected behavior are available for review.
- [x] Toy examples are labeled; no unmeasured model probabilities are shown.
- [x] Lesson 1 repository references checked at the pinned commit.
- [ ] Owner confirms audience and reviews timing/content.
- [ ] Curriculum and this exact lesson plan revision approved.
- [ ] Dataset snapshot pinned and browser notebook executed successfully.
- [ ] Raw notebook export round-trips without escaped underscores, emphasized keywords or nonbreaking-space indentation; exported notebook executed in the actual browser runtime.
- [ ] Page 3 position selection, answer masking, keyboard interaction and feedback verified.
- [ ] Objective-linked checks persist across reload, distinguish attempted/correct/revealed/skipped states and isolate each learner's progress.
- [ ] Rendering matches the approved plan, source links and highlights work.
- [ ] Quizzes, flashcards, notebook editing/reset and lesson playback verified.

Open review point: six minutes leaves limited time for reading. Keep extended text below the canvas and let learners pause; measure pacing in preview before calling this a six-minute lesson.

Next milestone: one functioning Lesson 1, with this interaction and the existing
assessments, previewed by someone comfortable with basic Python and new to
transformers. Observe whether they can complete the prefix/target task, explain
fixed parameters during generation, and distinguish data from learned state.
Record confusion and time spent; revise from that evidence rather than adding
more assets. Audience preview and all build requirements above remain pending.
