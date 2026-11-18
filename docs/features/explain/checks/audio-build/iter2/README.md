# Card audio iteration 2 (feat/audio-build-2)

Worktree C:/s/audio-build-2, branch `feat/audio-build-2` on `rabbit-hole`, based on feat/audio-build 5be5d3402. feat/audio-build and its worktree were not touched.

STATUS: code, tests and docs are done and pushed. The LIVE steps (the 36-call measurement on the 12 AUD-2 cards, and the one live script + one voice call with the full texts) are NOT run: the permission system denied the first paid measurement command ("Destructive or Unwanted Actions"), and I did not work around it. Harness is ready: `node run-length2.mjs v2a 3` in this folder (Gemini first, 36 calls plus any re-asks, about USD 0.06 to 0.12; writes results2.jsonl, raw2.jsonl). The live-check script is `../live-check.mjs` (needs its import paths pointed at audio-build-2 and a full-text output file).

| Item | Commit |
|---|---|
| A length rules (floors, one re-ask, card-number rule, counting words, Gemini asks, plain wording, no Greek letters) and the voice cost on the script answer | 302c574de (hunk.diffs/1-length-rules.diff) |
| D in-flight marker | 29c89e50a (hunk.diffs/2-voice-marker.diff) |
| B cost confirmation | a8673c797 (hunk.diffs/3-confirm-cost.diff) |
| Docs | a600bbc8c (hunk.diffs/4-docs.diff) |

Coordination primitive for D: no KV binding exists on the worker (wrangler.rabbit-hole-prod.jsonc has D1, R2, a service binding only). The paid routes coordinate through D1 (admitSpend stable operation ids, admitUsage rows), so the marker is one atomic INSERT ... WHERE NOT EXISTS row in `shared_ask_events` (no migration). B: the pill had no cost confirmation before (it sent confirmed:true at once); it now opens ConfirmDialog with the shared usageLine wording (GenerationProposalCard.jsx usageLine / UNKNOWN_PRICE) and the server's credit figure.
Counting words (A3): per the coordinator's measurement it saves only about 5 words per Gemini script (28 of 35 strips) and lets invented small example sizes ("ten emails") pass; kept as decided, and the prompt now says to use only the card's own numbers for examples.
