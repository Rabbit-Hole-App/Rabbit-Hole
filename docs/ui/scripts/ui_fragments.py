"""Resolve canonical UI template includes for every preview/export/search consumer."""
from pathlib import Path
import re
ROOT = Path(__file__).resolve().parents[1]
INCLUDE = re.compile(r"<!-- ui:include ([a-z0-9-]+) -->")
def expand(text, chain=()):
    def replace(match):
        name = match[1]
        if name in chain:
            raise ValueError("Circular UI include: " + " -> ".join((*chain, name)))
        return expand((ROOT / "templates" / (name + ".html")).read_text(), (*chain, name))
    return INCLUDE.sub(replace, text)
def read_markup(folder):
    return expand((folder / "markup.html").read_text())
