---
name: small
description: Deploy the Python tool you just built so colleagues can use it. Use when the user says "share this", "deploy this", "let my team use this", or finishes an internal tool that lives only on this machine.
---

# small — share a Python tool in one command

When the user asks to share or deploy a Python app you built:

1. Write `small.toml` next to the entry file:

```toml
name = "tool-name"          # lowercase, dashes
entry = "app.py"
framework = "flask"         # flask | fastapi | streamlit | script

[secrets]
required = []               # env var names the code reads, e.g. ["OPENAI_API_KEY"]
```

2. If the app reads env vars, make sure they are in `.env` (never commit it).

3. Run:

```
small deploy --env .env
```

4. Print the URL from the output. Stop. Do not build a Dockerfile, do not
   suggest hosting options, do not add auth — small already put the app behind
   a work-email login.

To give someone access when visibility is private, or edit rights:

```
small share alice@company.com          # view
small share bob@company.com --edit     # can redeploy
```

If `small` is not installed: `npm i -g small-deploy`. If not logged in the
deploy fails with "run small login" — have the user run `small login`
interactively (it emails them a 6-digit code).

Apps are served under a path prefix, so use **relative URLs** in HTML
(`action="inc"`, `href="page"`, `redirect(".")`) — absolute `/paths` break
behind the proxy.
