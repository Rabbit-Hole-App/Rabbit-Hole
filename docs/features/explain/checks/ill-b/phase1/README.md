ILL-B Phase 1 harness (experiment; outside the product repo). Set ILLB_ENV_FILE to the .env that holds RECRAFT_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY (names only are read; never printed).
Run (from the folder holding these scripts and a run/ directory):
1. images: `node phase1.mjs --real --owner-ok-usd 15` (resumable; `--dry-run` first)
2. judges: `node judges.mjs --real --owner-ok-usd 15` (`--judge gemini|sonnet|both`)
3. blind sheets, per group as it completes: `node sheets.mjs` (`--group physical|spatial|abstract`, `--partial`)
4. scoring after the Reviewer's csv: `node score.mjs --reviewer claude/ill-b-reviewer-scores.csv`
Never push: salt.json, run/key.json, run/originals (unless asked). The key stays local until claude/ill-b-reviewer-scores.csv is pushed.
