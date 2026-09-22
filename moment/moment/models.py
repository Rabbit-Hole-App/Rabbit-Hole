from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

CACHE_DIR = Path(os.environ.get("MOMENT_CACHE", "~/.cache/moment")).expanduser()
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Models — all local except the LLM.
EMBED_MODEL = os.environ.get("MOMENT_EMBED", "BAAI/bge-m3")
RERANK_MODEL = os.environ.get("MOMENT_RERANK", "BAAI/bge-reranker-v2-m3")
LLM_MODEL = os.environ.get("MOMENT_LLM", "claude-sonnet-4-6")

# Search knobs
N_QUERIES = 4          # YouTube search queries generated per question
N_PER_QUERY = 10       # candidates pulled per query
MAX_DURATION_S = 3 * 3600
CHUNK_TARGET_S = 60    # target moment length before LLM trimming
CHUNK_STRIDE_S = 30
TOP_RETRIEVE = 40
TOP_RERANK = 8


@dataclass
class Segment:
    """One caption line with timing."""
    start: float
    end: float
    text: str


@dataclass
class Video:
    id: str
    title: str
    channel: str
    duration: float
    segments: list[Segment] = field(default_factory=list)

    @property
    def url(self) -> str:
        return f"https://www.youtube.com/watch?v={self.id}"


@dataclass
class Chunk:
    """A candidate moment: a contiguous run of segments."""
    video: Video
    seg_lo: int          # index into video.segments (inclusive)
    seg_hi: int          # exclusive
    score: float = 0.0

    @property
    def start(self) -> float:
        return self.video.segments[self.seg_lo].start

    @property
    def end(self) -> float:
        return self.video.segments[self.seg_hi - 1].end

    @property
    def text(self) -> str:
        return " ".join(s.text for s in self.video.segments[self.seg_lo:self.seg_hi])

    def timed_text(self) -> str:
        """Text with per-segment timestamps so the LLM can pick tight bounds."""
        return "\n".join(
            f"[{s.start:.1f}] {s.text}" for s in self.video.segments[self.seg_lo:self.seg_hi]
        )


@dataclass
class Answer:
    video: Video
    start: float
    end: float
    answer: str
    reason: str
    confidence: float

    @property
    def url(self) -> str:
        return f"{self.video.url}&t={int(self.start)}s"

    @property
    def embed_url(self) -> str:
        return f"https://www.youtube.com/embed/{self.video.id}?start={int(self.start)}&end={int(self.end)}&autoplay=1"
