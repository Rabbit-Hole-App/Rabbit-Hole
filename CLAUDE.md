# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

# small

Deploy a Python app for your team, behind a work-email login, in one command.
Read docs/SCOPE.md for the product and docs/v1_mvp_shipped.md for what's built and why.

## Layout
- `packages/cli` — Node CLI, zero dependencies, stdlib only. Never add a package.
- `packages/control-plane` — Cloudflare Worker + D1. Holds every credential. The CLI never sees a Fly token.
- `packages/runtime` — Python, stdlib only. `guard.py` fronts every server container.
- `examples/` — one directory per app shape; each has a `small.toml`.
- `tests/unit_tests`, `tests/integration_tests` — mirror the package layout.

## Rules
- Every command prints what it decided: `✓ entry: app.py (flask)`. A wrong guess must be visible in one line.
- Fail at deploy time, not runtime. Missing secrets, unknown framework, bad entry all stop the deploy with a one-line fix.
- The user never sees a Dockerfile, a Fly app name, or a session cookie.
- `make test-unit` before every commit. `make test-integration` before merge.
- Mark anything deliberately skipped with a `ponytail:` comment.
- Feature specs live in `docs/features/<name>.md`. Implement the spec; don't expand it.
- Never guess identifiers or state — DB names, paths, flags, what's applied where. Read the config/source/remote state first; every suggested command must come from a verified source, not memory or pattern-matching. One wrong guessed command costs more than three verification reads.

---

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
