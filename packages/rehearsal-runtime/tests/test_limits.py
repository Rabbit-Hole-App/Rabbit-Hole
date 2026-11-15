import pytest
import limits


def test_values_match_the_spec():
    assert limits.JOB_WALL_SEC == 35 * 60 and limits.STEP_TIMEOUT_CAP_SEC == 25 * 60
    assert limits.SANDBOX_IDLE_TIMEOUT_SEC == 10 * 60 < limits.JOB_WALL_SEC
    assert (limits.SANDBOX_CPU, limits.SANDBOX_MEMORY_MIB) == (2, 4096)
    assert (limits.MAX_FIX_CYCLES, limits.MAX_FIX_CYCLES_PER_STEP, limits.MAX_MODEL_CALLS, limits.MODEL_SPEND_CAP_USD, limits.MAX_QUEUE) == (6, 3, 12, 3.0, 4)


def test_step_timeout_is_clamped():
    assert limits.step_timeout(600) == 600
    assert limits.step_timeout(99999) == 1500
    assert limits.step_timeout(0) == 1


def test_per_step_fix_bound_is_three():
    b = limits.Budget()
    for _ in range(3):
        b.start_fix('train')
    assert not b.can_fix('train') and b.can_fix('sample')
    with pytest.raises(RuntimeError):
        b.start_fix('train')


def test_job_fix_bound_is_six():
    b = limits.Budget()
    for i in range(6):
        b.start_fix(f's{i // 2}')
    assert not b.can_fix('new_step')


def test_model_bounds_are_calls_and_dollars():
    b = limits.Budget()
    for _ in range(12):
        assert b.can_call_model()
        b.charge_model(0.01)
    assert not b.can_call_model()
    c = limits.Budget()
    c.charge_model(3.0)
    assert not c.can_call_model()
