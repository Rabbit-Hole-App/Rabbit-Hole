import importlib.util
import json
from pathlib import Path
from unittest.mock import Mock

import pytest

spec = importlib.util.spec_from_file_location('constants_api', Path(__file__).parents[1] / 'api.py')
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


@pytest.fixture(autouse=True)
def job_name(monkeypatch):
    monkeypatch.setenv('JOB_NAME', 'first-app')


def test_constants_preserve_scalar_types():
    values = {'threshold': 0.85, 'region': 'us-east-1', 'enabled': False, 'count': 0, 'label': ''}
    assert api.validate_constants(values) == values


def test_input_tooltip_is_preserved_and_validated():
    schema = {'profile': {'type': 'select', 'options': ['prod', 'sensitive'],
                         'tooltip': 'Prod: 90 degrees; sensitive: 80 degrees.', 'help': 'Choose a profile.'}}
    assert api.validate_schema(schema)['profile']['tooltip'] == schema['profile']['tooltip']
    for value in [None, 1, {}, 'x'*2001]:
        with pytest.raises(api.Rejected, match='tooltip'):
            api.validate_schema({'profile': {'type': 'text', 'tooltip': value}})


@pytest.mark.parametrize('value', [None, [], {'bad-name': 1}, {'nested': {}}, {'list': [1]},
    {'x': None}, {'x': float('nan')}, {'x': float('inf')}, {'x': 2**53}, {'x': 9007199254740991.5}, {'x': 'a'*2100},
    {str(i): i for i in range(21)}])
def test_invalid_constants_are_rejected(value):
    with pytest.raises(api.Rejected):
        api.validate_constants(value)


def test_deploy_saves_constants_and_returns_them_to_run_form(monkeypatch):
    monkeypatch.setenv('BUCKET', 'customer')
    monkeypatch.setattr(api, 'task_role', Mock())
    monkeypatch.setattr(api, 'client', Mock(return_value=Mock()))
    save = Mock()
    monkeypatch.setattr(api, 'put_doc', save)
    values = {'threshold': {'value': 0.85, 'tooltip': 'Minimum score accepted.'}, 'enabled': False}
    result = api.dispatch('POST', '/deploys', {'entry': 'job.py', 'constants': values}, {}, {}, 'proof')
    assert result['constants'] == values
    assert save.call_args.args[1]['constants'] == values
    monkeypatch.setattr(api, 'latest_deployment', lambda _: result)
    monkeypatch.setattr(api, 'current_deployment', lambda _: result)
    assert api.dispatch('GET', '/job', {}, {}, {}, 'proof')['deployment']['constants'] == values


def test_runs_take_constants_from_deployment_and_cannot_override_them(monkeypatch):
    for key, value in {'BUCKET': 'customer', 'CLUSTER': 'test', 'SUBNETS': 'subnet', 'TASK_SECURITY_GROUP': 'sg'}.items():
        monkeypatch.setenv(key, value)
    doc = {'id': 'deployment', 'status': 'ready', 'inputs': {}, 'task_definition': 'task',
           'constants': {'threshold': {'value': 0.85, 'tooltip': 'Minimum score accepted.'}, 'enabled': False}}
    monkeypatch.setattr(api, 'current_deployment', lambda _: doc)
    monkeypatch.setattr(api, 'require_current_deployment', Mock())
    monkeypatch.setattr(api, 'task_role', lambda *args: 'role')
    monkeypatch.setattr(api, 'uploaded_files', lambda *args: [])
    monkeypatch.setattr(api, 'put_doc', Mock())
    aws = Mock()
    aws.generate_presigned_post.return_value = {'url': 'https://example.test', 'fields': {}}
    aws.generate_presigned_url.return_value = 'https://example.test/result'
    aws.run_task.return_value = {'tasks': [{'taskArn': 'task/test'}]}
    monkeypatch.setattr(api, 'client', lambda _: aws)
    for body in [{'constants': {'threshold': 9}}, {'inputs': {'threshold': 9}}]:
        with pytest.raises(api.Rejected):
            api.dispatch('POST', '/runs', body, {}, {'sub': 'owner'}, 'proof')
    aws.run_task.assert_not_called()
    for constants in [doc['constants'], {}]:
        if constants: doc['constants'] = constants
        else: doc.pop('constants', None)  # Old deployments still run.
        run = api.dispatch('POST', '/runs', {}, {}, {'sub': 'owner'}, 'proof')
        env = {v['name']: v['value'] for v in aws.run_task.call_args.kwargs['overrides']['containerOverrides'][0]['environment']}
        expected = {name: value['value'] if isinstance(value, dict) else value for name, value in constants.items()}
        assert json.loads(env['SMALL_CONSTANTS']) == expected == run['constants']
        assert run['inputs'] == {}


@pytest.mark.parametrize('definition', [{'tooltip': 'Missing value'}, {'value': []},
    {'value': 1, 'extra': True}, {'value': 1, 'tooltip': 42}, {'value': 1, 'tooltip': 'x'*2001}])
def test_invalid_constant_tooltips(definition):
    with pytest.raises(api.Rejected):
        api.validate_constants({'threshold': definition})
