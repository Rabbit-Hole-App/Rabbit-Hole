from __future__ import annotations

import argparse
import json
import sys
import time

from .answer import choose
from .discover import discover
from .models import Answer
from .retrieve import retrieve
from .transcribe import load_transcripts


def ask(question: str, verbose: bool = True) -> Answer | None:
    log = (lambda *a: print(*a, file=sys.stderr)) if verbose else (lambda *a: None)
    t = time.time()

    videos = discover(question)
    log(f"[{time.time()-t:5.1f}s] {len(videos)} candidate videos")

    videos = load_transcripts(videos)
    log(f"[{time.time()-t:5.1f}s] {len(videos)} with transcripts")

    cands = retrieve(question, videos)
    log(f"[{time.time()-t:5.1f}s] {len(cands)} reranked moments")
    for c in cands:
        log(f"   {c.score:6.2f}  {c.video.id} {c.start:7.1f}-{c.end:7.1f}  {c.video.title[:60]}")

    ans = choose(question, cands)
    log(f"[{time.time()-t:5.1f}s] done")
    return ans


def main() -> None:
    p = argparse.ArgumentParser(description="Find the one YouTube moment that answers a question.")
    p.add_argument("question", nargs="+")
    p.add_argument("--json", action="store_true")
    p.add_argument("-q", "--quiet", action="store_true")
    a = p.parse_args()

    ans = ask(" ".join(a.question), verbose=not a.quiet)
    if ans is None:
        print("No answer found.")
        sys.exit(1)

    if a.json:
        print(json.dumps({
            "video_id": ans.video.id, "title": ans.video.title, "channel": ans.video.channel,
            "start": round(ans.start, 1), "end": round(ans.end, 1),
            "url": ans.url, "embed_url": ans.embed_url,
            "answer": ans.answer, "reason": ans.reason, "confidence": ans.confidence,
        }, indent=2))
        return

    m0, s0 = divmod(int(ans.start), 60)
    m1, s1 = divmod(int(ans.end), 60)
    print(f"\n{ans.video.title}  —  {ans.video.channel}")
    print(f"{m0}:{s0:02d} → {m1}:{s1:02d}   (confidence {ans.confidence:.2f})")
    print(ans.url)
    print(f"\n{ans.answer}\n\nWhy this one: {ans.reason}")


if __name__ == "__main__":
    main()
