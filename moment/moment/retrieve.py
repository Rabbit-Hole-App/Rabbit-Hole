"""Steps 3-4: chunk transcripts into candidate moments, retrieve, rerank.

Chunks are the retrieval unit. That is the whole reason this returns a moment
rather than a video.
"""
from __future__ import annotations

import re
from functools import lru_cache

import numpy as np
from rank_bm25 import BM25Okapi

from .models import (CHUNK_STRIDE_S, CHUNK_TARGET_S, EMBED_MODEL, RERANK_MODEL,
                     TOP_RERANK, TOP_RETRIEVE, Chunk, Video)


def chunk_video(v: Video) -> list[Chunk]:
    """Sliding windows of ~CHUNK_TARGET_S seconds, snapped to segment boundaries.

    Overlapping windows mean a moment that straddles a boundary still appears
    intact in at least one chunk. The LLM tightens the bounds later.
    """
    chunks, n = [], len(v.segments)
    lo = 0
    while lo < n:
        t0 = v.segments[lo].start
        hi = lo
        while hi < n and v.segments[hi].end - t0 < CHUNK_TARGET_S:
            hi += 1
        hi = max(hi, lo + 1)
        chunks.append(Chunk(video=v, seg_lo=lo, seg_hi=hi))
        # advance by stride
        nxt = lo
        while nxt < n and v.segments[nxt].start - t0 < CHUNK_STRIDE_S:
            nxt += 1
        lo = nxt if nxt > lo else lo + 1
        if hi >= n:
            break
    return chunks


@lru_cache(maxsize=1)
def _embedder():
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer(EMBED_MODEL)


@lru_cache(maxsize=1)
def _reranker():
    from sentence_transformers import CrossEncoder
    return CrossEncoder(RERANK_MODEL, max_length=1024)


_tok = re.compile(r"[a-z0-9]+")


def _tokens(t: str) -> list[str]:
    return _tok.findall(t.lower())


def _rrf(rankings: list[list[int]], k: int = 60) -> dict[int, float]:
    scores: dict[int, float] = {}
    for ranking in rankings:
        for r, idx in enumerate(ranking):
            scores[idx] = scores.get(idx, 0.0) + 1.0 / (k + r + 1)
    return scores


def retrieve(question: str, videos: list[Video]) -> list[Chunk]:
    chunks = [c for v in videos for c in chunk_video(v)]
    if not chunks:
        return []
    texts = [f"{c.video.title}\n{c.text}" for c in chunks]

    # sparse
    bm25 = BM25Okapi([_tokens(t) for t in texts])
    sparse = np.argsort(-bm25.get_scores(_tokens(question)))[:TOP_RETRIEVE].tolist()

    # dense
    emb = _embedder()
    q = emb.encode([question], normalize_embeddings=True)
    d = emb.encode(texts, normalize_embeddings=True, batch_size=64, show_progress_bar=False)
    dense = np.argsort(-(d @ q.T).ravel())[:TOP_RETRIEVE].tolist()

    fused = _rrf([sparse, dense])
    cand = sorted(fused, key=fused.get, reverse=True)[:TOP_RETRIEVE]

    # cross-encoder rerank: biggest single quality jump over raw vector search
    pairs = [(question, texts[i]) for i in cand]
    scores = _reranker().predict(pairs)
    for i, s in zip(cand, scores):
        chunks[i].score = float(s)
    ranked = sorted((chunks[i] for i in cand), key=lambda c: c.score, reverse=True)

    # keep at most 2 chunks per video so the LLM sees breadth, not one video x8
    out, per_video = [], {}
    for c in ranked:
        if per_video.get(c.video.id, 0) >= 2:
            continue
        per_video[c.video.id] = per_video.get(c.video.id, 0) + 1
        out.append(c)
        if len(out) >= TOP_RERANK:
            break
    return out
