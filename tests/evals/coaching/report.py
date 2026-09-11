"""Generate the report from saved provider responses; never calls a model."""

import json
import os
import statistics
from datetime import datetime, timezone
from pathlib import Path

from tests.evals.coaching.bench import (
    ARMS, MODEL, ROOT, answer_pass, call_result, candidates, capture_metrics,
    check_citations, build_context, paired_counts, parsed, save, visible_text,
)


def fraction(n, d):
    return f"{n}/{d} ({100*n/d:.1f}%)" if d else "not measured"


def median(values):
    return round(statistics.median(values), 2) if values else None


def score(run_dir, corpus):
    rows, captures = [], []
    for case in corpus["cases"]:
        cap = candidates(run_dir, case)
        cap_judge = parsed(call_result(run_dir, f"judge-capture-{case['id']}")) or {}
        grades = cap_judge.get("grades", [])
        try:
            invalid_anchors = {v["id"] for v in cap["validation"] if "invalid_anchor" in v["errors"]}
            capture_score = capture_metrics(case["gold"], cap["raw"], grades, invalid_anchors)
        except ValueError:
            capture_score = {"error": "capture grading incomplete"}
        captures.append({"id": case["id"], "completed": cap["completed"], "metrics": capture_score,
                         "retained": len(cap["retained"]), "validation": cap["validation"], "grades": grades})
        for q in case["questions"]:
            map_path = run_dir / f"blind-map-{q['id']}.json"
            mapping = json.loads(map_path.read_text(encoding="utf-8")) if map_path.exists() else {}
            judge = parsed(call_result(run_dir, f"judge-answer-{q['id']}")) or {}
            anonymous = judge.get("grades", [])
            for arm in ARMS:
                matches = [g for g in anonymous if mapping.get(g.get("label")) == arm]
                grade = matches[0] if len(matches) == 1 else {}
                response = call_result(run_dir, f"answer-{q['id']}-{arm}")
                value = parsed(response) or {}
                completed = isinstance(value.get("answer"), str) and bool(value["answer"].strip())
                context = build_context(case, arm, cap["retained"])
                citation_errors = check_citations(value.get("citations"), context)
                passed = answer_pass(grade, len(q["required"]), len(q["forbidden"]), citation_errors, completed)
                content_present = bool(visible_text(response)) and response.get("response", {}).get("stop_reason") == "end_turn"
                content_pass = answer_pass(grade, len(q["required"]), len(q["forbidden"]), [], content_present)
                rows.append({"episode": case["id"], "question": q["id"], "category": q["category"], "arm": arm,
                             "completed": completed, "graded": bool(grade), "passed": passed, "content_pass": content_pass, "grade": grade,
                             "required_count": len(q["required"]), "citation_errors": citation_errors,
                             "answer": value.get("answer"), "unparsed_text": visible_text(response) if not completed else None,
                             "duration_s": response.get("duration_s"),
                             "estimated_cost_usd": response.get("estimated_cost_usd", 0),
                             "usage": response.get("response", {}).get("usage", {})})
    arms = {}
    for arm in ARMS:
        subset = [r for r in rows if r["arm"] == arm]
        arms[arm] = {"passed": sum(r["passed"] for r in subset), "total": len(subset),
                     "content_passed": sum(r["content_pass"] for r in subset),
                     "completed": sum(r["completed"] for r in subset), "graded": sum(r["graded"] for r in subset),
                     "required_covered": sum(sum(x is True for x in r["grade"].get("required", [])) for r in subset
                                             if len(r["grade"].get("required", [])) == r["required_count"]),
                     "required_total": sum(r["required_count"] for r in subset),
                     "unsupported_answers": sum(bool(r["grade"].get("unsupported_claims")) for r in subset),
                     "citation_failures": sum(bool(r["citation_errors"]) or r["grade"].get("citation_support") is not True for r in subset),
                     "median_latency_s": median([r["duration_s"] for r in subset if r["duration_s"] is not None]),
                     "estimated_cost_usd": sum(r["estimated_cost_usd"] for r in subset),
                     "input_tokens": sum(r["usage"].get("input_tokens", 0) for r in subset),
                     "output_tokens": sum(r["usage"].get("output_tokens", 0) for r in subset)}
    by_question = {(r["question"], r["arm"]): r["passed"] for r in rows}
    question_ids = [q["id"] for c in corpus["cases"] for q in c["questions"]]
    comparisons = {}
    for control, treatment in (("sources", "session"), ("sources", "records"), ("session", "records")):
        comparisons[f"{treatment}_vs_{control}"] = paired_counts([
            (by_question[(q, control)], by_question[(q, treatment)]) for q in question_ids])
    calls = [json.loads(p.read_text(encoding="utf-8")) | {"name": p.stem} for p in sorted((run_dir / "calls").glob("*.json"))]
    api_calls = [r for r in calls if r.get("transport") != "claude-code-subscription"]
    subscription_calls = [r for r in calls if r.get("transport") == "claude-code-subscription"]
    cli_usage = [usage for r in subscription_calls for usage in r.get("cli_result", {}).get("modelUsage", {}).values()]
    costs = {}
    for stage in ("capture", "answer", "judge-capture", "judge-answer"):
        subset = [r for r in api_calls if r["name"].startswith(stage + "-")]
        costs[stage] = {"calls": len(subset), "estimated_cost_usd": sum(r.get("estimated_cost_usd", 0) for r in subset),
                       "input_tokens": sum(r.get("response", {}).get("usage", {}).get("input_tokens", 0) for r in subset),
                       "output_tokens": sum(r.get("response", {}).get("usage", {}).get("output_tokens", 0) for r in subset),
                       "median_latency_s": median([r["duration_s"] for r in subset if "duration_s" in r])}
    return {"rows": rows, "capture": captures, "arms": arms, "comparisons": comparisons, "costs": costs,
            "total_calls": len(calls), "usage_unknown_calls": sum(bool(r.get("usage_unknown")) for r in calls),
            "api_calls": len(api_calls), "subscription_calls": len(subscription_calls),
            "subscription_usage": {key: sum(u.get(key, 0) for u in cli_usage) for key in
                                   ("inputTokens", "outputTokens", "cacheReadInputTokens", "cacheCreationInputTokens")},
            "subscription_auxiliary_models": sorted({model for r in subscription_calls
                for model in r.get("cli_result", {}).get("modelUsage", {}) if model != MODEL}),
            "subscription_api_equivalent_usd": sum(r.get("api_equivalent_cost_usd") or 0 for r in calls),
            "total_estimated_cost_usd": sum(r.get("estimated_cost_usd", 0) for r in calls),
            "answer_models": sorted({r["response"].get("model") for r in calls
                                     if r["name"].startswith("answer-") and "response" in r}),
            "provider_models": sorted({r["response"].get("model") for r in calls if "response" in r}),
            "stop_reasons": {reason: sum(r.get("response", {}).get("stop_reason") == reason for r in calls)
                             for reason in sorted({r.get("response", {}).get("stop_reason", "missing") for r in calls})}}


def write_report(run_dir, corpus, manifest):
    summary = score(run_dir, corpus)
    save(run_dir / "summary.json", summary)
    report = ROOT / "docs/testing/coaching-benchmark-results.md"
    report.parent.mkdir(parents=True, exist_ok=True)
    relative = Path(os.path.relpath(run_dir, report.parent)).as_posix()
    arms = summary["arms"]
    best = max(a["passed"] for a in arms.values())
    winners = ", ".join(a for a in ARMS if arms[a]["passed"] == best)
    lines = [
        "# Coaching benchmark: first real-excerpt pilot", "",
        f"Generated {datetime.now(timezone.utc).isoformat(timespec='seconds')}. **Provisional automated evaluation.**", "",
        f"**Highest strict answer score: {winners}, {best}/30.** "
        "The same thirty questions were asked under three context conditions (ninety answers). "
        "This measures answers about historical work, not successful user tasks or the live Chat UI.", "",
        "| Context | Strict passes | Required facts covered | Answers with unsupported claims | Citation failures | Median request time | Answer cost estimate |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for arm in ARMS:
        a = arms[arm]
        lines.append(f"| {arm} | {fraction(a['passed'], a['total'])} | {fraction(a['required_covered'], a['required_total'])} "
                     f"| {a['unsupported_answers']}/{a['total']} | {a['citation_failures']}/{a['total']} "
                     f"| {a['median_latency_s']}s | ${a['estimated_cost_usd']:.4f} |")
    lines += ["", "Strict pass = every required criterion met, no forbidden or unsupported factual claim, "
              "and valid supporting citations. A missing/truncated/malformed answer or missing grade fails. "
              "Citation failures combine local reference validation and model-judged semantic support.", "",
              "## What this suggests for Coaching", "",
              "For this pilot, sources plus authorized conversation excerpts performed best. "
              "Extracted records helped over sources alone, but did not preserve everything needed to coach "
              "the next person. Keep the authorized original evidence accessible alongside decision records "
              "in the next prototype. Records plus retrieval of relevant excerpts is the next comparison "
              "to test; this run did not evaluate that combination.", "",
              "The failure rows show specific information lost or mishandled:", "",
              "- [Memory observations](#s01-q3-memory-observation): records preserved the 512MB failure but "
              "omitted that the page loaded before upload/inference failed.",
              "- [Credential probe](#s02-q4-scope-proof): the session preserved the reported own-app "
              "200 / other-app 403 test result; records did not.",
              "- [CLI-only scope](#s05-q1-cli-scope): the user correction was available to the "
              "Session arm but its candidate was discarded for lacking a valid code anchor.",
              "- [Unknown rationale](#s03-q3-overwrite-handling): a Records answer supplied a plausible reason "
              "for preserving an existing file even though no reason had been recorded.", "",
              "Improve capture of operational evidence and corrections, preserve explicit unknowns, and "
              "fix structured-answer reliability. Evaluate those changes on independent sessions with human "
              "review before treating the current scores as a product claim.", "",
              "### Exploratory content-only check", "",
              "Eight answers did not produce valid JSON. They remain failures in the primary score above. "
              "After observing this format problem, an exploratory score was added: the judge also reads the "
              "original unparsed text and checks the same factual rubric and semantic citation support, while "
              "ignoring JSON syntax and local machine-citation validation. This is not a replacement primary metric.", "",
              "| Arm | Rubric-only passes | Valid answer JSON | Input tokens for 30 answers |",
              "| --- | --- | --- | --- |"]
    for arm in ARMS:
        a = arms[arm]
        lines.append(f"| {arm} | {fraction(a['content_passed'], a['total'])} | {a['completed']}/{a['total']} | {a['input_tokens']} |")
    lines += ["",
              "## What ran", "",
              "- **Sources:** selected code and available relevant documentation at the episode's final commit.",
              "- **Session:** exactly those sources plus the selected visible conversation messages.",
              "- **Records:** exactly those sources plus extracted candidates that passed structural anchor/evidence validation. "
              "These were not builder-approved or published to an app.",
              f"- Requested model: `{manifest['frozen']['model']}`. Models reported for the ninety answers: "
              + ", ".join(f"`{m}`" for m in summary["answer_models"]) + ".",
              f"- Adaptive thinking, high effort; {manifest['frozen']['answer_limit']} total output tokens per answer. "
              "Identical answer prompt/settings and fresh contexts. No tools, retrieval, chat history, actions, or app API calls.",
              "- Entire selected inputs fit the context window; no token-budget truncation. Input token counts can differ "
              "because added context is the variable being tested.",
              "- Labels and questions frozen before inference. Same model grades the three anonymized answers against the "
              "original evidence in deterministic shuffled order; arm names are withheld, although content can reveal an arm.",
              "- Original API judges used the provider's JSON-schema output format. Subscription completion "
              "requested JSON through the prompt, as did capture/answer calls. Local checks require one valid "
              "grade per answer/candidate; valid JSON alone is insufficient. No answer was repaired or regenerated.",
              f"- Completed answer grades: {sum(a['graded'] for a in arms.values())}/90; "
              f"capture audits: {sum('error' not in c['metrics'] for c in summary['capture'])}/5.",
              f"- Corpus SHA256: `{manifest['frozen']['corpus_hash']}`.",
              f"- [Frozen corpus]({relative}/corpus.json), [run manifest]({relative}/manifest.json), "
              f"[machine-readable scores]({relative}/summary.json), [raw requests/responses]({relative}/calls).", "",
              "## Corpus and per-episode results", "",
              "**Five excerpts from one real Claude Code session, not five independent sessions.** "
              "38 selected visible user/assistant messages; one repository and one builder. "
              "Selection excludes unrelated discussion, raw tool payloads and hidden thinking. "
              "The session arm is the complete selected excerpt, not the original full conversation. "
              "The corpus records source message IDs, transcript line numbers, text hashes, timestamps and code hashes. "
              "No customer AWS source/logs/inputs were used.", "",
              "| Episode | Snapshot | Sources | Session | Records |",
              "| --- | --- | --- | --- | --- |"]
    for case in corpus["cases"]:
        counts = [sum(r["passed"] for r in summary["rows"] if r["episode"] == case["id"] and r["arm"] == arm) for arm in ARMS]
        lines.append(f"| {case['id']}: {case['title']} | `{case['commit'][:7]}` | {counts[0]}/6 | {counts[1]}/6 | {counts[2]}/6 |")
    lines += ["", "Documentation was not withheld to make the baseline weaker. Some historical source comments and "
              "specs already contain the reasoning. These are task/component slices of Small, not five deployed customer apps.", "",
              "## Paired comparisons", "", "| Treatment vs control | Both pass | Treatment only | Control only | Both fail | Lift |",
              "| --- | --- | --- | --- | --- | --- |"]
    for name, p in summary["comparisons"].items():
        lines.append(f"| {name} | {p['both']} | {p['treatment_only']} | {p['control_only']} | {p['neither']} | {p['lift_pp']:+.1f} pp |")
    lines += ["", "These are descriptive paired counts. Thirty related questions from one session do not support "
              "an independence-based significance claim. No McNemar p-value or population confidence interval is claimed.", "",
              "## Capture", "",
              "Reference decisions and answer rubrics were authored by the coding assistant before inference. "
              "They are not independently annotated human gold. Recall means coverage of this frozen reference list. "
              "Precision means choices the automated audit confirms in the source with structurally valid code anchors; "
              "unanchored predictions are false positives and valid additional choices are allowed.", "",
              "| Episode | Supported choices / predictions | Reference decisions recovered | Stated reasons unsupported | Unknown reasons recovered | Retained after structural checks |",
              "| --- | --- | --- | --- | --- | --- |"]
    for cap in summary["capture"]:
        m = cap["metrics"]
        if "error" in m:
            lines.append(f"| {cap['id']} | grading incomplete | — | — | — | {cap['retained']} |")
            continue
        lines.append(f"| {cap['id']} | {m['valid_choices']}/{m['predictions']} | {m['matched_gold']}/{m['gold']} "
                     f"| {m['unsupported_reasons']}/{m['stated_reasons']} | {m['unknown_recovered']}/{m['unknown_gold']} "
                     f"| {cap['retained']}/{m['predictions']} |")
    measured = [c["metrics"] for c in summary["capture"] if "error" not in c["metrics"]]
    total = lambda key: sum(m[key] for m in measured)
    if measured:
        n = total("reason_fidelity_count")
        lines += ["", f"Pooled supported-choice precision: **{fraction(total('valid_choices'), total('predictions'))}**. "
                  f"Reference coverage: **{fraction(total('matched_gold'), total('gold'))}**.",
                  (f"Reason fidelity on matched, reason-bearing references: "
                   f"{total('reason_fidelity_sum') / n:.2f}/3 across {n} matches.") if n else "Reason fidelity not measured.",
                  f"Reference alternatives recovered: {fraction(total('alternatives_recovered'), total('alternatives_gold'))}. "
                  f"Unknown-reason gaps recovered: {fraction(total('unknown_recovered'), total('unknown_gold'))}.",
                  f"Unsupported stated reasons: {fraction(total('unsupported_reasons'), total('stated_reasons'))}. "
                  f"Proposed 90% precision gate: {'met' if total('valid_choices') >= .9 * total('predictions') else 'missed'}; "
                  f"80% reference-coverage gate: {'met' if total('matched_gold') >= .8 * total('gold') else 'missed'}."]
    rejected = [(c["id"], v) for c in summary["capture"] for v in c["validation"] if v["errors"]]
    lines += ["", "A structural pass checks that a code/config line range exists and quoted evidence is an exact "
              "substring of a selected message. It cannot prove the reason is true or the anchor semantically relevant. "
              "Semantic support is judged separately. No human approval, annotation agreement, or review-time measurement occurred."]
    if rejected:
        lines += ["", "Rejected candidates:"]
        lines += [f"- {cid}/{v['id']}: {', '.join(v['errors'])}." for cid, v in rejected]
    lines += ["", "## Cost and execution", "",
              "Original metered API run only; subscription usage is separated below.", "",
              "| Stage | API calls | Input tokens | Output tokens, including thinking | API cost estimate | Median request time |",
              "| --- | --- | --- | --- | --- | --- |"]
    for stage, c in summary["costs"].items():
        lines.append(f"| {stage} | {c['calls']} | {c['input_tokens']} | {c['output_tokens']} | ${c['estimated_cost_usd']:.4f} | {c['median_latency_s']}s |")
    lines += ["", f"**Metered API estimate: ${summary['total_estimated_cost_usd']:.4f} across {summary['api_calls']} calls.** "
              f"There are {summary['total_calls']} saved call artifacts including subscription attempts; "
              f"{summary['usage_unknown_calls']} calls have unknown usage. "
              f"[Provider pricing]({manifest['frozen']['pricing_url']}): $2/M input and $10/M output; "
              "cache write/read rates are included if reported. Estimates use actual provider token counts, not invoice data. "
              "Answer costs exclude one-time capture; evaluation judges are not a product-serving cost. "
              "Timings are per HTTP request on this machine with up to four requests in flight, not UI end-to-end latency.", "",
              f"Provider stop reasons: `{json.dumps(summary['stop_reasons'], sort_keys=True)}`.", "",
              "### Subscription switch", "",
              f"The initial API run had already completed when the user requested their subscription. "
              f"Its estimated metered API cost was **${summary['total_estimated_cost_usd']:.4f}**. "
              f"The {summary['subscription_calls']} additional grading attempts used the verified Claude Code Max login "
              "with API-key/provider environment overrides removed, safe mode, tools disabled, and no API-key fallback. "
              f"Claude Code reported ${summary['subscription_api_equivalent_usd']:.4f} in API-equivalent usage; "
              "that value describes tokens consumed through the subscription and is not an additional API invoice.", "",
              "CLI-reported usage, including auxiliary calls: "
              f"{summary['subscription_usage']['inputTokens']} uncached input tokens, "
              f"{summary['subscription_usage']['cacheCreationInputTokens']} cache-write tokens, "
              f"{summary['subscription_usage']['cacheReadInputTokens']} cache-read tokens, and "
              f"{summary['subscription_usage']['outputTokens']} output tokens. "
              "Claude Code also reported auxiliary model usage for "
              + ", ".join(f"`{m}`" for m in summary["subscription_auxiliary_models"]) + ". "
              "The answer comparison itself used Sonnet 5 throughout. CLI timings include its wrapper overhead, "
              "with at most two CLI processes in flight.", "",
              "Four original graders hit their 6000-token output cap; a fifth returned JSON that omitted two "
              "answer grades. The replacements used the same saved evidence, "
              "rubrics and answers through Claude Code, with a 12000-token grading cap. The first subscription "
              "attempts failed Claude Code's structured-output tool flow with tools disabled; the next attempts "
              "requested ordinary JSON text. Every attempt remains in the artifacts and usage totals. "
              "Only grading changed; none of the ninety answers was regenerated. "
              f"[Selected-grade audit]({relative}/grade-selections.json), "
              f"[switch record]({relative}/subscription-switch.json). Future runs default to the subscription.", "",
              "## Question-level results and failure explanations", "",
              "Each question was generated from the preselected episode before seeing model outputs. "
              "Failures below retain the automated judge's assessment so a human can challenge it.", ""]
    for case in corpus["cases"]:
        for q in case["questions"]:
            lines += [f"### {q['id']}: {q['name']}", "", q["text"], "",
                      "| Arm | Result | Reason for failure |", "| --- | --- | --- |"]
            for arm in ARMS:
                row = next(r for r in summary["rows"] if r["question"] == q["id"] and r["arm"] == arm)
                reasons = []
                if not row["completed"]:
                    reasons.append("missing, malformed, or truncated answer")
                if not row["graded"]:
                    reasons.append("grading incomplete")
                if not row["passed"]:
                    reasons += row["citation_errors"]
                    if row["grade"].get("notes"):
                        reasons.append(row["grade"]["notes"])
                note = " ".join(reasons).replace("|", "\\|").replace("\n", " ") or "—"
                lines.append(f"| {arm} | {'PASS' if row['passed'] else 'FAIL'} | {note} |")
            lines.append("")
    lines += ["## Limitations and next decision", "",
              "- This evaluates context strategies with one model; it does not select the best model/provider or prove "
              "the existing production extraction/Chat path works.",
              "- One builder, one project, one source session, hand-selected excerpts, one answer per arm/question. "
              "No independent human gold, blinded human scoring, repeated-seed stability, or generalization claim.",
              "- The same model extracts, answers and judges. Arm names were hidden, but the judge may infer them from "
              "citations and context. Human review of the disagreements remains necessary.",
              "- No real builder approval, permission/tenant isolation, malicious-session stress test, secret-leak "
              "guarantee, anchor durability sweep, user task completion, or colleague time-saving study was run (`ponytail:`).",
              "- A rules-based redactor and outbound check ran on the selected material. Absence of a match is not "
              "proof that arbitrary private sessions are safe to upload.",
              "- Extraction is lossy: changes in score can reflect omitted observations, unanchored facts, "
              "candidate selection, or answer variance. Inspect the question rows before choosing a production design.", "",
              "Use this pilot to choose the next comparison, not to publish a broad performance claim. "
              "Keep the full authorized evidence available during development; promote structured memory only when "
              "its measured answers preserve the information colleagues need. A later experiment can test records "
              "plus targeted retrieval of authorized excerpts, followed by a user/colleague task study.", "",
              "## Reproduce", "", "```powershell",
              "python -m pytest tests/evals/coaching/test_bench.py -q -p no:cacheprovider",
              "python tests/evals/coaching/bench.py --dry-run",
              "# Uses the installed Claude Code subscription login; API credentials are not inherited.",
              "python tests/evals/coaching/bench.py --run-dir tests/evals/coaching/results/new-run --phase all",
              f"python tests/evals/coaching/bench.py --run-dir {run_dir.as_posix()} --phase report",
              "```", "", "`--phase report` uses saved responses only and needs no API key/network. "
              "Resuming a run reuses a response only if its exact request hash matches; changed corpus/settings "
              "require a new directory. Failed responses are retained. Explicit `--phase finish-grading` "
              "records replacement grades through the subscription with an audit map; it never replaces answers.", ""]
    report.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {report}")
    print(json.dumps({"passes": {a: x["passed"] for a, x in arms.items()},
                      "cost_usd": summary["total_estimated_cost_usd"]}))
