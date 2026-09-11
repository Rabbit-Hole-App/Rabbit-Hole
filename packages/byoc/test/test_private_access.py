"""Cognito owner approval, exact requests, cancellation races and failure recovery."""
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import time
import unittest
from unittest.mock import Mock, patch

from botocore.exceptions import ClientError

spec = importlib.util.spec_from_file_location("private_access_api", Path(__file__).parents[1] / "private_api.py")
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


class AccessTable:
    def __init__(self):
        self.items = {}

    def conflict(self):
        raise ClientError({"Error": {"Code": "ConditionalCheckFailedException"}}, "WriteItem")

    def get_item(self, **kw):
        assert kw['ConsistentRead']
        return {"Item": copy.deepcopy(self.items.get(kw['Key']['id'], {}))}

    def put_item(self, **kw):
        if kw['Item']['id'] in self.items:
            self.conflict()
        self.items[kw['Item']['id']] = copy.deepcopy(kw['Item'])

    def check(self, kw):
        row = self.items.get(kw['Key']['id'], {})
        values = kw['ExpressionAttributeValues']
        if row.get('request_id') != values[':id'] or (':status' in values and row.get('status') != values[':status']):
            self.conflict()
        return row

    def update_item(self, **kw):
        self.check(kw)['status'] = kw['ExpressionAttributeValues'][':next']

    def delete_item(self, **kw):
        self.check(kw)
        del self.items[kw['Key']['id']]


class PrivateAccessTests(unittest.TestCase):
    def setUp(self):
        env = {"COGNITO_POOL_ID": "us-east-1_TestPool", "COGNITO_CLIENT_ID": "testclient123",
               "COGNITO_DOMAIN": "https://small-test.auth.us-east-1.amazoncognito.com", "PRIVATE_API_ID": "api123",
               "WORKSPACE": "w-small-aws", "METADATA_TABLE": "metadata", "ACCESS_TABLE": "access",
               "ACCESS_FUNCTION": "internal-permissions", "INSTALLATION_ID": "a" * 32}
        p = patch.dict(os.environ, env); p.start(); self.addCleanup(p.stop)
        self.member = {"email": "owner@example.test", "role": "owner"}
        self.metadata, self.access, self.invoke = Mock(), AccessTable(), Mock()
        self.metadata.get_item.side_effect = lambda **kw: {"Item": self.member if kw['Key']['sk'].startswith('MEMBER#') else {"name": "Small AWS"}}
        for name, value in [('table', self.metadata), ('access_table', self.access)]:
            p = patch.object(api, name, return_value=value, create=True); p.start(); self.addCleanup(p.stop)
        p = patch.object(api.boto3, 'client', return_value=self.invoke); p.start(); self.addCleanup(p.stop)
        self.invoke.invoke.side_effect = self.apply
        self.s3 = 's3://customer-data/reports/'

    def call(self, method='GET', suffix='', body=None, workspace=None):
        request = {"rawPath": '/api/byoc/access' + suffix, "headers": {}, "requestContext": {"apiId": "api123",
            "http": {"method": method}, "authorizer": {"jwt": {"claims": {"sub": "owner-sub",
                "iss": "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_TestPool", "client_id": "testclient123",
                "token_use": "access", "scope": "openid", "exp": int(time.time()) + 900}}}}}
        if body is not None: request['body'] = json.dumps(body)
        if workspace: request['headers']['X-Small-Workspace'] = workspace
        response = api.handler(request, None)
        return response['statusCode'], json.loads(response['body'])

    def request(self, **kw):
        status, data = self.call('POST', body={"app_name": "report", "s3_read": self.s3, **kw})
        self.assertEqual(status, 200, data)
        return data['request_id']

    def apply(self, **kw):
        self.assertEqual(kw['FunctionName'], 'internal-permissions')
        change = json.loads(kw['Payload'])
        self.assertEqual(change['email'], 'owner@example.test')
        self.assertEqual(change['installation_id'], 'a' * 32)
        state = json.loads(self.access.items.get('state', {}).get('payload', '{"apps":{}}'))
        field = 'grants' if 'grants' in change else 's3_read'
        state['apps'][change['app_name']] = change[field] or None
        state['last_request'] = change
        state.pop('pending', None)
        self.access.items['state'] = {'id': 'state', 'payload': json.dumps(state)}
        return {'Payload': io.BytesIO(b'{"ok":true}')}

    def test_owner_approves_saved_exact_scope_and_other_app_grants_survive(self):
        self.access.items['state'] = {'payload': json.dumps({'apps': {'other': 's3://customer-data/other/'}})}
        request_id = self.request(s3_read=self.s3.rstrip('/'))
        self.invoke.invoke.assert_not_called()
        status, data = self.call()
        self.assertEqual(data['pending'], {'id': request_id, 'app_name': 'report', 's3_read': self.s3, 'status': 'pending'})
        status, data = self.call('POST', '/approve', {'request_id': request_id})
        self.assertEqual(status, 200, data)
        self.assertEqual(data['approved'], {'report': self.s3, 'other': 's3://customer-data/other/'})
        self.assertIsNone(data['pending'])
        self.assertEqual(self.call('POST', '/approve', {'request_id': request_id})[0], 409)

    def test_non_owner_and_wrong_workspace_cannot_request_or_approve(self):
        for role in ['member', 'removed']:
            self.member['role'] = role
            for suffix, body in [('', {'app_name': 'report', 's3_read': self.s3}), ('/approve', {'request_id': 'b' * 32}), ('/dismiss', {'request_id': 'b' * 32})]:
                self.assertEqual(self.call('POST', suffix, body)[0], 403)
        self.member['role'] = 'owner'
        self.assertEqual(self.call(workspace='w-other')[0], 403)
        self.assertEqual(self.access.items, {})
        self.invoke.invoke.assert_not_called()

    def test_invalid_scope_and_retargeted_approval_do_not_invoke_iam(self):
        for value in ['s3://customer-data/', 's3://customer-data/*', 's3://customer-data/reports/../private/', 's3://customer-data/reports//', 's3://customer-data/reports/${x}', 2]:
            self.assertEqual(self.call('POST', body={'app_name': 'report', 's3_read': value})[0], 400)
        request_id = self.request()
        for body in [{'request_id': 'wrong'}, {'request_id': request_id, 's3_read': 's3://customer-data/private/'}]:
            self.assertIn(self.call('POST', '/approve', body)[0], (400, 409))
        self.invoke.invoke.assert_not_called()

    def test_cancellation_and_concurrent_request_cannot_replace_approved_app(self):
        request_id = self.request()
        self.assertEqual(self.request(), request_id)
        self.assertEqual(self.call('POST', body={'app_name': 'other', 's3_read': self.s3})[0], 409)
        self.assertEqual(self.call('POST', '/dismiss', {'request_id': request_id})[0], 200)
        self.assertEqual(self.call('POST', '/approve', {'request_id': request_id})[0], 409)
        self.assertIsNone(self.call()[1]['pending'])
        self.invoke.invoke.assert_not_called()

    def test_failed_approval_retains_exact_request_for_retry_and_blocks_cancel(self):
        request_id = self.request()
        self.invoke.invoke.side_effect = RuntimeError('sensitive AWS details')
        self.assertEqual(self.call('POST', '/approve', {'request_id': request_id})[0], 503)
        self.assertEqual(self.call()[1]['pending']['status'], 'applying')
        self.assertEqual(self.call('POST', '/dismiss', {'request_id': request_id})[0], 409)
        self.invoke.invoke.side_effect = self.apply
        self.assertEqual(self.call('POST', '/approve', {'request_id': request_id})[0], 200)
        self.assertIsNone(self.call()[1]['pending'])

    def test_stale_grant_and_cancel_racing_approval_never_invoke_iam(self):
        request_id = self.request()
        self.access.items['state'] = {'payload': json.dumps({'apps': {'report': 's3://customer-data/changed/'}})}
        self.assertEqual(self.call()[1]['pending']['status'], 'stale')
        self.assertEqual(self.call('POST', '/approve', {'request_id': request_id})[0], 409)
        self.access.items.pop('state')
        with patch.object(self.access, 'update_item', side_effect=lambda **kw: self.access.conflict()):
            self.assertEqual(self.call('POST', '/approve', {'request_id': request_id})[0], 409)
        self.invoke.invoke.assert_not_called()

    def test_no_s3_cpu_job_and_removal_use_the_same_flow(self):
        status, data = self.call('POST', body={'app_name': 'cpu-job', 's3_read': None})
        self.assertEqual((status, data['status']), (200, 'approved'))
        request_id = self.request()
        self.call('POST', '/approve', {'request_id': request_id})
        removal = self.request(s3_read=None)
        self.assertEqual(self.call('POST', '/approve', {'request_id': removal})[0], 200)
        self.assertNotIn('report', self.call()[1]['approved'])

    def test_configured_actions_bind_exact_resources_and_legacy_conversion_requires_approval(self):
        with patch.dict(os.environ, {'APP_GRANTS': 'v1', 'ACCOUNT_ID': '234567890123',
                                    'APP_GRANT_ACTIONS': 's3:GetObject,dynamodb:GetItem'}):
            self.access.items['state'] = {'payload': json.dumps({'apps': {'report': self.s3}})}
            grants = [{'action': 's3:GetObject', 'resource': 'arn:aws:s3:::customer-data/reports/*'}]
            status, result = self.call('POST', body={'app_name': 'report', 'grants': grants})
            self.assertEqual((status, result['status']), (200, 'pending'))
            self.assertEqual(self.call()[1]['pending']['grants'], grants)
            self.assertEqual(self.call('POST', '/approve', {'request_id': result['request_id']})[0], 200)
            self.assertEqual(self.call()[1]['approved']['report'], grants)
            self.assertEqual(self.call('POST', body={'app_name': 'report', 'grants': grants})[1]['status'], 'approved')
            for grant in [
                {'action': 's3:PutObject', 'resource': 'arn:aws:s3:::customer-data/jobs/*'},
                {'action': 'dynamodb:GetItem', 'resource': 'arn:aws:dynamodb:us-east-1:999999999999:table/orders'},
            ]:
                self.assertEqual(self.call('POST', body={'app_name': 'other', 'grants': [grant]})[0], 400)
            grant = {'action': 'dynamodb:GetItem', 'resource': 'arn:aws:dynamodb:us-east-1:234567890123:table/orders'}
            self.assertEqual(self.call('POST', body={'app_name': 'other', 'grants': [grant]})[0], 200)
            self.assertEqual(self.call('POST', body={'app_name': 'other', 'grants': [], 's3_read': None})[0], 400)

    def test_aws_policy_validation_failure_allows_cancellation(self):
        request_id = self.request()
        self.invoke.invoke.side_effect = lambda **kw: {'Payload': io.BytesIO(b'{"error":"Invalid AWS policy","status":400}')}
        self.assertEqual(self.call('POST', '/approve', {'request_id': request_id})[0], 400)
        self.assertEqual(self.call('POST', '/dismiss', {'request_id': request_id})[0], 200)
