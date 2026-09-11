"""Offline scoring/report for the subscription-only session-retrieval comparison."""

import json
import os
import statistics
from datetime import datetime, timezone
from pathlib import Path

from tests.evals.coaching import bench as b
from tests.evals.coaching.retrieval import ARMS, tokens, saved_contexts
from tests.evals.coaching.subscription import grading_complete


def score(run_dir, corpus):
    rows, captures = [], []
    for case in corpus["cases"]:
        cap = b.candidates(run_dir, case)
        captures.append({"id": case["id"], "completed": cap["completed"], "raw": len(cap["raw"]),
                         "retained": len(cap["retained"]), "validation": cap["validation"]})
        for q in case["questions"]:
            context = saved_contexts(run_dir, q)
            map_path = run_dir / f"blind-map-{q['id']}.json"
            mapping = json.loads(map_path.read_text(encoding="utf-8")) if map_path.exists() else {}
            result = b.call_result(run_dir, f"judge-answer-{q['id']}")
            payload = {"question": q, "answers": [{"label": label} for label in mapping]}
            valid_grade = len(mapping) == 2 and grading_complete(result, payload, False)
            grades = b.parsed(result)["grades"] if valid_grade else []
            for arm in ARMS:
                raw = b.call_result(run_dir, f"answer-{q['id']}-{arm}")
                value = b.parsed(raw) or {}
                completed = isinstance(value.get("answer"), str) and bool(value["answer"].strip())
                grade = next((g for g in grades if mapping[g["label"]] == arm), {})
                errors = b.check_citations(value.get("citations"), context["contexts"][arm])
                elapsed = raw.get("duration_s")
                if elapsed is not None and arm == "retrieval":
                    elapsed += context["retrieval"]["duration_s"]
                rows.append({"session": case["id"], "question": q["id"], "arm": arm, "completed": completed,
                             "graded": valid_grade, "grade": grade, "citation_errors": errors,
                             "passed": b.answer_pass(grade, len(q["required"]), len(q["forbidden"]), errors, completed),
                             "content_pass": b.answer_pass(grade, len(q["required"]), len(q["forbidden"]), [],
                                 bool(b.visible_text(raw)) and raw.get("cli_result", {}).get("stop_reason") == "end_turn"),
                             "required_covered": sum(x is True for x in grade.get("required", [])),
                             "required_total": len(q["required"]), "tokens": tokens(raw), "duration_s": elapsed,
                             "usage_known": bool(raw.get("cli_result", {}).get("modelUsage")) and not raw.get("usage_unknown"),
                             "answer": value.get("answer"), "unparsed_text": b.visible_text(raw) if not completed else None,
                             "retrieval": context["retrieval"] if arm == "retrieval" else None})
    calls = [json.loads(path.read_text(encoding="utf-8")) | {"name": path.stem} for path in (run_dir / "calls").glob("*.json")]
    stages = {}
    for stage in ("capture", "answer", "judge"):
        subset = [r for r in calls if r["name"].startswith(stage + "-")]
        stages[stage] = {"calls": len(subset), "input_tokens": sum(tokens(r)["input"] for r in subset),
                         "output_tokens": sum(tokens(r)["output"] for r in subset),
                         "api_equivalent_usd": sum(r.get("api_equivalent_cost_usd") or 0 for r in subset)}
    arms = {}
    for arm in ARMS:
        subset = [r for r in rows if r["arm"] == arm]
        latencies = [r["duration_s"] for r in subset if r["duration_s"] is not None]
        serving_input = sum(r["tokens"]["input"] for r in subset)
        serving_output = sum(r["tokens"]["output"] for r in subset)
        total_input = serving_input + (stages["capture"]["input_tokens"] if arm == "retrieval" else 0)
        total_output = serving_output + (stages["capture"]["output_tokens"] if arm == "retrieval" else 0)
        arms[arm] = {"passed": sum(r["passed"] for r in subset), "total": len(subset),
                     "content_passed": sum(r["content_pass"] for r in subset),
                     "graded": sum(r["graded"] for r in subset), "valid_json": sum(r["completed"] for r in subset),
                     "required_covered": sum(r["required_covered"] for r in subset),
                     "required_total": sum(r["required_total"] for r in subset),
                     "unsupported_answers": sum(bool(r["grade"].get("unsupported_claims")) for r in subset),
                     "citation_failures": sum(bool(r["citation_errors"]) or r["grade"].get("citation_support") is not True for r in subset),
                     "serving_input_tokens": serving_input,
                     "total_input_tokens": total_input, "output_tokens": serving_output,
                     "total_output_tokens": total_output, "total_tokens": total_input + total_output,
                     "median_latency_s": round(statistics.median(latencies), 2) if latencies else None}
    by_question = {(r["question"], r["arm"]): r["passed"] for r in rows}
    paired = b.paired_counts([(by_question[(q["id"], "session")], by_question[(q["id"], "retrieval")])
                              for c in corpus["cases"] for q in c["questions"]])
    base, treatment = arms["session"], arms["retrieval"]
    complete = all(r["graded"] and r["usage_known"] for r in rows) and all(c["completed"] for c in captures)
    rule = {"quality_at_least_baseline": treatment["passed"] >= base["passed"],
            "unsupported_not_increased": treatment["unsupported_answers"] <= base["unsupported_answers"],
            "less_total_input": treatment["total_input_tokens"] < base["total_input_tokens"]}
    return {"arms": arms, "rows": rows, "captures": captures, "stages": stages, "paired": paired,
            "complete": complete, "decision_rule": rule, "pilot_win": complete and all(rule.values()),
            "calls": len(calls), "metered_api_calls": sum(r.get("transport") != "claude-code-subscription" for r in calls),
            "unknown_usage_calls": sum(not r.get("cli_result", {}).get("modelUsage") or bool(r.get("usage_unknown")) for r in calls),
            "api_equivalent_usd": sum(r.get("api_equivalent_cost_usd") or 0 for r in calls),
            "models": sorted({model for r in calls for model in r.get("cli_result", {}).get("modelUsage", {})})}


def fraction(n, d):
    return f"{n}/{d} ({100*n/d:.1f}%)" if d else "not measured"


def write_report(run_dir, corpus, manifest):
    result = score(run_dir, corpus)
    b.save(run_dir / "summary.json", result)
    path = b.ROOT / "docs/testing/coaching-retrieval-results.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    rel = Path(os.path.relpath(run_dir, path.parent)).as_posix()
    base, treatment = result["arms"]["session"], result["arms"]["retrieval"]
    reduction = 100 * (1 - treatment["total_input_tokens"] / base["total_input_tokens"]) if base["total_input_tokens"] else None
    status = "INCOMPLETE" if not result["complete"] else "MET" if result["pilot_win"] else "NOT MET"
    lines = ["# Coaching: decisions plus session retrieval", "",
             f"Generated {datetime.now(timezone.utc).isoformat(timespec='seconds')}. Provisional automated experiment.", "",
             f"**Predeclared success rule: {status}.** Session scored {base['passed']}/{base['total']}; "
             f"Decisions + retrieval scored {treatment['passed']}/{treatment['total']}. "
             "The rule requires at least the same strict answer quality, no increase in unsupported answers, "
             "and fewer input tokens including one-time extraction.", "",
             "| Context | Strict passes | Required criteria covered | Unsupported answers | Citation failures | Valid JSON | Median request + retrieval time |",
             "| --- | --- | --- | --- | --- | --- | --- |"]
    for arm, data in result["arms"].items():
        lines.append(f"| {arm} | {fraction(data['passed'], data['total'])} | {fraction(data['required_covered'], data['required_total'])} "
                     f"| {data['unsupported_answers']} | {data['citation_failures']} | {data['valid_json']}/{data['total']} | {data['median_latency_s']}s |")
    corrections_path = run_dir / "rubric-corrections.json"
    if corrections_path.exists():
        lines += ["", "### Source-based rubric correction", "",
                  "Review found that r01-q3's frozen rubric incorrectly required 49 seconds as the final job "
                  "test duration. The later m1242/m1261 messages report **59.81 seconds**. The benchmark author "
                  "identified this after inspecting grades; it is not independent human adjudication. "
                  "Both original answers were regraded against the same corrected timing criterion. "
                  "No source, question text, retrieval setting, or answer was changed. "
                  f"[Correction and evidence]({rel}/rubric-corrections.json).", ""]
        original_path = run_dir / "summary-frozen-rubric.json"
        if original_path.exists():
            original = json.loads(original_path.read_text(encoding="utf-8"))
            lines += [f"Before this correction, the frozen-rubric strict scores were "
                      f"Session {original['arms']['session']['passed']}/30 and Retrieval "
                      f"{original['arms']['retrieval']['passed']}/30. The table above uses the corrected grade. "
                      f"[Original score snapshot]({rel}/summary-frozen-rubric.json), "
                      f"[grade-selection audit]({rel}/grade-selections.json).", ""]
    lines += ["", "Strict pass requires all required criteria, no forbidden/unsupported factual claims, "
              "valid answer JSON, and citations that both resolve and support the answer. Missing answers or "
              "incomplete graders fail without shrinking the denominator. Unsupported claims are model judgments, "
              "not confirmed hallucinations from human adjudication. "
              f"{base['total'] + treatment['total'] - base['valid_json'] - treatment['valid_json']} of "
              f"{base['total'] + treatment['total']} answers failed JSON formatting, substantially limiting "
              "what the strict score says about reasoning quality alone.", "",
              "### Exploratory content diagnostic", "",
              "After observing answer-format failures, this diagnostic was added to separate content quality "
              "from JSON compliance. It uses the same factual rubric and judge's semantic citation check on "
              "the original visible text, without JSON/local citation parsing. It is post hoc and does not "
              "replace the predeclared strict score or decision rule.", "",
              f"Session: {fraction(base['content_passed'], base['total'])}; "
              f"Decisions + retrieval: {fraction(treatment['content_passed'], treatment['total'])}.", "",
              "## Token accounting", "",
              "Input counts include uncached input, cache writes, cache reads and CLI auxiliary model calls. "
              "A cache hit still counts as context processed. Extraction belongs only to the Retrieval arm, "
              "amortized over six questions per session. Evaluation judges are shown separately.", "",
              "| Context | Answering input | Extraction input | Total input | Total output including extraction | All tokens |",
              "| --- | --- | --- | --- | --- | --- |"]
    for arm, data in result["arms"].items():
        prep = result["stages"]["capture"]["input_tokens"] if arm == "retrieval" else 0
        lines.append(f"| {arm} | {data['serving_input_tokens']} | {prep} | {data['total_input_tokens']} "
                     f"| {data['total_output_tokens']} | {data['total_tokens']} |")
    serving_reduction = 100 * (1 - treatment['serving_input_tokens'] / base['serving_input_tokens']) if base['serving_input_tokens'] else None
    lines += ["", f"Answering-only input-token reduction: **{serving_reduction:.1f}%**." if serving_reduction is not None else "Serving reduction not available.",
              f"Total input-token reduction with extraction included: **{reduction:.1f}%**." if reduction is not None else "Token reduction not yet available.",
              "A negative reduction means Retrieval used more input tokens. This is not a dollar-cost reduction claim.", "",
              "## What ran", "",
              "- Five distinct Claude Code session IDs, six frozen questions each, two fresh answers per question. "
              "None is the original pilot session. All five still come from one builder and repository.",
              "- Session receives all retained visible conversation text plus selected historical code/docs. "
              "Retrieval receives exactly those code/docs, validated candidate decisions, and selected messages.",
              "- Same Sonnet 5 answer instructions, high effort, 4096 output-token allowance. Tools disabled. "
              "Everything runs through the installed Claude Code subscription; no direct API-key transport.",
              "- Local BM25 uses the question plus up to two matching decisions, selects four seeds and nearby "
              "messages, and returns at most eight complete messages / 12,000 characters in original order. "
              "It never sees scoring rubrics, reference answers or generated answers. No retrieval model calls.",
              "- Messages are never cut midway. Oversized selections and selected IDs are recorded per question. "
              "All structurally retained decisions are available; they were not approved by the builder.",
              "- Questions/rubrics/settings frozen before extraction or answering. A model judge scores shuffled "
              "anonymous labels; it may still infer the arm from context. The same requested model is used for "
              "capture, answers and grading. No independent human gold or repeated-run stability study.",
              "- Timing includes the CLI wrapper and local retrieval, with two CLI processes at most in flight. "
              "It excludes the UI and one-time corpus preparation/extraction from response latency.",
              f"- Frozen corpus SHA256: `{manifest['frozen']['corpus_hash']}`.",
              f"- [Protocol](../features/coaching-retrieval-benchmark.md), [corpus]({rel}/corpus.json), "
              f"[manifest]({rel}/manifest.json), [scores and answers]({rel}/summary.json), [raw model calls]({rel}/calls).", "",
              "## Per-session results", "",
              "| Session | Source session ID | Commit | Visible messages | Session passes | Retrieval passes | Retained decisions |",
              "| --- | --- | --- | --- | --- | --- | --- |"]
    for case, cap in zip(corpus["cases"], result["captures"]):
        scores = [sum(r["passed"] for r in result["rows"] if r["session"] == case["id"] and r["arm"] == a) for a in ARMS]
        lines.append(f"| {case['id']}: {case['title']} | `{case['session_id']}` | `{case['commit'][:7]}` "
                     f"| {len(case['messages'])} | {scores[0]}/6 | {scores[1]}/6 | {cap['retained']}/{cap['raw']} |")
    paired = result["paired"]
    lines += ["", f"Paired outcomes: both pass {paired['both']}; Retrieval only {paired['treatment_only']}; "
              f"Session only {paired['control_only']}; both fail {paired['neither']}. "
              f"Descriptive lift: {paired['lift_pp']:+.1f} percentage points.", "",
              "No significance or generalization claim: these are related sessions in one project, one answer "
              "per condition. Existing docs and code comments remain in both arms, even when they explain the why.", "",
              "## Execution and subscription usage", "",
              "| Stage | CLI attempts | Input tokens including cache/helper calls | Output tokens | API-equivalent usage |",
              "| --- | --- | --- | --- | --- |"]
    for stage, data in result["stages"].items():
        lines.append(f"| {stage} | {data['calls']} | {data['input_tokens']} | {data['output_tokens']} | ${data['api_equivalent_usd']:.4f} |")
    lines += ["", f"Direct API-key calls: **{result['metered_api_calls']}**. CLI-reported API-equivalent usage: "
              f"**${result['api_equivalent_usd']:.4f}** across {result['calls']} attempts. "
              "This describes subscription allowance consumed and is not a separate API invoice. "
              f"Unknown-usage attempts: {result['unknown_usage_calls']}.",
              "Models reported by the CLI (including auxiliary work): " + ", ".join(f"`{m}`" for m in result["models"]) + ".",
              "Failed attempts remain in the artifacts. Answers are never regenerated for a better score.", "",
              "## Question-level results", ""]
    for case in corpus["cases"]:
        for q in case["questions"]:
            lines += [f"### {q['id']}: {q['name']}", "", q["text"], "",
                      "| Arm | Result | Failure explanation |", "| --- | --- | --- |"]
            for arm in ARMS:
                row = next(r for r in result["rows"] if r["question"] == q["id"] and r["arm"] == arm)
                notes = []
                if not row["completed"]: notes.append("Missing/malformed answer JSON.")
                if not row["graded"]: notes.append("Grading incomplete.")
                if not row["passed"]:
                    notes.extend(row["citation_errors"])
                    notes.append(row["grade"].get("notes", ""))
                explanation = " ".join(notes).replace("|", "\\|").replace("\n", " ") or "—"
                lines.append(f"| {arm} | {'PASS' if row['passed'] else 'FAIL'} | {explanation} |")
            audit = saved_contexts(run_dir, q)["retrieval"]
            lines += ["", f"Retrieved: {', '.join(audit['selected_ids']) or 'none'}; {audit['chars']} characters. "
                      f"[Exact contexts and selection audit]({rel}/context-{q['id']}.json).", ""]
    lines += ["## Interpretation and limits", "",
              "For this MVP, keep the authorized session evidence available to Coaching. This local "
              "retriever did not meet the pilot's success rule. First make answer formatting reliable, "
              "then improve retrieval of later corrections and final outcomes before testing again.", "",
              "The disagreement review found concrete problems: "
              "[r05-q2](#r05-q2-schedule-placement-correction) missed the TOML placement fix, "
              "[r05-q3](#r05-q3-cron-verification-state) confused a proposed test with a successful run, and "
              "[r05-q6](#r05-q6-pause-preserves-schedule) omitted the final paused state. "
              "Some answers also supplied reasons or delivery guarantees absent from the evidence. "
              "These are observed failures of this implementation, not proof that retrieval cannot work.", "",
              "The decision rule was fixed before inference. A failure to meet it does not show that all "
              "retrieval approaches fail; it evaluates this BM25/neighbor implementation and this extractor. "
              "Review disagreement rows to separate missing evidence, unsupported interpretation and output-format failures.", "",
              "This experiment measures answers about historical work. It does not measure accepted changes, "
              "human time saved, live Chat behavior, permission enforcement, anchor durability, or safe ingestion "
              "of arbitrary private sessions (`ponytail:`). Source material was redacted before the run; "
              "passing redaction checks is not a general privacy guarantee. Raw tool payloads and hidden "
              "thinking were excluded, so the baseline is the full retained visible conversation, not every byte "
              "of the original session export.", "",
              "## Reproduce", "", "```powershell",
              "python -m pytest tests/evals/coaching/test_bench.py -q -p no:cacheprovider",
              "python tests/evals/coaching/bench.py --experiment retrieval --dry-run",
              "python tests/evals/coaching/bench.py --experiment retrieval --run-dir tests/evals/coaching/results/new-retrieval-run --phase all",
              f"python tests/evals/coaching/bench.py --experiment retrieval --run-dir {run_dir.as_posix()} --phase report",
              "```", "", "Report generation is offline. The capture/answers/judge phases resume only identical "
              "saved requests. Explicit finish-grading completes malformed or missing grades without changing answers.", ""]
    path.write_text("\n".join(lines), encoding="utf-8")
    print(json.dumps({"report": str(path), "passes": {a: x["passed"] for a, x in result["arms"].items()}, "status": status}))
