"""Freeze five distinct local build conversations; never sends a model request."""

import hashlib
import json
import subprocess
from pathlib import Path

from bench import HERE, ROOT, digest, env_values, redact, save
from prepare import q

CP = "packages/control-plane/src/"
CLI = "packages/cli/bin/small.js"
CASES = [
    dict(id="r01", title="Jobs and missing run logs", project="small-jobs",
         session_id="964ce61b-c4b5-476d-975e-0f401bf47782", commit="7f9f105",
         paths=["packages/runtime/runner.py", "packages/cli/lib/generate.js", CP + "fly.js", CP + "index.js", CLI],
         questions=[
             q("job lifecycle", "why", "Why does deploying a job start nothing, and why does it use runner.py instead of guard.py?",
               ["Distinguish registering/building the image from starting a run with small run.", "Tie runner.py to a finite script with no HTTP port/auth wall, capturing logs and exit status."],
               ["Claim a job deploy starts a continuously serving HTTP app."]),
             q("missing logs diagnosis", "operations", "The script wrote its S3 result but Small kept showing running with no logs. What did this session eventually diagnose and change?",
               ["Report the historical Cloudflare 1010/default Python-urllib User-Agent diagnosis and small-runner User-Agent fix.", "Explain that failed runner log/exit-status POSTs left the control plane without completion despite the script succeeding; distinguish from the earlier route-clobber incident."],
               ["Assert this benchmark freshly reproduced the failure or attribute the eventual problem only to S3 writes."]),
             q("job verification", "evidence", "What did the final job integration run actually verify, and how long did that reported test run take?",
               ["Report the four passing checks: live progress, S3 JSON with caller identity, two runs listed, and log replay.", "Give the reported 49-second final suite duration as a historical observation, not a promise about every deploy."],
               ["Claim the final suite still hung or that the benchmark independently reran those infrastructure checks."]),
             q("log delivery failure", "coaching", "Should a temporary failure to send a batch of logs terminate the user's job? What behavior should we preserve?",
               ["Preserve the job continuing after bounded delivery retries; the job must not die on a log hiccup.", "Mention three attempts then dropping the batch with a stderr diagnostic, not guaranteed delivery."],
               ["Recommend unbounded retries or silently claim every log is durably delivered."]),
             q("run token duration", "unknown", "Was the six-hour run-token expiry chosen from measurements of customer job durations?",
               ["Identify the six-hour expiry as implemented.", "State that no such measurements or rationale for that exact duration are recorded."],
               ["Invent a customer-duration study or claim six hours was measured optimal."]),
             q("job feature scope", "scope", "Did this session ship scheduling, automatic job retries, concurrency limits, and a jobs web UI?",
               ["Say those capabilities were explicitly deferred in this job session.", "Separate job retries from the runner's bounded log-POST retries."],
               ["Treat log delivery retries as an implemented job retry scheduler."]),
         ]),
    dict(id="r02", title="Persistent SQLite storage", project="small-sqlite",
         session_id="473c94ca-a511-4caa-bbfb-52342a79435b", commit="808470e",
         paths=[CP + "fly.js", "packages/cli/lib/init.js", "packages/cli/lib/generate.js", "examples/counter/app.py", "examples/counter/small.toml"],
         questions=[
             q("storage purpose", "why", "What failure motivated persistent storage, and why must the volume and machine stay in the same region?",
               ["Explain the counter reset when the machine was replaced and the need for state to outlive it.", "Explain per-app persistent volume reuse and co-location of volume and machine, with the machine pinned to the volume's region."],
               ["Claim creating a new empty volume on every deploy preserves the old counter."]),
             q("merge preservation", "correction", "During the storage rebase, was it acceptable to replace the jobs machine configuration with the server's volume configuration?",
               ["Say no: the user explicitly required preserving both paths.", "Keep jobs' auto_destroy/startMachine behavior while adding server ensureVolume/mount handling; do not apply the server path indiscriminately to jobs."],
               ["Recommend dropping the existing jobs path as part of the storage change."]),
             q("persistence evidence", "evidence", "The final live counter read 16. Did the persistence test require the counter to equal exactly 3, and what did it prove?",
               ["Explain that the test asserted before + 3 after machine destruction and redeploy, not an absolute 3.", "Explain that the reported 16 accumulated across prior runs and is consistent with persistence; frame this as session-reported evidence."],
               ["Call 16 proof of a failed test or claim this benchmark independently replaced a machine."]),
             q("storage inference", "behavior", "What makes small init add storage, and should SMALL_DATA be requested from the user as a secret?",
               ["Identify entry-file sqlite3 imports or SMALL_DATA references as the storage inference triggers.", "Explain SMALL_* values are platform-injected and excluded from required secrets; local counter falls back to ./counter.db."],
               ["Ask the colleague to supply a secret value for SMALL_DATA."]),
             q("storage size rationale", "unknown", "Was 1GB selected after a measured storage-capacity study for the counter?",
               ["Recognize 1GB as the requested/default storage size.", "State no measured capacity study or optimal-size comparison is recorded."],
               ["Invent a measured workload or claim 1GB guarantees enough storage for every app."]),
             q("storage boundaries", "coaching", "Can I tell colleagues this version includes automatic backups and shared storage across apps?",
               ["Say backups and cross-app sharing were explicitly skipped.", "Describe the single-volume/single-region per-app design; avoid presenting deferred capabilities as available."],
               ["Promise automatic backups or cross-app volume sharing in this snapshot."]),
         ]),
    dict(id="r03", title="Request logs", project="small-request-logs",
         session_id="9a9d7713-2967-4744-86e7-841788ab01c8", commit="91311e9",
         paths=["packages/runtime/guard.py", CP + "index.js", CLI, "docs/v7_request_logs.md"],
         questions=[
             q("traffic versus machine state", "why", "Why did small logs change its default, and how can I still get the previous machine-state view?",
               ["Tie the change to seeing actual request traffic rather than only machine state.", "Name --machine as the preserved previous view and describe the newest-first request-log default."],
               ["Claim the prior machine-state interface was removed."]),
             q("log privacy constraint", "coaching", "For easier debugging, should we log complete query strings, request bodies, and the asserted user on rejected direct requests?",
               ["Reject bodies/query strings: log path only.", "Rejected 403 requests have rejected=true and no user; the provided user header must not be treated as trusted attribution on a rejection."],
               ["Recommend persisting bodies, full queries, or trusted user attribution for rejected requests."]),
             q("request log evidence", "evidence", "What did the final two-user and direct-origin test report in small logs?",
               ["Report three POST /inc 303 click lines and one GET / 403 direct-origin rejection.", "The rejection has no user; the successful clicks reflect two users, and the output is historical reported evidence."],
               ["Say the direct-origin request succeeded through the auth wall or that this benchmark made those requests."]),
             q("batch timing rationale", "unknown", "Why exactly batch every two seconds or fifty lines? Was that interval benchmarked against one second?",
               ["State the requested/implemented two-second or fifty-line threshold.", "Say no recorded comparison establishes those exact thresholds as optimal; distinguish general batching benefits from historical evidence."],
               ["Invent a measured latency or cost comparison."]),
             q("websocket log status", "behavior", "A WebSocket log says status 101. Does that prove the upstream application returned a successful upgrade?",
               ["Say 101 is assumed in this raw-tunnel implementation, not parsed from the upstream response.", "Note logging occurs after the tunnel closes; avoid treating it as independent proof of a successful upstream handshake."],
               ["Claim the logger parses and verifies every upstream WebSocket handshake."]),
             q("log endpoint wiring", "why", "Why did this feature add a SMALL_LOG_URL assignment in deploy, outside the initial list of logging files?",
               ["Explain the guard needs the endpoint and app slug to POST its batches.", "Without SMALL_LOG_URL older images remain stdout-only; this wiring was needed for control-plane request logs."],
               ["Claim the variable contains user log bodies or was added to alter runner.py."]),
         ]),
    dict(id="r04", title="Generated runbooks and review lifetime", project="small-runbook",
         session_id="0f6aa39f-c101-41d4-a743-2114cbbf9c2c", commit="241e5c9",
         paths=[CP + "review.js", CP + "index.js", CLI, "docs/v8_runbook.md", "RUNBOOK.example.md"],
         questions=[
             q("runbook purpose", "why", "Who was the generated runbook intended to help, and why reuse the deploy review call?",
               ["Identify the colleague who did not write the tool and needs to understand/run it before sharing is useful.", "State the runbook extends the same review model call and source bundle rather than introducing a separate per-deploy generation call."],
               ["Claim runbooks are manually authored by colleagues or generated in an independent second per-deploy model call."]),
             q("review lifetime correction", "operations", "Why was deploy review moved out of waitUntil, and what replaced it?",
               ["Report the approximately 30-second waitUntil lifetime problem with longer review/runbook model calls as observed in this session.", "Describe the CLI holding POST /api/review/run open alongside the Fly build, with storage completed before the response; old-client fallback does not mean the new path still relies on waitUntil."],
               ["Recommend relying only on waitUntil for the new CLI path or claim this benchmark freshly measured Cloudflare."]),
             q("runbook storage choice", "behavior", "Did adding runbooks require a new D1 column or read endpoint? Where do the current and previous versions live?",
               ["Explain runbooks live inside existing review/review_prev JSON with reviewed_at, requiring no D1 migration.", "Reading reuses GET /api/review; distinguish the POST /api/runbook generation route used by init before an app row exists."],
               ["Claim a dedicated D1 runbook column or new GET read endpoint shipped."]),
             q("hand edits correction", "correction", "Can I edit a saved RUNBOOK.md, and why was 'do not edit by hand' removed from its generated-by line?",
               ["Say hand edits are allowed and the wording was removed rather than enforcing a prohibition.", "Explain edits can be overwritten by --write or regenerated copies; the regenerated-on-deploy wording remains."],
               ["Claim the system prohibits editing or automatically merges every manual edit into future model output."]),
             q("route correction", "evidence", "The initial runbook test request named /click. Was that the actual counter endpoint used in the final test?",
               ["Identify the actual counter increment route as /inc, not /click.", "Explain the implementation/test followed the existing code and the final generated runbook showed POST /inc."],
               ["Invent a new /click route to match the original wording."]),
             q("diff algorithm rationale", "unknown", "Was the line-set runbook diff selected after benchmarking it against an ordered diff?",
               ["Describe the simple line-set diff and its lack of ordering, matching review --diff.", "State no benchmarking/comparison establishing it as superior is recorded; an ordered diff is explicitly deferred."],
               ["Invent measured superiority or claim the current diff preserves line ordering."]),
         ]),
    dict(id="r05", title="Cron and unverified trigger delivery", project="small-cron",
         session_id="a6b56e54-f7a3-4935-96fb-26edbbd9f87d", commit="7de2dc9",
         paths=[CP + "cron.js", CP + "index.js", "packages/control-plane/wrangler.jsonc", CLI],
         questions=[
             q("cron overlap choice", "why", "What should cron do when the prior run is still active, and why not launch another machine?",
               ["Skip launching another scheduled run to preserve the explicit no-overlap requirement.", "Write a skipped run row with reason previous run still active, keeping evidence of the skipped tick."],
               ["Recommend launching concurrent cron runs or silently dropping all record of the skip."]),
             q("schedule placement correction", "correction", "The test wrote a schedule into small.toml, but the control plane stored no schedule. What was wrong with the test setup?",
               ["Explain the appended schedule landed inside the preceding [secrets] section instead of at TOML root.", "Describe prepending the top-level schedule as the fix; distinguish this from the later missing-trigger-delivery problem."],
               ["Claim this was fixed by accepting schedule as a secrets field."]),
             q("cron verification state", "evidence", "At the end of this session, had a real cron tick and overlap skip been successfully demonstrated?",
               ["Say the two tick-dependent integration checks were still not demonstrated; no delivered cron invocation was reported.", "Distinguish registered trigger/handler and passing other checks from actual tick delivery; treat the agent's platform-root-cause attribution as an inference, not independently proven fact."],
               ["Claim both cron checks passed or promise they must pass unchanged once Cloudflare delivers a tick."]),
             q("late tick handling", "behavior", "How does the scheduler avoid double-firing when a tick is delayed or delivered again? Does it replay every missed minute after downtime?",
               ["Explain nominal scheduledTime floored to a minute and last_scheduled_at preventing duplicate/older tick execution.", "Say catch-up of every missed minute was explicitly skipped."],
               ["Claim the scheduler replays all missed jobs after downtime."]),
             q("scan horizon rationale", "unknown", "Why does nextRun stop searching after four years? Was four years validated as the optimal performance cutoff?",
               ["Identify the bounded scan and its stated purpose of rejecting expressions with no found occurrence, such as February 30, at deploy time.", "Say no measured comparison establishing exactly four years as optimal is recorded."],
               ["Invent a performance benchmark selecting four years."]),
             q("pause preserves schedule", "coaching", "To stop further attempts while investigating trigger delivery, should I erase the cron expression? What did this session leave configured?",
               ["Recommend schedule pause: retain the expression and set schedule_paused rather than erase it.", "Report the session ended with the test schedule paused again so nothing would start unexpectedly."],
               ["Claim the final test schedule was left actively running or that pause deletes the schedule expression."]),
         ]),
]


def messages(path, secrets):
    kept, excluded = [], 0
    for line_no, line in enumerate(path.open(encoding="utf-8"), 1):
        row = json.loads(line)
        if row.get("type") not in ("user", "assistant") or row.get("isSidechain") or row.get("isMeta"):
            continue
        content = row.get("message", {}).get("content", "")
        text = content if isinstance(content, str) else "\n".join(x.get("text", "") for x in content if x.get("type") == "text")
        if not text.strip() or text.startswith(("<local-command", "<command-name>", "<bash-", "<task-notification>",
                                                "This session is being continued", "<system-reminder>")):
            excluded += 1
            continue
        if row.get("sessionId") != path.stem:
            raise ValueError("Mixed session IDs")
        clean = redact(text, secrets)
        kept.append({"id": f"m{line_no}", "role": row["type"], "text": clean,
                     "source_uuid": row.get("uuid"), "source_line": line_no, "timestamp": row.get("timestamp"),
                     "original_sha256": hashlib.sha256(text.encode()).hexdigest(), "redacted": clean != text})
    return kept, excluded


def prepare():
    secrets = list(env_values().values())
    root = Path("C:/Users/cyudhist/.claude/projects")
    cases = []
    for spec in CASES:
        case = json.loads(json.dumps(spec))
        path = root / ("C--Users-cyudhist-Desktop-workspace-" + case["project"]) / (case["session_id"] + ".jsonl")
        case["messages"], case["excluded_message_rows"] = messages(path, secrets)
        case["source_session_file"] = path.name
        case["commit"] = subprocess.check_output(["git", "rev-parse", case["commit"]], cwd=ROOT, text=True).strip()
        case["sources"], case["source_hashes"] = {}, {}
        for source in case.pop("paths"):
            original = subprocess.check_output(["git", "show", case["commit"] + ":" + source], cwd=ROOT).decode("utf-8")
            case["sources"][source] = redact(original, secrets)
            case["source_hashes"][source] = hashlib.sha256(original.encode()).hexdigest()
        for i, question in enumerate(case["questions"], 1):
            question["id"] = case["id"] + f"-q{i}"
        cases.append(case)
    corpus = {"version": 2, "source_sessions": 5, "synthetic": False, "cases": cases,
              "selection": "Five distinct Small worktree sessions, one builder/repository; not random or statistically independent.",
              "scope": "Complete normalized visible main-thread text; no tools, hidden thinking, terminal envelopes or compaction summaries.",
              "label_status": "Agent-authored question rubrics fixed before inference; not human gold."}
    save(HERE / "retrieval-corpus.json", corpus)
    print(json.dumps({"sessions": len(cases), "messages": [len(c["messages"]) for c in cases],
                      "conversation_chars": [sum(len(m["text"]) for m in c["messages"]) for c in cases], "sha256": digest(corpus)}))


if __name__ == "__main__":
    prepare()
