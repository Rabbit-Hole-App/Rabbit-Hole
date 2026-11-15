import copy
import json
import re
from pathlib import Path

import pytest
from conftest import FIXTURE, SCHEMAS, load, route_from_fixture

NAMES = ['job', 'status', 'route', 'record', 'plan', 'fake-script']


def test_every_schema_is_a_valid_schema(validator):
    from jsonschema import Draft202012Validator
    for p in SCHEMAS.glob('*.json'):
        Draft202012Validator.check_schema(load(p))


@pytest.mark.parametrize('name', [n for n in NAMES if n != 'route'])
def test_example_validates(validator, name):
    errors = list(validator(name).iter_errors(load(SCHEMAS / 'examples' / f'{name}.example.json')))
    assert not errors, errors[0].message


def test_fixture_route_validates(validator):
    errors = list(validator('route').iter_errors(route_from_fixture()))
    assert not errors, errors[0].message


def test_fixture_route_has_the_three_readme_steps_and_a_source_each():
    route = route_from_fixture()
    assert [s['id'] for s in route['steps']] == ['prepare', 'train', 'sample']
    assert all(s['source'].startswith('README.md:') for s in route['steps'])


def bad(validator, name, obj):
    return list(validator(name).iter_errors(obj))


def test_step_without_a_source_is_rejected(validator):
    r = route_from_fixture()
    del r['steps'][0]['source']
    assert bad(validator, 'route', r)


def test_unknown_check_type_and_metric_below_without_value_are_rejected(validator):
    r = route_from_fixture()
    r['steps'][0]['checks'].append({'type': 'vibes'})
    assert bad(validator, 'route', r)
    r = route_from_fixture()
    r['steps'][0]['checks'] = [{'type': 'metric_below', 'pattern': 'x'}]
    assert bad(validator, 'route', r)


def test_route_schema_states_the_multiline_rule():
    desc = load(SCHEMAS / 'route.json')['description']
    assert 're.MULTILINE' in desc and 'FIRST and LAST' in desc and 'LAST match' in desc


def test_fixture_patterns_need_multiline_and_match_with_it():
    """The fixture's ^-anchored patterns match a multi-line log only under re.MULTILINE (the rule the route schema states)."""
    log = 'step 0: train loss 4.2, val loss 4.2\niter 0: loss 4.2, time 1ms\niter 1: loss 4.1, time 1ms\nstep 2000: train loss 1.2, val loss 1.8\n'
    for s in route_from_fixture()['steps']:
        for c in s['checks']:
            if c['type'] in ('stdout_matches', 'metric_decreased') and c['pattern'].startswith('^') and s['id'] == 'train':
                assert re.search(c['pattern'], log, re.MULTILINE)
    assert not re.search('^step 2000', 'x\nstep 2000: train loss', 0)


def test_job_rejects_bad_commit_repo_and_gpu(validator):
    job = load(SCHEMAS / 'examples' / 'job.example.json')
    for key, value in [('commit', 'main'), ('commit', 'A' * 40), ('repo', 'a b/c'), ('repo', 'owner'), ('hardware', 'gpu'), ('version', 'rehearsal-2')]:
        j = copy.deepcopy(job)
        j[key] = value
        assert bad(validator, 'job', j), (key, value)


def test_record_requires_traps_and_model_calls_and_closes_fix_kinds(validator):
    rec = load(SCHEMAS / 'examples' / 'record.example.json')
    for key in ('traps', 'modelCalls', 'model'):
        r = copy.deepcopy(rec)
        del r[key]
        assert bad(validator, 'record', r), key
    r = copy.deepcopy(rec)
    r['fixes'][0]['kind'] = 'edit_repository_source'
    assert bad(validator, 'record', r)
    r = copy.deepcopy(rec)
    r['provider'] = 'local'
    assert bad(validator, 'record', r)


def test_record_trap_that_does_not_fail_is_still_a_valid_record(validator):
    rec = load(SCHEMAS / 'examples' / 'record.example.json')
    rec['traps'][0].update(rc=0, failsAsExpected=False)
    assert not bad(validator, 'record', rec)


def test_status_enum_is_the_spec_list(validator):
    assert load(SCHEMAS / 'status.json')['properties']['status']['enum'] == ['queued', 'discovering', 'provisioning', 'running', 'repairing', 'planning', 'ready', 'failed']


def test_fixture_traps_and_fixes_files_present():
    for f in ('expected-route', 'expected-fixes', 'expected-traps', 'expected-files'):
        assert (FIXTURE / f'{f}.json').exists()
    assert len(load(FIXTURE / 'expected-traps.json')['traps']) == 3
