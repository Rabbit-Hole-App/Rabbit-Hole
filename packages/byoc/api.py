"""Customer-side API. boto3 is supplied by the AWS Lambda Python runtime."""
import base64
import hashlib
import hmac
import json
import math
import os
import re
import time
import uuid
from datetime import datetime, timezone
from urllib.parse import quote

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

_clients = {}
_secret = None


class Rejected(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def client(service):
    if service not in _clients:
        _clients[service] = boto3.client(service, config=Config(signature_version="s3v4",
            s3={"us_east_1_regional_endpoint": "regional", "addressing_style": "virtual"}) if service == "s3" else None)
    return _clients[service]


def signing_secret():
    global _secret
    if not _secret or _secret[0] < time.time() - 120:
        _secret = (time.time(), client("secretsmanager").get_secret_value(SecretId=os.environ["SIGNING_SECRET"])["SecretString"])
    return _secret[1]


def decode(value):
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def authorize(header, secret, permission, now=None):
    now = time.time() if now is None else now
    try:
        if not header.startswith("Bearer ") or len(header) > 4096:
            raise ValueError()
        encoded, payload, signature = header[7:].split(".")
        expected = hmac.new(secret.encode(), (encoded + "." + payload).encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(expected, decode(signature)):
            raise ValueError()
        head, claims = json.loads(decode(encoded)), json.loads(decode(payload))
        if (head.get("alg") != "HS256" or claims.get("iss") != "small-byoc"
                or claims.get("aud") != os.environ["INSTALLATION_ID"]
                or claims.get("org") != os.environ["WORKSPACE"]
                or not isinstance(claims.get("sub"), str) or not claims["sub"]
                or not isinstance(claims.get("exp"), (int, float))
                or not isinstance(claims.get("iat"), (int, float))
                or not math.isfinite(claims["exp"]) or not math.isfinite(claims["iat"])
                or claims["exp"] <= now or claims["iat"] > now + 5
                or claims["exp"] - claims["iat"] > 180):
            raise ValueError()
    except (ValueError, TypeError, KeyError, AttributeError, UnicodeError):
        raise Rejected("Sign in again to renew AWS access", 401)
    if permission not in claims.get("permissions", []):
        raise Rejected("Only the installer can deploy this AWS job", 403)
    return claims


def validate_schema(schema):
    if not isinstance(schema, dict) or len(schema) > 20:
        raise Rejected("Use at most 20 scalar inputs")
    for name, field in schema.items():
        if not re.fullmatch(r"[a-zA-Z][a-zA-Z0-9_]{0,39}", name) or not isinstance(field, dict):
            raise Rejected("Invalid input name or definition")
        if field.get("type", "text") not in ("text", "number", "bool", "select"):
            raise Rejected("AWS MVP supports text, number, boolean, and select inputs; file inputs are not enabled")
        if field.get("type") == "select" and (not isinstance(field.get("options"), list) or not field["options"]):
            raise Rejected("Select inputs need options")
    if len(json.dumps(schema)) > 8000:
        raise Rejected("Input schema is too large")
    return schema


def validate_inputs(schema, values):
    validate_schema(schema)
    if not isinstance(values, dict) or set(values) - set(schema):
        raise Rejected("Unknown input")
    result = {}
    for name, field in schema.items():
        value = values.get(name, field.get("default"))
        if value is None or value == "":
            if field.get("required"):
                raise Rejected("Missing input: " + name)
            continue
        kind = field.get("type", "text")
        if kind == "number" and (isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value)):
            raise Rejected("Input must be a finite number: " + name)
        if kind == "bool" and not isinstance(value, bool):
            raise Rejected("Input must be a boolean: " + name)
        if kind in ("text", "select") and not isinstance(value, str):
            raise Rejected("Input must be text: " + name)
        if kind == "select" and value not in field["options"]:
            raise Rejected("Choose one of the options for " + name)
        if kind == "number" and (("min" in field and value < field["min"]) or ("max" in field and value > field["max"])):
            raise Rejected("Input is outside its allowed range: " + name)
        result[name] = value
    if len(json.dumps(result).encode()) > 4000:
        raise Rejected("Inputs exceed 4 KB")
    return result


def record_id(value, prefix):
    if not isinstance(value, str) or not re.fullmatch(prefix + r"-\d{13}-[a-f0-9]{12}", value):
        raise Rejected("Invalid record ID")
    return value


def app_name(value):
    if not isinstance(value, str) or not re.fullmatch(r"[a-z0-9-]{1,40}", value):
        raise Rejected("Use an app name with 1-40 lowercase letters, numbers, or hyphens")
    return value


def app_route(path):
    if path.startswith("/apps/"):
        parts = path.split("/", 3)
        return app_name(parts[2]), "/" + parts[3] if len(parts) == 4 else "/"
    return os.environ["JOB_NAME"], path


def app_key(app, key):
    # Preserve the first app's installed paths and history without a migration.
    return key if app is None or app_name(app) == os.environ["JOB_NAME"] else "apps/" + app + "/" + key


def app_names():
    return sorted({os.environ["JOB_NAME"], *(app_name(p.split("/")[1]) for p in prefixes("apps", 1000))})


def new_id(prefix):
    return f"{prefix}-{int(time.time() * 1000)}-{uuid.uuid4().hex[:12]}"


def stamp():
    return datetime.now(timezone.utc).isoformat()


def get_doc(key, missing=None):
    try:
        return json.loads(client("s3").get_object(Bucket=os.environ["BUCKET"], Key=key)["Body"].read())
    except ClientError as error:
        if error.response["Error"]["Code"] in ("NoSuchKey", "404"):
            return missing
        raise


def put_doc(key, value, **extra):
    return client("s3").put_object(Bucket=os.environ["BUCKET"], Key=key,
                                    Body=json.dumps(value, allow_nan=False).encode(), ContentType="application/json", **extra)


def prefixes(kind, limit=20):
    # Bound each page, walking the prefix index so old records do not hide newer runs.
    found, continuation = [], None
    for _ in range(20):
        args = dict(Bucket=os.environ["BUCKET"], Prefix=kind + "/", Delimiter="/", MaxKeys=1000)
        if continuation:
            args["ContinuationToken"] = continuation
        page = client("s3").list_objects_v2(**args)
        found.extend(x["Prefix"] for x in page.get("CommonPrefixes", []))
        continuation = page.get("NextContinuationToken")
        if not continuation:
            break
    return sorted(found, reverse=True)[:limit]


def deployment(deploy_id, refresh=False, finalize=False, app=None):
    record_id(deploy_id, "d")
    key = app_key(app, "deploys/" + deploy_id + "/record.json")
    doc = get_doc(key)
    if not doc:
        raise Rejected("No such deployment", 404)
    if (refresh or finalize) and doc["status"] == "building":
        builds = client("codebuild").batch_get_builds(ids=[doc["build_id"]]).get("builds", [])
        if builds:
            build = builds[0]
            doc["build_log_stream"] = build.get("logs", {}).get("streamName")
            if build["buildStatus"] == "SUCCEEDED":
                exported = {v["name"]: v["value"] for v in build.get("exportedEnvironmentVariables", [])}
                image = exported.get("IMAGE_URI", "")
                if not re.fullmatch(re.escape(os.environ["REPOSITORY"]) + r"@sha256:[a-f0-9]{64}", image):
                    raise Rejected("Build did not produce a pinned image", 502)
                doc.update(status="built", image=image)
            elif build["buildStatus"] in ("FAILED", "FAULT", "TIMED_OUT", "STOPPED"):
                doc["status"] = "failed"
    if finalize:
        if doc["status"] == "built":
                task = client("ecs").register_task_definition(
                    family=os.environ["TASK_FAMILY"], networkMode="awsvpc", requiresCompatibilities=["FARGATE"],
                    cpu="1024", memory="2048", executionRoleArn=os.environ["EXECUTION_ROLE"], taskRoleArn=os.environ["TASK_ROLE"],
                    runtimePlatform={"cpuArchitecture": "X86_64", "operatingSystemFamily": "LINUX"},
                    containerDefinitions=[dict(name="job", image=doc["image"], essential=True, readonlyRootFilesystem=False,
                        environment=[{"name": "SMALL_AWS_BUCKET", "value": os.environ["BUCKET"]},
                                     {"name": "AWS_REGION", "value": os.environ["AWS_REGION"]}],
                        logConfiguration={"logDriver": "awslogs", "options": {
                            "awslogs-group": os.environ["RUN_LOG_GROUP"], "awslogs-region": os.environ["AWS_REGION"],
                            "awslogs-stream-prefix": "small"}})])
                doc.update(status="ready", task_definition=task["taskDefinition"]["taskDefinitionArn"])
        put_doc(key, doc)
    return doc


def latest_deployment(app=None):
    rows = prefixes(app_key(app, "deploys"), 1)
    return deployment(rows[0].rstrip("/").split("/")[-1], refresh=True, app=app) if rows else None


def log_lines(group, stream, cursor=None):
    if not stream:
        return {"lines": [], "cursor": None}
    args = dict(logGroupName=group, logStreamName=stream, limit=200, startFromHead=True)
    if cursor:
        args["nextToken"] = cursor
    try:
        result = client("logs").get_log_events(**args)
    except client("logs").exceptions.ResourceNotFoundException:
        return {"lines": [], "cursor": cursor}
    return {"lines": [{"timestamp": e["timestamp"], "line": e["message"]} for e in result["events"]],
            "cursor": result.get("nextForwardToken")}


def run_record(run_id, app=None):
    record_id(run_id, "r")
    key = app_key(app, "runs/" + run_id + "/record.json")
    doc = get_doc(key)
    if not doc:
        raise Rejected("No such run", 404)
    if doc.get("task_arn") and doc["status"] not in ("finished", "failed", "stopped"):
        tasks = client("ecs").describe_tasks(cluster=os.environ["CLUSTER"], tasks=[doc["task_arn"]])["tasks"]
        if tasks:
            task = tasks[0]
            if task["lastStatus"] == "STOPPED":
                code = task.get("containers", [{}])[0].get("exitCode", -1)
                result = get_doc(app_key(app, "runs/" + run_id + "/result.json"))
                if code == 0 and not result:
                    code = -1  # a successful job must also finish its output upload
                doc.update(status="finished" if code == 0 else "failed", exit_code=code,
                           finished_at=stamp(), reason=task.get("stoppedReason", ""))
                put_doc(key, doc)
            elif task["lastStatus"] == "RUNNING":
                doc["status"] = "running"
    return doc


def dispatch(method, path, body, query, claims, app=None):
    if path == "/apps" and method == "GET":
        return {"apps": [{"name": name} for name in app_names()]}
    if path == "/job" and method == "GET":
        return {"name": app or os.environ["JOB_NAME"], "deployment": latest_deployment(app)}
    if path == "/deploys" and method == "POST":
        entry = body.get("entry", "")
        if not re.fullmatch(r"[a-zA-Z0-9_][a-zA-Z0-9_./-]*\.py", entry) or ".." in entry.split("/"):
            raise Rejected("Entry must be a relative Python file")
        if set(body) - {"entry", "inputs"}:
            raise Rejected("Unsupported deployment setting")
        schema = validate_schema(body.get("inputs", {}))
        deploy_id = new_id("d")
        doc = dict(id=deploy_id, status="uploading", entry=entry, inputs=schema, created_at=stamp())
        put_doc(app_key(app, "deploys/" + deploy_id + "/record.json"), doc)
        # Archives keep globally unique deployment IDs under the installed build
        # role's sources/ permission; only the owning app's record can build them.
        url = client("s3").generate_presigned_url("put_object", Params={"Bucket": os.environ["BUCKET"],
            "Key": "sources/" + deploy_id + ".zip", "ContentType": "application/zip"}, ExpiresIn=300)
        return {**doc, "upload_url": url}
    match = re.fullmatch(r"/deploys/([^/]+)(/build|/logs|/finalize)?", path)
    if match:
        deploy_id, suffix = match.groups()
        doc = deployment(deploy_id, refresh=method == "GET", app=app)
        if suffix == "/finalize" and method == "POST":
            return deployment(deploy_id, finalize=True, app=app)
        if suffix == "/build" and method == "POST":
            if doc["status"] != "uploading":
                return doc
            source = "sources/" + deploy_id + ".zip"
            obj = client("s3").head_object(Bucket=os.environ["BUCKET"], Key=source)
            if obj["ContentLength"] > 50 * 1024 * 1024:
                raise Rejected("Source archive exceeds 50 MB")
            # CodeBuild reconciles retries using this deployment's idempotency token.
            # A separate permanent lock would strand a failed start or record write.
            build = client("codebuild").start_build(projectName=os.environ["BUILD_PROJECT"],
                sourceTypeOverride="S3", sourceLocationOverride=os.environ["BUCKET"] + "/" + source,
                sourceVersion=obj["VersionId"], idempotencyToken=deploy_id)["build"]
            doc.update(status="building", build_id=build["id"])
            put_doc(app_key(app, "deploys/" + deploy_id + "/record.json"), doc)
            return doc
        if method == "GET" and suffix == "/logs":
            return log_lines(os.environ["BUILD_LOG_GROUP"], doc.get("build_log_stream"), query.get("cursor"))
        if method == "GET" and not suffix:
            return doc
    if path == "/runs" and method == "POST":
        if set(body) - {"inputs", "deploy_id"}:
            raise Rejected("Unsupported run setting")
        doc = deployment(body["deploy_id"], refresh=True, app=app) if body.get("deploy_id") else latest_deployment(app)
        if not doc or doc["status"] != "ready":
            raise Rejected("Deploy the job successfully before running it", 409)
        values = validate_inputs(doc["inputs"], body.get("inputs", {}))
        run_id = new_id("r")
        run = dict(run_id=run_id, deploy_id=doc["id"], status="starting", inputs=values,
                   started_by=claims["sub"], started_at=stamp())
        output_post = client("s3").generate_presigned_post(Bucket=os.environ["BUCKET"],
            Key=app_key(app, "runs/" + run_id + "/outputs/${filename}"),
            Conditions=[["content-length-range", 1, 11 * 1024 * 1024]], ExpiresIn=1800)
        result_url = client("s3").generate_presigned_url("put_object", Params={"Bucket": os.environ["BUCKET"],
            "Key": app_key(app, "runs/" + run_id + "/result.json"), "ContentType": "application/json"}, ExpiresIn=1800)
        overrides = {"containerOverrides": [{"name": "job", "environment": [
            {"name": "SMALL_RUN_ID", "value": run_id}, {"name": "SMALL_RUN_INPUTS", "value": json.dumps(values)},
            {"name": "SMALL_OUTPUT_POST", "value": json.dumps(output_post)}, {"name": "SMALL_RESULT_URL", "value": result_url}]}]}
        if len(json.dumps(overrides).encode()) > 8192:
            raise Rejected("Run inputs and upload grants exceed the AWS task limit", 413)
        put_doc(app_key(app, "runs/" + run_id + "/record.json"), run)
        try:
            result = client("ecs").run_task(cluster=os.environ["CLUSTER"], launchType="FARGATE", platformVersion="1.4.0",
                taskDefinition=doc["task_definition"], count=1, clientToken=run_id,
                networkConfiguration={"awsvpcConfiguration": {"subnets": os.environ["SUBNETS"].split(","),
                    "securityGroups": [os.environ["TASK_SECURITY_GROUP"]], "assignPublicIp": "DISABLED"}},
                overrides=overrides)
        except Exception:
            run.update(status="failed", reason="AWS could not start the task", finished_at=stamp(), exit_code=-1)
            put_doc(app_key(app, "runs/" + run_id + "/record.json"), run)
            raise
        if result.get("failures") or not result.get("tasks"):
            run.update(status="failed", reason="AWS could not start the task", finished_at=stamp(), exit_code=-1)
        else:
            run["task_arn"] = result["tasks"][0]["taskArn"]
        put_doc(app_key(app, "runs/" + run_id + "/record.json"), run)
        return run
    if path == "/runs" and method == "GET":
        return {"runs": [run_record(p.rstrip("/").split("/")[-1], app) for p in prefixes(app_key(app, "runs"))]}
    match = re.fullmatch(r"/runs/([^/]+)(/logs|/outputs)?", path)
    if match and method == "GET":
        run_id, suffix = match.groups()
        run = run_record(run_id, app)
        if suffix == "/logs":
            stream = "small/job/" + run["task_arn"].split("/")[-1] if run.get("task_arn") else None
            return log_lines(os.environ["RUN_LOG_GROUP"], stream, query.get("cursor"))
        if suffix == "/outputs":
            prefix = app_key(app, "runs/" + run_id + "/outputs/")
            objs = client("s3").list_objects_v2(Bucket=os.environ["BUCKET"], Prefix=prefix, MaxKeys=100).get("Contents", [])
            return {"outputs": [{"name": o["Key"][len(prefix):], "size": o["Size"],
                "url": client("s3").generate_presigned_url("get_object", Params={"Bucket": os.environ["BUCKET"],
                    "Key": o["Key"], "ResponseContentDisposition": "attachment; filename*=UTF-8''" + quote(o["Key"][len(prefix):], safe="")},
                    ExpiresIn=180)} for o in objs]}
        if not suffix:
            return run
    raise Rejected("No such AWS operation", 404)


def handler(event, context):
    try:
        method = event.get("requestContext", {}).get("http", {}).get("method", "")
        app, path = app_route(event.get("rawPath", ""))
        permission = "read" if method == "GET" else "deploy" if path.startswith("/deploys") else "run"
        claims = authorize(event.get("headers", {}).get("authorization", ""), signing_secret(), permission)
        raw = event.get("body") or "{}"
        if event.get("isBase64Encoded"):
            raw = base64.b64decode(raw).decode()
        if len(raw) > 16000:
            raise Rejected("Request too large", 413)
        body = json.loads(raw)
        if not isinstance(body, dict):
            raise Rejected("Expected an object")
        result = dispatch(method, path, body, event.get("queryStringParameters") or {}, claims, app)
        status = 200
    except Rejected as error:
        status, result = error.status, {"error": str(error)}
    except (ValueError, TypeError, KeyError):
        status, result = 400, {"error": "Invalid request"}
    except ClientError as error:
        # AWS details can include keys and customer content; return only the service error code.
        status, result = 502, {"error": "AWS operation failed: " + error.response["Error"]["Code"]}
    except BotoCoreError:
        status, result = 502, {"error": "AWS could not complete the operation; try again"}
    return {"statusCode": status, "headers": {"Content-Type": "application/json", "Cache-Control": "no-store"},
            "body": json.dumps(result, allow_nan=False)}
