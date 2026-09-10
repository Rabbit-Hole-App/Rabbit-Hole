"""IAM-only S3 approval handler. No access to source, inputs, outputs, or logs."""
import json
import os
import re
import time

import boto3
from botocore.exceptions import ClientError


def scope(value):
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("Invalid S3 folder")
    match = re.fullmatch(r"s3://([a-z0-9][a-z0-9.-]{1,61}[a-z0-9])/([A-Za-z0-9_][A-Za-z0-9_./-]{0,199})", value)
    if not match:
        raise ValueError("Use one literal S3 folder")
    bucket, prefix = match.groups()
    if ".." in bucket or "//" in prefix or re.fullmatch(r"\d+\.\d+\.\d+\.\d+", bucket) or any(p in ("", ".", "..") for p in prefix.rstrip("/").split("/")):
        raise ValueError("Invalid S3 folder")
    return "s3://" + bucket + "/" + prefix.rstrip("/") + "/"


def handler(event, context):
    keys = {"installation_id", "org", "email", "request_id", "app_name", "s3_read", "previous_s3_read"}
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
        requested, previous = scope(event["s3_read"]), scope(event["previous_s3_read"])
    except ValueError as error:
        return {"error": str(error), "status": 400}
    table = os.environ["ACCESS_TABLE"]
    db = boto3.client("dynamodb")
    row = db.get_item(TableName=table, Key={"id": {"S": "state"}}, ConsistentRead=True).get("Item", {})
    state = json.loads(row.get("payload", {}).get("S", '{"apps":{}}'))
    revision = int(row.get("revision", {}).get("N", "0"))
    app, request_id = event["app_name"], event["request_id"]
    change = {"app_name": app, "request_id": request_id, "s3_read": requested,
              "previous_s3_read": previous, "approved_by": event["email"]}
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
        if len(json.dumps({k: v for k, v in approved.items() if v}, separators=(",", ":"))) > 1500:
            return {"error": "Too many S3 grants for this preview", "status": 400}
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
    role_name = os.environ["ACCESS_ROLE_PREFIX"] + app
    trust = {"Version": "2012-10-17", "Statement": [{"Effect": "Allow", "Principal": {"Service": "ecs-tasks.amazonaws.com"},
        "Action": "sts:AssumeRole", "Condition": {"StringEquals": {"aws:SourceAccount": os.environ["ACCOUNT_ID"]},
        "ArnLike": {"aws:SourceArn": "arn:aws:ecs:" + os.environ["AWS_REGION"] + ":" + os.environ["ACCOUNT_ID"] + ":*"}}}]}
    try:
        iam.create_role(RoleName=role_name, AssumeRolePolicyDocument=json.dumps(trust), PermissionsBoundary=os.environ["ACCESS_BOUNDARY"])
    except ClientError as error:
        if error.response["Error"]["Code"] != "EntityAlreadyExists":
            raise
        role = iam.get_role(RoleName=role_name)["Role"]
        if role.get("PermissionsBoundary", {}).get("PermissionsBoundaryArn") != os.environ["ACCESS_BOUNDARY"] or role["AssumeRolePolicyDocument"] != trust:
            return {"error": "App role was changed in AWS; ask the AWS administrator to restore it", "status": 502}
    statements = [{"Effect": "Deny", "Action": "*", "Resource": "*"}]
    if requested:
        resource = "arn:aws:s3:::" + requested[5:] + "*"
        statements = [{"Effect": "Allow", "Action": "s3:GetObject", "Resource": resource},
                      {"Effect": "Deny", "Action": "s3:GetObject", "NotResource": resource}]
    iam.put_role_policy(RoleName=role_name, PolicyName="small-s3", PolicyDocument=json.dumps({"Version": "2012-10-17", "Statement": statements}))
    state["apps"][app] = requested
    state.pop("pending")
    state["last_request"] = change
    audit = {**change, "approved_at": int(time.time())}
    db.transact_write_items(TransactItems=[{"Put": {"TableName": table,
        "Item": {"id": {"S": "state"}, "revision": {"N": str(revision + 1)}, "payload": {"S": json.dumps(state)}},
        "ConditionExpression": "revision = :revision", "ExpressionAttributeValues": {":revision": {"N": str(revision)}}}},
        {"Put": {"TableName": table, "Item": {"id": {"S": "approval:" + request_id}, "payload": {"S": json.dumps(audit)}},
                  "ConditionExpression": "attribute_not_exists(id)"}}])
    return {"ok": True}
