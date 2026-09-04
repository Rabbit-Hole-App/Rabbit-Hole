# small-deploy

Deploy a Python app behind a work-email login in one command.

```
npm i -g small-deploy

small login                 # email → 6-digit code
small deploy --env .env     # detect app, build remotely, print URL
small share alice@acme.com  # grant access
small list                  # apps in your org
small logs [app]            # recent container output
```

Your app is served at `https://<control-plane>/a/<org>/<app>/` behind a
magic-link login. Only people at your email domain (or explicitly shared
emails) get in. The container itself refuses any request that did not come
through the auth wall.

## App detection

In order: `small.toml` (`entry`), `--entry` flag, framework hint
(`Flask(`, `FastAPI(`, `import streamlit`), filename convention
(`app.py`/`main.py`/`server.py`), only `.py` file. Every deploy prints what
was chosen.

## small.toml

```toml
name = "counter"
entry = "app.py"
framework = "flask"       # flask | fastapi | streamlit | script

[deps]
file = "requirements.txt"
system = []               # apt packages

[secrets]
required = []             # deploy fails if any are missing from .env

[access]
visibility = "domain"     # domain | private
```

Only `entry` is required.

## Notes

- Builds run on Fly.io remote builders — you need `flyctl` installed, no Docker.
- Apps live under a path prefix: use relative URLs in your HTML.
- `.env` values are sent to the runtime as secrets, never baked into the image.
