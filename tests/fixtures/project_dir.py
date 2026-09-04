"""Fixture: a temp directory holding a freshly generated Flask app ready for `small deploy`."""

import shutil
import tempfile
from pathlib import Path

import pytest

APP_PY = '''\
# Relative URLs only — served under a path prefix behind the small proxy.
from flask import Flask, redirect

app = Flask(__name__)
count = 0


@app.route("/")
def home():
    return f"<h1>count: {count}</h1><form method='post' action='inc'><button>+1</button></form>"


@app.post("/inc")
def inc():
    global count
    count += 1
    return redirect(".", code=303)
'''


@pytest.fixture(scope="session")
def project_dir():
    d = Path(tempfile.mkdtemp(prefix="small-itest-"))
    (d / "app.py").write_text(APP_PY)
    (d / "requirements.txt").write_text("flask\ngunicorn\n")
    (d / "small.toml").write_text('name = "itest-flask"\nentry = "app.py"\nframework = "flask"\n')
    yield d
    shutil.rmtree(d, ignore_errors=True)
