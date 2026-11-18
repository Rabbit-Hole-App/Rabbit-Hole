"""Unit tests for the pure parts of S2 (knob probe ports, a server step's knob entry), S3 (traps by rule from knob types) and S4 (stdout table detection).
No sandbox, no model: run from this directory with `python -m pytest test_knobs_traps.py`."""
import runner
import run_output
from runner import Runner, is_port_knob, move_port_checks, port_knob_value, trap_plan

DS_CHECKS = [{'type': 'port_listens', 'port': 8001}, {'type': 'http_200', 'port': 8001, 'path': '/-/versions.json'}]
DS_ROUTE = {
    'steps': [{'id': 'fixtures', 'cmd': 'python tests/fixtures.py fixtures.db', 'checks': []},
              {'id': 'serve', 'cmd': 'datasette serve fixtures.db --port 8001', 'longRunning': True, 'checks': DS_CHECKS}],
    'knobs': [{'step': 'serve', 'flag': '--port', 'type': 'int', 'default': '8001', 'safeValue': '8002'},
              {'step': 'serve', 'flag': '--cors', 'type': 'bool', 'default': 'false'},
              {'step': 'serve', 'flag': '--setting', 'type': 'string'}]}
NANO_CMD = 'python sample.py --out_dir=out-shakespeare-char --device=cpu --num_samples=1 --max_new_tokens=5'
NANO_ROUTE = {
    'steps': [{'id': 'sample', 'cmd': NANO_CMD, 'checks': []}],
    'knobs': [{'step': 'sample', 'flag': '--start', 'type': 'string', 'default': '"\\n"', 'safeValue': 'ROMEO:'},
              {'step': 'sample', 'flag': '--temperature', 'type': 'float', 'default': '0.8'},
              {'step': 'sample', 'flag': '--num_samples', 'type': 'int', 'default': '10'},
              {'step': 'sample', 'flag': '--max_new_tokens', 'type': 'int', 'default': '500'}]}


# ---- S3: traps by rule from the knob types -------------------------------------------------------------------------------
def by_kind(traps):
    return {(t['kind'], t['knob']): t for t in traps}


def test_nanogpt_traps_are_the_fixture_shapes():
    traps = by_kind(trap_plan(NANO_ROUTE))
    temp = traps[('wrong_type', '--temperature')]
    assert '--temperature=1 ' in temp['cmd'] + ' ' and temp['id'] == 'temperature_int_not_float'  # configurator style: an int-looking float
    assert 'A=B' in traps[('string_equals', '--start')]['cmd']
    assert '--temprature=' in traps[('unknown_flag', '--temperature')]['cmd']
    assert ('wrong_type', '--num_samples') in traps  # the first int knob gets a non-number
    assert '--num_samples=abc' in traps[('wrong_type', '--num_samples')]['cmd']


def test_datasette_port_trap_is_not_an_integer():
    traps = by_kind(trap_plan(DS_ROUTE))
    port = traps[('wrong_type', '--port')]
    assert port['id'] == 'port_not_an_integer' and '--port=abc' in port['cmd'] and port['cmd'].startswith('datasette serve fixtures.db')
    assert ('unknown_flag', '--port') in traps
    assert '--pot=' in traps[('unknown_flag', '--port')]['cmd']  # not a prefix of --port: argparse would accept `--por`


def test_one_trap_per_kind_and_type_and_a_cap():
    traps = trap_plan(NANO_ROUTE)
    assert [t['kind'] for t in traps] == ['wrong_type', 'wrong_type', 'string_equals', 'unknown_flag']  # int, float, string, unknown: 4 of at most 6
    many = {'steps': [{'id': f's{i}', 'cmd': f'python a{i}.py --x=1', 'checks': []} for i in range(3)],
            'knobs': [{'step': f's{i}', 'flag': f'--{n}', 'type': t, 'default': ''} for i in range(3) for n, t in (('a', 'int'), ('b', 'float'), ('c', 'string'))]}
    got = trap_plan(many)
    assert len(got) == runner.TRAP_MAX == 6 and len({t['id'] for t in got}) == 6  # 3 steps x 4 traps, cut at the cap, ids unique


def test_float_knob_outside_configurator_style_gets_a_non_number():
    route = {'steps': [{'id': 's', 'cmd': 'python t.py --lr 0.1', 'checks': []}], 'knobs': [{'step': 's', 'flag': '--lr', 'type': 'float', 'default': '0.1'}]}
    t = by_kind(trap_plan(route))[('wrong_type', '--lr')]
    assert '--lr=abc' in t['cmd'] and t['id'] == 'lr_not_a_number'


def test_bool_knobs_get_no_trap_and_only_filter_steps():
    assert not [t for t in trap_plan(DS_ROUTE) if t['knob'] == '--cors']
    assert trap_plan(DS_ROUTE, only={'fixtures'}) == []


# ---- S2: knob probe ports -------------------------------------------------------------------------------------------------
def test_port_knob_value_avoids_the_port_in_use():
    k = DS_ROUTE['knobs'][0]
    assert is_port_knob(k) and not is_port_knob(DS_ROUTE['knobs'][1])
    assert port_knob_value(k, DS_CHECKS) == '8002'
    assert port_knob_value({**k, 'safeValue': '8001'}, DS_CHECKS) == '8002'  # a safeValue equal to the port in use proves nothing
    assert port_knob_value({'flag': '--port', 'type': 'int', 'default': ''}, [{'type': 'port_listens', 'port': 9000}]) == '9001'  # no default: from the checks
    assert port_knob_value({'flag': '--port', 'type': 'int', 'default': ''}, []) == '8001'
    assert port_knob_value({**k, 'safeValue': '80'}, DS_CHECKS) == '8002'  # a privileged port is never probed


def test_port_checks_move_with_the_knob():
    k = DS_ROUTE['knobs'][0]
    moved = move_port_checks(DS_CHECKS, k, '8002')
    assert [c['port'] for c in moved] == [8002, 8002] and moved[1]['path'] == '/-/versions.json'
    assert [c['port'] for c in DS_CHECKS] == [8001, 8001]  # the step's own checks are not touched
    nodef = move_port_checks([{'type': 'port_listens', 'port': 7000}], {'flag': '--port', 'type': 'int', 'default': ''}, '7001')
    assert nodef == [{'type': 'port_listens', 'port': 7001}]


class FakeRunner(Runner):
    """verify_knobs with the sandbox replaced: a server start answers on the ports of the checks it is given when `up`."""
    def __init__(self, route, steps, up=True):
        super().__init__(None, route, None, None, None, 0)
        self.steps, self.up, self.started = steps, up, []

    def _start_long(self, step, cmd=None, checks=None, keep=True, name=None):
        self.started.append((cmd, [c.get('port') for c in checks]))
        done = [{'type': c['type'], 'passed': self.up} for c in checks]
        return runner.ExecResult(0 if self.up else 1, 'INFO: log line', '', 1.0), done, 1.0 if self.up else None

    def _attempt_log_extra(self, name, cmd, res):
        pass


def test_server_step_with_a_knob_ends_verified_and_probes_the_new_port():
    rn = FakeRunner(DS_ROUTE, [{'id': 'serve', 'sec': 3.0, 'startedSec': 3.0}])
    out = rn.verify_knobs()
    assert len(out) == 1 and out[0]['rc'] == 0
    assert out[0]['cmd'] == 'datasette serve fixtures.db --port=8002'
    assert rn.started == [(out[0]['cmd'], [8002, 8002])]  # port_listens and http_200 both on 8002


def test_server_step_that_does_not_come_up_is_recorded_as_failed_not_dropped():
    out = FakeRunner(DS_ROUTE, [{'id': 'serve', 'sec': 3.0, 'startedSec': 3.0}], up=False).verify_knobs()
    assert [e['rc'] for e in out] == [1] and out[0]['_error'].startswith('probe failed: port_listens 8002')


def test_server_step_never_ends_both_empty():
    slow = FakeRunner(DS_ROUTE, [{'id': 'serve', 'sec': 999, 'startedSec': 999}]).verify_knobs()
    assert len(slow) == 1 and slow[0]['rc'] == 1 and 'did not start within' in slow[0]['_error']
    bools = {**DS_ROUTE, 'knobs': [DS_ROUTE['knobs'][1]]}
    only_bool = FakeRunner(bools, [{'id': 'serve', 'sec': 3.0, 'startedSec': 3.0}]).verify_knobs()
    assert len(only_bool) == 1 and only_bool[0]['rc'] == 1 and 'no knob of this step can be exercised' in only_bool[0]['_error']


# ---- S4: stdout table detection -----------------------------------------------------------------------------------------
UVICORN = """INFO:     Started server process [123]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8002 (Press CTRL+C to quit)
"""
TABLE = """name      count   mean
alpha        12   0.5
beta          7   0.25
gamma         3   0.125
"""


def test_uvicorn_log_lines_are_text():
    assert run_output.stdout_kind(UVICORN) == 'text'


def test_timestamped_and_levelled_log_lines_are_text():
    assert run_output.stdout_kind('12:01:02  started  ok\n12:01:03  loaded  ok\n12:01:04  ready  ok\n') == 'text'
    assert run_output.stdout_kind('2026-11-15 12:01  a  b\n2026-11-15 12:02  c  d\n2026-11-15 12:03  e  f\n') == 'text'
    assert run_output.stdout_kind('WARNING:  one  two\nERROR:  three  four\nDEBUG:  five  six\n') == 'text'


def test_aligned_table_is_a_table():
    assert run_output.stdout_kind(TABLE) == 'table'
    assert run_output.stdout_kind('| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n') == 'table'


def test_table_after_log_lines_is_still_a_table_and_two_rows_are_not():
    assert run_output.stdout_kind(UVICORN + TABLE) == 'table'
    assert run_output.stdout_kind('name    count\nalpha     12\n') == 'text'
    assert run_output.stdout_kind('{"a": 1}') == 'json'
