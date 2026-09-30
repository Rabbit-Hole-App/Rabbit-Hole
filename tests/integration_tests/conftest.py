"""P0-B Phase 2B (docs/features/rabbit-hole-dev.md): every integration test deploys a real app
through the control plane to Fly. Production small-cp has no test bypass (P0-A), and the
Rabbit Hole dev control plane deliberately has no Fly deploy capability yet, so the suite is
skipped rather than pointed back at production. Remove this hook when isolated Fly dev
resources exist; the tests already target RABBIT_HOLE_DEV_CP."""

import pytest

REASON = "needs Fly deploys on the Rabbit Hole dev control plane (not enabled in P0-B Phase 2B)"


def pytest_collection_modifyitems(items):
    for item in items:
        item.add_marker(pytest.mark.skip(reason=REASON))
