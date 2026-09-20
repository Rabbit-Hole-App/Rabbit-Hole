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
  "referenceType": "external_reference_only",
  "localPath": ".local-benchmark-cache/illustrated-transformer/self-attention-detail.png",
  "productionAllowed": false
}
```

The benchmark runner reads the cache. Anyone can re-capture from `sourceUrl`.
Nothing restricted enters git history or a product bundle.

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
