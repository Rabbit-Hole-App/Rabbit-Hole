import importlib.util
import io
from pathlib import Path
from unittest.mock import Mock

import pytest

spec = importlib.util.spec_from_file_location('context_job_api', Path(__file__).parents[1] / 'api.py')
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


@pytest.fixture(autouse=True)
def first_app(monkeypatch):
    monkeypatch.setenv('JOB_NAME', 'first-app')


def test_context_excludes_transport_fields_and_reads_only_bounded_text_outputs(monkeypatch):
    monkeypatch.setenv('BUCKET', 'customer')
    monkeypatch.setenv('RUN_LOG_GROUP', 'customer-logs')
    s3 = Mock()
    s3.list_objects_v2.return_value = {'Contents': [
        {'Key': 'apps/proof/runs/run/outputs/report.json', 'Size': 11},
        {'Key': 'apps/proof/runs/run/outputs/large.txt', 'Size': 100000},
        {'Key': 'apps/proof/runs/run/outputs/image.png', 'Size': 200},
    ]}
    s3.get_object.return_value = {'Body': io.BytesIO(b'{"sum":204}')}
    monkeypatch.setattr(api, 'client', lambda _: s3)
    logs = Mock(return_value={'lines': [{'line': 'done', 'timestamp': 1}], 'cursor': 'transport-token'})
    monkeypatch.setattr(api, 'log_lines', logs)
    record = {'run_id': 'run', 'status': 'finished', 'exit_code': 0, 'task_arn': 'task/private-task',
              'inputs': {'count': 8}, 'upload_id': 'private-upload',
              'input_files': [{'name': 'events', 'filename': 'events.txt', 'size': 16, 'url': 'signed-url'}]}
    context = api.run_context('proof', record, {'sources': 'log,outputs'})
    assert context['run']['inputs'] == {'count': 8}
    assert context['outputs'][0]['text'] == '{"sum":204}'
    assert all('text' not in o for o in context['outputs'][1:])
    assert s3.get_object.call_count == 1
    assert logs.call_args.kwargs['tail'] is True
    assert 'signed-url' not in str(context) and 'private-task' not in str(context) and 'transport-token' not in str(context)
    assert 'private-upload' not in str(context)


def test_deselected_sources_never_fetch_logs_or_output_bytes(monkeypatch):
    client, logs = Mock(), Mock()
    monkeypatch.setattr(api, 'client', client)
    monkeypatch.setattr(api, 'log_lines', logs)
    result = api.run_context('proof', {'run_id': 'run', 'status': 'finished'}, {'sources': ''})
    assert set(result) == {'run'}
    client.assert_not_called()
    logs.assert_not_called()


def test_output_names_cannot_escape_the_run_prefix(monkeypatch):
    monkeypatch.setenv('BUCKET', 'customer')
    client = Mock()
    client.list_objects_v2.return_value = {'Contents': [{'Key': 'apps/other/runs/run/outputs/private.txt', 'Size': 10}]}
    monkeypatch.setattr(api, 'client', lambda _: client)
    context = api.run_context('proof', {'run_id': 'run'}, {'sources': 'outputs'})
    assert context['outputs'] == []
    client.get_object.assert_not_called()


def test_app_context_bounds_recent_runs_and_uses_only_the_latest_run_for_details(monkeypatch):
    run_ids = ['r-1789086976562-' + str(i).zfill(12) for i in range(5, 0, -1)]
    deploy_id = 'd-1789086976562-aaaaaaaaaaaa'
    prefixes = Mock(side_effect=lambda kind, limit: ['apps/proof/deploys/' + deploy_id + '/'] if kind.endswith('/deploys')
                    else ['apps/proof/runs/' + ident + '/' for ident in run_ids[:limit]])
    monkeypatch.setattr(api, 'prefixes', prefixes)
    monkeypatch.setattr(api, 'deployment', Mock(return_value={'id': deploy_id, 'entry': 'job.py', 'status': 'ready',
        'inputs': {'count': {'type': 'number', 'default': 8}}, 'task_definition': 'internal-task', 'image': 'internal-image'}))
    monkeypatch.setattr(api, 'run_record', Mock(side_effect=lambda ident, app: {'run_id': ident, 'status': 'finished',
        'inputs': {'count': 8}, 'task_arn': 'internal-task'}))
    details = Mock(return_value={'run': {'run_id': run_ids[0]}, 'log': {'lines': ['L1: done']}, 'outputs': []})
    monkeypatch.setattr(api, 'run_context', details)
    context = api.dispatch('GET', '/context', {}, {'sources': 'runs,log,outputs'}, {}, app='proof')
    assert context['app'] == 'proof' and context['deployment']['entry'] == 'job.py'
    assert context['deployment']['inputs']['count']['default'] == 8
    assert [run['run_id'] for run in context['runs']] == run_ids
    assert 'internal-' not in str(context)
    assert prefixes.call_args.args == ('apps/proof/runs', 5)
    assert details.call_args.args == ('proof', {'run_id': run_ids[0], 'status': 'finished', 'inputs': {'count': 8},
                                             'task_arn': 'internal-task'}, {'sources': 'log,outputs'})
    assert details.call_count == 1


def test_app_context_without_selected_run_sources_does_not_fetch_runs(monkeypatch):
    prefixes = Mock(return_value=[])
    monkeypatch.setattr(api, 'prefixes', prefixes)
    run, logs = Mock(), Mock()
    monkeypatch.setattr(api, 'run_record', run)
    monkeypatch.setattr(api, 'run_context', logs)
    context = api.dispatch('GET', '/context', {}, {'sources': ''}, {}, app='proof')
    assert context['app'] == 'proof' and context['deployment'] is None
    assert 'runs' not in context and 'latest_run' not in context
    assert prefixes.call_count == 1
    run.assert_not_called()
    logs.assert_not_called()


def test_app_context_reports_no_runs_and_rejects_unsupported_sources_before_reading(monkeypatch):
    prefixes = Mock(return_value=[])
    monkeypatch.setattr(api, 'prefixes', prefixes)
    context = api.dispatch('GET', '/context', {}, {}, {}, app='proof')
    assert context['runs'] == [] and context['latest_run'] is None
    prefixes.reset_mock()
    with pytest.raises(api.Rejected):
        api.dispatch('GET', '/context', {}, {'sources': 'code'}, {}, app='proof')
    prefixes.assert_not_called()
