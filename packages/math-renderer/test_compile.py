"""The parts of the compiler that resolve a spec, checked without manim installed."""
import math
import pytest
from compile_math import build, safe_function
from validation import validate

SPEC = {
    'op': 'generate_math_animation', 'id': 'sigmoid', 'concept': 'Sigmoid', 'purpose': 'derivation',
    'scene': {'title': 'Saturation', 'steps': [
        {'kind': 'plot', 'functions': [{'expression': '1 / (1 + exp(-x))'}], 'xRange': [-6, 6], 'hold': 3},
        {'kind': 'equation', 'expressions': ['y = x'], 'note': 'a line'},
    ]},
}


def test_a_plot_step_resolves_to_a_callable_and_keeps_its_range():
    plan = build(validate(SPEC))
    plot = plan['steps'][0]
    assert plan['title'] == 'Saturation'
    assert plot['hold'] == 3
    assert plot['xRange'] == [-6, 6]
    assert plot['functions'][0]['evaluate'](0) == pytest.approx(0.5)
    assert plot['functions'][0]['evaluate'](-6) < 0.01
    # a colour the spec did not set still has one
    assert plot['functions'][0]['color'].startswith('#')


def test_steps_that_are_not_plots_pass_their_fields_through():
    equation = build(validate(SPEC))['steps'][1]
    assert equation['expressions'] == ['y = x']
    assert equation['note'] == 'a line'
    assert equation['hold'] == 2


def test_a_function_that_leaves_its_domain_yields_no_point_rather_than_raising():
    evaluate = safe_function('sqrt(x)')
    assert evaluate(4) == 2
    assert math.isnan(evaluate(-1))
    assert math.isnan(safe_function('1 / x')(0))
    assert math.isnan(safe_function('exp(x)')(10000))


def test_a_compiled_function_cannot_reach_builtins():
    with pytest.raises(ValueError):
        safe_function('__import__("os").system("id")')
    # names that exist in Python but not in the allowlist are refused too
    with pytest.raises(ValueError):
        safe_function('len(x)')
