"""Use the installed Claude Code login; never extract OAuth tokens or call its API."""

import json
import os
import re
import shutil
import subprocess
import threading
import time
from datetime import datetime, timezone

if __package__:
    from . import bench as b
else:
    import bench as b


def subscription_env(source, limit):
    # API-key and third-party-provider overrides must not supersede the user's plan.
    env = {k: v for k, v in source.items() if not k.startswith("ANTHROPIC_")
           and k not in ("CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY")}
    env.update(CLAUDE_CODE_MAX_OUTPUT_TOKENS=str(limit), CLAUDE_CODE_MAX_RETRIES="0",
               CLAUDE_CODE_MAX_TURNS="2", MAX_STRUCTURED_OUTPUT_RETRIES="1")
    return env


def require_subscription(status):
    if not (status.get("loggedIn") is True and status.get("authMethod") == "claude.ai"
            and status.get("subscriptionType") in ("pro", "max", "team", "enterprise")):
        raise ValueError("Claude Code must be signed into your subscription; no API-key fallback is allowed")


class SubscriptionProvider:
    def __init__(self, run_dir, budget=None, workspace=None):
        self.run_dir = run_dir
        self.cli = shutil.which("claude")
        if not self.cli:
            raise ValueError("Claude Code is not installed")
        self.cwd = b.ROOT / ".small/coaching-benchmark"
        self.cwd.mkdir(parents=True, exist_ok=True)
        self.env = subscription_env(os.environ, 12000)
        status = subprocess.run([self.cli, "--safe-mode", "auth", "status", "--json"],
                                cwd=self.cwd, env=self.env, capture_output=True, text=True,
                                encoding="utf-8", timeout=30, check=True)
        auth = json.loads(status.stdout)
        require_subscription(auth)
        self.auth = {k: auth.get(k) for k in ("loggedIn", "authMethod", "apiProvider", "subscriptionType")}
        values = b.env_values()
        self.secrets = [v for k, v in values.items() if re.search(r"TOKEN|SECRET|PASSWORD|KEY", k)]
        # Two inference processes at once, with all agent tools disabled.
        self.slots = threading.Semaphore(2)

    def call(self, name, system, payload, limit):
        schema = b.judge_schema("judge-capture-" in name) if "judge-" in name else None
        request = {"transport": "claude-code-subscription", "model": b.MODEL, "system": system,
                   "payload": payload, "max_output_tokens": limit, "effort": "high", "expected_schema": schema,
                   "output_mode": "prompt-json"}
        if b.redact(b.encode(request), self.secrets) != b.encode(request):
            raise ValueError(f"{name}: outbound redaction match")
        fingerprint = b.digest(request)
        path = self.run_dir / "calls" / f"{name}.json"
        if path.exists():
            saved = json.loads(path.read_text(encoding="utf-8"))
            if saved["request_hash"] != fingerprint:
                raise ValueError("Subscription request changed; use a new run directory")
            return saved
        args = [self.cli, "--safe-mode", "-p", "--model", b.MODEL, "--effort", "high",
                "--tools", "", "--no-session-persistence", "--output-format", "json",
                "--system-prompt", system]
        # --json-schema uses Claude Code's StructuredOutput tool flow. This harness
        # disables tools and requests one ordinary JSON answer through the prompt.
        result = {"transport": "claude-code-subscription", "authentication": self.auth,
                  "request": request, "request_hash": fingerprint,
                  "started_at": datetime.now(timezone.utc).isoformat(),
                  "estimated_cost_usd": 0, "billing_note": "Uses subscription allowance; CLI cost is API-equivalent usage, not an invoice."}
        with self.slots:
            start = time.monotonic()
            try:
                run = subprocess.run(args, input=b.encode(payload), cwd=self.cwd,
                                     env=subscription_env(self.env, limit), text=True, encoding="utf-8",
                                     capture_output=True, timeout=240)
                cli = json.loads(run.stdout)
                result["cli_result"] = cli
                result["api_equivalent_cost_usd"] = cli.get("total_cost_usd")
                result["process_returncode"] = run.returncode
                if run.returncode or cli.get("is_error"):
                    result["error"] = "ClaudeCodeError"
                content = cli.get("structured_output")
                text = b.encode(content) if isinstance(content, dict) else cli.get("result", "")
                models = list(cli.get("modelUsage", {}))
                result["response"] = {"model": models[0] if len(models) == 1 else b.MODEL,
                                      "model_ids": models, "stop_reason": "end_turn" if not result.get("error") else "error",
                                      "content": [{"type": "text", "text": text}], "usage": cli.get("usage", {})}
            except (subprocess.TimeoutExpired, ValueError) as exc:
                result["error"] = type(exc).__name__
                result["usage_unknown"] = True
            result["duration_s"] = round(time.monotonic() - start, 3)
        b.save(path, result)
        print(f"{name}: {'complete' if b.parsed(result) else 'FAILED'} via subscription ({result['duration_s']}s)", flush=True)
        return result


def grading_complete(response, payload, capture):
    value = b.parsed(response)
    grades = value.get("grades") if value else None
    key, items = ("id", payload["predictions"]) if capture else ("label", payload["answers"])
    expected = [item[key] for item in items]
    if not isinstance(grades, list) or len(grades) != len(expected):
        return False
    if any(not isinstance(g, dict) or not isinstance(g.get(key), str) for g in grades):
        return False
    if sorted(g[key] for g in grades) != sorted(expected):
        return False
    for grade in grades:
        if capture:
            if any(type(grade.get(k)) is not bool for k in ("valid_choice", "reason_supported")):
                return False
            if type(grade.get("reason_fidelity")) is not int or not 0 <= grade["reason_fidelity"] <= 3:
                return False
            if type(grade.get("alternatives_recovered")) is not int or grade["alternatives_recovered"] < 0:
                return False
            if grade.get("gold_id") not in [None] + [r["id"] for r in payload["references"]]:
                return False
        else:
            for field in ("required", "forbidden"):
                flags = grade.get(field)
                if not isinstance(flags, list) or len(flags) != len(payload["question"][field]):
                    return False
                if any(type(flag) is not bool for flag in flags):
                    return False
            claims = grade.get("unsupported_claims")
            if not isinstance(claims, list) or any(not isinstance(s, str) or not s.strip() for s in claims):
                return False
            if type(grade.get("citation_support")) is not bool:
                return False
    return True


def finish_grading(run_dir):
    """Explicitly complete missing/malformed grades; original responses remain intact."""
    provider = SubscriptionProvider(run_dir)
    mapping_path = run_dir / "grade-selections.json"
    mapping = json.loads(mapping_path.read_text(encoding="utf-8")) if mapping_path.exists() else {}
    tasks = []
    for path in sorted((run_dir / "calls").glob("judge-*.json")):
        if "-subscription-" in path.stem:
            continue
        original = json.loads(path.read_text(encoding="utf-8"))
        request = original["request"]
        payload = request["payload"] if "payload" in request else json.loads(request["messages"][0]["content"])
        capture = path.stem.startswith("judge-capture-")
        selected = b.call_result(run_dir, path.stem)
        if not grading_complete(selected, payload, capture):
            attempts = sorted((run_dir / "calls").glob(path.stem + "-subscription-*.json"))
            successful = [p for p in attempts if grading_complete(json.loads(p.read_text(encoding="utf-8")), payload, capture)]
            if successful:
                mapping[path.stem] = successful[-1].stem
            else:
                tasks.append((path.stem, request, payload, len(attempts) + 1))
    def one(task):
        name, request, payload, attempt = task
        new_name = name + f"-subscription-{attempt}"
        response = provider.call(new_name, request["system"], payload, 12000)
        if not grading_complete(response, payload, name.startswith("judge-capture-")):
            raise ValueError(f"Subscription grading incomplete: {new_name}")
        return name, new_name
    print(f"Completing {len(tasks)} incomplete graders through the subscription", flush=True)
    for original, selected in b.parallel(tasks, one):
        mapping[original] = selected
    b.save(mapping_path, mapping)
    b.save(run_dir / "subscription-switch.json", {
        "reason": "User requested using their subscription after the original API run had completed.",
        "auth": provider.auth, "answer_regenerations": 0,
        "original_api_calls_preserved": True, "replacement_grades": mapping,
        "grading_change": "Same original evidence/rubric/answers, Claude Code subscription transport; grading output cap raised from 6000 to 12000 after truncation.",
    })
