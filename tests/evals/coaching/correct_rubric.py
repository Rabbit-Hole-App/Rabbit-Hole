"""Audit the documented timing-label correction; preserve every original answer/grade."""

import json

from tests.evals.coaching import bench as b
from tests.evals.coaching.retrieval_report import score
from tests.evals.coaching.subscription import SubscriptionProvider, grading_complete


def correct(run_dir):
    corpus = json.loads((run_dir / "corpus.json").read_text(encoding="utf-8"))
    current = score(run_dir, corpus)
    if not all(r["graded"] for r in current["rows"]):
        raise ValueError("Complete all original grades before the rubric correction")
    original_path = run_dir / "summary-frozen-rubric.json"
    if not original_path.exists():
        b.save(original_path, current)
    path = run_dir / "rubric-corrections.json"
    audit = json.loads(path.read_text(encoding="utf-8"))
    map_path = run_dir / "grade-selections.json"
    mapping = json.loads(map_path.read_text(encoding="utf-8")) if map_path.exists() else {}
    provider = SubscriptionProvider(run_dir)
    for correction in audit["corrections"]:
        assert correction["question"] == "r01-q3" and correction["field"] == "required[1]"
        original_name = "judge-answer-" + correction["question"]
        original = json.loads((run_dir / "calls" / (original_name + ".json")).read_text(encoding="utf-8"))
        request = original["request"]
        payload = request["payload"]
        assert payload["question"]["required"][1] == correction["original"]
        payload["question"]["required"][1] = correction["corrected"]
        prefix = original_name + "-subscription-correction-"
        attempts = list((run_dir / "calls").glob(prefix + "*.json"))
        saved = [(p, json.loads(p.read_text(encoding="utf-8"))) for p in attempts]
        successful = [p for p, r in saved if r["request"]["payload"] == payload
                      and r["request"]["system"] == request["system"] and grading_complete(r, payload, False)]
        if successful:
            selected = successful[-1].stem
        else:
            selected = prefix + str(len(attempts) + 1)
            result = provider.call(selected, request["system"], payload, 12000)
            if not grading_complete(result, payload, False):
                raise ValueError("Corrected grade incomplete; original grades are preserved")
        mapping[original_name] = selected
        correction["selected_grade"] = selected
        correction["original_grade"] = original_name
    b.save(map_path, mapping)
    b.save(path, audit)
    print("Applied the documented source correction to both answers; original scores preserved.")
