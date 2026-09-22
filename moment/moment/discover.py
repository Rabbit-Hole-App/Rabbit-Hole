"""Step 1: turn a question into candidate YouTube videos.

Remy 'searched all of YouTube' by not indexing all of YouTube. We let a search
engine do candidate generation, then only transcribe/index what comes back.

Two backends, selected by MOMENT_DISCOVER (default "ytdlp"):
  ytdlp - LLM expands the question into N YouTube searches, run via yt-dlp. Free, no key.
  exa   - Exa neural search restricted to youtube.com. Needs EXA_API_KEY. One call,
          no LLM expansion, meaning-based matching. Exa does NOT return transcripts
          or timestamps; it is only used to find videos.
  both  - union of the two (more recall, slower).
"""
from __future__ import annotations

import json
import os
import re
from concurrent.futures import ThreadPoolExecutor

from .models import MAX_DURATION_S, N_PER_QUERY, N_QUERIES, Video

DISCOVER_BACKEND = os.environ.get("MOMENT_DISCOVER", "ytdlp").lower()
EXA_NUM_RESULTS = int(os.environ.get("MOMENT_EXA_RESULTS", "30"))

_VID_RE = re.compile(r"(?:v=|youtu\.be/|/shorts/|/embed/|/live/)([A-Za-z0-9_-]{11})")


def _video_id(url: str) -> str | None:
    m = _VID_RE.search(url or "")
    return m.group(1) if m else None


# ---------------------------------------------------------------- yt-dlp backend
_EXPAND_PROMPT = """You are generating YouTube search queries.

Question: {question}

Write {n} diverse YouTube search queries that would surface videos where someone
actually answers this question out loud (tutorials, talks, interviews, podcasts).
Mix phrasings: a how-to phrasing, a direct question, an expert/technical phrasing,
and a beginner phrasing. Avoid queries that would return news or Shorts.

Return JSON: {{"queries": ["...", "..."]}}"""


def expand_queries(question: str, n: int = N_QUERIES) -> list[str]:
    from .llm import complete_json
    out = complete_json(_EXPAND_PROMPT.format(question=question, n=n))
    queries = [q.strip() for q in out.get("queries", []) if q.strip()]
    return (queries or [question])[:n]


def _yt_search(query: str, n: int) -> list[dict]:
    import yt_dlp
    opts = {"quiet": True, "no_warnings": True, "extract_flat": True, "skip_download": True}
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(f"ytsearch{n}:{query}", download=False)
    return info.get("entries") or []


def discover_ytdlp(question: str) -> list[Video]:
    queries = expand_queries(question)
    with ThreadPoolExecutor(max_workers=len(queries)) as ex:
        results = list(ex.map(lambda q: _yt_search(q, N_PER_QUERY), queries))
    videos = []
    for entries in results:
        for e in entries:
            if not e.get("id"):
                continue
            videos.append(Video(
                id=e["id"],
                title=e.get("title") or "",
                channel=e.get("uploader") or e.get("channel") or "",
                duration=float(e.get("duration") or 0),
            ))
    return videos


# ------------------------------------------------------------------- Exa backend
def discover_exa(question: str) -> list[Video]:
    from exa_py import Exa
    exa = Exa(os.environ["EXA_API_KEY"])
    res = exa.search(
        question,
        include_domains=["youtube.com"],
        num_results=EXA_NUM_RESULTS,
        type="auto",
        contents=False,          # we only need URLs + titles; transcripts come from step 2
    )
    videos = []
    for r in res.results:
        vid = _video_id(r.url)
        if not vid or "/shorts/" in r.url:
            continue
        videos.append(Video(
            id=vid,
            title=getattr(r, "title", "") or "",
            channel=getattr(r, "author", "") or "",
            duration=0.0,        # unknown from Exa; filled lazily in _fill_durations
        ))
    return videos


def _fill_durations(videos: list[Video]) -> None:
    """Exa results lack duration; fetch it cheaply so the length filter still applies."""
    import yt_dlp
    missing = [v for v in videos if not v.duration]
    if not missing:
        return
    opts = {"quiet": True, "no_warnings": True, "skip_download": True, "extract_flat": True}

    def one(v: Video) -> None:
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(f"https://www.youtube.com/watch?v={v.id}", download=False)
            v.duration = float(info.get("duration") or 0)
            v.channel = v.channel or info.get("uploader") or info.get("channel") or ""
            v.title = v.title or info.get("title") or ""
        except Exception:
            pass

    with ThreadPoolExecutor(max_workers=8) as ex:
        list(ex.map(one, missing))


# ---------------------------------------------------------------------- dispatch
def discover(question: str, backend: str | None = None) -> list[Video]:
    backend = (backend or DISCOVER_BACKEND)
    if backend == "exa":
        videos = discover_exa(question)
    elif backend == "both":
        videos = discover_exa(question) + discover_ytdlp(question)
    else:
        videos = discover_ytdlp(question)

    if backend in ("exa", "both"):
        _fill_durations(videos)

    seen: dict[str, Video] = {}
    for v in videos:
        if v.id in seen:
            continue
        if v.duration and (v.duration < 45 or v.duration > MAX_DURATION_S):  # Shorts / marathons
            continue
        seen[v.id] = v
    return list(seen.values())


if __name__ == "__main__":
    import sys
    for v in discover(" ".join(sys.argv[1:])):
        print(json.dumps({"id": v.id, "title": v.title, "channel": v.channel, "dur": v.duration}))
