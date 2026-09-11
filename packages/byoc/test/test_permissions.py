import copy
import importlib.util
import json
from pathlib import Path

import pytest
from unittest.mock import Mock
from botocore.exceptions import ClientError

spec = importlib.util.spec_from_file_location("permissions", Path(__file__).parents[1] / "permissions.py")
permissions = importlib.util.module_from_spec(spec)
spec.loader.exec_module(permissions)


class Database:
    def __init__(self):
        self.items = {}

    def get_item(self, **args):
        assert args["ConsistentRead"] is True
        return {"Item": copy.deepcopy(self.items.get(args["Key"]["id"]["S"], {}))}

    def put_item(self, **args):
        key = args["Item"]["id"]["S"]
        old = self.items.get(key)
        if args.get("ConditionExpression") == "attribute_not_exists(id)":
            assert old is None
        else:
            assert old["revision"] == args["ExpressionAttributeValues"][":revision"]
        self.items[key] = copy.deepcopy(args["Item"])

    def transact_write_items(self, **args):
        for item in args["TransactItems"]:
            self.put_item(**item["Put"])

    def state(self):
        return json.loads(self.items["state"]["payload"]["S"])


class IAM:
    def __init__(self):
        self.roles, self.policies = {}, {}
        self.fail = False

    def create_role(self, **args):
        if args["RoleName"] in self.roles:
            raise ClientError({"Error": {"Code": "EntityAlreadyExists"}}, "CreateRole")
        self.roles[args["RoleName"]] = {"PermissionsBoundary": {"PermissionsBoundaryArn": args["PermissionsBoundary"]},
            "AssumeRolePolicyDocument": json.loads(args["AssumeRolePolicyDocument"])}

    def get_role(self, **args):
        return {"Role": self.roles[args["RoleName"]]}

    def put_role_policy(self, **args):
        if self.fail:
            raise RuntimeError("AWS unavailable")
        self.policies[args["RoleName"]] = json.loads(args["PolicyDocument"])


@pytest.fixture
def fixture(monkeypatch):
    for name, value in {"INSTALLATION_ID": "a" * 32, "WORKSPACE": "w-team", "OWNER": "owner@example.com",
        "ACCOUNT_ID": "123456789012", "AWS_REGION": "us-east-1", "ACCESS_TABLE": "permissions",
        "ACCESS_ROLE_PREFIX": "small-s3-aaaaaaaaaaaa-", "ACCESS_BOUNDARY": "arn:aws:iam::123456789012:policy/boundary",
        "S3_ACCESS": '{"legacy":"s3://company-data/old/"}', "APP_ACCESS_ROLE_PREFIX": "small-app-aaaaaaaaaaaa-",
        "APP_ACCESS_BOUNDARY": "arn:aws:iam::123456789012:policy/app-boundary",
        "APP_GRANT_ACTIONS": "s3:GetObject,s3:PutObject,s3:ListBucket,lambda:InvokeFunction,ecs:DescribeTasks"}.items():
        monkeypatch.setenv(name, value)
    db, iam = Database(), IAM()
    analyzer = Mock(); analyzer.validate_policy.return_value = {"findings": []}
    monkeypatch.setattr(permissions.boto3, "client", lambda service: {"dynamodb": db, "iam": iam, "accessanalyzer": analyzer}[service])
    event = {"installation_id": "a" * 32, "org": "w-team", "email": "owner@example.com", "request_id": "b" * 32,
        "app_name": "report", "s3_read": "s3://company-data/reports/", "previous_s3_read": None}
    return event, db, iam


@pytest.mark.parametrize("field,value", [("org", "w-other"), ("email", "viewer@example.com"), ("installation_id", "c" * 32),
    ("s3_read", "s3://company-data/*"), ("s3_read", "s3://company-data/"), ("s3_read", "s3://company-data/reports//"),
    ("s3_read", "s3://company-data/reports/../private"), ("app_name", "../../admin"), ("request_id", "not-an-id"), ("role_arn", "admin")])
def test_rejects_unapproved_identity_or_scope_before_aws_writes(fixture, field, value):
    event, db, iam = fixture
    event[field] = value
    assert permissions.handler(event, None)["status"] in (400, 403)
    assert not db.items and not iam.roles


def test_approval_uses_fixed_role_boundary_exact_folder_and_durable_audit(fixture):
    event, db, iam = fixture
    assert permissions.handler(event, None) == {"ok": True}
    assert db.state()["apps"] == {"report": "s3://company-data/reports/"}
    audit = json.loads(db.items["approval:" + event["request_id"]]["payload"]["S"])
    assert audit["approved_by"] == event["email"] and audit["approved_at"] > 0
    policy = iam.policies["small-s3-aaaaaaaaaaaa-report"]["Statement"]
    assert policy[0] == {"Effect": "Allow", "Action": "s3:GetObject", "Resource": "arn:aws:s3:::company-data/reports/*"}
    assert policy[1]["NotResource"] == policy[0]["Resource"]
    before = copy.deepcopy(db.items)
    assert permissions.handler(event, None) == {"ok": True}
    assert db.items == before


def test_failure_keeps_exact_request_for_retry_and_blocks_other_changes(fixture):
    event, db, iam = fixture
    iam.fail = True
    with pytest.raises(RuntimeError):
        permissions.handler(event, None)
    assert db.state()["pending"]["request_id"] == event["request_id"]
    assert db.state()["apps"] == {}
    assert permissions.handler({**event, "app_name": "other"}, None)["status"] == 409
    iam.fail = False
    assert permissions.handler(event, None) == {"ok": True}
    assert "pending" not in db.state()


def test_removal_revokes_managed_role_and_old_approval_cannot_replay(fixture):
    event, db, iam = fixture
    permissions.handler(event, None)
    removal = {**event, "request_id": "c" * 32, "previous_s3_read": event["s3_read"], "s3_read": None}
    assert permissions.handler(removal, None) == {"ok": True}
    assert iam.policies["small-s3-aaaaaaaaaaaa-report"]["Statement"] == [{"Effect": "Deny", "Action": "*", "Resource": "*"}]
    assert permissions.handler(event, None)["status"] == 409
    assert db.state()["apps"]["report"] is None


def test_stale_base_does_not_change_any_permissions(fixture):
    event, db, iam = fixture
    assert permissions.handler({**event, "app_name": "legacy"}, None)["status"] == 409
    assert not db.items and not iam.roles


def test_second_app_approval_preserves_first_apps_policy_and_audit(fixture):
    event, db, iam = fixture
    permissions.handler(event, None)
    first_policy = copy.deepcopy(iam.policies['small-s3-aaaaaaaaaaaa-report'])
    first_audit = copy.deepcopy(db.items['approval:' + event['request_id']])
    other = {**event, 'app_name': 'other', 'request_id': 'd' * 32, 's3_read': 's3://company-data/other/'}
    assert permissions.handler(other, None) == {'ok': True}
    assert db.state()['apps'] == {'report': event['s3_read'], 'other': other['s3_read']}
    assert iam.policies['small-s3-aaaaaaaaaaaa-report'] == first_policy
    assert db.items['approval:' + event['request_id']] == first_audit
    assert iam.policies['small-s3-aaaaaaaaaaaa-other']['Statement'][1]['NotResource'] == 'arn:aws:s3:::company-data/other/*'


@pytest.mark.parametrize("account", ["123456789012", "234567890123"])
def test_general_grants_are_bound_to_the_installation_and_revoked_together(fixture, monkeypatch, account):
    event, db, iam = fixture
    monkeypatch.setenv("ACCOUNT_ID", account)
    monkeypatch.setenv("APP_GRANTS", "v1")
    permissions.handler(event, None)
    legacy = copy.deepcopy(iam.policies["small-s3-aaaaaaaaaaaa-report"])
    grant = {"action": "lambda:InvokeFunction", "resource": f"arn:aws:lambda:us-east-1:{account}:function:launcher"}
    request = {k: v for k, v in event.items() if k not in ("s3_read", "previous_s3_read")}
    request.update(app_name="second", request_id="e" * 32, grants=[grant], previous_grants=None)
    assert permissions.handler(request, None) == {"ok": True}
    assert db.state()["apps"]["second"] == [grant]
    assert iam.policies["small-s3-aaaaaaaaaaaa-report"] == legacy
    assert iam.roles["small-app-aaaaaaaaaaaa-second"]["AssumeRolePolicyDocument"]["Statement"][0]["Condition"]["StringEquals"]["aws:SourceAccount"] == account
    foreign = {**grant, "resource": "arn:aws:lambda:us-east-1:999999999999:function:launcher"}
    assert permissions.handler({**request, "grants": [foreign]}, None)["status"] == 400
    assert permissions.handler({**request, "request_id": "f" * 32, "previous_grants": [grant], "grants": []}, None) == {"ok": True}
    assert iam.policies["small-app-aaaaaaaaaaaa-second"]["Statement"] == [{"Effect": "Deny", "Action": "*", "Resource": "*"}]
    assert permissions.handler(request, None)["status"] == 409


def test_migrating_roles_revokes_old_policy_and_retries_partial_conversion(fixture, monkeypatch):
    event, db, iam = fixture
    monkeypatch.setenv("APP_GRANTS", "v1")
    permissions.handler(event, None)
    grant = {"action": "s3:GetObject", "resource": "arn:aws:s3:::company-data/reports/*"}
    request = {k: v for k, v in event.items() if k not in ("s3_read", "previous_s3_read")}
    request.update(request_id="e" * 32, grants=[grant], previous_grants=event["s3_read"])
    original = iam.put_role_policy
    def fail_old_role(**kw):
        if kw["RoleName"].startswith("small-s3-"):
            raise RuntimeError("AWS unavailable")
        original(**kw)
    monkeypatch.setattr(iam, "put_role_policy", fail_old_role)
    with pytest.raises(RuntimeError):
        permissions.handler(request, None)
    assert db.state()["apps"]["report"] == event["s3_read"] and db.state()["pending"]
    monkeypatch.setattr(iam, "put_role_policy", original)
    assert permissions.handler(request, None) == {"ok": True}
    assert iam.policies["small-s3-aaaaaaaaaaaa-report"]["Statement"] == [{"Effect": "Deny", "Action": "*", "Resource": "*"}]
    assert db.state()["apps"]["report"] == [grant]
    back = {**event, "request_id": "f" * 32, "previous_s3_read": [grant]}
    assert permissions.handler(back, None) == {"ok": True}
    assert iam.policies["small-app-aaaaaaaaaaaa-report"]["Statement"] == [{"Effect": "Deny", "Action": "*", "Resource": "*"}]
