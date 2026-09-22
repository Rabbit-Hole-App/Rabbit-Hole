"""Step 2: get timed transcripts. Captions first (free, fast), Whisper if missing."""
from __future__ import annotations

import json
import re
from concurrent.futures import ThreadPoolExecutor

from youtube_transcript_api import YouTubeTranscriptApi

from .models import CACHE_DIR, Segment, Video

_TAG = re.compile(r"<[^>]+>|\[[^\]]*\]|&\w+;")


def _clean(t: str) -> str:
    return re.sub(r"\s+", " ", _TAG.sub("", t)).strip()


def _from_captions(video_id: str) -> list[Segment] | None:
    try:
        tl = YouTubeTranscriptApi().list(video_id)
        try:
            tr = tl.find_manually_created_transcript(["en"])
        except Exception:
            tr = tl.find_generated_transcript(["en"])
        segs = []
        for s in tr.fetch():
            text = _clean(s.text)
            if text:
                segs.append(Segment(start=s.start, end=s.start + s.duration, text=text))
        return _dedupe(segs)
    except Exception:
        return None


def _dedupe(segs: list[Segment]) -> list[Segment]:
    """Auto-captions repeat rolling lines; drop a segment whose text is a prefix of the next."""
    out: list[Segment] = []
    for s in segs:
        if out and s.text.startswith(out[-1].text):
            out[-1] = Segment(out[-1].start, s.end, s.text)
        else:
            out.append(s)
    return out


def _from_whisper(video_id: str) -> list[Segment] | None:
    try:
        import yt_dlp
        from faster_whisper import WhisperModel
    except ImportError:
        return None
    audio = CACHE_DIR / f"{video_id}.m4a"
    if not audio.exists():
        opts = {"format": "bestaudio[ext=m4a]/bestaudio", "outtmpl": str(audio), "quiet": True}
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([f"https://www.youtube.com/watch?v={video_id}"])
    model = WhisperModel("small", compute_type="int8")
    segs, _ = model.transcribe(str(audio), vad_filter=True)
    return [Segment(s.start, s.end, _clean(s.text)) for s in segs if _clean(s.text)]


def get_segments(video_id: str, allow_whisper: bool = True) -> list[Segment] | None:
    cache = CACHE_DIR / f"{video_id}.json"
    if cache.exists():
        data = json.loads(cache.read_text())
        return [Segment(**d) for d in data] if data else None

    segs = _from_captions(video_id)
    if segs is None and allow_whisper:
        segs = _from_whisper(video_id)

    cache.write_text(json.dumps([s.__dict__ for s in segs] if segs else []))
    return segs


def load_transcripts(videos: list[Video], workers: int = 8) -> list[Video]:
    def fill(v: Video) -> Video | None:
        segs = get_segments(v.id, allow_whisper=False)   # Whisper only when explicitly enabled
        if not segs:
            return None
        v.segments = segs
        return v

    with ThreadPoolExecutor(max_workers=workers) as ex:
        return [v for v in ex.map(fill, videos) if v is not None]
