# Notes for coding agents

- Entry point: `moment/cli.py:ask()`. Pipeline order: discover → transcribe → retrieve → answer.
- All config lives in `moment/models.py`. Do not scatter constants elsewhere.
- Offline tests: `pytest -q tests`. They must stay runnable with no network, no model
  downloads, no API key. Keep heavy imports (sentence_transformers, anthropic, yt_dlp)
  out of module top level in anything the tests import, or lazy-load them.
- Discovery backends live in `discover.py` behind `discover(question, backend=)`. Add a new
  backend as `discover_<name>()` returning `list[Video]` and wire it in `discover()`; keep
  the yt-dlp path free of API keys. Exa is find-only: never expect timestamps from it.
- Network-dependent behaviour (YouTube, Hugging Face, Anthropic, Exa) is only in
  `discover.py`, `transcribe.py`, `retrieve.py` (model load), `llm.py`.
- Transcript cache: `~/.cache/moment/<video_id>.json` (empty list = "no captions", also cached).
  Delete a file to force a refetch.
- To change the LLM provider, edit only `llm.py:complete`. Everything else uses `complete_json`.
- Before claiming a change works end-to-end, run `moment --json "<question>"` and
  check `start < end`, `end - start` is 5–300 s, and `url` opens at the moment.
