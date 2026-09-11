import json
import pytest

from grants import normalize_grants, stored_grants, grant_policy, check_protected


@pytest.mark.parametrize('resource', ['arn:aws:s3:::live-data', 'arn:aws:s3:::live-data/*',
    'arn:aws:s3:::live-data/reports/output.json', 'arn:aws:lambda:us-east-1:234567890123:function:live-small-api'])
def test_dev_cannot_request_protected_live_resources(monkeypatch, resource):
    monkeypatch.setenv('SMALL_PROTECTED_RESOURCE_ARNS', json.dumps(['arn:aws:s3:::live-data',
        'arn:aws:s3:::live-data/*', 'arn:aws:lambda:us-east-1:234567890123:function:live-small-*']))
    with pytest.raises(ValueError, match='installation resources'):
        check_protected([{'action': 's3:GetObject', 'resource': resource}])
    check_protected([{'action': 's3:GetObject', 'resource': 'arn:aws:s3:::dev-data/test/sample.csv'}])


@pytest.mark.parametrize("account", ["123456789012", "234567890123"])
def test_same_contract_supports_each_customers_resources(account):
    grants = [
        {"action": "s3:PutObject", "resource": "arn:aws:s3:::customer-jobs/jobs/*"},
        {"action": "s3:GetObject", "resource": "arn:aws:s3:::customer-jobs/*"},
        {"action": "s3:ListBucket", "resource": "arn:aws:s3:::customer-jobs"},
        {"action": "lambda:InvokeFunction", "resource": f"arn:aws:lambda:us-east-1:{account}:function:launcher"},
        {"action": "ecs:DescribeTasks", "resource": f"arn:aws:ecs:us-east-1:{account}:task/customer-cluster/*"},
    ]
    normalized = normalize_grants(grants, account, "us-east-1")
    assert normalized == normalize_grants(list(reversed(grants)) + grants, account, "us-east-1")
    policy = grant_policy(normalized)
    allows = [s for s in policy if s["Effect"] == "Allow"]
    assert {s["Action"] for s in allows} == {g["action"] for g in grants}
    for statement in allows:
        assert any(s["Effect"] == "Deny" and s["Action"] == statement["Action"]
                   and s.get("NotResource") == statement["Resource"] for s in policy)


@pytest.mark.parametrize("action,resource", [
    ("iam:PassRole", "*"), ("s3:*", "arn:aws:s3:::customer-jobs/*"),
    ("s3:GetObject", "arn:aws:s3:::*/*"), ("s3:PutObject", "arn:aws:s3:::customer-jobs/jobs*"),
    ("s3:GetObject", "arn:aws:s3:::customer-jobs/${aws:username}/*"),
    ("s3:GetObject", "arn:aws:s3:::customer-jobs/folder/../private/*"),
    ("s3:ListBucket", "arn:aws:s3:::customer-jobs/*"),
    ("lambda:InvokeFunction", "arn:aws:lambda:us-east-1:999999999999:function:launcher"),
    ("lambda:InvokeFunction", "arn:aws:lambda:us-west-2:123456789012:function:launcher"),
    ("lambda:InvokeFunction", "arn:aws:lambda:us-east-1:123456789012:function:*"),
    ("ecs:DescribeTasks", "arn:aws:ecs:us-east-1:123456789012:task/*"),
])
def test_wildcard_actions_foreign_accounts_regions_and_ambiguous_resources_fail(action, resource):
    with pytest.raises(ValueError):
        normalize_grants([{"action": action, "resource": resource}], "123456789012", "us-east-1")


def test_legacy_read_and_empty_access_stay_compatible_and_deny_other_actions():
    legacy = stored_grants("s3://customer-jobs/reports/", "123456789012", "us-east-1")
    assert legacy == [{"action": "s3:GetObject", "resource": "arn:aws:s3:::customer-jobs/reports/*"}]
    assert stored_grants(None, "123456789012", "us-east-1") == []
    assert grant_policy([]) == [{"Effect": "Deny", "Action": "*", "Resource": "*"}]
    assert any(s["Effect"] == "Deny" and s.get("NotAction") == ["s3:GetObject"] and s["Resource"] == "*"
               for s in grant_policy(legacy))


def test_unknown_fields_and_overlarge_requests_fail():
    with pytest.raises(ValueError):
        normalize_grants([{"action": "s3:GetObject", "resource": "arn:aws:s3:::customer-jobs/*", "effect": "Allow"}], "123456789012", "us-east-1")
    with pytest.raises(ValueError):
        normalize_grants([{"action": "s3:GetObject", "resource": "arn:aws:s3:::customer-jobs/*"}] * 21, "123456789012", "us-east-1")


def test_customer_can_enable_another_scoped_action_without_changing_small_code():
    grant = {"action": "dynamodb:GetItem", "resource": "arn:aws:dynamodb:us-east-1:234567890123:table/orders"}
    with pytest.raises(ValueError, match="not enabled"):
        normalize_grants([grant], "234567890123", "us-east-1", allowed_actions=["s3:GetObject"])
    assert normalize_grants([grant], "234567890123", "us-east-1", allowed_actions=["dynamodb:GetItem"]) == [grant]
    policy = grant_policy([grant])
    assert policy[-1] == {"Effect": "Deny", "NotAction": ["dynamodb:GetItem"], "Resource": "*"}
