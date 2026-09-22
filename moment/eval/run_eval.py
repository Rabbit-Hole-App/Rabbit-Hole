"""Score the pipeline against eval/gold.jsonl.

Each gold line: {"question", "video_id", "start", "end"}. Leave video_id empty to skip.
Reports video hit@1 and temporal IoU of the returned window vs the gold window.
"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from moment.cli import ask

def iou(a0, a1, b0, b1):
    inter = max(0.0, min(a1, b1) - max(a0, b0))
    union = max(a1, b1) - min(a0, b0)
    return inter / union if union > 0 else 0.0

gold = [json.loads(l) for l in open(Path(__file__).parent / "gold.jsonl") if l.strip()]
gold = [g for g in gold if g.get("video_id")]
hits, ious, rows = 0, [], []
for g in gold:
    ans = ask(g["question"], verbose=False)
    hit = ans is not None and ans.video.id == g["video_id"]
    j = iou(ans.start, ans.end, g["start"], g["end"]) if hit else 0.0
    hits += hit; ious.append(j)
    rows.append({"question": g["question"], "hit": hit, "iou": round(j, 2),
                 "got": None if ans is None else [ans.video.id, round(ans.start), round(ans.end)]})
    print(json.dumps(rows[-1]))
if gold:
    print(f"\nvideo hit@1: {hits}/{len(gold)}   mean IoU (on hits): {sum(ious)/len(ious):.2f}")
Path(__file__).with_name("results.jsonl").write_text("\n".join(json.dumps(r) for r in rows))
