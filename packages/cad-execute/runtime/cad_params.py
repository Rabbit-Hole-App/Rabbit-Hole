"""Trusted parameter helper for saved CAD source (cad-params/1).

The executor writes the job's validated input values to the read-only parameters.json. Source reads them with
value(id) instead of editing constants, so a rebuild changes data, never source text. computed(id, v) reports a
dependent construction value the source derived. At exit the ids read and the computed values go to controls.json;
the control plane treats only ids actually read as bound. These are the model's own reports, not measurements.
"""
import atexit
import json
import math
import os
import sys
from pathlib import Path

_JOB = Path(os.environ.get('CAD_JOB_DIR', '/tmp/job'))
_path = _JOB / 'in' / 'parameters.json'
_values = json.loads(_path.read_text()).get('values', {}) if _path.exists() else {}
# cadgen loads the model a second time with a fresh copy of this module: every copy shares one report and one writer.
_state = sys.__dict__.setdefault('_cad_params_report', {'read': [], 'computed': {}, 'writer': False})
_read = _state['read']
_computed = _state['computed']


def value(name):
    if name not in _values:
        raise KeyError(f'CAD parameter {name!r} was not supplied')
    if name not in _read:
        _read.append(name)
    return _values[name]


def computed(name, result):
    if not isinstance(name, str) or not name or len(name) > 48:
        raise ValueError('Computed parameter ids are short strings')
    if isinstance(result, bool) or not isinstance(result, (int, float)) or not math.isfinite(result):
        raise ValueError(f'Computed parameter {name!r} must be a finite number')
    if len(_computed) >= 40 and name not in _computed:
        raise ValueError('At most 40 computed parameters')
    _computed[name] = result
    return result


def _write():
    (_JOB / 'out' / 'controls.json').write_text(json.dumps({'read': _read, 'computed': _computed}, allow_nan=False))


if not _state['writer']:
    _state['writer'] = True
    atexit.register(_write)
