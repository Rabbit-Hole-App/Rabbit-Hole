"""Measured Modal spend, read in code (nobody reads the usage page). Called once before the sandbox exists and once after it is terminated; never fails a job.
SDK: modal.billing.workspace_billing_report(*, start, end=None, resolution='d', tag_names=None, client=None) -> list of dicts
     {object_id, description, environment_name, interval_start, cost (Decimal), tags}. Deprecated in modal 1.6.4 in favour of Workspace.from_context().billing.report(...), same arguments."""
from datetime import datetime, timezone
from decimal import Decimal

APP_NAME = 'rabbit-hole-rehearsal'


def _utc():
    return datetime.now(timezone.utc)


def snapshot(job_key: str) -> dict:
    """{'ok': True, 'job': usd for items tagged job=<key>, 'app': usd for this app, 'items': n, 'at': iso} or {'ok': False, 'error': class name, 'at': iso}."""
    at = _utc()
    try:
        import modal.billing
        items = modal.billing.workspace_billing_report(start=at.replace(hour=0, minute=0, second=0, microsecond=0), resolution='h', tag_names=['job'])
        tags = lambda i: i.get('tags') or {}
        job = sum((Decimal(i['cost']) for i in items if tags(i).get('job') == job_key), Decimal(0))
        app = sum((Decimal(i['cost']) for i in items if APP_NAME in (i.get('description') or '') or 'job' in tags(i)), Decimal(0))
        return {'ok': True, 'job': float(job), 'app': float(app), 'items': len(items), 'at': at.strftime('%Y-%m-%dT%H:%M:%SZ')}
    except Exception as e:  # programmatic billing reports may be Team/Enterprise only; do not retry, do not fail the job
        return {'ok': False, 'error': type(e).__name__, 'at': at.strftime('%Y-%m-%dT%H:%M:%SZ')}


def spend_note(before: dict, after: dict, job_key: str, lifetime_sec: float) -> str:
    """The record's sandboxSpendNote. A measurement and an estimate never share a field, and a lagging report is neither: a report with no job cost yet says 'not yet visible' and carries no number."""
    if after.get('ok'):
        base = before.get('job', 0.0) if before.get('ok') else 0.0
        delta = after['job'] - base
        if after['items'] == 0 or delta <= 0:
            return f"not yet visible (billing report returned {after['items']} items at {after['at']}; job cost not in an hourly bucket yet)"
        app_base = before.get('app', 0.0) if before.get('ok') else 0.0
        return f"measured {delta:.4f} USD for job {job_key} at {after['at']} (app delta {after['app'] - app_base:.4f} USD, {after['items']} report items)"
    return (f"billing report refused: {after.get('error')}; estimate = lifetime x requested resources (cpu 2, memory 4 GiB) at the pricing page rates, "
            f"labelled estimate; lifetime {lifetime_sec:.0f} s")
