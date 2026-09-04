"""Fixture: a temp directory holding a freshly generated Flask app ready for `small deploy`."""

import shutil
import tempfile
from pathlib import Path

import pytest

APP_PY = '''\
# Count lives in SQLite under $SMALL_DATA (the [storage] volume), so it survives
# machine replacement. Falls back to ./counter.db for local runs without the volume.
import os
import sqlite3

from flask import Flask, redirect

app = Flask(__name__)
DB = os.path.join(os.environ.get("SMALL_DATA", "."), "counter.db")


def db():
    con = sqlite3.connect(DB)
    con.execute("CREATE TABLE IF NOT EXISTS counter (id INTEGER PRIMARY KEY, n INTEGER NOT NULL)")
    con.execute("INSERT OR IGNORE INTO counter (id, n) VALUES (1, 0)")
    return con


# Relative URLs only — served under a path prefix behind the small proxy.
@app.route("/")
def home():
    with db() as con:
        (n,) = con.execute("SELECT n FROM counter WHERE id = 1").fetchone()
    con.close()
    return f"<h1>count: {n}</h1><form method='post' action='inc'><button>+1</button></form>"


@app.post("/inc")
def inc():
    with db() as con:
        con.execute("UPDATE counter SET n = n + 1 WHERE id = 1")
    con.close()
    return redirect(".", code=303)
'''

SMALL_TOML = '''\
name = "itest-flask"
entry = "app.py"
framework = "flask"

[storage]
path = "/data"
size = "1GB"
'''


@pytest.fixture(scope="session")
def project_dir():
    d = Path(tempfile.mkdtemp(prefix="small-itest-"))
    (d / "app.py").write_text(APP_PY)
    (d / "requirements.txt").write_text("flask\ngunicorn\n")
    (d / "small.toml").write_text(SMALL_TOML)
    yield d
    shutil.rmtree(d, ignore_errors=True)
