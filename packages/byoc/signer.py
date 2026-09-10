"""IAM-only connection function. Has no access to customer app data."""
import base64
import hashlib
import hmac
import json
import os
import time
import urllib.request

import boto3


def metadata():
    approved = json.loads(os.environ.get("S3_ACCESS", "{}"))
    state = {}
    if os.environ.get("ACCESS_TABLE"):
        row = boto3.client("dynamodb").get_item(TableName=os.environ["ACCESS_TABLE"], Key={"id": {"S": "state"}}, ConsistentRead=True).get("Item", {})
        state = json.loads(row.get("payload", {}).get("S", '{"apps":{}}'))
        approved.update(state["apps"])
    return {"installation_id": os.environ["INSTALLATION_ID"], "org": os.environ["WORKSPACE"],
            "owner": os.environ["OWNER"], "account_id": os.environ["ACCOUNT_ID"],
            "region": os.environ["AWS_REGION"], "api_url": os.environ["API_URL"], "job_name": os.environ["JOB_NAME"],
            "s3_access": {k: v for k, v in approved.items() if v}, "access_approval": bool(os.environ.get("ACCESS_TABLE")),
            "applying": state.get("pending")}


def handler(event, context):
    if event.get("RequestType") in ("Create", "Update", "Delete") and event.get("ResponseURL"):
        status = "SUCCESS"
        try:
            if event["RequestType"] != "Delete":
                data = {"installation_id": os.environ["INSTALLATION_ID"], "account_id": os.environ["ACCOUNT_ID"],
                        "role_arn": event["ResourceProperties"]["RoleArn"], "signer_arn": context.invoked_function_arn,
                        "stack_id": event["StackId"]}
                req = urllib.request.Request(os.environ["PLATFORM_ORIGIN"] + "/api/byoc/register",
                    data=json.dumps(data).encode(), headers={"Content-Type": "application/json", "User-Agent": "small-byoc-installer/1"}, method="POST")
                with urllib.request.urlopen(req, timeout=15) as response:
                    if response.status != 200:
                        status = "FAILED"
        except Exception:
            status = "FAILED"
        response = {"Status": status, "Reason": "small connection registration " + status.lower(),
                    "PhysicalResourceId": os.environ["INSTALLATION_ID"], "StackId": event["StackId"],
                    "RequestId": event["RequestId"], "LogicalResourceId": event["LogicalResourceId"]}
        req = urllib.request.Request(event["ResponseURL"], data=json.dumps(response).encode(),
                                     headers={"Content-Type": ""}, method="PUT")
        with urllib.request.urlopen(req, timeout=15):
            pass
        return
    info = metadata()
    if event.get("org") != info["org"] or event.get("installation_id") != info["installation_id"]:
        return {"error": "Connection mismatch"}
    if event.get("operation") == "info":
        return info
    if event.get("operation") != "grant" or not isinstance(event.get("email"), str) or len(event["email"]) > 254:
        return {"error": "Invalid connection operation"}
    now = int(time.time())
    permissions = ["read", "run"]
    if event["email"] == info["owner"]:
        permissions.append("deploy")
    claims = {"iss": "small-byoc", "aud": info["installation_id"], "org": info["org"],
              "sub": event["email"], "iat": now, "exp": now + 180, "permissions": permissions}
    enc = lambda value: base64.urlsafe_b64encode(json.dumps(value, separators=(",", ":")).encode()).decode().rstrip("=")
    body = enc({"alg": "HS256", "typ": "JWT"}) + "." + enc(claims)
    secret = boto3.client("secretsmanager").get_secret_value(SecretId=os.environ["SIGNING_SECRET"])["SecretString"]
    sig = base64.urlsafe_b64encode(hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest()).decode().rstrip("=")
    return {"token": body + "." + sig, "expires_at": now + 180, "api_url": info["api_url"], "permissions": permissions}
