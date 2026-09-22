"""Offline tests: no network, no models, no LLM. Run: pytest -q"""
from moment.models import Segment, Video, Chunk
from moment.retrieve import chunk_video, _rrf
from moment.transcribe import _dedupe, _clean


def _video(n=40, step=3.0):
    segs = [Segment(i * step, (i + 1) * step, f"line {i}") for i in range(n)]
    return Video(id="x", title="t", channel="c", duration=n * step, segments=segs)


def test_chunks_cover_whole_video_with_overlap():
    v = _video()
    chunks = chunk_video(v)
    assert chunks[0].seg_lo == 0
    assert chunks[-1].seg_hi == len(v.segments)
    # overlap: consecutive chunks share segments
    assert chunks[1].seg_lo < chunks[0].seg_hi


def test_chunk_timing_and_text():
    v = _video()
    c = Chunk(video=v, seg_lo=2, seg_hi=5)
    assert c.start == 6.0 and c.end == 15.0
    assert c.text == "line 2 line 3 line 4"
    assert "[6.0] line 2" in c.timed_text()


def test_rrf_prefers_items_in_both_lists():
    s = _rrf([[1, 2, 3], [2, 5, 1]])
    assert s[2] > s[3] and s[1] > s[5]


def test_dedupe_rolling_captions():
    segs = [Segment(0, 2, "hello"), Segment(1, 3, "hello world"), Segment(3, 5, "next")]
    out = _dedupe(segs)
    assert [s.text for s in out] == ["hello world", "next"]
    assert out[0].start == 0 and out[0].end == 3


def test_clean_strips_tags():
    assert _clean("<c>hi</c> [Music] &nbsp; there") == "hi there"


def test_video_id_extraction():
    from moment.discover import _video_id
    assert _video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s") == "dQw4w9WgXcQ"
    assert _video_id("https://youtu.be/dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert _video_id("https://www.youtube.com/shorts/dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert _video_id("https://www.youtube.com/@channel") is None
