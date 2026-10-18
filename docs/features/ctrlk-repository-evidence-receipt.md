# Explicit repository evidence inspector

Implementation `e7ea5de3`, with actual-schema permission tests at `1671fce7d4bf490f57b2fedae7df22e214322e10`. Dev version `c90040ba-17fc-4dfe-a263-f6d4f993286a` at [session dev app](https://rabbit-hole-web-dev-ctrlk-tools.tryrabbithole.workers.dev).

An owned repository canvas with an exact indexed commit exposes **Search this repository** in Ctrl+K. Opening it performs no retrieval; the user enters a separate literal query and presses Search or Enter. The query is not inherited from Chat or the generation prompt. Results distinguish source-line matches from symbol metadata; source pills use the existing viewer. Inspection never mutates selected objects or invokes a model.

## Evidence

- Focused evidence access tests: **6 passed, 0 failed, 0 skipped**. Includes real SQLite repository schema/access checks with controlled identity and bucket fixtures, no database writes. Original adapter/route checks remain attributed to their original commits.
- Build passed in **11.73 seconds**, dev upload10.50 seconds.
- Deployed browser fixture run2: **4 passed, 0 failed, 0 skipped, 0 interrupted**,4.248 seconds. Existing repository catalog/snapshot/evidence responses are fixtures; actual app interaction verifies blank explicit query, source/metadata distinction and existing source viewer navigation. A separate actual deployed request confirms nonexistent/unowned repository refusal before reading source.
- Run1: **1 passed, 1 failed, 0 skipped, 2 interrupted**. The test literal contained a shell-corrupted question mark in place of the UI middle dot; corrected to an explicit Unicode escape with exact assertion retained. Application unchanged for run2.
- Local evidence: `ctrlk-evidence-unit.log`, `ctrlk-evidence-build.log`, `ctrlk-evidence-deploy.log`, `e2e/shots/ctrlk-evidence-run1/`, `e2e/shots/ctrlk-evidence-run2/`.

## Limits

No verified owned indexed dev repository was available for complete deployed retrieval verification. Do not count browser fixtures as that coverage. This is an explicit deterministic inspector, not natural-language `find_evidence` routing, shared/private attached-source search, factual rewriting or full repository coverage. Source previews are bounded; omitted import content is unavailable. No model calls, indexing/import jobs, main push or production action occurred.

[Extraction dev receipt](ctrlk-extraction-native-receipt.md) records the preceding independent slice; [core PR #4](https://github.com/Rabbit-Hole-App/Rabbit-Hole/pull/4) remains a separate checkpoint.
