"""Two-arm subscription experiment: full visible sessions vs decisions + local retrieval."""

import hashlib
import json
import math
import random
import re
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

if __package__:
    from . import bench as b
    from .subscription import SubscriptionProvider, grading_complete, finish_grading
else:
    import bench as b
    from subscription import SubscriptionProvider, grading_complete, finish_grading

ARMS = ("session", "retrieval")
SETTINGS = {"char_limit": 12000, "message_limit": 8, "seed_limit": 4, "decision_expansion": 2,
            "bm25_k1": 1.5, "bm25_b": .75, "answer_limit": b.ANSWER_LIMIT, "judge_limit": 12000}
STOP = set("a an the is are was were be been to of for with in on and or it its this that these those "
           "what which how why did does do should can i we you they he she from as at by then than "
           "has have had will would could about into our their there here not no".split())


def words(text):
    text = re.sub(r"([a-z])([A-Z])", r"\1 \2", text)
    return [w for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in STOP]


def rank(texts, query):
    bags = [Counter(words(text)) for text in texts]
    avg = sum(sum(bag.values()) for bag in bags) / len(bags) if bags else 1
    scores = [0.0] * len(bags)
    for term in set(words(query)):
        df = sum(term in bag for bag in bags)
        weight = math.log(1 + (len(bags) - df + .5) / (df + .5))
        for i, bag in enumerate(bags):
            freq = bag[term]
            norm = SETTINGS["bm25_k1"] * (1 - SETTINGS["bm25_b"] + SETTINGS["bm25_b"] * sum(bag.values()) / (avg or 1))
            scores[i] += weight * freq * (SETTINGS["bm25_k1"] + 1) / (freq + norm) if freq else 0
    return sorted(enumerate(scores), key=lambda pair: (-pair[1], pair[0]))


def retrieve(messages, decisions, question, char_limit=12000):
    start = time.perf_counter()
    descriptions = [" ".join(str(d.get(k) or "") for k in ("decision", "reason", "alternatives")) for d in decisions]
    expanded = [i for i, score in rank(descriptions, question) if score > 0][:SETTINGS["decision_expansion"]]
    query = question + " " + " ".join(descriptions[i] for i in expanded)
    ranking = rank([m["text"] for m in messages], query)
    seeds = [i for i, score in ranking if score > 0][:SETTINGS["seed_limit"]]
    priority = list(seeds)
    for i in seeds:
        priority.extend(j for j in (i - 1, i + 1) if 0 <= j < len(messages))
    selected, skipped, seen, used = [], [], set(), 0
    for i in priority:
        if i in seen:
            continue
        seen.add(i)
        if len(selected) >= SETTINGS["message_limit"] or used + len(messages[i]["text"]) > char_limit:
            skipped.append(messages[i]["id"])
            continue
        selected.append(i)
        used += len(messages[i]["text"])
    chosen = [messages[i] for i in sorted(selected)]
    return chosen, {"selected_ids": [m["id"] for m in chosen], "skipped_budget": skipped,
                    "expanded_decision_ids": [decisions[i]["id"] for i in expanded],
                    "scores": [{"id": messages[i]["id"], "score": round(score, 6)} for i, score in ranking[:8]],
                    "chars": used, "model_calls": 0, "duration_s": round(time.perf_counter() - start, 6)}


def contexts(case, decisions, question):
    messages = [{k: m[k] for k in ("id", "role", "text")} for m in case["messages"]]
    found, audit = retrieve(messages, decisions, question, SETTINGS["char_limit"])
    common = {"snapshot": case.get("commit"), "sources": case["sources"]}
    return {"session": common | {"messages": messages},
            "retrieval": common | {"decisions": decisions, "messages": found}}, audit


def tokens(result):
    usage = result.get("cli_result", {}).get("modelUsage", {})
    if not usage:
        return {"input": 0, "output": 0}
    return {"input": sum(u.get("inputTokens", 0) + u.get("cacheCreationInputTokens", 0) + u.get("cacheReadInputTokens", 0) for u in usage.values()),
            "output": sum(u.get("outputTokens", 0) for u in usage.values())}


def validate_corpus(corpus):
    cases = corpus["cases"]
    ids = [c["session_id"] for c in cases]
    if len(cases) != 5 or len(set(ids)) != 5:
        raise ValueError("Require five distinct source sessions")
    if "f7276580-edb7-49d4-8570-a5d612f657b4" in ids:
        raise ValueError("Do not reuse the first pilot session")
    if any(len(c["questions"]) != 6 for c in cases) or len({q["id"] for c in cases for q in c["questions"]}) != 30:
        raise ValueError("Require six questions per session and 30 unique question IDs")


def prepare_contexts(run_dir, cases):
    for case in cases:
        cap = b.candidates(run_dir, case)
        for q in case["questions"]:
            available, audit = contexts(case, cap["retained"], q["text"])
            path = run_dir / f"context-{q['id']}.json"
            if path.exists():
                saved = json.loads(path.read_text(encoding="utf-8"))
                if b.digest(saved["contexts"]) != b.digest(available):
                    raise ValueError("Frozen retrieval changed; use a new run directory")
            else:
                b.save(path, {"contexts": available, "retrieval": audit})


def saved_contexts(run_dir, question):
    return json.loads((run_dir / f"context-{question['id']}.json").read_text(encoding="utf-8"))


def answer(provider, cases):
    prepare_contexts(provider.run_dir, cases)
    items = [(q, arm) for c in cases for q in c["questions"] for arm in ARMS]
    random.Random(20260910).shuffle(items)
    def one(item):
        q, arm = item
        context = saved_contexts(provider.run_dir, q)["contexts"][arm]
        provider.call(f"answer-{q['id']}-{arm}", b.ANSWER_SYSTEM,
                      {"context": b.prompt_context(context), "question": q["text"]}, SETTINGS["answer_limit"])
    b.parallel(items, one)


def judge(provider, cases):
    def one(item):
        case, q = item
        available = saved_contexts(provider.run_dir, q)["contexts"]
        order = list(ARMS)
        random.Random(q["id"] + ":retrieval-v1").shuffle(order)
        mapping, anonymous = {}, []
        for i, arm in enumerate(order):
            label = f"answer-{i+1}"
            mapping[label] = arm
            raw = b.call_result(provider.run_dir, f"answer-{q['id']}-{arm}")
            anonymous.append({"label": label, "response": b.parsed(raw) or {"unparsed_text": b.visible_text(raw)},
                              "available_context": b.prompt_context(available[arm])})
        b.save(provider.run_dir / f"blind-map-{q['id']}.json", mapping)
        payload = {"original_evidence": b.prompt_context(available["session"]), "question": q, "answers": anonymous}
        provider.call(f"judge-answer-{q['id']}", b.JUDGE_SYSTEM, payload, SETTINGS["judge_limit"])
    b.parallel([(c, q) for c in cases for q in c["questions"]], one)


def main(args):
    run_dir = args.run_dir
    if args.phase == "finish-grading":
        finish_grading(run_dir)
        return
    corpus_path = b.HERE / "retrieval-corpus.json" if args.corpus == b.HERE / "corpus.json" else args.corpus
    if args.phase == "report" and run_dir:
        corpus_path = run_dir / "corpus.json"
    corpus = json.loads(corpus_path.read_text(encoding="utf-8"))
    validate_corpus(corpus)
    print(f"5 distinct sessions / 30 questions / 60 answers; {b.MODEL}; subscription only", flush=True)
    if args.dry_run:
        print(f"Corpus SHA256: {b.digest(corpus)}; no requests sent")
        return
    if not run_dir:
        raise ValueError("--run-dir is required")
    run_dir.mkdir(parents=True, exist_ok=True)
    path = run_dir / "manifest.json"
    if args.phase == "report":
        from tests.evals.coaching.retrieval_report import write_report
        write_report(run_dir, corpus, json.loads(path.read_text(encoding="utf-8")))
        return
    if args.transport != "subscription":
        raise ValueError("This experiment uses the subscription; API transport is disabled")
    frozen = {"corpus_hash": b.digest(corpus), "settings": SETTINGS, "model": b.MODEL, "arms": list(ARMS),
              "prompts": {"capture": b.digest(b.CAPTURE_SYSTEM), "answer": b.digest(b.ANSWER_SYSTEM), "judge": b.digest(b.JUDGE_SYSTEM)},
              "retrieval_code_hash": hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    if path.exists():
        if json.loads(path.read_text(encoding="utf-8"))["frozen"] != frozen:
            raise ValueError("Frozen experiment changed; use a new directory")
    else:
        b.save(path, {"frozen": frozen, "started_at": datetime.now(timezone.utc).isoformat(), "transport": "claude-code-subscription"})
        b.save(run_dir / "corpus.json", corpus)
    provider = SubscriptionProvider(run_dir)
    for phase, fn in (("capture", b.capture), ("answers", answer), ("judge", judge)):
        if args.phase in (phase, "all"):
            fn(provider, corpus["cases"])
    if args.phase == "all":
        from tests.evals.coaching.retrieval_report import write_report
        write_report(run_dir, corpus, json.loads(path.read_text(encoding="utf-8")))
