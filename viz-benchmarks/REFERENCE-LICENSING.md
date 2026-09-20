# Reference material: what may be committed, and what may not

Decided 2026-09-19, before the first capture of restrictively licensed material.

Benchmark references come from other people's work. The licence on that work
decides where the bytes may live — not how useful the reference is, and not how
internal we consider the use.

## The two policies

| licence | reference storage |
|---|---|
| **Permissive** — MIT, Apache, BSD, CC BY | captures may live in this repository, provided the licence's attribution conditions are satisfied in the project's `SOURCE.md` |
| **Restrictive** — CC BY-NC-SA, CC BY-NC, all-rights-reserved, unclear | **URL and metadata only.** Captures go in a gitignored local cache |

Default to the restrictive policy when the licence is unclear. An unlicensed page
is not permissive by omission.

## Why, for the NonCommercial case

CC BY-NC-SA 4.0 grants copying and adaptation **only for NonCommercial purposes**,
which Creative Commons defines as use not primarily intended for commercial
advantage or monetary compensation. Whether an internal benchmark inside a
commercial product effort sits outside that restriction is fact-specific and may
depend on an exception.

**Do not bake that assumption into the architecture.** Committed files persist in
git history and travel with every clone of a commercial product's repository,
which is a decision that cannot be quietly reversed later. Storing the reference
outside the repository costs nothing and removes the question.

## The restrictive layout

```text
cases/<case>/reference/
├── SOURCE.md                # canonical URL, section, licence, attribution
├── reference-manifest.json  # what exists, and where it is cached locally
└── .gitkeep

.local-benchmark-cache/      # gitignored, never packaged
└── <project>/
    └── the actual captures
```

`reference-manifest.json`, one entry per reference:

```json
{
  "sourceUrl": "https://jalammar.github.io/illustrated-transformer/",
  "section": "Self-Attention in Detail",
  "license": "CC BY-NC-SA 4.0",
  "licenseUrl": "https://creativecommons.org/licenses/by-nc-sa/4.0/",
  "capturedAt": "2026-09-19",
  "referenceType": "external_reference_only",
  "localPath": ".local-benchmark-cache/illustrated-transformer/self-attention-detail.png",
  "productionAllowed": false,
  "contentHash": "sha256:..."
}
```

**`contentHash` is what makes a gitignored reference auditable.** It proves which
exact version of a reference an evaluation ran against without the image itself
ever being committed. A source article can be re-edited, and without the hash a
score from six months ago is a claim about a picture nobody can identify.
`capturedAt` and `licenseUrl` exist for the same reason: a licence can change,
and a reader needs to know which one applied at capture time.

The benchmark runner reads the cache. Anyone can re-capture from `sourceUrl`.
Nothing restricted enters git history or a product bundle.

## A missing capture fails loudly

**The runner must never silently substitute synthetic material for an absent
external reference.** That would produce an evaluation labelled external that is
in fact internal — a suite reporting coverage it does not have, which is the one
failure this whole programme is built to avoid.

When a manifest entry's `localPath` is missing, stop with the reason and the fix:

```text
REFERENCE_MISSING

Capture required from:
  https://jalammar.github.io/illustrated-transformer/  (Self-Attention in Detail)

Expected local cache:
  .local-benchmark-cache/illustrated-transformer/self-attention-detail.png
```

A hash mismatch is the same class of problem and gets the same treatment: say
which reference changed, and do not score against it until a human has looked.

## The separation must be enforced, not merely written

Build and package code may reference **neither** `viz-benchmarks/` nor
`.local-benchmark-cache/`. A rule in a document decays the first time somebody is
in a hurry; the same rule asserted by a test does not. Keep that assertion cheap
and keep it running.

## What is unchanged

This is about where reference *bytes* live. It changes nothing about the
methodology: the evaluation target stays semantic and pedagogical parity,
`visualImitationTarget` stays false everywhere, and copying a reference's palette,
typography, shapes or wording remains a scored failure regardless of its licence.
