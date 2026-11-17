"""Run card cells, derived from a rehearsal record, and the allowed-command rule (schemas/cells.json: DERIVATION and ALLOWED COMMAND).
The browser never sends a command: a run request names a cell and flag values, and build_command() is the only place a command is made."""
import posixpath
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
_SOURCE = re.compile(r'[^\s:]+:[0-9]+(?:-[0-9]+)?')
_FLAG_NAME = re.compile(r'--[A-Za-z0-9_-]+')
MAX_ADDED_KNOBS = 8
MAX_SOURCE_LINES = 50   # a cited range longer than this is refused (the check reads it all)
_QUOTES = chr(39) + chr(34)


def cell_id_of(step_id: str) -> str:
    return step_id + '_step' if step_id in _RESERVED else step_id


def _flag_value(cmd: str, flag: str, loose: bool = False):
    """The value of `--flag=value` in cmd (shell-unquoted), or None when the flag is not there in that form.
    loose (step cells): also `--flag value` (click, argparse) and a bare `--flag` (reads as 'true')."""
    try:
        tokens = shlex.split(cmd)
    except ValueError:
        return None
    for i, t in enumerate(tokens):
        if t.startswith(flag + '='):
            return t[len(flag) + 1:]
        if loose and t == flag:
            return tokens[i + 1] if i + 1 < len(tokens) and not tokens[i + 1].startswith('-') else 'true'
    return None


def _flag_spec(k: dict, value: str = None) -> dict:
    """A cells.json flag from a route knob: value (the command's, else the repository default), default, source, editable, addedBy."""
    default = str(k.get('default', '')).strip().strip(_QUOTES)
    out = {'flag': k['flag'], 'type': k['type'], 'value': default if value is None else value, 'default': default, 'editable': True, 'addedBy': 'discovery'}
    if _SOURCE.fullmatch(str(k.get('source', ''))):
        out['source'] = k['source']
    return out


def _metric_name(pattern: str) -> str:
    words = re.findall(r'[A-Za-z_][A-Za-z_ ]*', pattern.split('(')[0])  # '^iter \d+: loss ([\d.]+)' -> 'loss'
    return words[-1].strip() if words and words[-1].strip() else 'metric'


def metric_checks(step: dict) -> list:
    """[(series name, regex)] of a step's metric_decreased / metric_below checks: the patterns the Run card reads loss curves with."""
    return [(_metric_name(c.get('pattern', '')), c['pattern']) for c in step.get('checks', []) if c.get('type') in ('metric_decreased', 'metric_below') and c.get('pattern')]


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
        cid = cell_id_of(st['id'])
        rec_step = done.get(st['id'], {})
        sec = rec_step.get('startedSec') if st.get('longRunning') and rec_step.get('startedSec') is not None else rec_step.get('sec')  # a server's `sec` is the time to its first probe
        flags, seen = [], set()
        for k in route.get('knobs', []):  # every knob of the step, discovery's order (the card shows the first three, the rest under More parameters)
            if k['step'] == st['id'] and k['flag'] not in seen:
                seen.add(k['flag'])
                value = _flag_value(st['cmd'], k['flag'], loose=True)
                flags.append(_flag_spec(k, value))
        cells.append({'cellId': cid, 'kind': 'step', 'title': titles.get(st['cmd']) or st['id'].replace('_', ' ').capitalize(), 'cmd': st['cmd'],
                      'timeoutSec': limits.step_timeout(st['timeoutSec']), 'flags': flags, 'expected': _expected(sec, rec_step or None, st['checks'])})
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
                default = str(k.get('default', '')).strip().strip(_QUOTES)
                rule = _TYPE_RULES.get(k['type'])
                if k['type'] in ('float', 'int') and rule and rule[0].fullmatch(default):
                    value = default
                flags.append(_flag_spec(k, value))
        cmd = kv['cmd']
        for f in flags:
            cmd = set_flag(cmd, f['flag'], shlex.quote(f['value']) if re.search(r'[^A-Za-z0-9_.:/=,-]', f['value']) else f['value'])
        cells.append({'cellId': 'knobs', 'kind': 'knobs', 'title': 'Make it yours', 'cmd': cmd, 'timeoutSec': limits.step_timeout(final['timeoutSec']), 'flags': flags,
                      'expected': {'sec': kv.get('sec')}})  # ponytail: the record keeps no stdout for the knob run, so no stdoutHead
    return cells


def _check_value(flag: str, ftype: str, value) -> None:
    """The type rule (ValueError naming the flag and the rule)."""
    if not isinstance(value, str):
        raise ValueError(f'flag {flag!r} value must be a string')
    if ftype == 'string' and '=' in value:
        raise ValueError(f"flag {flag!r} value {value[:40]!r} refused: a string must not contain '='")
    pattern, rule = _TYPE_RULES[ftype]
    if not pattern.fullmatch(value):
        raise ValueError(f'flag {flag!r} value {value[:40]!r} refused: {rule}')


def _source_parts(source: str):
    """(file, first, last) of a `file:line` or `file:a-b` citation, the file confined to the clone (no leading slash, no `..`, no backslash); ValueError otherwise."""
    if not isinstance(source, str) or not _SOURCE.fullmatch(source):
        raise ValueError(f'source {str(source)[:60]!r} must look like train.py:59')
    path, lines = source.rsplit(':', 1)
    first, _, last = lines.partition('-')
    first, last = int(first), int(last or first)
    norm = posixpath.normpath(path)
    if path.startswith('/') or '\\' in path or '\x00' in path or '..' in path.split('/') or norm != path:
        raise ValueError(f'source {source[:80]!r} must be a plain path inside the repository')
    if first < 1 or last < first or last - first + 1 > MAX_SOURCE_LINES:
        raise ValueError(f'source {source[:80]!r} must cite one line or a range of at most {MAX_SOURCE_LINES} lines')
    return path, first, last


def added_specs(added_knobs, wanted: set, read_source, accepts: str = '') -> dict:
    """{flag: knob} for the Tutor-added knobs in `wanted` (the flags a run actually sets), each checked against the cloned source: the name pattern, the type, a file:line that exists
    and whose text names the flag (the flag without its dashes). `read_source(path, first, last)` returns the text of those lines, or None when the file or line is absent.
    More than MAX_ADDED_KNOBS added knobs, or any failed check, is a ValueError whose message lists what the cell accepts."""
    added = list(added_knobs or [])
    if len(added) > MAX_ADDED_KNOBS:
        raise ValueError(f'at most {MAX_ADDED_KNOBS} added knobs per run (got {len(added)})' + accepts)
    out = {}
    for a in added:
        if not isinstance(a, dict) or a.get('flag') not in wanted or a['flag'] in out:
            continue
        flag = a['flag']
        try:
            if not _FLAG_NAME.fullmatch(flag):
                raise ValueError('a flag looks like --name (letters, digits, - and _)')
            if a.get('type') not in _TYPE_RULES:
                raise ValueError('its type must be string, float, int or bool')
            path, first, last = _source_parts(a.get('source'))
            if read_source is None:
                raise ValueError('its source cannot be checked here')
            text = read_source(path, first, last)
            if text is None:
                raise ValueError(f'{a["source"]} does not exist in the repository')
            if flag.lstrip('-') not in text:
                raise ValueError(f'{a["source"]} does not mention {flag}')
        except ValueError as e:
            raise ValueError(f'flag {str(flag)[:60]!r} cannot be added: {e}' + accepts)
        out[flag] = a
    return out


def _accepts(cell: dict) -> str:
    names = [f['flag'] for f in cell['flags'] if f['editable']]
    return '; the flags this cell accepts: ' + ', '.join(names) if names else '; this cell has no editable flags'


def _equals_style(cmd: str) -> bool:
    return re.search(r'(?<!\S)--[A-Za-z0-9_-]+=', cmd) is not None


def _apply(cmd: str, flag: str, value: str, ftype: str, equals: bool) -> str:
    """Put `flag` = `value` into cmd, in the command's own convention: replaced in place (a spaced `--port 8001` becomes `--port=8002`), appended when absent, every value shell-quoted.
    A bool in a command with no `--x=value` flags (`equals` false: click, argparse store_true) is the bare flag: present for true, removed for false."""
    if ftype == 'bool' and not equals:
        cmd = re.sub(r' {2,}', ' ', re.sub(r'(?<!\S)' + re.escape(flag) + r'(?=\s|$)', '', cmd)).strip()
        return cmd + ' ' + flag if value.lower() == 'true' else cmd
    spaced = ftype != 'bool' and re.search(r'(?<!\S)' + re.escape(flag) + r'\s+(?!-)\S', cmd) is not None
    cmd = re.sub(r'(?<!\S)([\'"])' + re.escape(flag) + r'=.*?\1(?=\s|$)', flag + '=X', cmd)  # a quoted `'--flag=a b'` from an earlier set_flag becomes plain so set_flag replaces it
    return set_flag(cmd, flag, value, spaced)  # replaces the flag's value in place and shell-quotes the token


def _compose(cell: dict, flags: dict, added: dict) -> str:
    cmd = cell['cmd']
    equals = _equals_style(cmd)  # the command's convention as the record wrote it, before any flag is set
    for flag, value in (flags or {}).items():
        spec = next((f for f in cell['flags'] if f['flag'] == flag and f['editable']), None) or added.get(flag)
        if spec is None:
            raise ValueError(f'flag {flag!r} cannot be set on cell {cell["cellId"]!r}' + _accepts(cell))
        _check_value(flag, spec['type'], value)
        cmd = _apply(cmd, flag, value, spec['type'], equals)
    return cmd


def _flags_to_check(cell: dict, flags: dict) -> set:
    return {f for f in (flags or {}) if not any(x['flag'] == f and x['editable'] for x in cell['flags'])}


def build_command(cells: list, cellId: str, flags: dict = None, added_knobs: list = None, read_source=None) -> str:
    """The command to run for `cellId` with the learner's flag values substituted. ValueError (the message names the flag and the rule, and lists the flags the cell accepts) for an unknown cell,
    an unknown or non-editable flag not added by the Tutor, an added knob failing its checks (added_specs), or a value failing its type rule."""
    cell = next((c for c in cells if c['cellId'] == cellId), None)
    if cell is None:
        raise ValueError(f'unknown cell {cellId!r}: the cells are ' + ', '.join(c['cellId'] for c in cells))
    return _compose(cell, flags, added_specs(added_knobs, _flags_to_check(cell, flags), read_source, _accepts(cell)))


def build_custom(cells: list, route: dict, custom: dict, added_knobs: list = None, read_source=None) -> list:
    """A custom run (run-request.json `custom`): [{step, cellId, cmd, timeoutSec}] in route order. `steps` must be route step ids in route order, `knobs` may name only those steps,
    each step's knobs go through the same rule as a cell run. `name` is a label and is never used here."""
    order = [st['id'] for st in route['steps']]
    steps = custom.get('steps') or []
    pos = []
    for sid in steps:
        if sid not in order:
            raise ValueError(f'unknown step {str(sid)[:40]!r}: the steps are ' + ', '.join(order))
        pos.append(order.index(sid))
    if not steps or pos != sorted(set(pos)):
        raise ValueError('steps must be route steps in route order, each at most once: ' + ', '.join(order))
    knobs = custom.get('knobs') or {}
    stray = [k for k in knobs if k not in steps]
    if stray:
        raise ValueError(f'knobs given for {stray[0]!r}, which is not one of the steps run')
    by_id = {c['cellId']: c for c in cells}
    wanted = set()
    for sid in steps:
        wanted |= _flags_to_check(by_id[cell_id_of(sid)], knobs.get(sid))
    added = added_specs(added_knobs, wanted, read_source, '; the flags each step accepts: ' + '; '.join(
        sid + ': ' + (', '.join(f['flag'] for f in by_id[cell_id_of(sid)]['flags'] if f['editable']) or 'none') for sid in steps))
    out = []
    for sid in steps:
        cell = by_id[cell_id_of(sid)]
        out.append({'step': sid, 'cellId': cell['cellId'], 'cmd': _compose(cell, knobs.get(sid), added), 'timeoutSec': cell['timeoutSec']})
    return out
