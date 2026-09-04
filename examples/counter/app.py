# Count lives in SQLite under $SMALL_DATA (the [storage] volume), so it survives
# machine replacement. Falls back to ./counter.db for local runs without the volume.
# ponytail: connection per request, no WAL — fine at internal-tool traffic.
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


# Relative URLs only — the app is served under a path prefix behind the proxy.
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
