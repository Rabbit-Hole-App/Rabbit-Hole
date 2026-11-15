"""Run card outputs (RUN_CARD.md, Run card v1.1): what a run's stdout and produced files are, for schemas/run-status.json.
Pure functions and one small parser; no sandbox in here."""
import json
import posixpath
import re
import threading

import limits

_KINDS = {'image': 'png jpg jpeg gif webp svg', 'json': 'json', 'table': 'csv tsv', 'markdown': 'md', 'html': 'html htm', 'notebook': 'ipynb',
          'audio': 'wav mp3 ogg', 'video': 'mp4 webm', 'text': 'txt log'}
_KIND_OF_EXT = {ext: kind for kind, exts in _KINDS.items() for ext in exts.split()}
_CONTENT_TYPE = {'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'gif': 'image/gif', 'webp': 'image/webp',
                 'svg': 'text/plain; charset=utf-8',  # never image/svg+xml: an SVG opened on its own origin runs scripts; the card sanitizes the text itself
                 'json': 'application/json', 'ipynb': 'application/json', 'csv': 'text/csv; charset=utf-8', 'tsv': 'text/tab-separated-values; charset=utf-8',
                 'md': 'text/markdown; charset=utf-8', 'html': 'text/html; charset=utf-8', 'htm': 'text/html; charset=utf-8', 'txt': 'text/plain; charset=utf-8', 'log': 'text/plain; charset=utf-8',
                 'wav': 'audio/wav', 'mp3': 'audio/mpeg', 'ogg': 'audio/ogg', 'mp4': 'video/mp4', 'webm': 'video/webm'}


def _ext(path: str) -> str:
    return posixpath.splitext(path)[1].lstrip('.').lower()


def kind_of(path: str) -> str:
    """run-status.json producedFile.kind, by extension; everything unlisted (.pt .bin .db .pkl) is binary."""
    return _KIND_OF_EXT.get(_ext(path), 'binary')


def content_type(path: str, kind: str) -> str:
    return _CONTENT_TYPE.get(_ext(path), 'application/octet-stream') if kind != 'binary' else 'application/octet-stream'


# ---------------------------------------------------------------- stdout

def collapse_cr(text: str) -> str:
    """Carriage-return progress (tqdm) collapsed to the last state of each line."""
    return '\n'.join(line.rstrip('\r').rsplit('\r', 1)[-1] for line in text.replace('\r\n', '\n').split('\n'))


def _shape(line: str):
    if line.count('|') >= 2:
        return ('pipe', line.count('|'))
    cells = re.split(r'\s{2,}', line.strip())
    return ('cols', len(cells)) if len(cells) >= 2 else None


def stdout_kind(text: str) -> str:
    """json when the whole stdout parses as a JSON object or array; table when 3 or more consecutive lines share a pipe or column shape (best effort); else text."""
    t = text.strip()
    if t[:1] in ('{', '['):
        try:
            json.loads(t)
            return 'json'
        except ValueError:
            pass
    run, prev = 0, None
    for line in collapse_cr(text).split('\n'):
        shape = _shape(line) if line.strip() else None
        run = run + 1 if shape and shape == prev else (1 if shape else 0)
        prev = shape
        if run >= 3:
            return 'table'
    return 'text'


# ---------------------------------------------------------------- metrics

_NUM = r'-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?'
_ITER = re.compile(r'^\s*(?:iter(?:ation)?|step|epoch)\s+(\d+)\s*[:,]\s*(.*)$', re.I)       # `iter 10: loss 4.1, time 12ms` (nanoGPT): x = 10, one point per `name value` part
_PAIR = re.compile(rf'([A-Za-z_][A-Za-z_ ]*?)\s*[:=]?\s*({_NUM})\s*(?:ms|s|%)?')
_KV = re.compile(rf'^\s*([A-Za-z_][\w .-]{{0,40}}?)\s*[:=]\s*({_NUM})\s*$')                  # `key: number`: x = the point's index
_X = re.compile(r'\b(?:iter(?:ation)?|step|epoch)\s*[:=]?\s*(\d+)', re.I)


class MetricParser:
    """Series from stdout as it streams: the step's metric_* check pattern (capture group 1) first, then `iter N: name value, ...` lines, then generic `key: number` lines.
    A generic series is reported once it has 2 points (a lone `Epoch: 3` is not a chart); a check series from its first point. At most METRIC_MAX_SERIES reported, METRIC_MAX_POINTS each."""
    CANDIDATES = 24  # distinct names tracked before the 8 reported are chosen

    def __init__(self, checks=()):
        self.checks = [(name, re.compile(pattern, re.M)) for name, pattern in checks if pattern]
        self.series, self.checked, self.buf, self.lock = {}, set(), '', threading.Lock()

    def _add(self, name: str, x, y: float) -> None:
        pts = self.series.get(name)
        if pts is None:
            if len(self.series) >= self.CANDIDATES:
                return
            pts = self.series[name] = []
        if len(pts) >= limits.METRIC_MAX_POINTS:
            del pts[::2]  # shortcut: halve the series (every other point) when full, so the whole run stays in 2000 points; the last point is always the newest
        pts.append([x if x is not None else len(pts), y])

    def _line(self, line: str) -> None:
        if not line.strip():
            return
        found, xm = {}, _X.search(line)
        x = int(xm.group(1)) if xm else None
        for name, rx in self.checks:
            m = rx.search(line)
            if m:
                try:
                    found[name] = float(m.group(1))
                    self.checked.add(name)
                except (ValueError, IndexError):
                    pass
        it = _ITER.match(line)
        if it:
            for part in it.group(2).split(','):
                m = _PAIR.fullmatch(part.strip())
                if m and m.group(1).strip():
                    found.setdefault(m.group(1).strip(), float(m.group(2)))
        else:
            m = _KV.match(line)
            if m:
                found.setdefault(m.group(1).strip(), float(m.group(2)))
        for name, y in found.items():
            self._add(name, x, y)

    def feed(self, text: str) -> None:
        with self.lock:
            parts = re.split(r'[\r\n]', self.buf + text)
            self.buf = parts.pop() if len(parts[-1]) < 4096 else ''  # an unfinished line waits for its end
            for line in parts:
                self._line(line)

    def flush(self) -> None:
        with self.lock:
            line, self.buf = self.buf, ''
            self._line(line)

    def result(self) -> list:
        with self.lock:
            keep = [(n, p) for n, p in self.series.items() if n in self.checked or len(p) >= 2]
            keep.sort(key=lambda np: np[0] not in self.checked)  # check series first, then first-seen order (sort is stable)
            return [{'name': n, 'points': [list(pt) for pt in p]} for n, p in keep[:limits.METRIC_MAX_SERIES]]
