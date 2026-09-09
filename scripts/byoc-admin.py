"""Operator setup/proof helper. Never prints credentials or customer content."""
import argparse
import json
from pathlib import Path
import urllib.request
import urllib.error

import boto3
from botocore.exceptions import ClientError

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / ".small" / "byoc"
ACCOUNT = "637423432890"
REGION = "us-east-1"
BASE = "https://small-cp-dev.zeroshothq.workers.dev"


def session():
    cfg = dict(line.split("=", 1) for line in (ROOT / ".env").read_text().splitlines()
               if "=" in line and not line.lstrip().startswith("#"))
    aws = boto3.Session(aws_access_key_id=cfg["AWS_ACCESS_KEY_ID"].strip(),
                        aws_secret_access_key=cfg["AWS_SECRET_ACCESS_KEY"].strip(), region_name=REGION)
    if aws.client("sts").get_caller_identity()["Account"] != ACCOUNT:
        raise RuntimeError("Refusing to operate outside the user-approved AWS account")
    return aws


def small(path, body=None):
    config = json.loads((Path.home() / ".small" / "config.json").read_text())
    request = urllib.request.Request(BASE + path, headers={"Authorization": "Bearer " + config["token"],
        "Content-Type": "application/json", "User-Agent": "small-byoc-proof/1"}, data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        try:
            message = json.load(error).get("error", "Request failed")
        except (ValueError, AttributeError):
            message = "Request failed"
        raise SystemExit(f"Small HTTP {error.code}: {message}") from None


def platform_policy(bucket):
    return {"Version": "2012-10-17", "Statement": [
        {"Effect": "Allow", "Action": ["s3:GetObject", "s3:PutObject"], "Resource": f"arn:aws:s3:::{bucket}/templates/*"},
        {"Effect": "Allow", "Action": "sts:AssumeRole", "Resource": "arn:aws:iam::*:role/small-byoc-????????????-connection",
         "Condition": {"Null": {"sts:ExternalId": "false"}}},
    ]}


def enable_cross_account(aws):
    iam = aws.client("iam")
    name = "small-byoc-dev"
    user = iam.get_user(UserName=name)["User"]
    if user["Arn"] != f"arn:aws:iam::{ACCOUNT}:user/{name}":
        raise RuntimeError("Unexpected platform IAM user")
    tags = {x["Key"]: x["Value"] for x in iam.list_user_tags(UserName=name)["Tags"]}
    if tags.get("Purpose") != "small-byoc-preview":
        raise RuntimeError("IAM user is not owned by this preview")
    previous = iam.get_user_policy(UserName=name, PolicyName="small-byoc-preview")["PolicyDocument"]
    desired = platform_policy(f"small-byoc-installer-{ACCOUNT}-{REGION}")
    legacy = {**desired, "Statement": [desired["Statement"][0], {
        "Effect": "Allow", "Action": "sts:AssumeRole", "Resource": f"arn:aws:iam::{ACCOUNT}:role/small-byoc-*-connection"}]}
    if previous not in (legacy, desired):
        raise RuntimeError("Platform policy has unrelated changes; review before updating")
    STATE.mkdir(parents=True, exist_ok=True)
    backup = STATE / "platform-policy-before-cross-account.json"
    if not backup.exists():
        backup.write_text(json.dumps(previous, indent=2))
    iam.put_user_policy(UserName=name, PolicyName="small-byoc-preview", PolicyDocument=json.dumps(desired))
    print(json.dumps({"principal": user["Arn"], "connection_roles": desired["Statement"][1]["Resource"], "external_id_required": True}))


def bootstrap(aws):
    STATE.mkdir(parents=True, exist_ok=True)
    bucket = f"small-byoc-installer-{ACCOUNT}-{REGION}"
    s3, iam = aws.client("s3"), aws.client("iam")
    try:
        s3.head_bucket(Bucket=bucket, ExpectedBucketOwner=ACCOUNT)
    except ClientError as error:
        if error.response["Error"]["Code"] not in ("404", "NoSuchBucket"):
            raise
        s3.create_bucket(Bucket=bucket)
    s3.put_public_access_block(Bucket=bucket, PublicAccessBlockConfiguration={
        "BlockPublicAcls": True, "IgnorePublicAcls": True, "BlockPublicPolicy": True, "RestrictPublicBuckets": True})
    s3.put_bucket_encryption(Bucket=bucket, ServerSideEncryptionConfiguration={"Rules": [
        {"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]})
    name = "small-byoc-dev"
    try:
        user = iam.get_user(UserName=name)["User"]
        tags = {x["Key"]: x["Value"] for x in iam.list_user_tags(UserName=name)["Tags"]}
        if tags.get("Purpose") != "small-byoc-preview":
            raise RuntimeError("Existing IAM user is not owned by this preview setup")
    except iam.exceptions.NoSuchEntityException:
        user = iam.create_user(UserName=name, Tags=[{"Key": "Purpose", "Value": "small-byoc-preview"}])["User"]
    policy = platform_policy(bucket)
    iam.put_user_policy(UserName=name, PolicyName="small-byoc-preview", PolicyDocument=json.dumps(policy))
    secret_file = STATE / "vendor-secrets.json"
    if not secret_file.exists():
        if iam.list_access_keys(UserName=name)["AccessKeyMetadata"]:
            raise RuntimeError("Vendor key already exists; restore its local secrets file instead of issuing another key")
        key = iam.create_access_key(UserName=name)["AccessKey"]
        secret_file.write_text(json.dumps({"AWS_ACCESS_KEY_ID": key["AccessKeyId"], "AWS_SECRET_ACCESS_KEY": key["SecretAccessKey"]}))
    metadata = {"account_id": ACCOUNT, "region": REGION, "principal_arn": user["Arn"], "template_bucket": bucket}
    (STATE / "bootstrap.json").write_text(json.dumps(metadata, indent=2))
    print(json.dumps(metadata))
    print("Vendor credentials saved to the ignored .small/byoc/vendor-secrets.json")


def install(aws):
    STATE.mkdir(parents=True, exist_ok=True)
    data = small("/api/byoc/install", {"account_id": ACCOUNT, "job_name": "aws-cpu-proof"})
    (STATE / "installation.json").write_text(json.dumps(data))
    stack_name = "small-byoc-" + data["connection"]["id"][:12]
    cf = aws.client("cloudformation")
    cf.validate_template(TemplateURL=data["template_url"])
    result = cf.create_stack(StackName=stack_name, TemplateURL=data["template_url"],
        Capabilities=["CAPABILITY_NAMED_IAM"], Tags=[{"Key": "Purpose", "Value": "small-byoc-preview"}])
    print(json.dumps({"stack_id": result["StackId"], "workspace": data["connection"]["org"], "owner": data["connection"]["owner_email"]}))


def status(aws):
    data = json.loads((STATE / "installation.json").read_text())
    name = "small-byoc-" + data["connection"]["id"][:12]
    cf = aws.client("cloudformation")
    stack = cf.describe_stacks(StackName=name)["Stacks"][0]
    print(json.dumps({"stack": name, "status": stack["StackStatus"], "outputs": stack.get("Outputs", [])}))
    failures = [e for e in cf.describe_stack_events(StackName=name)["StackEvents"] if "FAILED" in e["ResourceStatus"]]
    for event in failures[:5]:
        print(json.dumps({"resource": event["LogicalResourceId"], "status": event["ResourceStatus"], "reason": event.get("ResourceStatusReason")}))


def update(aws):
    data = json.loads((STATE / "installation.json").read_text())
    name = "small-byoc-" + data["connection"]["id"][:12]
    cf = aws.client("cloudformation")
    stack = cf.describe_stacks(StackName=name)["Stacks"][0]
    if {t["Key"]: t["Value"] for t in stack["Tags"]}.get("Purpose") != "small-byoc-preview":
        raise RuntimeError("Refusing to update a stack not owned by this preview")
    template = cf.get_template(StackName=name)["TemplateBody"]
    if isinstance(template, str):
        template = json.loads(template)
    for resource, source in [("ApiFunction", "api.py"), ("SignerFunction", "signer.py")]:
        template["Resources"][resource]["Properties"]["Code"]["ZipFile"] = (ROOT / "packages/byoc" / source).read_text()
    result = cf.update_stack(StackName=name, TemplateBody=json.dumps(template), Capabilities=["CAPABILITY_NAMED_IAM"])
    print(json.dumps({"stack_id": result["StackId"], "status": "UPDATE_IN_PROGRESS"}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["inspect", "bootstrap", "install", "status", "connect", "update", "enable-cross-account"])
    args = parser.parse_args()
    if args.action == "connect":
        print(json.dumps(small("/api/byoc/connect", {})))
    else:
        aws = session()
        if args.action == "inspect":
            print(json.dumps({"account": ACCOUNT, "region": REGION}))
        elif args.action == "bootstrap":
            bootstrap(aws)
        elif args.action == "install":
            install(aws)
        elif args.action == "update":
            update(aws)
        elif args.action == "enable-cross-account":
            enable_cross_account(aws)
        else:
            status(aws)
