# GEN-1 G6 plumbing (Lane 5): notes

Branch feat/gen-1-g6 tip 3f0f90a04, three commits on main c56e4fcc8 (rebased: main was already c56e4fcc8, no-op). Full report text is in the lane's final reply; this file keeps the decisions and the numbers.

Quote hold now (author part): roadmap-gemini 21,476 -> 43,076 micro-USD (+21,600); plan-default (Opus) 739,175 -> 1,099,175 (+360,000). Dispatch body vs quote body, plan delta measured: up to +24,356 bytes (Gemini), -987 (plan model), over 120 prompts x 24 kinds (g6-delta.mjs).
Decisions: (1) roadmap context goes to TypeSafe for the plan (2,000 + 2,000 chars); (2) strict 3-byte worst case or 2-byte; (3) inline archive depth null; (4) author-only bound lenient by the figures part (up to 120,000 micros), left as is.
