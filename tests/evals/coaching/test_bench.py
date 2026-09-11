"""Offline checks for benchmark accounting; no model calls or credentials."""

import json

import pytest

from tests.evals.coaching.bench import (
    answer_pass, build_context, capture_metrics, check_citations,
    paired_counts, redact, validate_decision, usage_cost, Provider, save, parsed,
)
from tests.evals.coaching.report import score
from tests.evals.coaching.subscription import subscription_env, require_subscription, grading_complete


@pytest.fixture
def case():
    return {
        "id": "s1", "sources": {"app.py": "LIMIT = 5\nprint(LIMIT)\n"},
        "messages": [{"id": "m1", "role": "user", "text": "Keep five because the display has five slots."}],
        "gold": [{"id": "g1", "reason": "The display has five slots."}],
        "questions": [{"id": "q1", "category": "why", "required": ["five slots"], "forbidden": ["faster"]}],
    }


@pytest.fixture
def decision():
    return {
        "id": "d1", "decision": "Limit to five", "reason": "The display has five slots.",
        "kind": "design", "alternatives": [], "constraints": [], "depends_on": [],
        "revisit": None,
        "evidence": [{"message_id": "m1", "quote": "the display has five slots"}],
        "anchors": [{"path": "app.py", "start_line": 1, "end_line": 1}],
    }


def test_valid_record_and_unknown_gap(case, decision):
    assert validate_decision(case, decision) == []
    decision.update(reason=None, evidence=[])
    assert validate_decision(case, decision) == []


@pytest.mark.parametrize("anchor", [
    {"path": "missing.py", "start_line": 1, "end_line": 1},
    {"path": "app.py", "start_line": 0, "end_line": 1},
    {"path": "app.py", "start_line": 1, "end_line": 3},
    {"path": "app.py", "start_line": True, "end_line": 1},
    {"path": "app.py", "start_line": 2, "end_line": 1},
])
def test_invalid_anchor_is_rejected(case, decision, anchor):
    decision["anchors"] = [anchor]
    assert "invalid_anchor" in validate_decision(case, decision)


def test_reason_requires_real_evidence(case, decision):
    decision["evidence"][0]["quote"] = "made up"
    assert "invalid_evidence" in validate_decision(case, decision)
    decision["evidence"] = []
    assert "unreferenced_reason" in validate_decision(case, decision)


def test_malformed_records_and_citations_fail_instead_of_crashing(case):
    assert validate_decision(case, "oops") == ["invalid_record"]
    assert check_citations(["app.py"], build_context(case, "sources", [])) == ["invalid_citation"]


def test_documents_cannot_anchor_a_decision(case, decision):
    case["sources"]["README.md"] = "why\n"
    decision["anchors"][0]["path"] = "README.md"
    assert "invalid_anchor" in validate_decision(case, decision)


def test_labels_and_other_arm_context_never_reach_answer_prompt(case, decision):
    case["gold"][0]["reason"] = "GOLD_ONLY"
    base = build_context(case, "sources", [decision])
    session = build_context(case, "session", [decision])
    records = build_context(case, "records", [decision])
    assert "GOLD_ONLY" not in json.dumps([base, session, records])
    assert "messages" not in base and "decisions" not in base
    assert session["messages"] == case["messages"] and "decisions" not in session
    assert records["decisions"] == [decision] and "messages" not in records


def test_citation_must_exist_in_the_arm_not_just_the_corpus(case, decision):
    citation = {"kind": "message", "message_id": "m1"}
    assert check_citations([citation], build_context(case, "sources", [decision]))
    assert not check_citations([citation], build_context(case, "session", [decision]))
    assert not check_citations([citation], build_context(case, "records", [decision]))
    assert check_citations([], build_context(case, "sources", [])) == ["missing_citation"]


def test_incomplete_or_unsupported_answer_does_not_pass():
    grade = {"required": [True, True], "forbidden": [False], "unsupported_claims": [], "citation_support": True}
    assert answer_pass(grade, 2, 1, [], True)
    for changed in [
        {"required": [True]}, {"required": [True, False]}, {"required": [1, True]},
        {"forbidden": [True]}, {"forbidden": []},
        {"unsupported_claims": ["invented rationale"]}, {"citation_support": False},
    ]:
        assert not answer_pass(grade | changed, 2, 1, [], True)
    assert not answer_pass(grade, 2, 1, ["invalid_citation"], True)
    assert not answer_pass(grade, 2, 1, [], False)


def test_paired_comparison_keeps_missing_results_visible():
    result = paired_counts([(True, True), (False, True), (True, False), (False, False), (None, True)])
    assert result == {"both": 1, "treatment_only": 1, "control_only": 1, "neither": 1,
                      "incomplete": 1, "complete_pairs": 4, "lift_pp": 0.0}


def test_capture_one_to_one_and_unknown_denominators():
    gold = [{"id": "g1", "reason": "why"}, {"id": "g2", "reason": None}]
    grades = [
        {"id": "d1", "gold_id": "g1", "valid_choice": True, "reason_supported": True, "reason_fidelity": 3, "alternatives_recovered": 0},
        {"id": "d2", "gold_id": "g1", "valid_choice": True, "reason_supported": True, "reason_fidelity": 3, "alternatives_recovered": 0},
        {"id": "d3", "gold_id": None, "valid_choice": False, "reason_supported": False, "reason_fidelity": 0, "alternatives_recovered": 0},
    ]
    preds = [{"id": "d1", "reason": "why"}, {"id": "d2", "reason": "why"}, {"id": "d3", "reason": "invented"}]
    score = capture_metrics(gold, preds, grades)
    assert score["matched_gold"] == 1 and score["recall"] == 0.5
    assert score["unsupported_reasons"] == 1 and score["stated_reasons"] == 3
    assert score["unknown_recovered"] == 0 and score["unknown_gold"] == 1
    assert score["duplicate_matches"] == 1
    assert capture_metrics([], [], [])["precision"] is None


def test_missing_capture_grade_is_not_silently_dropped():
    with pytest.raises(ValueError, match="one grade"):
        capture_metrics([], [{"id": "d1", "reason": None}], [])


def test_unanchored_prediction_is_a_false_positive_even_if_the_choice_is_real():
    gold = [{"id": "g1", "reason": None}]
    pred = [{"id": "d1", "reason": None}]
    grades = [{"id": "d1", "gold_id": "g1", "valid_choice": True, "reason_supported": True}]
    metric = capture_metrics(gold, pred, grades, invalid_anchor_ids={"d1"})
    assert metric["valid_choices"] == metric["matched_gold"] == 0
    assert metric["predictions"] == 1


def test_redaction_at_both_boundaries():
    text = "token=real-private-value sk-ant-api03-" + "x" * 40 + " AKIA1234567890ABCDEF alice@example.com"
    clean = redact(text, ["real-private-value"])
    assert all(secret not in clean for secret in ["real-private-value", "sk-ant-", "AKIA", "alice@example.com"])
    assert redact(clean, ["real-private-value"]) == clean


def test_cost_counts_cache_tokens_as_well_as_uncached_tokens():
    usage = {"input_tokens": 100, "output_tokens": 20, "cache_creation_input_tokens": 30, "cache_read_input_tokens": 50}
    assert usage_cost(usage) == pytest.approx((100 * 2 + 20 * 10 + 30 * 2.5 + 50 * 0.2) / 1e6)


def test_truncated_model_json_is_not_treated_as_a_completed_answer():
    response = {"response": {"stop_reason": "max_tokens", "content": [{"type": "text", "text": '{"answer":"looks valid"}'}]}}
    assert parsed(response) is None


def test_unknown_and_alternative_capture_accounting():
    gold = [{"id": "g1", "reason": None, "alternatives": ["memory", "redis"]}]
    predictions = [{"id": "d1", "reason": None, "alternatives": ["memory"]}]
    grades = [{"id": "d1", "gold_id": "g1", "valid_choice": True, "reason_supported": True, "alternatives_recovered": 99}]
    metrics = capture_metrics(gold, predictions, grades)
    assert metrics["unknown_recovered"] == 1
    assert metrics["alternatives_recovered"] == 1 and metrics["alternatives_gold"] == 2
    assert metrics["stated_reasons"] == 0


def test_cost_ceiling_and_outbound_secret_fail_before_network(tmp_path, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "private-benchmark-test-key")
    monkeypatch.setattr("tests.evals.coaching.bench.env_values", lambda: {})
    monkeypatch.setattr("urllib.request.urlopen", lambda *a, **k: pytest.fail("network must not be called"))
    provider = Provider(tmp_path, 0, None)
    with pytest.raises(ValueError, match="ceiling"):
        provider.call("test", "system", {"test": "safe"}, 100)
    with pytest.raises(ValueError, match="redaction"):
        provider.call("test", "system", {"test": "private-benchmark-test-key"}, 100)
    assert not list(tmp_path.glob("calls/*"))


def test_report_counts_missing_answers_and_grades_in_the_denominator(tmp_path, case, decision):
    case["commit"] = "test-commit"
    save(tmp_path / "capture-s1.json", {"raw": [decision], "retained": [decision], "validation": [], "completed": True})
    save(tmp_path / "blind-map-q1.json", {"A": "sources", "B": "session", "C": "records"})
    grade = {"label": "A", "required": [True], "forbidden": [False], "unsupported_claims": [], "citation_support": True}
    def result(value):
        return {"response": {"stop_reason": "end_turn", "content": [{"type": "text", "text": json.dumps(value)}]}}
    save(tmp_path / "calls/judge-answer-q1.json", result({"grades": [grade]}))
    save(tmp_path / "calls/answer-q1-sources.json", result({"answer": "five slots", "citations": [{"kind": "code", "path": "app.py", "start_line": 1, "end_line": 1}]}))
    summary = score(tmp_path, {"cases": [case]})
    assert [summary["arms"][a]["total"] for a in ("sources", "session", "records")] == [1, 1, 1]
    assert summary["arms"]["sources"]["passed"] == 1
    assert summary["arms"]["session"]["passed"] == summary["arms"]["records"]["passed"] == 0
    assert summary["capture"][0]["metrics"]["error"] == "capture grading incomplete"


def test_subscription_cannot_inherit_api_credentials_or_fall_back_to_api_login():
    env = subscription_env({"PATH": "bin", "ANTHROPIC_API_KEY": "secret", "ANTHROPIC_AUTH_TOKEN": "secret",
                            "ANTHROPIC_BASE_URL": "https://example.invalid", "CLAUDE_CODE_USE_BEDROCK": "1"}, 12000)
    assert env["PATH"] == "bin" and env["CLAUDE_CODE_MAX_OUTPUT_TOKENS"] == "12000"
    assert not any(k.startswith("ANTHROPIC_") for k in env)
    assert "CLAUDE_CODE_USE_BEDROCK" not in env
    require_subscription({"loggedIn": True, "authMethod": "claude.ai", "subscriptionType": "max"})
    with pytest.raises(ValueError, match="no API-key fallback"):
        require_subscription({"loggedIn": True, "authMethod": "api_key", "subscriptionType": None})


def test_valid_json_with_missing_grades_still_needs_completion():
    payload = {"question": {"required": ["fact"], "forbidden": ["bad"]},
               "answers": [{"label": "A"}, {"label": "B"}, {"label": "C"}]}
    def response(labels):
        grades = [{"label": label, "required": [True], "forbidden": [False],
                   "unsupported_claims": [], "citation_support": True} for label in labels]
        return {"response": {"stop_reason": "end_turn", "content": [{"type": "text", "text": json.dumps({"grades": grades})}]}}
    assert grading_complete(response(["A", "B", "C"]), payload, False)
    assert not grading_complete(response(["A"]), payload, False)
    assert not grading_complete(response(["A", "A", "C"]), payload, False)


def test_retrieval_keeps_a_correction_next_to_the_original_message():
    from tests.evals.coaching.retrieval import retrieve
    messages = [
        {"id": "m1", "role": "user", "text": "The widget memory setting is 512MB."},
        {"id": "m2", "role": "user", "text": "Correction: that crashed. Use 1GB instead."},
        {"id": "m3", "role": "assistant", "text": "The unrelated release is ready."},
    ]
    found, audit = retrieve(messages, [], "What widget memory setting was chosen?")
    assert {"m1", "m2"} <= {m["id"] for m in found}
    assert [m["id"] for m in found] == sorted(m["id"] for m in found)
    assert audit["model_calls"] == 0


def test_retrieval_budget_keeps_whole_messages_and_reports_oversized_ones():
    from tests.evals.coaching.retrieval import retrieve
    messages = [{"id": "large", "role": "user", "text": "widget memory " * 100},
                {"id": "small", "role": "user", "text": "widget memory is 1GB"}]
    found, audit = retrieve(messages, [], "widget memory", char_limit=100)
    assert found == [messages[1]]
    assert sum(len(m["text"]) for m in found) <= 100
    assert "large" in audit["skipped_budget"]


def test_unmatched_retrieval_does_not_add_arbitrary_session_text():
    from tests.evals.coaching.retrieval import retrieve
    assert retrieve([{"id": "m1", "text": "banana"}], [], "zebra")[0] == []


def test_retrieval_context_cannot_leak_labels_or_the_entire_session(case, decision):
    from tests.evals.coaching.retrieval import contexts
    case["messages"].append({"id": "private", "role": "user", "text": "banana" * 15000})
    case["gold"][0]["reason"] = "REFERENCE_ANSWER_DO_NOT_SEND"
    contexts_by_arm, audit = contexts(case, [decision], "display slots")
    assert contexts_by_arm["session"]["messages"] == case["messages"]
    assert "REFERENCE_ANSWER_DO_NOT_SEND" not in json.dumps(contexts_by_arm)
    assert "private" not in {m["id"] for m in contexts_by_arm["retrieval"]["messages"]}
    assert contexts_by_arm["session"]["sources"] == contexts_by_arm["retrieval"]["sources"]


def test_subscription_token_accounting_includes_cache_and_auxiliary_models():
    from tests.evals.coaching.retrieval import tokens
    result = {"cli_result": {"modelUsage": {
        "main": {"inputTokens": 2, "cacheCreationInputTokens": 100, "cacheReadInputTokens": 300, "outputTokens": 20},
        "helper": {"inputTokens": 50, "outputTokens": 4},
    }}}
    assert tokens(result) == {"input": 452, "output": 24}


def test_independent_session_validation_rejects_reused_pilot_or_duplicates():
    from tests.evals.coaching.retrieval import validate_corpus
    cases = [{"id": f"r{i}", "session_id": f"session-{i}", "questions": [{"id": f"r{i}-q{j}"} for j in range(6)]} for i in range(5)]
    validate_corpus({"cases": cases})
    cases[4]["session_id"] = cases[0]["session_id"]
    with pytest.raises(ValueError, match="distinct"):
        validate_corpus({"cases": cases})
    cases[4]["session_id"] = "f7276580-edb7-49d4-8570-a5d612f657b4"
    with pytest.raises(ValueError, match="pilot"):
        validate_corpus({"cases": cases})


def test_retrieval_report_counts_setup_and_rejects_incomplete_pair_grades(tmp_path, case, decision):
    from tests.evals.coaching.retrieval import contexts
    from tests.evals.coaching.retrieval_report import score as retrieval_score
    available, audit = contexts(case, [decision], "five slots")
    save(tmp_path / "context-q1.json", {"contexts": available, "retrieval": audit})
    save(tmp_path / "capture-s1.json", {"raw": [decision], "retained": [decision], "completed": True, "validation": []})
    save(tmp_path / "blind-map-q1.json", {"A": "session", "B": "retrieval"})
    def call(value, count):
        return {"response": {"stop_reason": "end_turn", "content": [{"type": "text", "text": json.dumps(value)}]},
                "cli_result": {"modelUsage": {"test": {"inputTokens": count, "outputTokens": 5}}}}
    grade = {"label": "A", "required": [True], "forbidden": [False], "unsupported_claims": [], "citation_support": True}
    save(tmp_path / "calls/judge-answer-q1.json", call({"grades": [grade]}, 20))
    answer = {"answer": "five slots", "citations": [{"kind": "code", "path": "app.py", "start_line": 1, "end_line": 1}]}
    save(tmp_path / "calls/answer-q1-session.json", call(answer, 50))
    save(tmp_path / "calls/answer-q1-retrieval.json", call(answer, 10))
    save(tmp_path / "calls/capture-s1.json", call({"decisions": [decision]}, 100))
    result = retrieval_score(tmp_path, {"cases": [case]})
    assert result["arms"]["session"]["total_input_tokens"] == 50
    assert result["arms"]["retrieval"]["total_input_tokens"] == 110
    assert result["arms"]["session"]["total_tokens"] == 55
    assert result["arms"]["retrieval"]["total_tokens"] == 120
    assert all(a["total"] == 1 and a["passed"] == 0 and a["graded"] == 0 for a in result["arms"].values())
    assert result["complete"] is False and result["pilot_win"] is False
