"""Rebuild the frozen corpus from explicitly selected local transcript messages + git.

No network. Only visible user/assistant text is selected, never thinking or auth tool output.
python tests/evals/coaching/prepare.py --session PATH_TO_SELECTED_CLAUDE_JSONL
"""

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

from bench import HERE, ROOT, digest, env_values, redact, save


def q(name, kind, text, required, forbidden):
    return {"name": name, "category": kind, "text": text,
            "required": required, "forbidden": forbidden}


def g(name, decision, reason, path, marker, messages, alternatives=()):
    return {"id": name, "decision": decision, "reason": reason, "path": path,
            "marker": marker, "evidence": [f"m{x}" for x in messages],
            "alternatives": list(alternatives)}


GUARD = "packages/runtime/guard.py"
GRADIO = "examples/yolo-gradio/small.toml"
FLY = "packages/control-plane/src/fly.js"
INIT = "packages/cli/lib/init.js"
SOURCE = "packages/cli/lib/source.js"
INDEX = "packages/control-plane/src/index.js"
INPUTS = "packages/cli/lib/inputs.js"
CLI = "packages/cli/bin/small.js"

EPISODES = [
    {
        "id": "s01", "title": "WebSocket guard and Gradio memory", "commit": "a1bcdd6",
        "selected_lines": [960, 1026, 1140, 1181, 1289, 1416, 1427, 1436, 1446, 1470, 1514],
        "paths": [GUARD, GRADIO, "tests/unit_tests/packages/runtime/test_guard_ws.py"],
        "gold": [
            g("ws", "Tunnel WebSocket traffic as raw bytes", "Gradio and Streamlit open sockets after page load; the full-buffer proxy breaks them.", GUARD, "def _websocket", [960], ["Full-buffer HTTP proxy for WebSocket traffic"]),
            g("ws_auth", "Check X-Small-Proxy before accepting upgrades", None, GUARD, 'if self.headers.get("X-Small-Proxy")', [960, 1514]),
            g("memory", "Restore Gradio to 2GB after probing lower memory", "512MB OOMed; 1024MB worked in the reported probe, but 2GB was restored to match the requested configuration.", GRADIO, 'memory = "2GB"', [960, 1446, 1514], ["512MB for this tested workload"]),
            g("buffer", "Use a 65536-byte pump receive buffer", None, GUARD, "src.recv(65536)", []),
        ],
        "questions": [
            q("websocket reason", "why", "Why was a WebSocket path added instead of keeping all requests on the existing HTTP proxy?", ["Explain that Gradio/Streamlit open sockets after page load and the full-buffer proxy breaks that interaction.", "Describe raw bidirectional tunneling as the implemented approach."], ["Claim that plain HTTP was entirely replaced or that the change was primarily a measured latency optimization."]),
            q("upgrade safety", "change", "I want to accept Upgrade: websocket before checking X-Small-Proxy. Is that consistent with the builder's requirement?", ["Reject moving authentication after the upgrade; the header check must still apply.", "Explain the bypass risk or show that the snapshot checks the secret before the upgrade branch."], ["Recommend accepting unauthenticated upgrades."]),
            q("memory observation", "operations", "What actually happened when the builder tried 512MB and 1024MB for the Gradio app?", ["Report that 512MB could load the page but inference/upload failed with OOM/code 137.", "Report that 1024MB worked in that session, without claiming a universal memory guarantee."], ["Claim both sizes worked or that 1024MB is independently verified by this benchmark."]),
            q("memory choice", "why", "The config says 2GB, but was 2GB the smallest memory that worked? Why did it end up at 2GB?", ["Distinguish the observed 1024MB floor from the configured 2GB.", "Explain that the agent restored 2GB to match the user's requested configuration."], ["Claim measurements proved 2GB was the minimum or that the builder recorded a quantified safety-margin analysis."]),
            q("unknown buffer", "unknown", "Why exactly is the pump buffer 65536 bytes? Did the builder benchmark that size against smaller buffers?", ["Identify 65536 in the code and say its exact rationale/comparison is not recorded.", "Do not turn plausible buffering advice into a historical explanation."], ["Claim a buffer benchmark or a measured optimal size was recorded."]),
            q("regression guidance", "coaching", "I am changing the guard's WebSocket handling. What existing behavior should I preserve and what test should I run?", ["Preserve the secret check on upgrades and bidirectional byte forwarding.", "Use the stdlib echo round-trip test and the rejection/403 case without the header."], ["Suggest dropping authentication or adding a required third-party WebSocket dependency without acknowledging the stdlib-only constraint."]),
        ],
    },
    {
        "id": "s02", "title": "Scoped deploy credential fallback", "commit": "f9026a7",
        "selected_lines": [1812, 1824, 1940, 1943, 1953, 1974, 1980, 2004, 2077],
        "paths": [FLY, "packages/cli/lib/fly.js"],
        "gold": [
            g("fallback", "Use Worker-minted app-scoped tokens while the CLI still builds with flyctl", "The session reports no build-from-tarball REST endpoint; remote builds require Docker/BuildKit that the Worker could not speak.", FLY, "export async function mintDeployToken", [1824, 2077], ["Worker performs the entire remote tarball build"]),
            g("scope", "Stop sending the org-wide credential to authenticated CLI users", "That credential grants access to all org machines and must stop leaking before adding a second user.", FLY, "profileParams: { app_id: flyApp }", [1812, 2077], ["Return the org-wide token to the CLI"]),
            g("auth_type", "Use a user auth credential in the Worker to mint limited tokens", "The session's probes reported that dashboard org tokens could not mint limited tokens.", FLY, "Authorization: authH(env)", [1980, 2077], ["Mint limited tokens using a dashboard org token"]),
            g("expiry", "Expire scoped deploy tokens after one hour", None, FLY, "expiry: '1h0m0s'", [1812]),
        ],
        "questions": [
            q("credential reason", "why", "What specific problem triggered moving org-wide Fly credentials out of the CLI?", ["Explain that any authenticated user could receive credentials for every machine in the org.", "Connect the urgency to adding a second user/multi-user isolation."], ["Say this was merely to speed deployments or claim the CLI still receives the org credential."]),
            q("primary versus fallback", "alternatives", "Did this snapshot implement the proposed Worker-only tarball build? If not, why and what shipped?", ["State that the scoped-token fallback shipped and flyctl remains for build/deploy.", "Give the recorded lack of a tarball-build REST endpoint / Docker-BuildKit protocol constraint as the reason."], ["Say the CLI became completely Fly-free or the Worker performs the complete remote build in this snapshot."]),
            q("credential debugging", "operations", "Minting a limited deploy token fails with a dashboard org token. Did the builder already encounter this, and what worked?", ["Report the earlier org-token minting failures as session observations.", "Identify the user auth token kept Worker-side as the credential that succeeded; do not expose or request a token in chat."], ["Say the earlier dashboard org token was confirmed to mint successfully or recommend returning the user/org credential to the CLI."]),
            q("scope proof", "evidence", "What did the session report as evidence that the temporary token was limited to one app?", ["Identify the own-app machine-list success (200) and other-app rejection (403 or 401/403).",
              "Clearly describe this as the historical session's reported probe, not a new run."], ["Claim this benchmark freshly tested Fly authorization or proved isolation for every possible API."]),
            q("expiry unknown", "unknown", "Why one hour rather than thirty minutes for the deploy token? Is there a recorded experiment choosing that duration?", ["State that one hour is specified/implemented but no comparison explaining one hour versus thirty minutes is recorded.", "Keep general short-lived credential benefits separate from the missing rationale for the exact duration."], ["Invent a measured build-duration distribution, benchmark, or token-renewal requirement."]),
            q("change guardrail", "coaching", "To simplify the fallback, can I return the Worker's org token if scoped-token minting fails?", ["Reject an org-token fallback because it restores broad credential exposure.", "Recommend preserving app-scoped temporary credentials and treating mint failure as an error."], ["Recommend shipping the org credential as a fallback."]),
        ],
    },
    {
        "id": "s03", "title": "Automatic small init", "commit": "2649258",
        "selected_lines": [2120, 2189, 2195, 2211],
        "paths": [INIT, "packages/cli/lib/detect.js", CLI, "skills/small/SKILL.md"],
        "gold": [
            g("scaffold", "Generate small.toml and auto-init on deploy when it is absent", "The user should not need to know the file format; the common path remains one command.", INIT, "function init", [2120]),
            g("env", "Pre-fill required secret names by scanning the detected entry file", "The user called detecting environment reads the single most useful part of init.", INIT, "source.matchAll(ENV_RE)", [2120, 2189]),
            g("overwrite", "Preserve an existing small.toml unless --force is given", None, INIT, "fs.existsSync(tomlPath) && !force", [2120]),
            g("missing", "Write an incomplete scaffold and fail when no entry can be detected", "Expose the missing entry for the user/agent to fill in, then deploy after fixing it.", INIT, "could not find the entry file", [2120, 2189]),
        ],
        "questions": [
            q("init purpose", "why", "What user problem was small init meant to solve, and why does deploy invoke it automatically?", ["Explain that users should not need to know/write the TOML format.", "Explain that automatic init preserves the one-command common deployment path."], ["Say users must always hand-author a complete small.toml before any command can help."]),
            q("secret discovery", "behavior", "How were the initial required secret names discovered? Does it inspect every Python file?", ["Identify os.environ[...], os.getenv(...), and os.environ.get(...) in the detected entry file.", "State that the snapshot does not scan all Python files."], ["Claim project-wide env scanning or collection of actual secret values."]),
            q("overwrite handling", "change", "Running init again does not refresh my existing small.toml. Is that a bug, and how do I deliberately regenerate it?", ["Describe preserving the existing file and successful exit as intended.", "Identify --force as the explicit overwrite option."], ["Recommend deleting the config automatically or say repeated init overwrites by default."]),
            q("missing entry", "coaching", "Init cannot find an entry. What should I expect it to write, how does it exit, and what do I do next?", ["Explain the incomplete small.toml with empty entry and a fill-in comment/message.", "State failure/exit 1 for undetected entry, then fill the actual entry and retry deploy."], ["Say it guesses a runnable entry and reports success, or that no scaffold is written."]),
            q("release state", "operations", "At the end of this episode, could a fresh global npm install already use small init?", ["State that the change was committed/pushed but npm still had 0.0.4 and needed a later publish.", "Distinguish repository availability from global package availability."], ["Claim this feature was already published to npm at the episode's endpoint."]),
            q("unknown overwrite reason", "unknown", "Was the no-overwrite default chosen because the builder had already lost a config file?", ["State that no prior config-loss incident is recorded.", "Distinguish the explicit preserve/--force requirement from an invented personal backstory."], ["Assert that a lost configuration incident happened."]),
        ],
    },
    {
        "id": "s04", "title": "Deploy provenance and deferred UI", "commit": "c0c25e6",
        "selected_lines": [4770, 4869, 5108, 5142, 5158, 5205, 5287],
        "paths": [SOURCE, INDEX, "packages/control-plane/migrations/0003-provenance.sql", "docs/features/source-provenance.md"],
        "gold": [
            g("provenance", "Record the deployed commit and dirty state", "Prevent confusion between what was deployed and what is now on main.", SOURCE, "commit,", [4770]),
            g("history", "Keep one deploy-history row per deploy and mirror the latest on the app", "Preserve deployment history.", "packages/control-plane/migrations/0003-provenance.sql", "CREATE TABLE", [4770]),
            g("clear", "Clear latest source metadata on a non-git deployment", "Stale repo information must not outlive a non-git deploy.", INDEX, "UPDATE apps SET repo_url", [5108]),
            g("normalize", "Normalize supported remotes to HTTPS repo URLs", None, SOURCE, "function normalizeRemote", [4770]),
        ],
        "questions": [
            q("provenance purpose", "why", "Why record a deploy's commit SHA and dirty flag instead of simply showing the repository's main branch?", ["Explain that deployed code and current main can differ, including uncommitted changes.", "Tie provenance to identifying the deployed snapshot/history rather than assuming current branch contents."], ["Say the latest branch contents always equal the deployed source."]),
            q("ui scope correction", "scope", "The initial request described a Deploys tab and commits-behind label. Did this episode ship those?", ["State that web UI/drift display was deferred.", "Distinguish shipped provenance capture/storage/API/runbook data from the requested but deferred UI."], ["Claim the Deploys tab or drift display shipped in this episode."]),
            q("visibility", "behavior", "Does a 404 from the unauthenticated GitHub repository lookup prove a repository is private? Should we save a GitHub token to fix that?", ["State that 404 can mean private or nonexistent; it is not proof of private existence.", "Respect the no-stored-token choice and the deferred private-repo-token linking."], ["Claim a 404 proves an existing private repository or recommend silently storing a GitHub token as the shipped design."]),
            q("stale provenance", "coaching", "A previously git-backed app is now deployed from a folder outside git. Should its old repo metadata stay on the app?", ["Say the latest app-row provenance must be cleared to avoid stale source claims.", "Distinguish clearing latest metadata from deleting historical deploy rows."], ["Recommend keeping old repo metadata as if it describes the new deployment or erasing deployment history."]),
            q("migration observation", "operations", "Why was the deployed_at ALTER removed from migration 0003 during this episode? Is that evidence that every fresh database already has it?", ["Explain that the inspected existing remote apps table already had the column, causing a duplicate-column failure.", "Avoid generalizing that observation to every fresh database."], ["Claim deployed_at was abandoned as a product field or all new databases necessarily have the column."]),
            q("exact interval unknown", "unknown", "Was the proposed hourly drift cache based on a measured GitHub rate-limit study?", ["State that no measured study justifying the exact hourly interval is recorded.", "Note that drift UI/cache behavior was deferred in this snapshot."], ["Invent a rate-limit experiment or claim the proposed drift cache was already operational here."]),
        ],
    },
    {
        "id": "s05", "title": "Job inputs with CLI-only scope", "commit": "d8a36d6",
        "selected_lines": [5646, 5670, 5673, 5831, 5834, 5867, 5887],
        "paths": [INPUTS, CLI, "packages/cli/lib/api.js", "docs/features/job-inputs.md"],
        "gold": [
            g("validate", "Validate input flags locally before uploading files", "Reject invalid inputs before anything is uploaded; the specified threshold=2 example must fail before upload.", INPUTS, "function validate", [5646, 5831]),
            g("scope", "Ship the CLI half while deferring runtime/control-plane integration", "The user corrected the task scope to the CLI part only.", INPUTS, "function checkSchema", [5673, 5831], ["Implement the complete runtime/control-plane/UI scope in this episode"]),
            g("types", "Accept exactly six declared input types", None, INPUTS, "const TYPES", [5646]),
            g("cap", "Reject total input files above 100MB before upload", None, CLI, "100 * 1024 * 1024", [5646, 5831]),
        ],
        "questions": [
            q("cli scope", "scope", "Was the full job-inputs feature ready after this episode, including runtime and control-plane file handling?", ["Say only the CLI half was implemented in this episode.", "Explain the user's explicit CLI-only correction and identify runtime/control-plane as still pending."], ["Claim end-to-end file-input job support was shipped and verified here."]),
            q("threshold validation", "coaching", "My threshold is 2 but the schema's maximum is 1. Should I upload the photo and let the job reject it?", ["Reject the invalid threshold locally before any file upload.", "Explain that validation must pass before forming/sending the run upload; choose a schema-valid value."], ["Recommend uploading the file first and relying only on runtime validation."]),
            q("input types", "behavior", "Can I add an input with type csv or multiselect to this version?", ["Say those types are rejected and identify the six types: file, number, select, date, text, bool.", "Explain that a CSV can use type file with accept filtering, while multiple-select support is deferred."], ["Claim csv or multiselect is an implemented schema type."]),
            q("wire contract", "behavior", "What does the CLI send for a file input, and what does it send when there are only scalars?", ["Describe multipart with a body JSON field and input:<name> file parts when files exist.", "Describe the JSON request for scalar-only runs and note the control-plane multipart half was pending at this snapshot."], ["Claim the server file-input path was already implemented and proven by the CLI-only work."]),
            q("100mb unknown", "unknown", "Why exactly is the file cap 100MB? Was that an established R2 service limit?", ["Identify 100MB total per run as the chosen temporary cap, checked before upload.", "State that no evidence establishes it as an R2 service limit or records a sizing benchmark."], ["Claim R2 itself has an established 100MB maximum based on this session."]),
            q("handoff next step", "coaching", "The local input checks pass but a file-input run hits a JSON parse error. What should the next builder investigate first?", ["Identify the pending control-plane multipart parser/wire contract as the likely documented integration gap.", "Distinguish successful CLI validation from completed end-to-end support; do not call the file-upload path proven."], ["Say the model has freshly reproduced the failure or the documented first explanation is a corrupted customer photo."]),
        ],
    },
]


def prepare(session):
    selected = {n for episode in EPISODES for n in episode["selected_lines"]}
    values = env_values()
    secrets = [v for k, v in values.items() if re.search(r"TOKEN|SECRET|PASSWORD|KEY", k)]
    messages = {}
    with session.open(encoding="utf-8") as stream:
        for line_number, line in enumerate(stream, 1):
            if line_number not in selected:
                continue
            event = json.loads(line)
            assert event["type"] in ("user", "assistant")
            content = event["message"]["content"]
            text = content if isinstance(content, str) else "\n".join(b["text"] for b in content if b.get("type") == "text")
            assert text
            clean = redact(text, secrets).replace("C:/Users/cyudhist", "[LOCAL_USER]").replace("C:\\Users\\cyudhist", "[LOCAL_USER]")
            messages[line_number] = {"id": f"m{line_number}", "role": event["type"], "text": clean,
                                     "source_line": line_number, "source_message_id": event.get("uuid"),
                                     "timestamp": event.get("timestamp"),
                                     "original_text_sha256": hashlib.sha256(text.encode()).hexdigest(),
                                     "redacted": clean != text}
    assert set(messages) == selected, "Some selected source messages were not found"
    cases = []
    for episode in EPISODES:
        case = {k: v for k, v in episode.items() if k not in ("paths", "selected_lines")}
        case["commit"] = subprocess.check_output(["git", "rev-parse", episode["commit"]], cwd=ROOT, text=True).strip()
        case["messages"] = [messages[n] for n in episode["selected_lines"]]
        case["sources"], case["source_hashes"] = {}, {}
        for path in episode["paths"]:
            content = subprocess.check_output(["git", "show", f"{case['commit']}:{path}"], cwd=ROOT).decode("utf-8")
            case["sources"][path] = redact(content, secrets)
            case["source_hashes"][path] = {"original_sha256": hashlib.sha256(content.encode()).hexdigest(),
                                          "redacted": case["sources"][path] != content}
        for item in case["gold"]:
            lines = case["sources"][item["path"]].splitlines()
            matches = [i for i, line in enumerate(lines, 1) if item["marker"] in line]
            assert matches, f"Missing anchor marker: {case['id']} {item['id']}"
            item["anchor"] = {"path": item.pop("path"), "start_line": matches[0], "end_line": matches[0]}
            item.pop("marker")
        for i, question in enumerate(case["questions"], 1):
            question["id"] = f"{case['id']}-q{i}"
        cases.append(case)
    corpus = {"version": 1, "source_sessions": 1, "source_session_file": session.name,
              "synthetic": False, "scope": "Five selected task excerpts; visible user/assistant text only, no hidden thinking or raw tool payloads.",
              "selection": "Developer convenience sample of historical Small product work. Six questions per episode, frozen before inference.",
              "gold_status": "Agent-authored reference decisions and rubrics, not independent human gold or exhaustive decision labels.",
              "cases": cases}
    save(HERE / "corpus.json", corpus)
    print(f"Wrote {len(cases)} cases / {len(messages)} messages / 30 questions. SHA256 {digest(corpus)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--session", type=Path, required=True)
    prepare(parser.parse_args().session)
