# Batched authoring contract

This call is one part of a batched authoring pass. Every rule above applies unchanged. The input field `part` says which part this is. The pipeline assembles the parts mechanically; return exactly the fields named for your part and nothing else.

## part: foundation

Return `{files}` with exactly two files: `topic-<artifactTopic>-data.js` and `topic-<artifactTopic>-data.test.mjs`. The data module exports `toyData` (the supplied toy data), `metadata` (`{topic, artifactTopic, title, lessons, sources, briefLink}`, copied from the supplied topic metadata) and `derived()`, which returns every computed value any visual may display (counts, impurities, gains, draws, probabilities, means, leaf counts, depths). The test starts with `import test from 'node:test'` and `import assert from 'node:assert'` (not `node:assert/strict`; no other built-in is allowed) and recomputes each derived value independently. Write no references.

## part: batch

Return `{prelude, references, derived, tests, replay, walkthrough}` for the prompts in `assigned` only. Each assigned prompt gets exactly one reference. The data module in `dataModule` is read-only: do not return it. `helperSource` shows the definitions that are already in scope.

- `prelude` is statements that run before your references (helper functions and constants shared by this batch; an empty string if none). It runs after `helperSource`, so `data`, `replay`, `metadata`, `spec` and `reference` are in scope. Do not import anything; use `data` only.
- `references` has one entry per assigned prompt: `{id, expression}`. `id` is the reference id (the `referenceId` of its replay row). `expression` is one JavaScript expression, `reference({ id, keywords, useWhen, overview, standard, deep })`, where each of `overview`, `standard` and `deep` is `{ spec: spec(diagram), detailSpec?: spec(diagram) }`. Take every displayed number from `data.derived()` or from a computation on `data`.
- `derived` is a function expression `() => ({...})` returning numbers this batch computes beyond `data.derived()`, or an empty string.
- `tests` is the body of a block. It runs after `import test from 'node:test'` and `import assert from 'node:assert'`, so `test`, `assert`, `data`, `references`, `derived` and `replay` are in scope. Recompute every displayed number of your references against `derived()` and test that each reference's own prompt and keywords are present.
- `replay` has one row per assigned prompt: `{id, prompt, referenceId, paraphrases}` where `id` is the assigned prompt id, `prompt` is the assigned prompt verbatim, `referenceId` is a unique `idPrefix` id for your reference, and `paraphrases` is exactly five distinct strings. `reference({ id })` looks its prompt up by that `referenceId`.
- `walkthrough` is an empty string unless `last` is true. When `last` is true it is the topic walkthrough markdown for every prompt in the topic (the supplied exemplar walkthrough shows the format).

On a retry, `previous` holds your last answer for this part and `feedback` holds the verbatim failure. Repair the failure and return the complete part again. Return only the references named in feedback changed; every other reference in your part must be identical to `previous`. When the feedback names only some of the part's references, `assigned`, `previous.references` and `previous.replay` hold only those references: return `references` and `replay` for exactly those (the pipeline keeps the part's other references unchanged), and return `prelude`, `derived`, `tests` and `walkthrough` complete, starting from `previous`, so `tests` still covers every reference of the part.
