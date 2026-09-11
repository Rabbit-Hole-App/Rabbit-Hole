"""Scoped app requests, bounded by customer configuration. No AWS calls."""
import json
import os
import re


def installed_actions():
    actions = os.environ.get("APP_GRANT_ACTIONS", "").split(",")
    if not 1 <= len(actions) <= 100 or any(not valid_action(a) for a in actions):
        raise ValueError("The installation's AppGrantActions configuration is invalid")
    return sorted(set(actions))


def valid_action(action):
    return (isinstance(action, str) and bool(re.fullmatch(r"[a-z0-9-]+:[A-Za-z][A-Za-z0-9]{0,99}", action))
            and action.split(":")[0] not in ("iam", "sts", "organizations", "account", "cloudformation"))


def check_protected(grants):
    """Small's control resources are never delegated as application data."""
    namespaces = [n for n in os.environ.get("SMALL_RESOURCE_NAMES", "").split(",") if n]
    data_bucket = os.environ.get("SMALL_DATA_BUCKET")
    protected_buckets = {os.environ.get("SMALL_WEB_BUCKET"), os.environ.get("SMALL_RELEASE_BUCKET")}
    for grant in grants:
        resource = grant["resource"]
        if resource.startswith("arn:aws:s3:::"):
            bucket, _, key = resource[13:].partition("/")
            if bucket in protected_buckets:
                raise ValueError("Small installation resources cannot be granted to apps")
            if bucket == data_bucket:
                literal = key.removesuffix("*")
                reserved = ("sources/", "deploys/", "runs/", "uploads/", "apps/")
                if grant["action"] != "s3:GetObject" or not literal or any(literal.startswith(p) or p.startswith(literal) for p in reserved):
                    raise ValueError("Small's source, run and upload storage is reserved")
        elif (any(n in resource.split(":", 5)[-1] for n in namespaces)
              or resource == os.environ.get("SMALL_COGNITO_ARN")):
            raise ValueError("Small installation resources cannot be granted to apps")


def legacy_scope(value):
    if value is None:
        return None
    match = re.fullmatch(r"s3://([a-z0-9][a-z0-9.-]{1,61}[a-z0-9])/([A-Za-z0-9_][A-Za-z0-9_./-]{0,199})", value) if isinstance(value, str) else None
    if not match:
        raise ValueError("Use one literal S3 folder")
    bucket, prefix = match.groups()
    if ".." in bucket or "//" in prefix or re.fullmatch(r"\d+\.\d+\.\d+\.\d+", bucket) or any(p in ("", ".", "..") for p in prefix.rstrip("/").split("/")):
        raise ValueError("Invalid S3 folder")
    return "s3://" + bucket + "/" + prefix.rstrip("/") + "/"


def normalize_grants(value, account=None, region="us-east-1", allowed_actions=None):
    if not isinstance(value, list) or len(value) > 20:
        raise ValueError("Use at most 20 app permission grants")
    result = set()
    for grant in value:
        if not isinstance(grant, dict) or set(grant) != {"action", "resource"}:
            raise ValueError("Each grant needs only action and resource")
        action, resource = grant["action"], grant["resource"]
        if not valid_action(action) or not isinstance(resource, str) or len(resource) > 512:
            raise ValueError("Unsupported AWS action or resource")
        if allowed_actions is not None and action not in allowed_actions:
            raise ValueError(action + " is not enabled. Ask the AWS administrator to update AppGrantActions in the installation stack; a new Small release is not required.")
        valid = False
        if action.startswith("s3:"):
            match = re.fullmatch(r"arn:aws:s3:::([a-z0-9][a-z0-9.-]{1,61}[a-z0-9])(?:/(.+))?", resource)
            if match:
                bucket, key = match.groups()
                valid = ".." not in bucket and not re.fullmatch(r"\d+\.\d+\.\d+\.\d+", bucket)
                if action in ("s3:GetObject", "s3:PutObject"):
                    valid = valid and key is not None
                if action == "s3:ListBucket":
                    valid = valid and key is None
                if key:
                    literal = key[:-1] if key.endswith("*") else key
                    valid = valid and ("*" not in key or key == "*" or key.endswith("/*"))
                    valid = valid and bool(re.fullmatch(r"[A-Za-z0-9_./-]*", literal)) and "//" not in literal
                    if literal:
                        valid = valid and all(p not in (".", "..", "") for p in literal.rstrip("/").split("/"))
        elif account and re.fullmatch(r"\d{12}", account):
            match = re.fullmatch(r"arn:aws:([a-z0-9-]+):" + re.escape(region + ":" + account) + r":([A-Za-z0-9_./:$-]+\*?)", resource)
            if match:
                service, key = match.groups()
                valid = service == action.split(":")[0] and "${" not in key and "//" not in key and ".." not in key.split("/")
                valid = valid and ("*" not in key or (action == "ecs:DescribeTasks" and key.endswith("/*")))
                if service == "lambda":
                    valid = valid and bool(re.fullmatch(r"function:[A-Za-z0-9_-]{1,64}(?::(?:[A-Za-z0-9_-]{1,128}|\$LATEST))?", key))
                if service == "ecs" and action == "ecs:DescribeTasks":
                    valid = valid and bool(re.fullmatch(r"task/[A-Za-z0-9_-]{1,255}/(?:[A-Za-z0-9-]+|\*)", key))
        if not valid:
            raise ValueError("Use an exact supported resource in this installation's account and region: " + action)
        result.add((action, resource))
    normalized = [{"action": a, "resource": r} for a, r in sorted(result)]
    if len(json.dumps(grant_policy(normalized), separators=(",", ":"))) > 9500:
        raise ValueError("App permissions exceed the IAM policy limit")
    return normalized


def stored_grants(value, account=None, region="us-east-1"):
    if isinstance(value, list):
        return normalize_grants(value, account, region)
    scope = legacy_scope(value)
    return [{"action": "s3:GetObject", "resource": "arn:aws:s3:::" + scope[5:] + "*"}] if scope else []


def grant_policy(grants):
    if not grants:
        return [{"Effect": "Deny", "Action": "*", "Resource": "*"}]
    statements = []
    actions = sorted({g["action"] for g in grants})
    for action in actions:
        resources = sorted({g["resource"] for g in grants if g["action"] == action})
        resource = resources[0] if len(resources) == 1 else resources
        statements.extend([{"Effect": "Allow", "Action": action, "Resource": resource},
                           {"Effect": "Deny", "Action": action, "NotResource": resource}])
    # Future additions to the installation boundary cannot broaden an old approval.
    statements.append({"Effect": "Deny", "NotAction": actions, "Resource": "*"})
    return statements
