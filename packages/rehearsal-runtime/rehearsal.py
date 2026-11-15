"""One rehearsal job, end to end: provision -> clone -> discover -> install + steps (+ repair) -> knobs -> traps -> artifacts -> terminate -> plan -> record.
The server and run_job.py both call run_rehearsal(), so there is one code path."""
import time
from dataclasses import dataclass
from typing import Optional

import billing
import limits
import record as rec
from agent import RepairAgent, readme_install_section
from discover import DiscoveryFailed, discover
from model import DEFAULT_MODEL, Model, ModelCaller
from runner import REPO, JobFailed, RestartSandbox, Runner, clone, collect_files, environment


@dataclass
class Outcome:
    status: str                      # 'ready' | 'failed'
    error: Optional[str] = None
    record: Optional[dict] = None    # present whenever the route ran, even if the job gave up (partial evidence)
    zip: Optional[bytes] = None
    spend: Optional[dict] = None     # billing snapshots {'before', 'after'}


def _reader(provider):
    cache = {}

    def read(path: str):
        if path not in cache:
            try:
                cache[path] = provider.fetch(path)[:200_000].decode('utf-8', 'replace')
            except FileNotFoundError:
                cache[path] = None
        return cache[path]
    return read


def run_rehearsal(job: dict, provider, model_impl: Model, status=lambda *a, **k: None, escalation_model: str = '', billing_fn=billing.snapshot) -> Outcome:
    job = dict(job)
    tags = {'job': job['key'], 'repo': job['repo'], 'commit': job['commit'], 'hardware': job['hardware']}
    before = billing_fn(job['key'])  # once, before any sandbox exists, so a stale hour bucket cannot mislead the delta
    t0 = time.time()
    started = rec.utc_iso(t0)
    caller = ModelCaller(model_impl, limits.Budget())
    runner = route = env = model_used = err = None
    copied, listed, knobs, traps, sb_started = {}, [], [], [], False
    t_created = t_stopped = None
    terminated, left = False, []
    try:
        status('provisioning')
        provider.start(tags)
        sb_started, t_created = True, time.time()
        deadline = t_created + limits.JOB_WALL_SEC - 60
        clone(provider, job['repo'], job['commit'])
        read = _reader(provider)
        if not job['files']:  # run_job.py may leave these empty: read them from the clone
            job['files'] = provider.exec('git ls-files', 120, cwd=REPO).stdout.splitlines()
        if not job['readme'].strip():
            job['readme'] = read('README.md') or ''
        status('discovering')
        route, model_used = discover(job, caller, read, escalation_model)
        runner = Runner(provider, route, caller.budget, RepairAgent(caller, readme_install_section(job['readme'])), status, deadline, domains=list(limits.OUTBOUND_DOMAIN_ALLOWLIST))
        while True:
            try:
                ok = runner.run_route()
                break
            except RestartSandbox as r:  # allow_domain fix: new sandbox with the domain added, route restarts from a fresh clone
                if not provider.stop():
                    raise JobFailed('sandbox_not_terminated', 'could not terminate the sandbox before re-creating it')
                provider.extra_domains.append(r.domain)
                status('provisioning')
                provider.start(tags)
                clone(provider, job['repo'], job['commit'])
                runner.reset_for_restart()
        if ok:
            knobs, traps = runner.verify_knobs(), runner.run_traps()
        env = environment(provider)
        copied, listed = collect_files(provider, runner.steps)
    except (JobFailed, DiscoveryFailed) as e:
        err = e
    except Exception as e:  # noqa: BLE001 - every failure must still terminate the sandbox and say why
        err = JobFailed('internal_error', f'{type(e).__name__}: {e}')
    finally:
        if sb_started:
            terminated = provider.stop()
            t_stopped = time.time()
            try:
                left = provider.leftover(tags)
            except Exception:  # noqa: BLE001
                left = ['unknown']
    if sb_started and (not terminated or left) and err is None:
        err = JobFailed('sandbox_left', f'sandbox not confirmed terminated (terminated={terminated}, left={left})')

    plan = None
    if runner and route and err is None and runner.gave_up is None:
        status('planning')
        plan = rec.make_plan(caller, job, rec.plan_summary(route, runner.steps, runner.fixes, traps, knobs))

    after = billing_fn(job['key'])
    lifetime = (t_stopped - t_created) if t_created and t_stopped else 0.0
    out = Outcome('failed', None, spend={'before': before, 'after': after})
    if err is not None:
        out.error = f'{err.code}: {err.detail}' if hasattr(err, 'code') else str(err)
    elif runner and runner.gave_up:
        out.error = f"gave up at step {runner.gave_up['step']}: {runner.gave_up['reason']}"
    if not (runner and route):
        return out  # nothing ran past discovery: no record

    gave_up = runner.gave_up or ({'step': '-', 'reason': out.error} if err is not None else None)
    finished = time.time()
    record = {
        'version': 'rehearsal-1', 'repo': job['repo'], 'commit': job['commit'], 'hardware': job['hardware'], 'provider': 'modal',
        'sandboxId': provider.sandbox_id or 'none', 'terminated': terminated, 'sandboxesLeftAfter': len(left),
        'image': provider.image, 'model': model_used or DEFAULT_MODEL, 'startedUtc': started, 'finishedUtc': rec.utc_iso(finished),
        'wallSec': round(max(0.0, finished - t0 - provider.image_build_sec), 1),
        **({'imageBuildSec': provider.image_build_sec} if provider.image_build_sec else {}),
        'environment': env or {'python': '', 'cpu': 1, 'memGiB': 0, 'packagesAfter': {}},
        'route': route, 'attempts': runner.attempts, 'fixes': runner.fixes, 'steps': runner.steps, 'traps': traps, 'knobsVerified': knobs,
        'allChecksPassed': gave_up is None and len(runner.steps) == len(route['steps']),
        'modelCalls': caller.calls, 'modelSpendUsd': caller.spend, 'sandboxSpendNote': billing.spend_note(before, after, job['key'], lifetime),
        'draftPlan': plan, 'gaveUp': gave_up,
    }
    problems = rec.validate_record(record)
    out.record = record
    out.zip = rec.build_zip(record, runner.logs, copied, listed)
    if problems and out.error is None:
        out.error = 'record_invalid: ' + '; '.join(problems[:3])
    if out.error is None:
        out.status = 'ready'
    return out
