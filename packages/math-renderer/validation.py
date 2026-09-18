"""Validate the declarative math-animation schema; no executable inputs.

Two strings in this schema reach an interpreter, so both are allowlisted here
and again before use:

* LaTeX fragments are rendered by TeX, which can read and write files through
  \\input, \\write and friends. Only an explicit set of maths commands passes.
* Plot expressions are evaluated per sample. They are parsed as an expression
  tree and every node kind, name and call is checked, so nothing but arithmetic
  over x and a fixed set of maths functions survives.
"""
import ast
import json
import math
import re
from pathlib import Path

SCHEMA = json.loads(Path(__file__).with_name('math-schema.json').read_text())

# Maths only: no file access, no macro definition, no package loading, no
# shell escape. Anything outside this set is rejected rather than escaped.
TEX_COMMANDS = {
    'frac', 'dfrac', 'tfrac', 'sqrt', 'sum', 'prod', 'int', 'lim', 'log', 'ln', 'exp',
    'sin', 'cos', 'tan', 'sinh', 'cosh', 'tanh', 'min', 'max', 'arg', 'det',
    'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta',
    'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'phi',
    'varphi', 'chi', 'psi', 'omega', 'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi',
    'Sigma', 'Phi', 'Psi', 'Omega',
    'cdot', 'cdots', 'ldots', 'dots', 'times', 'div', 'pm', 'mp', 'ast', 'star',
    'leq', 'geq', 'neq', 'approx', 'equiv', 'sim', 'simeq', 'propto', 'in', 'notin',
    'subset', 'supset', 'cup', 'cap', 'to', 'mapsto', 'rightarrow', 'leftarrow',
    'Rightarrow', 'Leftarrow', 'leftrightarrow', 'infty', 'partial', 'nabla',
    'hat', 'bar', 'vec', 'tilde', 'dot', 'ddot', 'overline', 'underline',
    'text', 'mathrm', 'mathbf', 'mathbb', 'mathcal', 'operatorname',
    'left', 'right', 'big', 'Big', 'bigg', 'Bigg', 'quad', 'qquad', 'space',
    'begin', 'end', 'matrix', 'pmatrix', 'bmatrix', 'cases', 'aligned',
}
TEX_CHARACTERS = re.compile(r"^[A-Za-z0-9\s+\-*/=<>()\[\]{}|,.!'^_:;~\\&]*$")
TEX_COMMAND = re.compile(r'\\([A-Za-z]+)')

# Arithmetic over the plot variable and a fixed maths library.
EXPRESSION_NAMES = {'x', 'pi', 'e', 'tau'}
EXPRESSION_CALLS = {'sin', 'cos', 'tan', 'sinh', 'cosh', 'tanh', 'exp', 'log', 'log2', 'log10',
                    'sqrt', 'abs', 'floor', 'ceil', 'atan', 'asin', 'acos', 'pow', 'erf'}
EXPRESSION_NODES = (ast.Expression, ast.BinOp, ast.UnaryOp, ast.Constant, ast.Name, ast.Call,
                    ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Pow, ast.Mod, ast.USub, ast.UAdd, ast.Load)


def safe_tex(value, path):
    """A LaTeX fragment that cannot reach the filesystem or redefine TeX."""
    if not TEX_CHARACTERS.fullmatch(value):
        raise ValueError(f'{path}: unsupported characters in a maths expression')
    if '$' in value or '%' in value or '#' in value or '``' in value:
        raise ValueError(f'{path}: unsupported characters in a maths expression')
    for command in TEX_COMMAND.findall(value):
        if command not in TEX_COMMANDS:
            raise ValueError(f'{path}: unsupported LaTeX command \\{command}')
    if re.search(r'\\\\[^A-Za-z]', value) and '\\\\' not in value:
        raise ValueError(f'{path}: unsupported escape')
    return value


def safe_expression(value, path):
    """A plot expression parsed as arithmetic, never executed as a program."""
    try:
        tree = ast.parse(value, mode='eval')
    except SyntaxError as error:
        raise ValueError(f'{path}: not a valid expression') from error
    for node in ast.walk(tree):
        if not isinstance(node, EXPRESSION_NODES):
            raise ValueError(f'{path}: unsupported expression element {type(node).__name__}')
        if isinstance(node, ast.Name) and node.id not in EXPRESSION_NAMES | EXPRESSION_CALLS:
            raise ValueError(f'{path}: unknown name {node.id}')
        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name) or node.func.id not in EXPRESSION_CALLS:
                raise ValueError(f'{path}: unsupported function call')
            if node.keywords:
                raise ValueError(f'{path}: unsupported keyword argument')
        if isinstance(node, ast.Constant) and not isinstance(node.value, (int, float)):
            raise ValueError(f'{path}: only numbers are allowed')
    return value


def check(value, schema, path='animation'):
    kind = schema.get('type')
    valid = {'object': isinstance(value, dict), 'array': isinstance(value, list),
             'string': isinstance(value, str), 'boolean': isinstance(value, bool),
             'number': isinstance(value, (int, float)) and not isinstance(value, bool)}
    if not valid.get(kind, False):
        raise ValueError(f'{path}: expected {kind}')
    if 'enum' in schema and value not in schema['enum']:
        raise ValueError(f'{path}: unsupported value')
    if kind == 'object':
        if set(value) - set(schema['properties']) or any(k not in value for k in schema.get('required', [])):
            raise ValueError(f'{path}: unexpected or missing fields')
        for key, item in value.items():
            check(item, schema['properties'][key], f'{path}.{key}')
    elif kind == 'array':
        if not schema.get('minItems', 0) <= len(value) <= schema.get('maxItems', 100):
            raise ValueError(f'{path}: invalid item count')
        for item in value:
            check(item, schema['items'], path)
    elif kind == 'string':
        if not schema.get('minLength', 0) <= len(value.strip()) <= schema.get('maxLength', 1000):
            raise ValueError(f'{path}: invalid length')
        if 'pattern' in schema and not re.fullmatch(schema['pattern'], value):
            raise ValueError(f'{path}: invalid format')
    elif kind == 'number':
        if not math.isfinite(value) or not schema.get('minimum', -math.inf) <= value <= schema.get('maximum', math.inf):
            raise ValueError(f'{path}: out of range')


# Each step kind uses only its own fields, so a spec cannot smuggle a plot
# into an equation step and reach code the validator never looked at.
STEP_FIELDS = {
    'equation': {'expressions', 'highlight'},
    'plot': {'functions', 'xRange', 'yRange', 'marker'},
    'shapes': {'objects', 'moves'},
    'matrix': {'rows', 'emphasise', 'grid'},
}
STEP_REQUIRED = {'equation': 'expressions', 'plot': 'functions', 'shapes': 'objects', 'matrix': 'rows'}
COMMON = {'kind', 'note', 'hold'}
# Eight steps holding six seconds each is 48s, so this cap binds: manim
# renders on one shared CPU and a long scene is a slow scene.
MAX_SECONDS = 45


def validate(data):
    check(data, SCHEMA)
    steps = data['scene']['steps']
    total = 0.0
    for index, step in enumerate(steps):
        path = f'scene.steps[{index}]'
        kind = step['kind']
        if set(step) - COMMON - STEP_FIELDS[kind]:
            raise ValueError(f'{path}: fields that do not belong to a {kind} step')
        if STEP_REQUIRED[kind] not in step:
            raise ValueError(f'{path}: a {kind} step needs {STEP_REQUIRED[kind]}')
        total += step.get('hold', 2)
        if step.get('note'):
            safe_tex(step['note'], f'{path}.note')

        if kind == 'equation':
            for spot, expression in enumerate(step['expressions']):
                safe_tex(expression, f'{path}.expressions[{spot}]')
            for spot, fragment in enumerate(step.get('highlight', [])):
                safe_tex(fragment, f'{path}.highlight[{spot}]')

        elif kind == 'plot':
            for spot, function in enumerate(step['functions']):
                safe_expression(function['expression'], f'{path}.functions[{spot}].expression')
                if function.get('label'):
                    safe_tex(function['label'], f'{path}.functions[{spot}].label')
            for axis in ('xRange', 'yRange'):
                span = step.get(axis)
                if span and span[0] >= span[1]:
                    raise ValueError(f'{path}.{axis}: the range must increase')
                if span and len(span) == 3 and not 0 < span[2] <= (span[1] - span[0]):
                    raise ValueError(f'{path}.{axis}: invalid step')
            marker = step.get('marker')
            span = step.get('xRange', [-5, 5])
            if marker and not (span[0] <= marker['from'] <= span[1] and span[0] <= marker['to'] <= span[1]):
                raise ValueError(f'{path}.marker: the marker leaves the plotted range')

        elif kind == 'shapes':
            ids = [item['id'] for item in step['objects']]
            if len(set(ids)) != len(ids):
                raise ValueError(f'{path}.objects: duplicate ids')
            for spot, item in enumerate(step['objects']):
                where = f'{path}.objects[{spot}]'
                if item['type'] in ('arrow', 'line') and not item.get('to'):
                    raise ValueError(f'{where}: a {item["type"]} needs an end point')
                if item['type'] in ('label', 'brace') and not item.get('text'):
                    raise ValueError(f'{where}: a {item["type"]} needs text')
                if item.get('text'):
                    safe_tex(item['text'], f'{where}.text')
            for spot, move in enumerate(step.get('moves', [])):
                if move['target'] not in ids:
                    raise ValueError(f'{path}.moves[{spot}].target: no object with that id in this step')

        else:
            widths = {len(row) for row in step['rows']}
            if len(widths) != 1:
                raise ValueError(f'{path}.rows: every row needs the same number of entries')
            for row_index, row in enumerate(step['rows']):
                for column, entry in enumerate(row):
                    safe_tex(entry, f'{path}.rows[{row_index}][{column}]')
            spot = step.get('emphasise', {})
            if 'row' in spot and spot['row'] >= len(step['rows']):
                raise ValueError(f'{path}.emphasise.row: no such row')
            if 'column' in spot and spot['column'] >= widths.pop():
                raise ValueError(f'{path}.emphasise.column: no such column')

    if total > MAX_SECONDS:
        raise ValueError(f'The animation runs {total:.0f}s; the limit is {MAX_SECONDS}s')
    return {**data, 'quality': data.get('quality', 'low')}
