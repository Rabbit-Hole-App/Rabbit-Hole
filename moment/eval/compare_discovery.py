"""Compare discovery backends on recall: does the gold video appear in the candidate set?

Usage: python eval/compare_discovery.py            (needs EXA_API_KEY for the exa column)
"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from moment.discover import discover

gold = [json.loads(l) for l in open(Path(__file__).parent / "gold.jsonl") if l.strip()]
gold = [g for g in gold if g.get("video_id")]
backends = ["ytdlp", "exa"]
hits = {b: 0 for b in backends}
for g in gold:
    row = {"question": g["question"][:50]}
    for b in backends:
        try:
            ids = {v.id for v in discover(g["question"], backend=b)}
            ok = g["video_id"] in ids
        except Exception as e:
            ok, ids = False, set()
            row[f"{b}_err"] = str(e)[:60]
        hits[b] += ok
        row[b] = f"{'HIT' if ok else 'miss'} ({len(ids)})"
    print(json.dumps(row))
print("\nrecall@candidates:", {b: f"{hits[b]}/{len(gold)}" for b in backends})
