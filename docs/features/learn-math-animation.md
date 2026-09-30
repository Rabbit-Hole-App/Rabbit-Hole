# manim-generated maths animations

`generate_math_animation` accepts a validated declarative specification, renders it with manim on a
private worker, and stores the MP4 through the existing generated-video job. The tutor supplies the
steps; it never writes Python.

Not included: arbitrary manim scripts, 3D scenes, custom mobjects, sound, or a manim editor.

## Contract

The shared schema is [math-schema.json](../../packages/math-renderer/math-schema.json). It is
enforced in the control plane ([learn-math-schema.js](../../packages/control-plane/src/learn-math-schema.js))
and again in the worker ([validation.py](../../packages/math-renderer/validation.py)).

Four step kinds, at most eight steps, at most 45 seconds in total:

- `equation` — LaTeX lines that morph into each other, with optional highlighted fragments.
- `plot` — axes with ranges, up to three functions, and an optional marker that travels along the
  first curve with an optional tangent.
- `shapes` — circles, rectangles, arrows, lines, dots, braces and labels, with entrance animations
  and moves.
- `matrix` — a matrix with row or column emphasis, and an optional 2×2 grid transformation.

## Two strings reach an interpreter

Everything else in the schema is numbers and enums. These two are allowlisted on both sides:

- **LaTeX** is rendered by TeX, which can read and write files. Only an explicit set of maths
  commands passes; `\input`, `\write`, `\def`, `\csname` and `\usepackage` are refused rather than
  escaped, as are `$`, `%` and `#`. TeX also runs with `shell_escape=f` and `openout_any=p`.
- **Plot expressions** are evaluated per sample. Python parses them as an expression tree and checks
  every node kind, name and call, then evaluates with no builtins; the control plane applies the
  same allowlist textually. A domain error yields no point instead of failing the render.

## Architecture

`Learn agent JSON → authenticated dev API → durable video job → private Fly worker → trusted manim
compiler → MP4 → private R2 asset → the canvas video block`.

The worker lives in `packages/math-renderer`. The compiler constructs manim objects from the
specification; no Python source is generated from model output, so there is no generated code for a
specification to escape into. The render subprocess gets a clean environment without the service
token, runs as an unprivileged user in a temporary directory, and is capped at 420 seconds and
25 MB. One render at a time.

Cache keys are canonical at every level and include the worker's compiler version, so a reordered
specification reuses a render while a changed scene or a rebuilt compiler does not. Captions and
display ids are presentation and do not invalidate an asset.

## Deploying the worker

The worker is a separate Fly app so its LaTeX layer and slow renders stay off the Blender machine.

```
cd packages/math-renderer
fly launch --no-deploy --copy-config --config fly.dev.toml --name small-math-renderer-dev
fly secrets set MATH_WORKER_TOKEN=<token> --app small-math-renderer-dev
fly deploy --config fly.dev.toml --app small-math-renderer-dev
```

Then point the dev worker that serves Learn at it, with the same token. The
worker config lives in `packages/web` (there is no `wrangler.dev.jsonc` in
`packages/control-plane`): `wrangler.dev.jsonc` for the shared dev worker,
`wrangler.parallel.jsonc` for the small-parallel review clone.

```
cd packages/web
npx wrangler secret put MATH_WORKER_URL --config wrangler.parallel.jsonc    # https://small-math-renderer-dev.fly.dev
npx wrangler secret put MATH_WORKER_TOKEN --config wrangler.parallel.jsonc
```

Once one real render passes, set `maths_animation` back to `ready: true` in
`packages/control-plane/src/learn-primitives.js` so /animate returns.

## Verification

- [x] Schema, limits, per-kind fields, ranges and references — `packages/math-renderer/test_validation.py`.
- [x] LaTeX and expression allowlists refuse file access, macro definition and program text, on both
      sides — `test_validation.py` and `packages/control-plane/test/learn-math-schema.test.js`.
- [x] Spec resolution and safe evaluation, including domain errors — `test_compile.py`.
- [x] Provider submit/poll, busy, failure, lost job and cache-key behaviour — `test/math-provider.test.js`.
- [x] Both validators accept the same shipped sample, and its compiled functions agree with what the
      animation claims (σ(0) = 0.5, σ'(0) = 0.25).
- [x] A real manim render end to end: 2026-09-29, `small-math-renderer-dev` rendered the shipped sample
      (18.9 s, 854x480) on the small-parallel clone — `packages/web/e2e/manim-render-check.mjs` (paid).
- [ ] Playback, retry and placement of a rendered animation in the canvas block.
