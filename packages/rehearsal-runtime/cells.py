"""Run card cells, derived from a rehearsal record, and the allowed-command rule (schemas/cells.json: DERIVATION and ALLOWED COMMAND).
The browser never sends a command: a run request names a cell and flag values, and build_command() is the only place a command is made."""
import re
import shlex

import limits
from runner import set_flag

_TYPE_RULES = {  # flag type -> (pattern, rule text); matched with fullmatch (never `$`, which accepts a trailing newline)
    'float': (re.compile(r'-?[0-9]+\.[0-9]+'), 'a float must look like 0.5 or 1.0 (an integer-looking value is refused: the repository type-checks it)'),
    'int': (re.compile(r'-?[0-9]+'), 'an int must be digits only, like 2'),
    'bool': (re.compile(r'true|false|True|False'), 'a bool must be true or false'),
    'string': (re.compile(r"[A-Za-z0-9 :,.'_-]{0,80}"), "a string may hold letters, digits, space and : , . ' _ - only, up to 80 characters"),
}
_RESERVED = ('install', 'knobs')


def _flag_value(cmd: str, flag: str):
    """The value of `--flag=value` in cmd (shell-unquoted), or None when the flag is not there in that form."""
    try:
        tokens = shlex.split(cmd)
    except ValueError:
        return None
    for t in tokens:
        if t.startswith(flag + '='):
            return t[len(flag) + 1:]
    return None


def _metric_name(pattern: str) -> str:
    words = re.findall(r'[A-Za-z_][A-Za-z_ ]*', pattern.split('(')[0])  # '^iter \d+: loss ([\d.]+)' -> 'loss'
    return words[-1].strip() if words and words[-1].strip() else 'metric'


def _expected(sec, step=None, route_checks=()) -> dict:
    out = {'sec': sec}
    if not step:
        return out
    metrics = []
    seen = {}
    for c in step.get('checks', []):  # the record's check results carry no pattern: it is in the route's check of the same type (nth of that type)
        if c.get('type') in ('metric_decreased', 'metric_below') and 'last' in c:
            same = [r for r in route_checks if r.get('type') == c['type']]
            n = seen[c['type']] = seen.get(c['type'], -1) + 1
            m = {'name': _metric_name(same[n].get('pattern', '') if n < len(same) else ''), 'last': c['last']}
            if 'first' in c:
                m['first'] = c['first']
            metrics.append(m)
    if metrics:
        out['metrics'] = metrics
    if step.get('files'):
        out['files'] = [{'path': p, 'bytes': f['bytes']} for p, f in step['files'].items()]
    for k in ('stdoutHead', 'stdoutTail'):
        if step.get(k):
            out[k] = step[k]
    return out


def derive_cells(record: dict) -> list:
    route = record['route']
    done = {s['id']: s for s in record.get('steps', [])}
    titles = {s.get('cmd'): s['title'] for s in (record.get('draftPlan') or {}).get('steps', []) if s.get('cmd')}
    cells = []
    if route.get('install'):
        cells.append({'cellId': 'install', 'kind': 'install', 'title': 'Install', 'cmd': ' && '.join(i['cmd'] for i in route['install']), 'timeoutSec': 600, 'flags': [], 'expected': {'sec': None}})
    for st in route['steps']:
        cid = st['id'] + '_step' if st['id'] in _RESERVED else st['id']
        sec = done.get(st['id'], {}).get('sec')
        cells.append({'cellId': cid, 'kind': 'step', 'title': titles.get(st['cmd']) or st['id'].replace('_', ' ').capitalize(), 'cmd': st['cmd'],
                      'timeoutSec': limits.step_timeout(st['timeoutSec']), 'flags': [], 'expected': _expected(sec, done.get(st['id']), st['checks'])})
    kv = (record.get('knobsVerified') or [None])[0]
    if kv and route['steps']:
        final = route['steps'][-1]
        flags = []
        for k in route.get('knobs', []):
            if k['step'] != final['id']:
                continue
            value = _flag_value(kv['cmd'], k['flag'])
            if value is not None:
                # The verification run set numeric knobs to probe values (top_k=1, seed=1: greedy, repetitive text). The learner's cell starts from the repository's own defaults; string knobs keep the verified prompt.
                default = str(k.get('default', '')).strip().strip(chr(39) + chr(34))
                rule = _TYPE_RULES.get(k['type'])
                if k['type'] in ('float', 'int') and rule and rule[0].fullmatch(default):
                    value = default
                flags.append({'flag': k['flag'], 'type': k['type'], 'value': value, 'editable': True})
        cmd = kv['cmd']
        for f in flags:
            cmd = set_flag(cmd, f['flag'], shlex.quote(f['value']) if re.search(r'[^A-Za-z0-9_.:/=,-]', f['value']) else f['value'])
        cells.append({'cellId': 'knobs', 'kind': 'knobs', 'title': 'Make it yours', 'cmd': cmd, 'timeoutSec': limits.step_timeout(final['timeoutSec']), 'flags': flags,
                      'expected': {'sec': kv.get('sec')}})  # ponytail: the record keeps no stdout for the knob run, so no stdoutHead
    return cells


def build_command(cells: list, cellId: str, flags: dict = None) -> str:
    """The command to run for `cellId` with the learner's flag values substituted. ValueError (message names the flag and the rule) for an unknown cell, an unknown or non-editable flag, or a value failing its type rule."""
    cell = next((c for c in cells if c['cellId'] == cellId), None)
    if cell is None:
        raise ValueError(f'unknown cell {cellId!r}: the cells are ' + ', '.join(c['cellId'] for c in cells))
    cmd = cell['cmd']
    for flag, value in (flags or {}).items():
        spec = next((f for f in cell['flags'] if f['flag'] == flag), None)
        if spec is None or not spec['editable']:
            raise ValueError(f'flag {flag!r} cannot be set on cell {cellId!r}: ' + ('editable flags are ' + ', '.join(f['flag'] for f in cell['flags'] if f['editable']) if any(f['editable'] for f in cell['flags']) else 'this cell has no editable flags'))
        if not isinstance(value, str):
            raise ValueError(f'flag {flag!r} value must be a string')
        if spec['type'] == 'string' and '=' in value:
            raise ValueError(f"flag {flag!r} value {value[:40]!r} refused: a string must not contain '='")
        pattern, rule = _TYPE_RULES[spec['type']]
        if not pattern.fullmatch(value):
            raise ValueError(f'flag {flag!r} value {value[:40]!r} refused: {rule}')
        cmd = re.sub(r'(?<!\S)([\'"])' + re.escape(flag) + r'=.*?\1(?=\s|$)', flag + '=X', cmd)  # a quoted `'--flag=a b'` from an earlier set_flag becomes plain so set_flag replaces it
        cmd = set_flag(cmd, flag, value)  # replaces the flag's value in place and shell-quotes the token
    return cmd
