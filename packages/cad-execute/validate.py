"""Trusted artifact inspection. Run in a fresh sandbox with no generated source/cache."""
import json
import math
import sys
from pathlib import Path


def evaluate(facts, checks):
    results = []
    for check in checks:
        kind = check.get('kind')
        actual = None
        if kind == 'bounds_mm' and check.get('axis') in ('x', 'y', 'z'):
            actual = facts['bounds_mm'][check['axis']]
        elif kind == 'solid_count':
            actual = facts['solid_count']
        elif kind == 'volume_mm3':
            actual = facts['volume_mm3']
        elif kind == 'circular_diameter_mm':
            target = check.get('value')
            if isinstance(target, (int, float)) and facts['circular_diameters_mm']:
                actual = min(facts['circular_diameters_mm'], key=lambda n: abs(n - target))
        expected = check.get('value')
        tolerance = check.get('tolerance', 0.001)
        numeric = lambda v: isinstance(v, (float, int)) and not isinstance(v, bool) and math.isfinite(v)
        if actual is None or not numeric(expected) or not numeric(tolerance) or tolerance < 0:
            results.append({'id': str(check.get('id', kind))[:100], 'status': 'unchecked', 'passed': False, 'reason': 'Unsupported or underspecified geometric requirement'})
        else:
            results.append({'id': str(check.get('id', kind))[:100], 'status': 'passed' if abs(actual - expected) <= tolerance else 'failed', 'passed': abs(actual - expected) <= tolerance, 'actual': actual, 'expected': expected, 'tolerance': tolerance})
    return results


def inspect(path, requirements):
    from cadgen import read_step
    shape = read_step(str(path))
    solids = list(shape.solids())
    size = shape.bounding_box().size
    volumes = [s.volume for s in solids]
    bounds = dict(zip(('x', 'y', 'z'), (size.X, size.Y, size.Z)))
    baseline = bool(solids) and shape.is_valid and all(math.isfinite(v) and v > 0 for v in volumes + list(bounds.values()))
    diameters = []
    for edge in shape.edges():
        try:
            radius = edge.radius
            if math.isfinite(radius) and radius > 0:
                diameters.append(radius * 2)
        except (ValueError, AttributeError):
            pass
    facts = {'bounds_mm': bounds, 'solid_count': len(solids), 'volume_mm3': sum(volumes), 'circular_diameters_mm': sorted(set(diameters))}
    checks = evaluate(facts, requirements.get('checks', []))
    return {'baselinePassed': baseline, 'passed': baseline and all(c['status'] != 'failed' for c in checks), 'facts': facts, 'checks': checks, 'units': requirements['units'], 'geometry_units': 'mm', 'limitations': ['Circular diameter check establishes an edge diameter, not hole depth or placement.', 'Unlisted requirements and manufacturing suitability are not verified.']}


if __name__ == '__main__':
    job = json.loads(Path('/tmp/job/in/request.json').read_text())
    report = inspect(Path('/tmp/job/in/model.step'), job['requirements'])
    Path('/tmp/job/out/validation.json').write_text(json.dumps(report, allow_nan=False))
    sys.exit(0 if report['passed'] else 2)
