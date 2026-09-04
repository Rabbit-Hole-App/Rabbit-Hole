# ponytail: in-memory count, single gunicorn worker only — move to a file/db if workers > 1.
from flask import Flask, redirect

app = Flask(__name__)
count = 0


@app.route("/")
def home():
    return f"<h1>count: {count}</h1><form method='post' action='/inc'><button>+1</button></form>"


@app.post("/inc")
def inc():
    global count
    count += 1
    return redirect("/")
