# Answer bank (per video, NOT in git)

A bank is the set of model answers a take will show, generated beforehand (production blocks where they exist, otherwise a local stack) and stored as one JSON file, `bank/bank.json`, next to the video's other data (set `FILM_DATA` to that folder). Banks hold model output, so they stay out of the repository; `film.config.json` names the file in `files.bank` and the keys it uses.

The take never calls a model: `capture.mjs` answers every `/api` request from the config's scripted routes and the bank, and logs anything model-capable that is not scripted as `UNSCRIPTED` / `ABORT`.

```jsonc
{
  "p1":    { "source": "where it came from (a production block id, or 'local stack')", "prompt": "the prompt it answers", "response": { "result": "artifact", "primitive": "explanation", "block": { /* the block exactly as /api/learn/artifact returns it: type, title, body, depth, proseLists, interactions, authoredBy ... */ } } },
  "qhere": { "source": "...", "question": "the suggested question it answers", "sse": "event: chunk\ndata: {...}\n\n...event: done\ndata: {\"ok\":true,\"threadId\":\"...\"...}\n\n" }
}
```

- `response` entries serve `/api/learn/artifact` and `/api/learn/inline/generate`, in the order of `routes.artifacts.queue` (`[["p1", 1900], ["p2", 1900], ...]`: bank key + the scripted wait in ms; 1600-2000 ms so the skeleton is in frame for the whole wait).
- `sse` entries serve `/api/learn/ask` for the rules in `routes.ask.answers` (`{ "targetKind": "card", "messageRegex": "...", "bank": "qhere" }`); the only thing rewritten is `"threadId"`. Every other ask gets a quiet stream whose `done` frame carries `"ok": true` (without it the chat stays "busy" and hides the cards' suggestions).
- Strip client-only fields from a stored block so it has the server's shape. A block made on production keeps its production depth: choose the depth with the real Depth menu when the take shows it.
- `capture.mjs --dry` / `draft.mjs --dry` check that every key the config uses exists in the bank (when the file is reachable).
