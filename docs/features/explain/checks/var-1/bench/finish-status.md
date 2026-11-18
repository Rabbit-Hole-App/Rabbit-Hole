# VAR-1 bench finish: status 2026-11-18 14:15 PT

Not run yet: items 155 to 302 on both arms and the 20 variation runs on Gemini. Gemini answers HTTP 402 "prepayment credits are depleted" again (probes at 14:09, 14:14; one probe at about 14:05 returned 200, so the top-up was seen once and is not holding). Nothing was spent on the attempt: the resume harness (run2.mjs, settled-cost stop line US$5.50 counting earlier runs, exit 4 after three consecutive Gemini provider_error first attempts) made 2 runs that ended in provider_timeout before it was stopped; those rows were deleted so the plan resumes cleanly.

run2.mjs = run.mjs + patch-run2.mjs. Resume: `node run2.mjs --out results-gemini.jsonl --cap 5.50 --only <items 155-302,1000-1019>`.

Done offline from the saved results (no spend): offline-2ab.md (the flags on the Gemini-live slice, real vs false positive, and first-attempt-invalid error codes) and vary-bands-gptoss.md (variation bands for the 19 gpt-oss pairs already run; the same script runs on the Gemini results).
