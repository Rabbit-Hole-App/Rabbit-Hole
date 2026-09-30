"""P0-B Phase 2B (docs/features/rabbit-hole-dev.md): every integration test deploys a real app
through the control plane to Fly. Production small-cp has no test bypass (P0-A), and the
Rabbit Hole dev control plane deliberately has no Fly deploy capability yet, so the suite is
skipped rather than pointed back at production.

The HTTP calls already target RABBIT_HOLE_DEV_CP, but the `small deploy` subprocesses still take
their target from SMALL_API, then ~/.small/config.json, then the production default
(packages/cli/lib/api.js). Before removing this hook, pass SMALL_API=API (and a dev CLI token)
to every CLI subprocess, or they deploy to production."""

import pytest

REASON = "needs Fly deploys on the Rabbit Hole dev control plane (not enabled in P0-B Phase 2B)"


def pytest_collection_modifyitems(items):
    for item in items:
        item.add_marker(pytest.mark.skip(reason=REASON))
