"""Customer-local dashboard API. API Gateway validates Cognito JWT signatures.

Only the installation's HTTP API may invoke this Lambda. Workspace membership
is checked from customer DynamoDB on every request, including reads.
"""
from decimal import Decimal
from functools import lru_cache
import json
import base64
import os
import re
import time

import boto3
from botocore.exceptions import ClientError


class Denied(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message


@lru_cache(maxsize=1)
def table():
    return boto3.resource("dynamodb").Table(os.environ["METADATA_TABLE"])


def config():
    return {"issuer": "https://cognito-idp.us-east-1.amazonaws.com/" + os.environ["COGNITO_POOL_ID"],
            "clientId": os.environ["COGNITO_CLIENT_ID"], "cognitoDomain": os.environ["COGNITO_DOMAIN"],
            "cliRedirectUri": os.environ.get("CLI_REDIRECT_URI", "http://127.0.0.1:8766/auth/callback")}


def identity(event):
    context = event.get("requestContext", {})
    claims = context.get("authorizer", {}).get("jwt", {}).get("claims", {})
    settings = config()
    try:
        valid = (context.get("apiId") == os.environ["PRIVATE_API_ID"]
                 and claims.get("iss") == settings["issuer"]
                 and claims.get("client_id") == settings["clientId"]
                 and claims.get("token_use") == "access"
                 and "openid" in claims.get("scope", "").split()
                 and isinstance(claims.get("sub"), str) and bool(claims["sub"])
                 and int(claims.get("exp", 0)) > time.time())
    except (TypeError, ValueError, AttributeError):
        valid = False
    if not valid:
        raise Denied(401, "Sign in to this Small installation.")
    workspace = os.environ["WORKSPACE"]
    headers = {key.lower(): value for key, value in event.get("headers", {}).items()}
    if headers.get("x-small-workspace") not in (None, "", workspace):
        raise Denied(403, "You do not have access to this workspace.")
    member = item("MEMBER#" + claims["sub"])
    if not member or member.get("role") not in ("owner", "member"):
        raise Denied(403, "Your account has not been added to this Small workspace.")
    return {**member, "sub": claims["sub"]}


def item(key):
    return table().get_item(Key={"pk": os.environ["WORKSPACE"], "sk": key}, ConsistentRead=True).get("Item")


def rows(prefix):
    request = {"KeyConditionExpression": "pk = :workspace AND begins_with(sk, :prefix)",
               "ExpressionAttributeValues": {":workspace": os.environ["WORKSPACE"], ":prefix": prefix},
               "ConsistentRead": True}
    result = []
    while True:
        page = table().query(**request)
        result.extend(page.get("Items", []))
        if not page.get("LastEvaluatedKey"):
            return result
        request["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def apps(member):
    result = []
    for row in rows("APP#"):
        owner = row.get("owner_sub") == member["sub"]
        visible = owner or member["role"] == "owner" or row.get("visibility") == "domain" or member["sub"] in row.get("shared_with", [])
        if not visible:
            continue
        # Keep internal subjects/access records out of the browser contract.
        data = {key: row[key] for key in ("name", "description", "owner_email", "visibility", "deployed_at") if key in row}
        data.update(org=os.environ["WORKSPACE"], kind="job", hosting="aws", privateByoc=True, url="/apps/" + row["name"],
                    aws_connection={"private": True, "account_id": os.environ.get("ACCOUNT_ID"), "region": "us-east-1"},
                    canEdit=owner or member["role"] == "owner", canDeploy=owner or member["role"] == "owner", members=[])
        result.append(data)
    return result


def job_request(method, path, event, member):
    if not os.environ.get("JOB_API_FUNCTION"):
        raise Denied(501, "Job deployment is not enabled in this installation yet.")
    match = re.fullmatch(r"/api/jobs/apps/([a-z0-9-]{1,40})(/(?:job|deploys|runs)(?:/[a-z0-9-]+(?:/(?:build|finalize|logs|outputs))?)?)", path)
    if not match or method not in ("GET", "POST"):
        raise Denied(404, "No such job operation.")
    name, operation = match.groups()
    raw = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode()
    if len(raw) > 16000:
        raise Denied(413, "Request too large.")
    try:
        body = json.loads(raw)
        if not isinstance(body, dict):
            raise ValueError()
    except (ValueError, TypeError):
        raise Denied(400, "Expected a JSON object.")
    app = item("APP#" + name)
    if not app and method == "POST" and operation == "/deploys" and member["role"] == "owner":
        app = {"pk": os.environ["WORKSPACE"], "sk": "APP#" + name, "name": name, "owner_sub": member["sub"],
               "owner_email": member["email"], "visibility": "domain"}
        try:
            table().put_item(Item=app, ConditionExpression="attribute_not_exists(pk)")
        except ClientError as error:
            if error.response["Error"]["Code"] != "ConditionalCheckFailedException":
                raise
            app = item("APP#" + name)
    if not app or not (member["role"] == "owner" or app.get("owner_sub") == member["sub"]
                       or app.get("visibility") == "domain" or member["sub"] in app.get("shared_with", [])):
        raise Denied(404, "No such app.")
    can_deploy = member["role"] == "owner" or app.get("owner_sub") == member["sub"]
    if operation.startswith("/deploys") and not can_deploy:
        raise Denied(403, "Only this app's owner can deploy it.")
    if body.get("s3_read"):
        raise Denied(501, "Extra S3 access is not enabled in this private release yet.")
    payload = {"rawPath": "/apps/" + name + operation, "requestContext": {"http": {"method": method}},
               "body": json.dumps(body), "queryStringParameters": event.get("queryStringParameters") or {},
               "actor": {"org": os.environ["WORKSPACE"], "app": name, "email": member["email"],
                         "permissions": ["read", "run", *(["deploy"] if can_deploy else [])]}}
    result = boto3.client("lambda").invoke(FunctionName=os.environ["JOB_API_FUNCTION"],
        InvocationType="RequestResponse", Payload=json.dumps(payload).encode())
    if result.get("FunctionError"):
        raise Denied(502, "The job service could not complete the operation.")
    response = json.loads(result["Payload"].read())
    data = json.loads(response["body"])
    if response["statusCode"] != 200:
        raise Denied(response["statusCode"], data.get("error", "Job operation failed."))
    if operation.endswith("/finalize") and data.get("status") == "ready":
        table().update_item(Key={"pk": os.environ["WORKSPACE"], "sk": "APP#" + name},
            UpdateExpression="SET deployed_at = :stamp", ExpressionAttributeValues={":stamp": data["created_at"]},
            ConditionExpression="attribute_exists(pk)")
    return data


def dispatch(method, path, event, member):
    workspace = os.environ["WORKSPACE"]
    meta = item("META")
    if not meta:
        raise Denied(503, "The Small workspace installation is not complete.")
    name = meta["name"]
    if path.startswith("/api/jobs/apps/"):
        return job_request(method, path, event, member)
    if method == "GET":
        if path == "/api/jobs/apps":
            return {"apps": [{"name": app["name"]} for app in apps(member)]}
        if path == "/api/byoc/connection":
            return {"connection": {"private": True, "state": "connected", "org": workspace,
                "account_id": os.environ.get("ACCOUNT_ID"), "region": "us-east-1", "job_name": os.environ.get("JOB_NAME"),
                "owner_email": member["email"], "can_deploy": member["role"] == "owner"}}
        if path == "/api/apps":
            return {"org": workspace, "orgName": name, "email": member["email"],
                    "apps": apps(member), "folders": [], "privateByoc": True}
        if path == "/api/workspaces":
            return {"active": workspace, "email": member["email"], "workspaces": [
                {"slug": workspace, "name": name, "role": member["role"], "kind": "custom"}]}
        if path == "/api/members":
            members = sorted({row["email"] for row in rows("MEMBER#") if row.get("role") in ("owner", "member")})
            return {"org": workspace, "email": member["email"], "members": members, "added": members}
        if path == "/api/teams":
            return {"teams": []}
        if path == "/api/trash":
            return {"trash": [], "email": member["email"]}
        if path == "/api/watch":
            return {"observations": [], "runs": [], "available": False}
    # ponytail: sharing, S3 approval and hosted integrations follow this CPU slice.
    # No request in private mode is proxied to the hosted control plane.
    raise Denied(501, "This action is not available in this BYOC release yet.")


def handler(event, context):
    try:
        method = event.get("requestContext", {}).get("http", {}).get("method", "")
        path = event.get("rawPath", "")
        if method == "GET" and path == "/api/auth/config":
            data = config()
        else:
            data = dispatch(method, path, event, identity(event))
        status = 200
    except Denied as error:
        status, data = error.status, {"error": error.message}
    except Exception:
        # Provider exceptions can include resource names or credentials.
        status, data = 503, {"error": "Small could not read this workspace. Try again shortly."}
    return {"statusCode": status, "headers": {"Content-Type": "application/json", "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff"},
            "body": json.dumps(data, default=lambda value: float(value) if isinstance(value, Decimal) else str(value))}
