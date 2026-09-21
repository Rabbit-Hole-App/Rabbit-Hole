# Source

Canonical URL:
https://jalammar.github.io/illustrated-transformer/

Section: "The Decoder Side"

Licence: CC BY-NC-SA 4.0 — https://creativecommons.org/licenses/by-nc-sa/4.0/
(restrictive; see ../../../REFERENCE-LICENSING.md)

Attribution:
Alammar, J (2018). The Illustrated Transformer [Blog post]. Retrieved from
https://jalammar.github.io/illustrated-transformer/

Captured: 2026-09-20

This source has no diagram for causal masking - only the text quoted below.
No image was invented to stand in for a missing one.

Per the restrictive policy, the captured text is not committed here as a
standalone asset. It is cached at `.local-benchmark-cache/illustrated-transformer/`
(gitignored) and catalogued in `reference-manifest.json` alongside this file.
The exact quote (short enough to reproduce here for context):

> "In the decoder, the self-attention layer is only allowed to attend to
> earlier positions in the output sequence. This is done by masking future
> positions (setting them to -inf) before the softmax step in the
> self-attention calculation."
