"""A failed replacement must not hide a working app or enable old-image runs."""
import copy
import importlib.util
import os
from pathlib import Path
from unittest.mock import Mock, patch

import pytest
spec = importlib.util.spec_from_file_location('image_selection_api', Path(__file__).parents[1] / 'api.py')
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


OLD = 'd-1788980000000-aaaaaaaaaaaa'
NEW = 'd-1788980000001-bbbbbbbbbbbb'


@pytest.fixture
def records():
    docs = {OLD: {'id': OLD, 'status': 'ready', 'inputs': {}, 'task_definition': 'task:1'},
            NEW: {'id': NEW, 'status': 'failed', 'inputs': {}}}
    with patch.dict(os.environ, {'IMAGE_RETENTION': 'current', 'JOB_NAME': 'first-app'}), \
            patch.object(api, 'prefixes', return_value=['deploys/' + key + '/' for key in [NEW, OLD]]), \
            patch.object(api, 'get_doc', side_effect=lambda key: copy.deepcopy(docs[key.split('/')[-2]])):
        yield docs


def test_failed_or_uploading_replacement_preserves_current(records):
    for status in ['failed', 'uploading', 'built']:
        records[NEW]['status'] = status
        assert api.current_deployment()['id'] == OLD
        assert api.latest_deployment()['id'] == NEW
    records[NEW]['status'] = 'ready'
    assert api.current_deployment()['id'] == NEW


def test_older_deploy_id_cannot_start_a_run_after_replacement(records):
    records[NEW]['status'] = 'ready'
    aws = Mock()
    with patch.object(api, 'client', return_value=aws), pytest.raises(api.Rejected, match='replaced') as error:
        api.dispatch('POST', '/runs', {'deploy_id': OLD}, {}, {'sub': 'owner@example.test'})
    assert error.value.status == 409
    aws.run_task.assert_not_called()


def test_older_deploy_id_cannot_prepare_file_upload_after_replacement(records):
    records[NEW]['status'] = 'ready'
    with patch.dict(os.environ, {'FILE_INPUTS': 'v1'}), pytest.raises(api.Rejected, match='replaced'):
        api.prepare_upload(None, {'deploy_id': OLD, 'files': {'data': {}}}, 'owner@example.test')


def test_full_inventory_fails_closed_instead_of_selecting_from_partial_results():
    s3 = Mock()
    s3.list_objects_v2.return_value = {'CommonPrefixes': [], 'NextContinuationToken': 'more'}
    with patch.object(api, 'client', return_value=s3), patch.dict(os.environ, {'BUCKET': 'fixture'}), \
            pytest.raises(api.Rejected, match='inventory'):
        api.prefixes('deploys', limit=None)
