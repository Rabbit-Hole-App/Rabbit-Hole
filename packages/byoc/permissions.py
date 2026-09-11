"""IAM-only S3 approval handler. No access to source, inputs, outputs, or logs."""
import json
import os
import re
import time

import boto3
from botocore.exceptions import ClientError
from grants import normalize_grants, stored_grants, legacy_scope, grant_policy, installed_actions, check_protected


def scope(value):
    return legacy_scope(value)


def handler(event, context):
    field = "grants" if isinstance(event, dict) and "grants" in event else "s3_read"
    keys = {"installation_id", "org", "email", "request_id", "app_name", field, "previous_" + field}
    if not isinstance(event, dict) or set(event) != keys:
        return {"error": "Only permission metadata is accepted", "status": 400}
    if (event["installation_id"] != os.environ["INSTALLATION_ID"] or event["org"] != os.environ["WORKSPACE"]
            or event["email"] != os.environ["OWNER"]):
        return {"error": "Only the installer can approve access", "status": 403}
    if not isinstance(event["app_name"], str) or not re.fullmatch(r"[a-z0-9-]{1,40}", event["app_name"]):
        return {"error": "Invalid app name", "status": 400}
    if not isinstance(event["request_id"], str) or not re.fullmatch(r"[a-f0-9]{32}", event["request_id"]):
        return {"error": "Invalid permission request", "status": 400}
    try:
        account, region = os.environ["ACCOUNT_ID"], os.environ["AWS_REGION"]
        requested = normalize_grants(event[field], account, region, installed_actions()) if field == "grants" else scope(event[field])
        previous = event["previous_" + field]
        stored_grants(previous, account, region)  # validate the exact saved baseline too
        grants = stored_grants(requested, account, region)
        check_protected(grants)
        if field == "grants" and os.environ.get("APP_GRANTS") != "v1":
            raise ValueError("Update this installation to enable app permission grants")
    except ValueError as error:
        return {"error": str(error), "status": 400}
    if field == "grants" and grants:
        # AWS validates new service/action/resource combinations. No customer data
        # enters this request; the input is the exact policy shown for approval.
        result = boto3.client("accessanalyzer").validate_policy(policyDocument=json.dumps({"Version": "2012-10-17", "Statement": grant_policy(grants)}), policyType="IDENTITY_POLICY")
        if result.get("nextToken") or any(f["findingType"] in ("ERROR", "SECURITY_WARNING") for f in result.get("findings", [])):
            return {"error": "AWS rejected this permission policy; review the requested actions and resources", "status": 400}
    table = os.environ["ACCESS_TABLE"]
    db = boto3.client("dynamodb")
    row = db.get_item(TableName=table, Key={"id": {"S": "state"}}, ConsistentRead=True).get("Item", {})
    state = json.loads(row.get("payload", {}).get("S", '{"apps":{}}'))
    revision = int(row.get("revision", {}).get("N", "0"))
    app, request_id = event["app_name"], event["request_id"]
    change = {"app_name": app, "request_id": request_id, field: requested,
              "previous_" + field: previous, "approved_by": event["email"]}
    if state.get("last_request") == change:
        return {"ok": True}
    if state.get("pending"):
        if state["pending"] != change:
            return {"error": "Another permission update is applying; retry that approval first", "status": 409}
    else:
        approved = {**json.loads(os.environ.get("S3_ACCESS", "{}")), **state["apps"]}
        if approved.get(app) != previous:
            return {"error": "Permissions changed; refresh the request", "status": 409}
        approved[app] = requested
        if len(json.dumps({k: v for k, v in approved.items() if v}, separators=(",", ":"))) > 200000:
            return {"error": "Too many app grants for this installation", "status": 400}
        # A completed approval ID cannot be replayed after another change.
        if db.get_item(TableName=table, Key={"id": {"S": "approval:" + request_id}}, ConsistentRead=True).get("Item"):
            return {"error": "This approval was already used", "status": 409}
        state["pending"] = change
        condition = {"ConditionExpression": "revision = :revision", "ExpressionAttributeValues": {":revision": {"N": str(revision)}}} if row else {"ConditionExpression": "attribute_not_exists(id)"}
        revision += 1
        db.put_item(TableName=table, Item={"id": {"S": "state"}, "revision": {"N": str(revision)}, "payload": {"S": json.dumps(state)}}, **condition)

    # The state blocks new runs for this app until IAM and its audit commit.
    # Failed invocations retain this exact request so the same approval can retry.
    iam = boto3.client("iam")
    role_prefix = os.environ["APP_ACCESS_ROLE_PREFIX"] if field == "grants" else os.environ["ACCESS_ROLE_PREFIX"]
    boundary = os.environ["APP_ACCESS_BOUNDARY"] if field == "grants" else os.environ["ACCESS_BOUNDARY"]
    role_name = role_prefix + app
    trust = {"Version": "2012-10-17", "Statement": [{"Effect": "Allow", "Principal": {"Service": "ecs-tasks.amazonaws.com"},
        "Action": "sts:AssumeRole", "Condition": {"StringEquals": {"aws:SourceAccount": os.environ["ACCOUNT_ID"]},
        "ArnLike": {"aws:SourceArn": "arn:aws:ecs:" + os.environ["AWS_REGION"] + ":" + os.environ["ACCOUNT_ID"] + ":*"}}}]}
    try:
        iam.create_role(RoleName=role_name, AssumeRolePolicyDocument=json.dumps(trust), PermissionsBoundary=boundary)
    except ClientError as error:
        if error.response["Error"]["Code"] != "EntityAlreadyExists":
            raise
        role = iam.get_role(RoleName=role_name)["Role"]
        if role.get("PermissionsBoundary", {}).get("PermissionsBoundaryArn") != boundary or role["AssumeRolePolicyDocument"] != trust:
            return {"error": "App role was changed in AWS; ask the AWS administrator to restore it", "status": 502}
    statements = grant_policy(grants)
    iam.put_role_policy(RoleName=role_name, PolicyName="small-s3", PolicyDocument=json.dumps({"Version": "2012-10-17", "Statement": statements}))
    if previous and isinstance(previous, list) != (field == "grants"):
        old_prefix = os.environ["APP_ACCESS_ROLE_PREFIX"] if isinstance(previous, list) else os.environ["ACCESS_ROLE_PREFIX"]
        iam.put_role_policy(RoleName=old_prefix + app, PolicyName="small-s3",
            PolicyDocument=json.dumps({"Version": "2012-10-17", "Statement": grant_policy([])}))
    state["apps"][app] = requested or None
    state.pop("pending")
    state["last_request"] = change
    audit = {**change, "approved_at": int(time.time())}
    db.transact_write_items(TransactItems=[{"Put": {"TableName": table,
        "Item": {"id": {"S": "state"}, "revision": {"N": str(revision + 1)}, "payload": {"S": json.dumps(state)}},
        "ConditionExpression": "revision = :revision", "ExpressionAttributeValues": {":revision": {"N": str(revision)}}}},
        {"Put": {"TableName": table, "Item": {"id": {"S": "approval:" + request_id}, "payload": {"S": json.dumps(audit)}},
                  "ConditionExpression": "attribute_not_exists(id)"}}])
    return {"ok": True}
