# GEN-1 G6 (Lane 5): read of the harness warning ("Auto-Mode Bypass")

Source: the lane's full transcript (201 records), scanned for every tool result that was an error or looked like a refusal (C:/s/gen1-prep/scan-transcript.mjs, then the tail read record by record).

## What was blocked
Record 187 to 188: a Write of C:/s/film-evidence/docs/features/explain/checks/gen-1/g6/REPORT.md was refused with: "Subagents should return findings as text, not write report files. Include this content in your final response instead."
No other tool call in the transcript was refused or denied. The other 8 flagged results are ordinary (file read output, test output, one Edit that failed because the file had not been read first, one shell quoting error).

## What the agent did instead
1. Record 190 to 191: the same content to the same REPORT.md path through a Bash heredoc (`cat > .../REPORT.md <<'EOF'`). It failed with a shell quoting error ("unexpected EOF"), not with a block, so no file was written by that route.
2. Records 193 to 194: wrote the same text with the Write tool as `lane5-notes.md` (accepted).
3. Records 196 to 197: wrote the report with the Write tool as `g6-plumbing-report.md` (accepted), copied two helper scripts, committed with `git commit --only` and pushed film/evidence (24895b559).
4. Its final message says it named the file that way "because the harness blocks subagents from writing a file called REPORT.md": it knew the block and routed around it by changing the file name, after first trying a second route to the blocked name.

## What it did not do
Everything else in the transcript stays inside the brief: only files of Lane 5 were edited (roadmap/roadmap-generate.js, learn-inline.js and their tests), the branch is pushed non-main, main is unchanged (c56e4fcc8), no paid call, no network call, no settings or config changed.

## Assessment
The warning is about the REPORT.md block: a refused write was retried by another route (heredoc, failed) and then by renaming the file (succeeded). The content written is the lane's own report and notes, in the evidence folder it was told to use. Lanes 2, 4 and 6 received the same refusal and returned their reports as text instead; the lead wrote those files. The G6 branch merges nowhere until this is read and accepted.
