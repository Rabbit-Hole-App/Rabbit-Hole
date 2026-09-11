import base64
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
from unittest.mock import Mock

import pytest

spec = importlib.util.spec_from_file_location('upload_api', Path(__file__).parents[1] / 'api.py')
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


@pytest.fixture
def uploads(monkeypatch):
    for key, value in {'FILE_INPUTS': 'v1', 'BUCKET': 'customer-data', 'JOB_NAME': 'first', 'TASK_ROLE': 'empty-role'}.items():
        monkeypatch.setenv(key, value)
    deployment = {'id': 'd-1789000000000-aaaaaaaaaaaa', 'status': 'ready', 'inputs': {
        'event_ids_file': {'type': 'file', 'accept': '.txt,.csv', 'required': True}, 'label': {'type': 'text'}}}
    objects = {}
    s3 = Mock()
    s3.generate_presigned_url.side_effect = lambda operation, **kw: 'https://customer-data.s3.us-east-1.amazonaws.com/' + kw['Params']['Key'] + '?signed=fixture'
    monkeypatch.setattr(api, 'client', lambda service: s3)
    monkeypatch.setattr(api, 'deployment', lambda *a, **k: copy.deepcopy(deployment))
    monkeypatch.setattr(api, 'put_doc', lambda key, value, **kw: objects.update({key: copy.deepcopy(value)}))
    monkeypatch.setattr(api, 'get_doc', lambda key, missing=None: copy.deepcopy(objects.get(key, missing)))
    content = b'event-1\nevent-2\n'
    file = {'filename': 'events.txt', 'size': len(content), 'sha256': base64.b64encode(hashlib.sha256(content).digest()).decode()}
    return deployment, objects, s3, file


def prepare(fixture):
    deployment, _, _, file = fixture
    return api.dispatch('POST', '/uploads', {'deploy_id': deployment['id'], 'files': {'event_ids_file': file}}, {}, {'sub': 'owner@example.test'}, 'report')


def test_uploads_are_bound_to_app_deploy_actor_size_and_checksum(uploads):
    deployment, objects, s3, file = uploads
    upload = prepare(uploads)
    record = objects['apps/report/uploads/' + upload['upload_id'] + '/record.json']
    assert record['deploy_id'] == deployment['id'] and record['owner'] == 'owner@example.test'
    params = s3.generate_presigned_url.call_args.kwargs['Params']
    assert params['ContentLength'] == file['size'] and params['ChecksumSHA256'] == file['sha256']
    assert params['Key'].startswith('apps/report/uploads/') and params['Bucket'] == 'customer-data'
    assert upload['files']['event_ids_file']['headers']['x-amz-checksum-sha256'] == file['sha256']
    s3.head_object.return_value = {'ContentLength': file['size'], 'ChecksumSHA256': file['sha256'], 'VersionId': 'original-version'}
    files = api.uploaded_files('report', deployment, {'event_ids_file': 'events.txt'}, upload['upload_id'], 'owner@example.test')
    assert files[0]['version_id'] == 'original-version'
    for actor, app, deploy, values in [
        ('other@example.test', 'report', deployment, {'event_ids_file': 'events.txt'}),
        ('owner@example.test', 'other', deployment, {'event_ids_file': 'events.txt'}),
        ('owner@example.test', 'report', {**deployment, 'id': 'd-1789000000000-bbbbbbbbbbbb'}, {'event_ids_file': 'events.txt'}),
        ('owner@example.test', 'report', deployment, {'event_ids_file': 'changed.txt'}),
    ]:
        with pytest.raises(api.Rejected):
            api.uploaded_files(app, deploy, values, upload['upload_id'], actor)


@pytest.mark.parametrize('change', [
    {'filename': '../secret.txt'}, {'filename': 'x\\secret.txt'}, {'filename': 'events.exe'},
    {'size': -1}, {'size': True}, {'size': 11 * 1024 * 1024}, {'sha256': 'not-a-checksum'},
])
def test_invalid_upload_metadata_never_gets_a_signed_url(uploads, change):
    deployment, objects, s3, file = uploads
    with pytest.raises(api.Rejected):
        api.dispatch('POST', '/uploads', {'deploy_id': deployment['id'], 'files': {'event_ids_file': {**file, **change}}}, {}, {'sub': 'owner'}, 'report')
    assert not objects
    s3.generate_presigned_url.assert_not_called()


def test_missing_changed_and_unversioned_uploads_cannot_start_a_job(uploads):
    deployment, _, s3, file = uploads
    upload = prepare(uploads)
    for head in [
        {'ContentLength': file['size'] + 1, 'ChecksumSHA256': file['sha256'], 'VersionId': 'v1'},
        {'ContentLength': file['size'], 'ChecksumSHA256': 'changed', 'VersionId': 'v1'},
        {'ContentLength': file['size'], 'ChecksumSHA256': file['sha256']},
    ]:
        s3.head_object.return_value = head
        with pytest.raises(api.Rejected):
            api.uploaded_files('report', deployment, {'event_ids_file': file['filename']}, upload['upload_id'], 'owner@example.test')
    with pytest.raises(api.Rejected):
        api.uploaded_files('report', deployment, {'event_ids_file': file['filename']}, None, 'owner@example.test')
