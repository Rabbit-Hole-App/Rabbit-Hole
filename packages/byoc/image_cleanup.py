"""Customer-local retirement of replaced job image tags. Never deletes app data."""
import json
import os
import re
import time
from datetime import datetime

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError


class ImageCleanup:
    def __init__(self, client, bucket, repository, cluster, first_app, revision):
        self.client, self.bucket, self.repository = client, bucket, repository
        self.cluster, self.first_app, self.revision = cluster, first_app, revision
        self.count = 0

    def read(self, key):
        obj = self.client('s3').get_object(Bucket=self.bucket, Key=key)
        body = obj['Body']
        try:
            raw = body.read(131073)
        finally:
            body.close()
        if len(raw) > 131072:
            raise RuntimeError('Image inventory record exceeds limit')
        return json.loads(raw), obj

    def prefixes(self, prefix):
        result, token = [], None
        for _ in range(20):
            page = self.client('s3').list_objects_v2(Bucket=self.bucket, Prefix=prefix,
                Delimiter='/', MaxKeys=1000, **({'ContinuationToken': token} if token else {}))
            result.extend(row['Prefix'] for row in page.get('CommonPrefixes', []))
            token = page.get('NextContinuationToken')
            if not token:
                if page.get('IsTruncated'):
                    break
                return result
        raise RuntimeError('Image inventory is incomplete')

    def records(self, prefix):
        rows = []
        for folder in self.prefixes(prefix):
            self.count += 1
            if self.count > 2000:
                raise RuntimeError('Image inventory exceeds limit')
            doc, obj = self.read(folder + 'record.json')
            doc['_modified_at'] = obj['LastModified'].timestamp()
            rows.append(doc)
        return rows

    def activated(self, now, dry_run):
        key = '_image_cleanup/activation.json'
        try:
            state, obj = self.read(key)
            condition = {'IfMatch': obj['ETag']}
        except ClientError as error:
            if error.response['Error']['Code'] not in ('NoSuchKey', '404'):
                raise
            state, condition = {}, {'IfNoneMatch': '*'}
        if state.get('revision') != self.revision:
            if not dry_run:
                self.client('s3').put_object(Bucket=self.bucket, Key=key,
                    Body=json.dumps({'revision': self.revision, 'not_before': now + 120}).encode(),
                    ContentType='application/json', **condition)
            return False
        return now >= state['not_before']

    def active_deployments(self, deployments):
        """Also cover tasks whose launch response was lost before its ARN was saved."""
        ecs, token, arns = self.client('ecs'), None, []
        for _ in range(20):
            page = ecs.list_tasks(cluster=self.cluster, desiredStatus='RUNNING',
                                  **({'nextToken': token} if token else {}))
            arns.extend(page.get('taskArns', []))
            token = page.get('nextToken')
            if not token:
                break
        if token:
            raise RuntimeError('Task inventory is incomplete')
        by_definition = {d['task_definition']: d['id'] for d in deployments if d.get('task_definition')}
        active = set()
        for start in range(0, len(arns), 100):
            wanted = arns[start:start + 100]
            result = ecs.describe_tasks(cluster=self.cluster, tasks=wanted)
            if result.get('failures') or len(result.get('tasks', [])) != len(wanted):
                raise RuntimeError('Task inventory is incomplete')
            for task in result['tasks']:
                if task.get('lastStatus') == 'STOPPED':
                    continue
                deployed = by_definition.get(task.get('taskDefinitionArn'))
                if not deployed:
                    raise RuntimeError('Task image is unknown')
                active.add(deployed)
        return active

    def image_tag(self, doc):
        tag = doc.get('image_tag')
        if not tag and doc.get('build_id'):
            builds = self.client('codebuild').batch_get_builds(ids=[doc['build_id']]).get('builds', [])
            build = next((b for b in builds if b['id'] == doc['build_id']), {})
            if type(build.get('buildNumber')) is int:
                tag = 'build-' + str(build['buildNumber'])
        return tag if isinstance(tag, str) and re.fullmatch(r'build-[1-9][0-9]*', tag) else None

    def run(self, now=None, dry_run=False):
        now = time.time() if now is None else now
        self.count = 0
        result = {'delete_tags': [], 'deleted_tags': [], 'failures': []}
        if not self.activated(now, dry_run):
            return {**result, 'waiting_for_activation': True}
        apps = {self.first_app: ''}
        for prefix in self.prefixes('apps/'):
            name = prefix.split('/')[1]
            if not re.fullmatch(r'[a-z0-9-]{1,40}', name):
                raise RuntimeError('Invalid app inventory')
            if name != self.first_app:
                apps[name] = prefix
        protected, candidates, inventories = set(), [], {}
        for app, prefix in apps.items():
            docs = self.records(prefix + 'deploys/')
            inventories[app] = {d['id']: d for d in docs}
            ready = sorted((d for d in docs if d['status'] == 'ready'), key=lambda d: d['id'], reverse=True)
            # Only successfully published, replaced deployments are candidates.
            protected.update(d['id'] for d in docs if d['status'] not in ('ready', 'failed'))
            if not ready:
                continue
            current = ready[0]
            protected.add(current['id'])
            published = datetime.fromisoformat(current['ready_at']).timestamp() if current.get('ready_at') else current['_modified_at']
            if published > now - 120:
                protected.update(d['id'] for d in ready)
            else:
                candidates.extend(ready[1:])
        if not candidates:
            return result
        for app, prefix in apps.items():
            for run in self.records(prefix + 'runs/'):
                legacy_uncertain = (run['status'] == 'failed' and not run.get('task_arn')
                    and run.get('reason') == 'AWS could not start the task' and not run.get('launch_rejected'))
                if run['status'] in ('finished', 'failed', 'stopped') and not run.get('launch_uncertain') and not legacy_uncertain:
                    continue
                doc = inventories[app].get(run['deploy_id'])
                if not doc or not doc.get('image'):
                    raise RuntimeError('Run deployment is missing from inventory')
                tasks = self.client('ecs').describe_tasks(cluster=self.cluster, tasks=[run['task_arn']]) if run.get('task_arn') else {}
                task = next((t for t in tasks.get('tasks', []) if t.get('taskArn') == run.get('task_arn')), {})
                if task.get('lastStatus') != 'STOPPED' or tasks.get('failures'):
                    protected.add(doc['id'])
        all_docs = [d for docs in inventories.values() for d in docs.values()]
        protected.update(self.active_deployments(all_docs))
        protected_tags, uncertain_images = set(), set()
        for doc in all_docs:
            if doc['id'] in protected:
                tag = self.image_tag(doc)
                if tag:
                    protected_tags.add(tag)
                else:
                    uncertain_images.add(doc.get('image'))
        repository = self.repository.split('/', 1)[1]
        verified = set()
        for doc in candidates:
            image = doc.get('image', '')
            if doc['id'] in protected or image in uncertain_images or not re.fullmatch(re.escape(self.repository) + r'@sha256:[a-f0-9]{64}', image):
                continue
            tag = self.image_tag(doc)
            if not tag or tag in protected_tags:
                continue
            try:
                details = self.client('ecr').describe_images(repositoryName=repository, imageIds=[{'imageTag': tag}])['imageDetails']
            except ClientError as error:
                if error.response['Error']['Code'] == 'ImageNotFoundException':
                    continue
                raise
            if len(details) == 1 and details[0]['imageDigest'] == image.split('@')[1]:
                verified.add(tag)
        result['delete_tags'] = sorted(verified)
        if dry_run:
            return result
        # All inventories and candidate checks complete before the first delete.
        # Only remove this build's immutable tag; a concurrent new tag survives.
        for tag in result['delete_tags']:
            response = self.client('ecr').batch_delete_image(repositoryName=repository, imageIds=[{'imageTag': tag}])
            result['deleted_tags'].extend(i['imageTag'] for i in response.get('imageIds', []))
            result['failures'].extend({'tag': tag, 'code': f['failureCode']} for f in response.get('failures', []))
        return result


def handler(event, context):
    clients = {}
    def client(service):
        if service not in clients:
            clients[service] = boto3.client(service, config=Config(connect_timeout=2, read_timeout=5, retries={'max_attempts': 2}))
        return clients[service]
    worker = ImageCleanup(client, os.environ['BUCKET'], os.environ['REPOSITORY'], os.environ['CLUSTER'],
                          os.environ['JOB_NAME'], os.environ['RETENTION_REVISION'])
    result = worker.run(dry_run=event.get('dry_run') is True)
    print(json.dumps(result))
    return result
