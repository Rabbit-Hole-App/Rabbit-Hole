"""Step 5: from the reranked candidates, pick ONE moment and tighten its bounds.

Retrieval gives 'relevant passages'. This step turns that into 'the exact moment':
the LLM sees each candidate with per-line timestamps plus a little context on each
side, and returns the tightest [start, end] that actually answers the question.
"""
from __future__ import annotations

from .llm import complete_json
from .models import Answer, Chunk

CONTEXT_SEGS = 6   # extra segments shown on each side so bounds can extend past the chunk
PAD_S = 1.5        # seconds of padding on the final clip

_PROMPT = """You are choosing the single best moment on YouTube that answers a question.

Question: {question}

Below are candidate moments. Each line is prefixed with its start time in seconds.
Lines marked with '~' are surrounding context that you MAY include in the bounds
if they are part of the answer.

{candidates}

Pick the ONE candidate that most directly and completely answers the question
(prefer: the speaker actually explains/demonstrates it; clear; not tangential).
Then set the tightest start and end (in seconds, using the line timestamps) that
contain the full answer — typically 20–120 seconds.

Return JSON:
{{
  "candidate": <index>,
  "start": <seconds>,
  "end": <seconds>,
  "answer": "<2-3 sentence summary of what the speaker says, in your own words>",
  "reason": "<one sentence on why this beats the other candidates>",
  "confidence": <0.0-1.0, how well this actually answers the question>
}}"""


def _render(i: int, c: Chunk) -> str:
    segs = c.video.segments
    lo, hi = max(0, c.seg_lo - CONTEXT_SEGS), min(len(segs), c.seg_hi + CONTEXT_SEGS)
    lines = []
    for j in range(lo, hi):
        mark = "" if c.seg_lo <= j < c.seg_hi else "~"
        lines.append(f"{mark}[{segs[j].start:.1f}] {segs[j].text}")
    return (f"### Candidate {i}\nVideo: {c.video.title} — {c.video.channel} "
            f"({c.video.duration/60:.0f} min)\n" + "\n".join(lines))


def choose(question: str, candidates: list[Chunk]) -> Answer | None:
    if not candidates:
        return None
    body = "\n\n".join(_render(i, c) for i, c in enumerate(candidates))
    out = complete_json(_PROMPT.format(question=question, candidates=body), max_tokens=800)

    try:
        c = candidates[int(out["candidate"])]
        start, end = float(out["start"]), float(out["end"])
    except (KeyError, ValueError, IndexError, TypeError):
        c = candidates[0]
        start, end = c.start, c.end

    # sanity: bounds must be inside the video and sensible
    start = max(0.0, start - PAD_S)
    end = min(c.video.duration or end + PAD_S, end + PAD_S)
    if end - start < 5 or end <= start:
        start, end = max(0.0, c.start - PAD_S), c.end + PAD_S

    return Answer(
        video=c.video,
        start=start,
        end=end,
        answer=str(out.get("answer", "")),
        reason=str(out.get("reason", "")),
        confidence=float(out.get("confidence", 0.5)),
    )
