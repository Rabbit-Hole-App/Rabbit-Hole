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
from grants import normalize_grants, stored_grants, installed_actions, check_protected

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


def validate_constants(values):
    if not isinstance(values, dict) or len(values) > 20:
        raise Rejected('Constants must contain at most 20 named values')
    for name, value in values.items():
        if isinstance(value, dict):
            if 'value' not in value or set(value) - {'value', 'tooltip'}:
                raise Rejected('Constant definition requires value and optional tooltip')
            if 'tooltip' in value and (not isinstance(value['tooltip'], str) or len(value['tooltip']) > 2000):
                raise Rejected('Constant tooltip must be text, at most 2000 characters')
            value = value['value']
        if not isinstance(name, str) or not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{0,39}', name):
            raise Rejected('Invalid constant name')
        if type(value) not in (str, bool, int, float):
            raise Rejected('Constants must be text, finite numbers or booleans')
        if type(value) in (int, float) and (abs(value) > 9007199254740991 or not math.isfinite(value)):
            raise Rejected('Constant number is outside the supported range')
    if len(json.dumps(values, ensure_ascii=False, separators=(',', ':')).encode()) > 2048:
        raise Rejected('Constants exceed the 2 KiB limit')
    return values


def validate_schema(schema):
    if not isinstance(schema, dict) or len(schema) > 20:
        raise Rejected("Use at most 20 inputs")
    for name, field in schema.items():
        if not re.fullmatch(r"[a-zA-Z][a-zA-Z0-9_]{0,39}", name) or not isinstance(field, dict):
            raise Rejected("Invalid input name or definition")
        if field.get("type", "text") not in ("text", "number", "bool", "select", "file"):
            raise Rejected("AWS jobs support text, number, boolean, select and file inputs")
        if 'tooltip' in field and (not isinstance(field['tooltip'], str) or len(field['tooltip']) > 2000):
            raise Rejected('Input tooltip must be text, at most 2000 characters')
        if field.get("type") == "file":
            if os.environ.get("FILE_INPUTS") != "v1":
                raise Rejected("Update this installation to enable file inputs", 409)
            if "default" in field or not isinstance(field.get("accept", ""), str) or len(field.get("accept", "")) > 200:
                raise Rejected("File inputs need an optional accept string and cannot have defaults")
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
        if kind in ("text", "select", "file") and not isinstance(value, str):
            raise Rejected("Input must be text: " + name)
        if kind == "select" and value not in field["options"]:
            raise Rejected("Choose one of the options for " + name)
        if kind == "number" and (("min" in field and value < field["min"]) or ("max" in field and value > field["max"])):
            raise Rejected("Input is outside its allowed range: " + name)
        result[name] = value
    if len(json.dumps(result).encode()) > 4000:
        raise Rejected("Inputs exceed 4 KB")
    return result


def file_name(value, field):
    if (not isinstance(value, str) or not re.fullmatch(r"[^/\\:\x00-\x1f]{1,160}", value)
            or value in (".", "..") or value != value.strip()):
        raise Rejected("Use a filename without folders")
    extensions = [s.strip().lower() for s in field.get("accept", "").split(",") if s.strip()]
    if extensions and not any(value.lower().endswith(ext) for ext in extensions):
        raise Rejected("File type must be " + field["accept"])
    return value


def prepare_upload(app, body, actor):
    if os.environ.get("FILE_INPUTS") != "v1":
        raise Rejected("Update this installation to enable file inputs", 409)
    if set(body) != {"deploy_id", "files"} or not isinstance(body["files"], dict) or not 1 <= len(body["files"]) <= 5:
        raise Rejected("Upload one to five declared file inputs")
    doc = deployment(body["deploy_id"], refresh=True, app=app)
    require_current_deployment(doc, app)
    if doc["status"] != "ready":
        raise Rejected("Deploy the job successfully before uploading", 409)
    task_role(app, doc.get("s3_read"), doc.get("grants"))
    files = {}
    upload_id = new_id("u")
    for name, info in body["files"].items():
        field = doc["inputs"].get(name, {})
        if field.get("type") != "file" or not isinstance(info, dict) or set(info) != {"filename", "size", "sha256"}:
            raise Rejected("Unknown file input or unsupported upload metadata")
        filename = file_name(info["filename"], field)
        if type(info["size"]) is not int or not 0 <= info["size"] <= 10 * 1024 * 1024:
            raise Rejected("File inputs are limited to 10 MB per file")
        try:
            checksum = base64.b64decode(info["sha256"], validate=True)
            if len(checksum) != 32:
                raise ValueError()
        except (ValueError, TypeError):
            raise Rejected("File input requires a SHA-256 checksum")
        files[name] = {"name": name, "filename": filename, "size": info["size"], "sha256": info["sha256"],
                       "key": app_key(app, "uploads/" + upload_id + "/files/" + name)}
    record = {"upload_id": upload_id, "deploy_id": doc["id"], "owner": actor, "expires_at": int(time.time()) + 900, "files": files}
    put_doc(app_key(app, "uploads/" + upload_id + "/record.json"), record)
    urls = {}
    for name, info in files.items():
        headers = {"content-type": "application/octet-stream", "x-amz-checksum-sha256": info["sha256"]}
        url = client("s3").generate_presigned_url("put_object", Params={"Bucket": os.environ["BUCKET"], "Key": info["key"],
            "ContentType": headers["content-type"], "ContentLength": info["size"], "ChecksumSHA256": info["sha256"]}, ExpiresIn=300)
        urls[name] = {"url": url, "headers": headers}
    return {"upload_id": upload_id, "files": urls, "data_bucket": os.environ["BUCKET"]}


def uploaded_files(app, deployment, values, upload_id, actor):
    names = {k for k, v in values.items() if v and deployment["inputs"][k].get("type") == "file"}
    if not names:
        if upload_id:
            raise Rejected("No file input uses this upload")
        return []
    if not upload_id:
        raise Rejected("Upload the declared files before starting the run")
    record_id(upload_id, "u")
    upload = get_doc(app_key(app, "uploads/" + upload_id + "/record.json"))
    if (not upload or upload["owner"] != actor or upload["deploy_id"] != deployment["id"]
            or upload["expires_at"] <= time.time() or set(upload["files"]) != names):
        raise Rejected("This file upload does not belong to this user, app and deployment, or has expired", 403)
    files = []
    for name, info in upload["files"].items():
        if info["filename"] != values[name]:
            raise Rejected("File input does not match the uploaded filename")
        obj = client("s3").head_object(Bucket=os.environ["BUCKET"], Key=info["key"], ChecksumMode="ENABLED")
        if (obj.get("ContentLength") != info["size"] or obj.get("ChecksumSHA256") != info["sha256"]
                or not obj.get("VersionId") or obj["VersionId"] == "null"):
            raise Rejected("File upload is incomplete or changed; upload it again")
        files.append({**info, "version_id": obj["VersionId"]})
    return files


def input_file_url(info, expiry=1800):
    return client("s3").generate_presigned_url("get_object", Params={"Bucket": os.environ["BUCKET"], "Key": info["key"],
        "VersionId": info["version_id"], "ResponseContentDisposition": "attachment; filename*=UTF-8''" + quote(info["filename"], safe="")}, ExpiresIn=expiry)


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


def task_role(app, s3_read=None, grants=None):
    if s3_read is not None and grants is not None:
        raise Rejected("Declare either grants or s3_read")
    if grants is not None and os.environ.get("APP_GRANTS") != "v1":
        raise Rejected("Update this installation to enable app permission grants", 409)
    try:
        requested = stored_grants(grants if grants is not None else s3_read, os.environ.get("ACCOUNT_ID"))
        if grants is not None:
            normalize_grants(grants, os.environ.get("ACCOUNT_ID"), allowed_actions=installed_actions())
        check_protected(requested)
    except ValueError as error:
        raise Rejected(str(error), 409)
    if not requested:
        return os.environ["TASK_ROLE"]
    name = app_name(app or os.environ["JOB_NAME"])
    approved = json.loads(os.environ.get("S3_ACCESS", "{}"))
    role_prefix = os.environ.get("S3_ROLE_ARN_PREFIX")
    if os.environ.get("ACCESS_TABLE"):
        row = client("dynamodb").get_item(TableName=os.environ["ACCESS_TABLE"], Key={"id": {"S": "state"}}, ConsistentRead=True).get("Item", {})
        state = json.loads(row.get("payload", {}).get("S", '{"apps":{}}'))
        if state.get("pending", {}).get("app_name") == name:
            raise Rejected("App permission update is applying; retry after approval finishes", 409)
        if name in state["apps"]:
            approved[name] = state["apps"][name]
            role_prefix = os.environ["APP_ACCESS_ROLE_ARN_PREFIX"] if isinstance(approved[name], list) else os.environ["ACCESS_ROLE_ARN_PREFIX"]
    try:
        current = stored_grants(approved.get(name), os.environ.get("ACCOUNT_ID"))
        if isinstance(approved.get(name), list):
            normalize_grants(current, os.environ.get("ACCOUNT_ID"), allowed_actions=installed_actions())
    except ValueError as error:
        raise Rejected(str(error), 409)
    if current != requested or (grants is not None and not isinstance(approved.get(name), list)):
        raise Rejected("App access has not been approved; run small deploy and review the request in Settings > Connections > AWS", 409)
    return role_prefix + name


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
    if limit is None and continuation:
        raise Rejected("Deployment inventory is incomplete; retry later", 503)
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
                    cpu="1024", memory="2048", executionRoleArn=os.environ["EXECUTION_ROLE"], taskRoleArn=task_role(app, doc.get("s3_read"), doc.get("grants")),
                    runtimePlatform={"cpuArchitecture": "X86_64", "operatingSystemFamily": "LINUX"},
                    containerDefinitions=[dict(name="job", image=doc["image"], essential=True, readonlyRootFilesystem=False,
                        environment=[{"name": "SMALL_AWS_BUCKET", "value": os.environ["BUCKET"]},
                                     {"name": "AWS_REGION", "value": os.environ["AWS_REGION"]}],
                        logConfiguration={"logDriver": "awslogs", "options": {
                            "awslogs-group": os.environ["RUN_LOG_GROUP"], "awslogs-region": os.environ["AWS_REGION"],
                            "awslogs-stream-prefix": "small"}})])
                doc.update(status="ready", task_definition=task["taskDefinition"]["taskDefinitionArn"], ready_at=stamp())
        put_doc(key, doc)
    return doc


def latest_deployment(app=None):
    rows = prefixes(app_key(app, "deploys"), 1)
    return deployment(rows[0].rstrip("/").split("/")[-1], refresh=True, app=app) if rows else None


def current_deployment(app=None):
    if os.environ.get("IMAGE_RETENTION") != "current":
        return latest_deployment(app)
    for prefix in prefixes(app_key(app, "deploys"), limit=None):
        doc = deployment(prefix.rstrip("/").split("/")[-1], app=app)
        if doc["status"] == "ready":
            return doc
    return None


def require_current_deployment(doc, app=None):
    if os.environ.get("IMAGE_RETENTION") == "current" and doc and doc["status"] == "ready":
        current = current_deployment(app)
        if not current or doc["id"] != current["id"]:
            raise Rejected("This deployment was replaced; redeploy its source to run it again", 409)


def log_lines(group, stream, cursor=None, tail=False):
    if not stream:
        return {"lines": [], "cursor": None}
    args = dict(logGroupName=group, logStreamName=stream, limit=200, startFromHead=not tail)
    if cursor:
        args["nextToken"] = cursor
    try:
        result = client("logs").get_log_events(**args)
    except client("logs").exceptions.ResourceNotFoundException:
        return {"lines": [], "cursor": cursor}
    return {"lines": [{"timestamp": e["timestamp"], "line": e["message"]} for e in result["events"]],
            "cursor": result.get("nextForwardToken")}


def run_context(app, run, query):
    sources = query.get('sources', 'log,outputs')
    if not isinstance(sources, str) or any(s not in ('', 'log', 'outputs') for s in sources.split(',')):
        raise Rejected('Invalid run chat sources')
    result = {'run': {k: run[k] for k in ('run_id', 'deploy_id', 'status', 'exit_code', 'reason',
                                        'inputs', 'started_at', 'finished_at') if k in run}}
    if run.get('input_files'):
        result['run']['input_files'] = [{k: f[k] for k in ('name', 'filename', 'size') if k in f} for f in run['input_files']]
    if 'log' in sources.split(','):
        stream = 'small/job/' + run['task_arn'].split('/')[-1] if run.get('task_arn') else None
        events = log_lines(os.environ['RUN_LOG_GROUP'], stream, tail=True)['lines']
        text = '\n'.join(e['line'] for e in events)
        result['log'] = {'lines': ['L' + str(i + 1) + ': ' + line for i, line in enumerate(text[-18000:].splitlines())],
                         'truncated': len(events) == 200 or len(text) > 18000,
                         'note': 'Most recent log events; line numbers refer to this captured tail.'}
    if 'outputs' in sources.split(','):
        prefix = app_key(app, 'runs/' + run['run_id'] + '/outputs/')
        objects = client('s3').list_objects_v2(Bucket=os.environ['BUCKET'], Prefix=prefix, MaxKeys=100)
        result['outputs'], previews = [], 0
        result['outputs_truncated'] = bool(objects.get('IsTruncated'))
        for obj in objects.get('Contents', []):
            if not obj['Key'].startswith(prefix):
                continue
            name = obj['Key'][len(prefix):]
            output = {'name': name, 'size': obj['Size']}
            if previews < 3 and obj['Size'] <= 4096 and re.search(r'\.(json|txt|csv|log|md)$', name, re.I):
                body = client('s3').get_object(Bucket=os.environ['BUCKET'], Key=obj['Key'])['Body']
                try:
                    raw = body.read(4097)
                finally:
                    body.close()
                output['text'] = raw[:4096].decode('utf-8', errors='replace')
                output['truncated'] = len(raw) > 4096
                previews += 1
            result['outputs'].append(output)
    return result


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


def app_context(app, query):
    sources = query.get('sources', 'runs,log,outputs')
    if not isinstance(sources, str) or any(s not in ('', 'runs', 'log', 'outputs') for s in sources.split(',')):
        raise Rejected('Invalid app chat sources')
    sources = set(sources.split(',')) - {''}
    deployed = prefixes(app_key(app, 'deploys'), 1)
    doc = deployment(deployed[0].rstrip('/').split('/')[-1], app=app) if deployed else None
    result = {'app': app, 'deployment': {k: doc[k] for k in ('id', 'status', 'entry', 'inputs', 'created_at',
              's3_read', 'grants') if k in doc} if doc else None,
              'unavailable': ['Source code', 'Builder sessions', 'Approved design decisions']}
    if sources:
        records = [run_record(p.rstrip('/').split('/')[-1], app)
                   for p in prefixes(app_key(app, 'runs'), 5 if 'runs' in sources else 1)]
        if 'runs' in sources:
            result['runs'] = [{k: r[k] for k in ('run_id', 'deploy_id', 'status', 'exit_code', 'reason',
                              'started_at', 'finished_at') if k in r} for r in records]
            result['runs_note'] = 'At most the five most recent runs, not the complete run history.'
        details = [s for s in ('log', 'outputs') if s in sources]
        if details:
            result['latest_run'] = run_context(app, records[0], {'sources': ','.join(details)}) if records else None
    return result


def dispatch(method, path, body, query, claims, app=None):
    if path == "/uploads" and method == "POST":
        return prepare_upload(app, body, claims["sub"])
    if path == "/apps" and method == "GET":
        return {"apps": [{"name": name} for name in app_names()]}
    if path == "/job" and method == "GET":
        latest = latest_deployment(app)
        return {"name": app or os.environ["JOB_NAME"], "deployment": current_deployment(app) or latest,
                "latest_attempt": latest}
    if path == '/context' and method == 'GET':
        return app_context(app, query)
    if path == "/deploys" and method == "POST":
        entry = body.get("entry", "")
        if not re.fullmatch(r"[a-zA-Z0-9_][a-zA-Z0-9_./-]*\.py", entry) or ".." in entry.split("/"):
            raise Rejected("Entry must be a relative Python file")
        if set(body) - {"entry", "inputs", "constants", "s3_read", "grants"} or ("grants" in body and "s3_read" in body):
            raise Rejected("Unsupported deployment setting")
        schema = validate_schema(body.get("inputs", {}))
        constants = validate_constants(body.get('constants', {}))
        task_role(app, body.get("s3_read"), body.get("grants"))  # approval before any source upload
        deploy_id = new_id("d")
        doc = dict(id=deploy_id, status="uploading", entry=entry, inputs=schema, constants=constants, s3_read=body.get("s3_read"), created_at=stamp())
        if "grants" in body:
            doc["grants"] = normalize_grants(body["grants"], os.environ.get("ACCOUNT_ID"), allowed_actions=installed_actions())
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
            if type(build.get("buildNumber")) is int:
                doc["image_tag"] = "build-" + str(build["buildNumber"])
            put_doc(app_key(app, "deploys/" + deploy_id + "/record.json"), doc)
            return doc
        if method == "GET" and suffix == "/logs":
            return log_lines(os.environ["BUILD_LOG_GROUP"], doc.get("build_log_stream"), query.get("cursor"))
        if method == "GET" and not suffix:
            return doc
    if path == "/runs" and method == "POST":
        if set(body) - {"inputs", "deploy_id", "upload_id"}:
            raise Rejected("Unsupported run setting")
        doc = deployment(body["deploy_id"], refresh=True, app=app) if body.get("deploy_id") else current_deployment(app)
        require_current_deployment(doc, app)
        if not doc or doc["status"] != "ready":
            raise Rejected("Deploy the job successfully before running it", 409)
        # Old task definitions cannot retain access after its approval changes.
        role = task_role(app, doc.get("s3_read"), doc.get("grants"))
        values = validate_inputs(doc["inputs"], body.get("inputs", {}))
        constants = {name: value['value'] if isinstance(value, dict) else value
                     for name, value in validate_constants(doc.get('constants', {})).items()}
        files = uploaded_files(app, doc, values, body.get("upload_id"), claims["sub"])
        run_id = new_id("r")
        run = dict(run_id=run_id, deploy_id=doc["id"], status="starting", inputs=values, constants=constants,
                   started_by=claims["sub"], started_at=stamp())
        if files:
            run["input_files"] = files
        output_post = client("s3").generate_presigned_post(Bucket=os.environ["BUCKET"],
            Key=app_key(app, "runs/" + run_id + "/outputs/${filename}"),
            Conditions=[["content-length-range", 1, 11 * 1024 * 1024]], ExpiresIn=1800)
        result_url = client("s3").generate_presigned_url("put_object", Params={"Bucket": os.environ["BUCKET"],
            "Key": app_key(app, "runs/" + run_id + "/result.json"), "ContentType": "application/json"}, ExpiresIn=1800)
        bucket, _, prefix = (doc.get("s3_read") or "s3://")[5:].partition("/")
        overrides = {"taskRoleArn": role, "containerOverrides": [{"name": "job", "environment": [
            {"name": "SMALL_RUN_ID", "value": run_id}, {"name": "SMALL_RUN_INPUTS", "value": json.dumps(values)},
            {"name": "SMALL_CONSTANTS", "value": json.dumps(constants, ensure_ascii=False, separators=(',', ':'))},
            {"name": "SMALL_S3_BUCKET", "value": bucket}, {"name": "SMALL_S3_PREFIX", "value": prefix},
            {"name": "SMALL_OUTPUT_POST", "value": json.dumps(output_post)}, {"name": "SMALL_RESULT_URL", "value": result_url}]}]}
        if files:
            key = app_key(app, "runs/" + run_id + "/input-manifest.json")
            put_doc(key, [{"name": f["name"], "filename": f["filename"], "size": f["size"], "sha256": f["sha256"], "url": input_file_url(f)} for f in files])
            url = client("s3").generate_presigned_url("get_object", Params={"Bucket": os.environ["BUCKET"], "Key": key}, ExpiresIn=1800)
            overrides["containerOverrides"][0]["environment"].append({"name": "SMALL_INPUT_MANIFEST_URL", "value": url})
        if len(json.dumps(overrides).encode()) > 8192:
            raise Rejected("Run inputs and upload grants exceed the AWS task limit", 413)
        put_doc(app_key(app, "runs/" + run_id + "/record.json"), run)
        try:
            result = client("ecs").run_task(cluster=os.environ["CLUSTER"], launchType="FARGATE", platformVersion="1.4.0",
                taskDefinition=doc["task_definition"], count=1, clientToken=run_id,
                networkConfiguration={"awsvpcConfiguration": {"subnets": os.environ["SUBNETS"].split(","),
                    "securityGroups": [os.environ["TASK_SECURITY_GROUP"]], "assignPublicIp": "DISABLED"}},
                overrides=overrides)
        except Exception as error:
            # A lost response does not prove ECS rejected this idempotent request.
            # Retain its image until the task's actual state is established.
            rejected = isinstance(error, ClientError) and error.response['Error']['Code'] in (
                'AccessDeniedException', 'InvalidParameterException', 'ClusterNotFoundException', 'ClientException')
            if rejected:
                run.update(status="failed", launch_rejected=True, reason="AWS could not start the task", finished_at=stamp(), exit_code=-1)
            else:
                run.update(status="starting", launch_uncertain=True, reason="AWS did not confirm whether the task started")
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
    match = re.fullmatch(r"/runs/([^/]+)(/logs|/outputs|/context)?", path)
    if match and method == "GET":
        run_id, suffix = match.groups()
        run = run_record(run_id, app)
        if suffix == '/context':
            return run_context(app, run, query)
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
            if run.get("input_files"):
                return {**run, "input_files": [{"name": f["name"] + os.path.splitext(f["filename"])[1], "size": f["size"],
                                                "url": input_file_url(f, 180)} for f in run["input_files"]]}
            return run
    raise Rejected("No such AWS operation", 404)


def handler(event, context):
    return handle_request(event, context)


def private_handler(event, context):
    # This entry has no public URL. Only the customer gateway's IAM role can
    # invoke it in the installation. Actor/scope are constructed by that gateway.
    return handle_request(event, context, private=True)


def handle_request(event, context, private=False):
    try:
        method = event.get("requestContext", {}).get("http", {}).get("method", "")
        app, path = app_route(event.get("rawPath", ""))
        permission = "read" if method == "GET" else "deploy" if path.startswith("/deploys") else "run"
        if private:
            actor = event.get("actor", {})
            if (os.environ.get("PRIVATE_GATEWAY") != "true" or actor.get("org") != os.environ["WORKSPACE"]
                    or actor.get("app") != app or not isinstance(actor.get("email"), str) or not actor["email"]
                    or not isinstance(actor.get("permissions"), list)
                    or permission not in actor.get("permissions", [])):
                raise Rejected("Not authorized for this job", 403)
            claims = {"sub": actor["email"]}
        else:
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
