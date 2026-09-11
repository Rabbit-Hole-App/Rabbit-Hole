"""Run chat permissions and history, with deterministic AWS boundary doubles."""
import copy
import io
import json
import time
from unittest.mock import Mock

import pytest
from botocore.exceptions import ClientError, ReadTimeoutError

import private_api as gateway
import private_chat
from private_chat import PrivateChat, ChatDenied


RUN = 'r-1789086976562-f5400d4c418f'
SCOPE = {'app': 'proof', 'run': RUN}
MEMBER = {'sub': 'owner-sub', 'email': 'owner@example.test', 'role': 'owner'}


class ChatTable:
    def __init__(self):
        self.items = {}

    def get_item(self, **kw):
        return {'Item': copy.deepcopy(self.items.get(tuple(kw['Key'].values()), {}))}

    def put_item(self, **kw):
        row = kw['Item']
        key = (row['owner'], row['id'])
        before = self.items.get(key)
        expected = kw.get('ExpressionAttributeValues', {}).get(':version')
        if (expected is None and before) or (expected is not None and (not before or before['version'] != expected)):
            raise ClientError({'Error': {'Code': 'ConditionalCheckFailedException'}}, 'PutItem')
        self.items[key] = copy.deepcopy(row)

    def update_item(self, **kw):
        key = tuple(kw['Key'].values())
        vals = kw['ExpressionAttributeValues']
        row = self.items.setdefault(key, {})
        if ':limit' in vals:
            if row.get('requests', 0) >= vals[':limit']:
                raise ClientError({'Error': {'Code': 'ConditionalCheckFailedException'}}, 'UpdateItem')
            row['requests'] = row.get('requests', 0) + 1
        else:
            row['title'] = vals[':title']
            row['version'] += 1

    def delete_item(self, **kw):
        self.items.pop(tuple(kw['Key'].values()), None)

    def query(self, **kw):
        values = kw['ExpressionAttributeValues']
        return {'Items': [copy.deepcopy(r) for (owner, key), r in self.items.items()
                          if owner == values[':owner'] and key.startswith('t-')]}


@pytest.fixture
def chat(monkeypatch):
    monkeypatch.setenv('WORKSPACE', 'w-test')
    db, model = ChatTable(), Mock(return_value='The run finished with exit 0.\nSources: run ' + RUN)
    context = Mock(return_value={'run': {'run_id': RUN, 'status': 'finished', 'inputs': {'count': 8}},
                                 'log': ['Computed 8 squares'], 'outputs': [{'name': 'report.json', 'text': '{"sum":204}'}]})
    allowed = {'proof'}
    def check_app(name):
        if name not in allowed:
            raise ChatDenied(404, 'No such app.')
    service = PrivateChat(db, MEMBER, check_app, context, model)
    return service, db, model, context, allowed


def ask(service, **changes):
    return service.handle('POST', '/api/ask', {'scope': SCOPE, 'message': 'What happened?', **changes}, {})


def test_answer_and_followup_use_saved_history_and_only_verified_context(chat):
    service, db, model, context, _ = chat
    first = ask(service)
    assert 'exit 0' in first['answer']
    assert context.call_args.args == ('proof', RUN, ['log', 'outputs'])
    second = ask(service, thread_id=first['threadId'], message='What was the sum?')
    assert second['threadId'] == first['threadId']
    assert 'What happened?' in json.dumps(model.call_args.args)
    assert 'sum' in json.dumps(model.call_args.args)
    saved = service.handle('GET', '/api/ask/threads/' + first['threadId'], {}, {})
    assert [m['role'] for m in saved['messages']] == ['user', 'assistant', 'user', 'assistant']
    assert len(db.items) == 2  # one chat and one per-user minute quota


def test_visibility_checked_before_context_or_model_and_again_for_history(chat):
    service, _, model, context, allowed = chat
    with pytest.raises(ChatDenied) as error:
        ask(service, scope={'app': 'hidden', 'run': RUN})
    assert error.value.status == 404
    model.assert_not_called()
    context.assert_not_called()
    result = ask(service)
    allowed.clear()
    with pytest.raises(ChatDenied):
        service.handle('GET', '/api/ask/threads/' + result['threadId'], {}, {})


def test_another_user_or_run_cannot_reuse_a_chat(chat):
    service, db, model, context, _ = chat
    result = ask(service)
    before = model.call_count
    stranger = PrivateChat(db, {**MEMBER, 'sub': 'another-user'}, lambda _: None, context, model)
    with pytest.raises(ChatDenied):
        stranger.handle('GET', '/api/ask/threads/' + result['threadId'], {}, {})
    with pytest.raises(ChatDenied):
        ask(service, thread_id=result['threadId'], scope={**SCOPE, 'run': 'r-1789086976562-000000000000'})
    assert model.call_count == before


def test_source_selection_and_known_credentials_are_removed_before_model_and_storage(chat):
    service, db, model, context, _ = chat
    context.return_value = {'run': {'inputs': {'password': 'do-not-send'}}, 'log': ['Authorization: Bearer secret-value']}
    ask(service, message='api_key=do-not-store What failed?', sources=[])
    assert context.call_args.args[2] == []
    text = json.dumps(model.call_args.args) + json.dumps(list(db.items.values()))
    assert 'do-not-send' not in text and 'do-not-store' not in text and 'secret-value' not in text


def test_quoted_credentials_in_json_logs_are_redacted(chat):
    service, db, model, context, _ = chat
    context.return_value = {'log': ['{"AWS_SECRET_ACCESS_KEY":"do-not-send", "API_KEY":"private-key"}']}
    ask(service)
    text = json.dumps(model.call_args.args) + json.dumps(list(db.items.values()))
    assert 'do-not-send' not in text and 'private-key' not in text


@pytest.mark.parametrize('change', [
    {'message': ''}, {'message': 'x' * 4001}, {'message': []},
    {'scope': {'app': 'proof', 'run': None}}, {'scope': {**SCOPE, 'org': 'elsewhere'}},
    {'sources': ['code']}, {'model': 'unapproved-model'}, {'thread_id': '../another'},
    {'attachments': [{'url': 'http://169.254.169.254/'}]},
])
def test_invalid_requests_do_not_call_a_model(chat, change):
    service, _, model, context, _ = chat
    with pytest.raises(ChatDenied):
        ask(service, **change)
    model.assert_not_called()
    context.assert_not_called()


def test_new_chat_history_rename_delete_and_expiry(chat):
    service, db, _, _, _ = chat
    result = ask(service)
    path = '/api/ask/threads/' + result['threadId']
    service.handle('POST', path + '/rename', {'title': 'My run'}, {})
    history = service.handle('GET', '/api/ask/threads', {}, {'scope': 'run', 'ref': RUN, 'app': 'proof'})
    assert [row['title'] for row in history['threads']] == ['My run']
    assert 'messages' not in history['threads'][0]
    service.handle('POST', path + '/delete', {}, {})
    with pytest.raises(ChatDenied):
        service.handle('GET', path, {}, {})
    another = ask(service)
    row = next(r for r in db.items.values() if r.get('id') == another['threadId'])
    row['expires_at'] = 1
    with pytest.raises(ChatDenied):
        service.handle('GET', '/api/ask/threads/' + another['threadId'], {}, {})


def test_app_chat_uses_app_evidence_and_keeps_run_history_separate(chat):
    service, _, model, context, _ = chat
    run_chat = ask(service)
    context.return_value = {'app': 'proof', 'deployment': {'entry': 'job.py', 'inputs': {'count': {'type': 'number'}}}}
    model.return_value = 'Enter a count in Run. The source and design reasons are not available.\nSources: Job definition'
    app_chat = ask(service, scope={'app': 'proof'}, message='How do I use this app?')
    assert context.call_args.args == ('proof', None, ['runs', 'log', 'outputs'])
    assert 'job.py' in model.call_args.args[0]
    followup = ask(service, scope={'app': 'proof'}, thread_id=app_chat['threadId'], message='What input does it need?', sources=[])
    assert followup['threadId'] == app_chat['threadId']
    assert context.call_args.args == ('proof', None, [])
    history = service.handle('GET', '/api/ask/threads', {}, {'scope': 'app', 'ref': 'proof'})
    assert [row['id'] for row in history['threads']] == [app_chat['threadId']]
    run_history = service.handle('GET', '/api/ask/threads', {}, {'scope': 'run', 'ref': RUN, 'app': 'proof'})
    assert [row['id'] for row in run_history['threads']] == [run_chat['threadId']]
    before = model.call_count
    for scope, thread in [({'app': 'proof'}, run_chat), (SCOPE, app_chat)]:
        with pytest.raises(ChatDenied) as error:
            ask(service, scope=scope, thread_id=thread['threadId'])
        assert error.value.status == 409
    assert model.call_count == before


def test_hidden_and_revoked_apps_cannot_read_app_chat(chat):
    service, _, model, context, allowed = chat
    with pytest.raises(ChatDenied):
        ask(service, scope={'app': 'hidden'})
    context.assert_not_called()
    model.assert_not_called()
    result = ask(service, scope={'app': 'proof'})
    allowed.clear()
    for path, query in [('/api/ask/threads', {'scope': 'app', 'ref': 'proof'}),
                        ('/api/ask/threads/' + result['threadId'], {})]:
        with pytest.raises(ChatDenied):
            service.handle('GET', path, {}, query)


def test_quota_prevents_additional_model_invocations(chat):
    service, _, model, _, _ = chat
    for _ in range(10):
        ask(service)
    with pytest.raises(ChatDenied) as error:
        ask(service)
    assert error.value.status == 429
    assert model.call_count == 10


@pytest.mark.parametrize('deleted', [False, True])
def test_concurrent_reply_cannot_overwrite_a_newer_turn_or_resurrect_a_deleted_chat(chat, deleted):
    service, db, model, _, _ = chat
    first = ask(service)
    row = next(r for r in db.items.values() if r.get('id') == first['threadId'])
    def race(*_):
        if deleted:
            db.delete_item(Key=service.key(first['threadId']))
        else:
            row['version'] += 1
        return 'Losing reply'
    model.side_effect = race
    with pytest.raises(ChatDenied) as error:
        ask(service, thread_id=first['threadId'])
    assert error.value.status == 409
    assert 'Losing reply' not in json.dumps(list(db.items.values()))
    if deleted:
        assert not db.get_item(Key=service.key(first['threadId']))['Item']


def test_bedrock_converse_uses_bounded_history_text_only_and_the_configured_model(monkeypatch):
    monkeypatch.setenv('BEDROCK_MODEL_ID', 'approved-model')
    runtime = Mock()
    runtime.converse.return_value = {'output': {'message': {'content': [{'text': 'Done. api_key=private-value'}]}}, 'stopReason': 'end_turn'}
    factory = Mock(return_value=runtime)
    monkeypatch.setattr(private_chat.boto3, 'client', factory)
    turns = [{'role': 'user' if i % 2 == 0 else 'assistant', 'content': str(i)} for i in range(15)]
    answer = private_chat.bedrock_answer('{"run_id":"test","log":"untrusted"}', turns)
    assert 'private-value' not in answer
    options = runtime.converse.call_args.kwargs
    assert options['modelId'] == 'approved-model'
    assert len(options['messages']) == 11 and options['messages'][0]['role'] == 'user'
    assert 'untrusted' in options['messages'][0]['content'][0]['text']
    assert options['messages'][-1]['content'] == [{'text': '14'}]
    assert 'toolConfig' not in options and options['inferenceConfig']['maxTokens'] == 1000
    config = factory.call_args.kwargs['config']
    assert config.read_timeout == 20 and config.retries['max_attempts'] == 0


def test_bedrock_error_does_not_return_or_log_prompts_or_credentials(monkeypatch, capsys):
    monkeypatch.setenv('BEDROCK_MODEL_ID', 'approved-model')
    runtime = Mock()
    runtime.converse.side_effect = ClientError({'Error': {'Code': 'AccessDeniedException', 'Message': 'sensitive-prompt'}}, 'Converse')
    monkeypatch.setattr(private_chat.boto3, 'client', lambda *a, **kw: runtime)
    with pytest.raises(ChatDenied) as error:
        private_chat.bedrock_answer('sensitive-prompt', [{'role': 'user', 'content': 'sensitive-prompt'}])
    assert error.value.status == 503
    assert 'sensitive-prompt' not in error.value.message + capsys.readouterr().out


@pytest.mark.parametrize('response', [{}, {'output': {'message': {'content': [{'text': 'run this'}]}}, 'stopReason': 'tool_use'}])
def test_bedrock_invalid_output_cannot_become_an_action_or_empty_answer(monkeypatch, response):
    monkeypatch.setenv('BEDROCK_MODEL_ID', 'approved-model')
    runtime = Mock()
    runtime.converse.return_value = response
    monkeypatch.setattr(private_chat.boto3, 'client', lambda *a, **kw: runtime)
    with pytest.raises(ChatDenied) as error:
        private_chat.bedrock_answer('evidence', [{'role': 'user', 'content': 'question'}])
    assert error.value.status == 502


@pytest.mark.parametrize('scope,context_path', [(SCOPE, '/runs/' + RUN + '/context'), ({'app': 'proof'}, '/context')])
def test_private_api_authenticates_chat_and_builds_the_job_actor_from_membership(monkeypatch, scope, context_path):
    for key, value in {'COGNITO_POOL_ID': 'us-east-1_TestPool', 'COGNITO_CLIENT_ID': 'testclient',
                      'COGNITO_DOMAIN': 'https://test.auth.us-east-1.amazoncognito.com',
                      'PRIVATE_API_ID': 'api123', 'WORKSPACE': 'w-test', 'CHAT_TABLE': 'chat',
                      'BEDROCK_MODEL_ID': 'test-model', 'JOB_API_FUNCTION': 'job-api'}.items():
        monkeypatch.setenv(key, value)
    metadata, model, invoke = Mock(), Mock(return_value='This run completed.'), Mock()
    rows = {'MEMBER#owner-sub': MEMBER, 'META': {'name': 'Test'},
            'APP#proof': {'name': 'proof', 'owner_sub': 'owner-sub', 'visibility': 'private'}}
    metadata.get_item.side_effect = lambda **kw: {'Item': rows.get(kw['Key']['sk'])}
    monkeypatch.setattr(gateway, 'table', lambda: metadata)
    monkeypatch.setattr(gateway, 'chat_store', lambda: ChatTable(), raising=False)
    monkeypatch.setattr(gateway, 'bedrock_answer', model, raising=False)
    factory = Mock(return_value=invoke)
    monkeypatch.setattr(gateway.boto3, 'client', factory)
    invoke.invoke.side_effect = lambda **_: {'Payload': io.BytesIO(json.dumps({'statusCode': 200,
        'body': json.dumps({'run': {'run_id': RUN, 'status': 'finished'}, 'log': [], 'outputs': []})}).encode())}
    event = {'rawPath': '/api/ask', 'headers': {}, 'body': json.dumps({'scope': scope, 'message': 'What happened?'}),
        'requestContext': {'apiId': 'api123', 'http': {'method': 'POST'}, 'authorizer': {'jwt': {'claims': {
            'sub': 'owner-sub', 'iss': 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_TestPool',
            'client_id': 'testclient', 'token_use': 'access', 'scope': 'openid', 'exp': int(time.time()) + 900}}}}}
    response = gateway.handler(event, None)
    assert response['statusCode'] == 200
    assert 'completed' in json.loads(response['body'])['answer']
    payload = json.loads(invoke.invoke.call_args.kwargs['Payload'])
    assert payload['rawPath'] == '/apps/proof' + context_path
    assert payload['actor']['app'] == 'proof'
    assert payload['actor']['email'] == MEMBER['email']
    assert json.loads(payload['body']) == {}
    config = factory.call_args.kwargs['config']
    assert config.read_timeout <= 5 and config.connect_timeout == 1 and config.retries['max_attempts'] == 0
    model.reset_mock()
    invoke.reset_mock()
    event['requestContext']['authorizer']['jwt']['claims']['token_use'] = 'id'
    assert gateway.handler(event, None)['statusCode'] == 401
    model.assert_not_called()
    invoke.invoke.assert_not_called()
    event['requestContext']['authorizer']['jwt']['claims']['token_use'] = 'access'
    invoke.invoke.side_effect = ReadTimeoutError(endpoint_url='https://sensitive-resource')
    response = gateway.handler(event, None)
    assert response['statusCode'] == 503 and 'evidence' in response['body']
    assert 'sensitive-resource' not in response['body']
    model.assert_not_called()
