import importlib.util
import io
import json
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import Mock

import pytest
from botocore.exceptions import ClientError

spec = importlib.util.spec_from_file_location('image_cleanup', Path(__file__).parents[1] / 'image_cleanup.py')
cleanup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cleanup)

NOW = 2000000000
REPO = '123456789012.dkr.ecr.us-east-1.amazonaws.com/small-test'


class Bucket:
    def __init__(self):
        self.docs = {'_image_cleanup/activation.json': {'revision': 'test', 'not_before': NOW - 1}}
        self.modified = {}
        self.page_size = 2

    def get_object(self, Key, **kwargs):
        if Key not in self.docs:
            raise ClientError({'Error': {'Code': 'NoSuchKey'}}, 'GetObject')
        return {'Body': io.BytesIO(json.dumps(self.docs[Key]).encode()), 'ETag': 'etag',
                'LastModified': datetime.fromtimestamp(self.modified.get(Key, NOW - 1000), timezone.utc)}

    def put_object(self, Key, Body, **kwargs):
        self.docs[Key] = json.loads(Body)

    def list_objects_v2(self, Prefix, **kwargs):
        prefixes = sorted({Prefix + key[len(Prefix):].split('/')[0] + '/'
                           for key in self.docs if key.startswith(Prefix)})
        start = int(kwargs.get('ContinuationToken', 0))
        result = {'CommonPrefixes': [{'Prefix': p} for p in prefixes[start:start + self.page_size]]}
        if start + self.page_size < len(prefixes):
            result.update(IsTruncated=True, NextContinuationToken=str(start + self.page_size))
        return result


@pytest.fixture
def setup():
    s3, ecs, ecr, build = Bucket(), Mock(), Mock(), Mock()
    images = {}
    ecs.list_tasks.return_value = {'taskArns': []}
    ecs.describe_tasks.return_value = {'tasks': [], 'failures': []}
    build.batch_get_builds.return_value = {'builds': []}
    def describe(imageIds, **kwargs):
        tag = imageIds[0]['imageTag']
        if tag not in images:
            raise ClientError({'Error': {'Code': 'ImageNotFoundException'}}, 'DescribeImages')
        return {'imageDetails': [{'imageDigest': images[tag], 'imageTags': [tag]}]}
    def delete(imageIds, **kwargs):
        for item in imageIds:
            assert set(item) == {'imageTag'}
            images.pop(item['imageTag'], None)
        return {'imageIds': imageIds, 'failures': []}
    ecr.describe_images.side_effect = describe
    ecr.batch_delete_image.side_effect = delete
    worker = cleanup.ImageCleanup({'s3': s3, 'ecs': ecs, 'ecr': ecr, 'codebuild': build}.__getitem__,
                                  'fixture', REPO, 'cluster', 'first-app', 'test')
    def deploy(app, n, status='ready', digest=None, age=1000):
        ident = 'd-%013d-%012x' % (1788980000000 + n, n)
        digest = digest or ('sha256:' + ('%064x' % n))
        doc = {'id': ident, 'status': status, 'image': REPO + '@' + digest,
               'image_tag': 'build-' + str(n), 'build_id': 'build:' + str(n),
               'ready_at': datetime.fromtimestamp(NOW - age, timezone.utc).isoformat()}
        prefix = '' if app == 'first-app' else 'apps/' + app + '/'
        s3.docs[prefix + 'deploys/' + ident + '/record.json'] = doc
        images[doc['image_tag']] = digest
        return doc
    def run(app, doc, status='starting', task=None):
        prefix = '' if app == 'first-app' else 'apps/' + app + '/'
        s3.docs[prefix + 'runs/r-1788980000000-aaaaaaaaaaaa/record.json'] = {
            'deploy_id': doc['id'], 'status': status, **({'task_arn': task} if task else {})}
    return worker, s3, ecs, ecr, build, images, deploy, run


def test_each_apps_current_survives_and_only_replaced_tag_is_deleted(setup):
    worker, s3, ecs, ecr, build, images, deploy, run = setup
    deploy('first-app', 1)
    deploy('second-app', 2)
    deploy('first-app', 3)
    before = json.dumps(s3.docs, sort_keys=True)
    assert worker.run(now=NOW, dry_run=True)['delete_tags'] == ['build-1']
    assert set(images) == {'build-1', 'build-2', 'build-3'}
    assert worker.run(now=NOW)['deleted_tags'] == ['build-1']
    assert set(images) == {'build-2', 'build-3'}
    assert json.dumps(s3.docs, sort_keys=True) == before


def test_failed_build_does_not_retire_working_deployment(setup):
    worker, _, _, _, _, images, deploy, _ = setup
    deploy('first-app', 1)
    deploy('first-app', 2, status='failed')
    assert worker.run(now=NOW)['deleted_tags'] == []
    assert 'build-1' in images


def test_identical_redeployment_removes_old_tag_and_keeps_current_tag(setup):
    worker, _, _, _, _, images, deploy, _ = setup
    first = deploy('first-app', 1)
    deploy('first-app', 2, digest=first['image'].split('@')[1])
    assert worker.run(now=NOW)['deleted_tags'] == ['build-1']
    assert list(images) == ['build-2']


@pytest.mark.parametrize('status', ['starting', 'running'])
@pytest.mark.parametrize('aws_status', [None, 'PENDING', 'RUNNING'])
def test_unfinished_or_unknown_tasks_keep_replaced_image(setup, status, aws_status):
    worker, _, ecs, _, _, images, deploy, run = setup
    old = deploy('first-app', 1)
    deploy('first-app', 2)
    run('first-app', old, status, 'task/1' if aws_status else None)
    if aws_status:
        ecs.describe_tasks.return_value = {'tasks': [{'taskArn': 'task/1', 'lastStatus': aws_status}]}
    assert worker.run(now=NOW)['deleted_tags'] == []
    assert 'build-1' in images


def test_stopped_job_allows_deletion_and_keeps_history(setup):
    worker, s3, ecs, _, _, images, deploy, run = setup
    old = deploy('first-app', 1)
    deploy('first-app', 2)
    run('first-app', old, task='task/1')
    ecs.describe_tasks.return_value = {'tasks': [{'taskArn': 'task/1', 'lastStatus': 'STOPPED'}]}
    assert worker.run(now=NOW)['deleted_tags'] == ['build-1']
    assert any('/runs/' in '/' + key for key in s3.docs)


def test_recent_replacement_and_first_activation_wait_for_inflight_launches(setup):
    worker, s3, _, _, _, _, deploy, _ = setup
    deploy('first-app', 1)
    deploy('first-app', 2, age=10)
    assert worker.run(now=NOW)['deleted_tags'] == []
    assert worker.run(now=NOW + 121)['deleted_tags'] == ['build-1']
    del s3.docs['_image_cleanup/activation.json']
    assert worker.run(now=NOW)['deleted_tags'] == []
    assert s3.docs['_image_cleanup/activation.json']['not_before'] == NOW + 120


def test_shared_digest_built_version_and_concurrent_new_tag_are_protected(setup):
    worker, _, _, ecr, _, images, deploy, _ = setup
    old = deploy('first-app', 1)
    deploy('first-app', 2)
    deploy('second-app', 3, digest=old['image'].split('@')[1])
    assert worker.run(now=NOW)['deleted_tags'] == ['build-1']
    assert 'build-3' in images
    deploy('second-app', 4)
    # A new build can publish the same digest after inventory was read. Tag
    # deletion must leave its fresh tag intact even though the digest is shared.
    original = ecr.batch_delete_image.side_effect
    def concurrent(**kwargs):
        images['build-5'] = old['image'].split('@')[1]
        return original(**kwargs)
    ecr.batch_delete_image.side_effect = concurrent
    worker.run(now=NOW)
    assert 'build-5' in images


def test_mismatched_tag_or_unknown_legacy_tag_is_not_deleted(setup):
    worker, _, _, _, _, images, deploy, _ = setup
    old = deploy('first-app', 1)
    deploy('first-app', 2)
    images['build-1'] = 'sha256:' + 'f' * 64
    assert worker.run(now=NOW)['deleted_tags'] == []
    del old['image_tag']
    assert worker.run(now=NOW)['deleted_tags'] == []


def test_legacy_tag_resolves_from_build_number(setup):
    worker, _, _, _, build, _, deploy, _ = setup
    old = deploy('first-app', 1)
    del old['image_tag']
    deploy('first-app', 2)
    build.batch_get_builds.return_value = {'builds': [{'id': old['build_id'], 'buildNumber': 1}]}
    assert worker.run(now=NOW)['deleted_tags'] == ['build-1']


def test_incomplete_inventory_or_aws_failure_never_deletes(setup):
    worker, s3, _, ecr, _, images, deploy, _ = setup
    deploy('first-app', 1)
    deploy('first-app', 2)
    s3.list_objects_v2 = Mock(return_value={'CommonPrefixes': [], 'IsTruncated': True, 'NextContinuationToken': 'more'})
    with pytest.raises(RuntimeError, match='inventory'):
        worker.run(now=NOW)
    ecr.batch_delete_image.assert_not_called()


def test_missing_ecs_task_is_retained(setup):
    worker, _, ecs, _, _, _, deploy, run = setup
    old = deploy('first-app', 1)
    deploy('first-app', 2)
    run('first-app', old, task='task/missing')
    ecs.describe_tasks.return_value = {'tasks': [], 'failures': [{'arn': 'task/missing', 'reason': 'MISSING'}]}
    assert worker.run(now=NOW)['deleted_tags'] == []


@pytest.mark.parametrize('status', ['uploading', 'building', 'built', 'unknown'])
def test_nonterminal_deployment_and_its_image_are_never_candidates(setup, status):
    worker, _, _, _, _, images, deploy, _ = setup
    first = deploy('first-app', 1, status=status)
    deploy('first-app', 2)
    assert worker.run(now=NOW)['deleted_tags'] == []
    assert 'build-1' in images
    # An older ready tag for the same digest can go; the unfinished build's
    # own tag still keeps that image available.
    deploy('other', 3, digest=first['image'].split('@')[1])
    deploy('other', 4)
    assert worker.run(now=NOW)['deleted_tags'] == ['build-3']
    assert 'build-1' in images


def test_lost_start_response_and_untracked_active_ecs_task_are_retained(setup):
    worker, s3, ecs, _, _, _, deploy, run = setup
    old = deploy('first-app', 1)
    deploy('first-app', 2)
    run('first-app', old, status='failed')
    next(d for key, d in s3.docs.items() if key.startswith('runs/'))['launch_uncertain'] = True
    assert worker.run(now=NOW)['deleted_tags'] == []
    s3.docs = {key: doc for key, doc in s3.docs.items() if not key.startswith('runs/')}
    old['task_definition'] = 'definition:1'
    ecs.list_tasks.return_value = {'taskArns': ['task/1']}
    ecs.describe_tasks.return_value = {'tasks': [{'taskArn': 'task/1', 'lastStatus': 'RUNNING', 'taskDefinitionArn': 'definition:1'}]}
    assert worker.run(now=NOW)['deleted_tags'] == []
