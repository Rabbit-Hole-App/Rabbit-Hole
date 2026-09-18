"""The schema is the security boundary: these check what it refuses."""
import pytest
from validation import validate, safe_expression, safe_tex

BASE = {'op': 'generate_math_animation', 'id': 'sigmoid-steps', 'concept': 'Sigmoid saturation', 'purpose': 'derivation'}


def spec(*steps):
    return {**BASE, 'scene': {'steps': list(steps)}}


def test_a_derivation_a_plot_shapes_and_a_matrix_all_pass():
    animation = validate(spec(
        {'kind': 'equation', 'expressions': [r'\sigma(x) = \frac{1}{1 + e^{-x}}', r"\sigma'(x) = \sigma(x)(1 - \sigma(x))"], 'highlight': [r'\sigma(x)'], 'note': 'The derivative follows from the quotient rule'},
        {'kind': 'plot', 'functions': [{'expression': '1 / (1 + exp(-x))', 'label': r'\sigma(x)', 'color': '#2383e2'}], 'xRange': [-6, 6, 1], 'yRange': [0, 1, 0.25], 'marker': {'from': -6, 'to': 6, 'tangent': True}},
        {'kind': 'shapes', 'objects': [{'id': 'a', 'type': 'arrow', 'at': [0, 0], 'to': [2, 1]}, {'id': 'tag', 'type': 'label', 'at': [2, 1], 'text': 'gradient'}], 'moves': [{'target': 'a', 'to': [1, 1], 'scale': 1.5}]},
        {'kind': 'matrix', 'rows': [['1', '0'], ['0', '1']], 'emphasise': {'row': 1}},
    ))
    assert animation['quality'] == 'low'
    assert len(animation['scene']['steps']) == 4


@pytest.mark.parametrize('fragment', [
    r'\input{/etc/passwd}',
    r'\write18{rm -rf /}',
    r'\immediate\openout1=x',
    r'\def\x{1}',
    r'\csname relax\endcsname',
    r'\usepackage{tikz}',
    r'x $ 1 $',
    r'50% of x',
])
def test_latex_that_reaches_outside_maths_is_refused(fragment):
    with pytest.raises(ValueError):
        safe_tex(fragment, 'expression')


@pytest.mark.parametrize('expression', [
    '__import__("os").system("id")',
    'open("/etc/passwd").read()',
    'x.__class__',
    '[i for i in range(10)]',
    'lambda: 1',
    'eval("1")',
    'x if x else 0',
    'globals()',
])
def test_plot_expressions_that_are_programs_are_refused(expression):
    with pytest.raises(ValueError):
        safe_expression(expression, 'expression')


def test_plot_expressions_that_are_arithmetic_pass():
    for expression in ['1 / (1 + exp(-x))', 'sin(x) * x**2', 'sqrt(abs(x)) + pi', '-x / 2']:
        assert safe_expression(expression, 'expression') == expression


def test_a_step_cannot_carry_another_step_kind_fields():
    with pytest.raises(ValueError, match='do not belong'):
        validate(spec({'kind': 'equation', 'expressions': ['x'], 'functions': [{'expression': 'x'}]}))


def test_every_step_needs_its_own_content():
    with pytest.raises(ValueError, match='needs expressions'):
        validate(spec({'kind': 'equation', 'note': 'nothing here'}))


def test_ranges_markers_and_references_are_checked():
    with pytest.raises(ValueError, match='must increase'):
        validate(spec({'kind': 'plot', 'functions': [{'expression': 'x'}], 'xRange': [5, -5]}))
    with pytest.raises(ValueError, match='leaves the plotted range'):
        validate(spec({'kind': 'plot', 'functions': [{'expression': 'x'}], 'xRange': [0, 1], 'marker': {'from': 0, 'to': 9}}))
    with pytest.raises(ValueError, match='no object with that id'):
        validate(spec({'kind': 'shapes', 'objects': [{'id': 'a', 'type': 'dot', 'at': [0, 0]}], 'moves': [{'target': 'b', 'to': [1, 1]}]}))
    with pytest.raises(ValueError, match='same number of entries'):
        validate(spec({'kind': 'matrix', 'rows': [['1', '2'], ['3']]}))
    with pytest.raises(ValueError, match='no such row'):
        validate(spec({'kind': 'matrix', 'rows': [['1']], 'emphasise': {'row': 3}}))


def test_a_runaway_animation_is_refused():
    with pytest.raises(ValueError, match='the limit is 45s'):
        validate(spec(*[{'kind': 'equation', 'expressions': ['x'], 'hold': 6} for _ in range(8)]))


def test_unknown_fields_and_operations_are_refused():
    with pytest.raises(ValueError):
        validate({**BASE, 'op': 'run_python', 'scene': {'steps': [{'kind': 'equation', 'expressions': ['x']}]}})
    with pytest.raises(ValueError):
        validate({**BASE, 'scene': {'steps': [{'kind': 'equation', 'expressions': ['x']}], 'script': 'print(1)'}})
