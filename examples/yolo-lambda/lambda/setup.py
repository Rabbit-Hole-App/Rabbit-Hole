# User-side AWS setup for this example — everything that exists BEFORE small is
# involved, plus the role small assumes. Run with admin creds in env
# (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY), needs only boto3.
#
#   python setup.py rig      # bucket + weights + ECR + CodeBuild image build + Lambda
#   python setup.py invoke   # prove it: bus.jpg through the Lambda, boxes back
#   python setup.py role     # role small assumes; prints the role_arn for small.toml
#
# One-time, idempotent. The bucket name is small-yolo-weights-<account-id>; it and
# the function ARN land in the Lambda's env (WEIGHTS_BUCKET) and .env (LAMBDA_ARN).
import base64
import io
import json
import sys
import time
import zipfile
from pathlib import Path

import boto3

HERE = Path(__file__).resolve().parent          # .../examples/yolo-lambda/lambda
EXAMPLES = HERE.parent.parent                   # .../examples
WEIGHTS = EXAMPLES / "yolo-gradio" / "yolov8n.pt"
BUS = EXAMPLES.parent / "tests" / "integration_tests" / "examples" / "yolo-gradio" / "bus.jpg"

REGION = "us-east-1"
FUNC = "small-yolo"
ECR_REPO = "small-yolo-lambda"
ROLE = "small-yolo-demo"
SMALL_PRINCIPAL_USER = "small-cp"  # small's AWS principal; in production small publishes this ARN
ORG = "gmail-com"                  # your small org — the ExternalId pinning the role to it

s3 = boto3.client("s3", region_name=REGION)
iam = boto3.client("iam", region_name=REGION)
ecr = boto3.client("ecr", region_name=REGION)
cb = boto3.client("codebuild", region_name=REGION)
lam = boto3.client("lambda", region_name=REGION)

ACCOUNT = boto3.client("sts").get_caller_identity()["Account"]
BUCKET = f"small-yolo-weights-{ACCOUNT}"
ECR_URI = f"{ACCOUNT}.dkr.ecr.{REGION}.amazonaws.com/{ECR_REPO}"
LAMBDA_ARN = f"arn:aws:lambda:{REGION}:{ACCOUNT}:function:{FUNC}"

BUILDSPEC = """version: 0.2
phases:
  pre_build:
    commands:
      - aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $ECR_URI
  build:
    commands:
      - docker build -t $ECR_URI:latest .
      - docker push $ECR_URI:latest
"""


def ensure_role(name, trust, policy):
    try:
        iam.create_role(RoleName=name, AssumeRolePolicyDocument=json.dumps(trust))
        print(f"created role {name}")
    except iam.exceptions.EntityAlreadyExistsException:
        iam.update_assume_role_policy(RoleName=name, PolicyDocument=json.dumps(trust))
        print(f"role {name} exists — trust updated")
    iam.put_role_policy(RoleName=name, PolicyName="inline", PolicyDocument=json.dumps(policy))
    return iam.get_role(RoleName=name)["Role"]["Arn"]


def service_trust(service):
    return {"Version": "2012-10-17", "Statement": [{"Effect": "Allow", "Principal": {"Service": service}, "Action": "sts:AssumeRole"}]}


def rig():
    try:
        s3.create_bucket(Bucket=BUCKET)
        print(f"created bucket {BUCKET}")
    except (s3.exceptions.BucketAlreadyOwnedByYou, s3.exceptions.BucketAlreadyExists):
        print(f"bucket {BUCKET} exists")
    s3.upload_file(str(WEIGHTS), BUCKET, "yolov8n.pt")
    print("uploaded yolov8n.pt")

    try:
        ecr.create_repository(repositoryName=ECR_REPO)
    except ecr.exceptions.RepositoryAlreadyExistsException:
        pass

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for f in (HERE / "Dockerfile", HERE / "handler.py"):
            z.write(f, f.name)
    s3.put_object(Bucket=BUCKET, Key="src/lambda-src.zip", Body=buf.getvalue())

    cb_role = ensure_role(
        "small-yolo-codebuild",
        service_trust("codebuild.amazonaws.com"),
        {
            "Version": "2012-10-17",
            "Statement": [
                {"Effect": "Allow", "Action": ["ecr:GetAuthorizationToken"], "Resource": "*"},
                {"Effect": "Allow", "Action": ["ecr:BatchCheckLayerAvailability", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart", "ecr:CompleteLayerUpload", "ecr:PutImage", "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"], "Resource": f"arn:aws:ecr:{REGION}:{ACCOUNT}:repository/{ECR_REPO}"},
                {"Effect": "Allow", "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"], "Resource": "*"},
                {"Effect": "Allow", "Action": ["s3:GetObject", "s3:GetObjectVersion"], "Resource": f"arn:aws:s3:::{BUCKET}/src/*"},
            ],
        },
    )
    project = {
        "name": "small-yolo-lambda-build",
        "source": {"type": "S3", "location": f"{BUCKET}/src/lambda-src.zip", "buildspec": BUILDSPEC},
        "artifacts": {"type": "NO_ARTIFACTS"},
        "environment": {"type": "LINUX_CONTAINER", "image": "aws/codebuild/standard:7.0", "computeType": "BUILD_GENERAL1_MEDIUM", "privilegedMode": True, "environmentVariables": [{"name": "ECR_URI", "value": ECR_URI}]},
        "serviceRole": cb_role,
        "timeoutInMinutes": 30,
    }
    for attempt in range(10):
        try:
            if project["name"] in cb.list_projects()["projects"]:
                cb.update_project(**project)
            else:
                cb.create_project(**project)
            break
        except cb.exceptions.InvalidInputException:
            time.sleep(6)  # IAM eventual consistency

    bid = cb.start_build(projectName=project["name"])["build"]["id"]
    print(f"codebuild {bid} building the Lambda image (torch pull, ~10 min)")
    while True:
        b = cb.batch_get_builds(ids=[bid])["builds"][0]
        if b["buildStatus"] != "IN_PROGRESS":
            break
        time.sleep(20)
    if b["buildStatus"] != "SUCCEEDED":
        sys.exit(f"build failed: {b['buildStatus']} — {b.get('logs', {}).get('deepLink')}")

    lam_role = ensure_role(
        "small-yolo-lambda-role",
        service_trust("lambda.amazonaws.com"),
        {
            "Version": "2012-10-17",
            "Statement": [
                {"Effect": "Allow", "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"], "Resource": "*"},
                {"Effect": "Allow", "Action": ["s3:GetObject"], "Resource": f"arn:aws:s3:::{BUCKET}/yolov8n.pt"},
            ],
        },
    )
    digest = ecr.describe_images(repositoryName=ECR_REPO, imageIds=[{"imageTag": "latest"}])["imageDetails"][0]["imageDigest"]
    # This is where WEIGHTS_BUCKET reaches handler.py: Lambda env vars, set on the function.
    cfg = dict(MemorySize=2048, Timeout=120, Environment={"Variables": {"WEIGHTS_BUCKET": BUCKET, "WEIGHTS_KEY": "yolov8n.pt"}})
    for attempt in range(10):
        try:
            try:
                lam.get_function(FunctionName=FUNC)
                lam.update_function_code(FunctionName=FUNC, ImageUri=f"{ECR_URI}@{digest}")
                lam.get_waiter("function_updated_v2").wait(FunctionName=FUNC)
                lam.update_function_configuration(FunctionName=FUNC, **cfg)
            except lam.exceptions.ResourceNotFoundException:
                lam.create_function(FunctionName=FUNC, PackageType="Image", Code={"ImageUri": f"{ECR_URI}@{digest}"}, Role=lam_role, **cfg)
            break
        except lam.exceptions.InvalidParameterValueException:
            time.sleep(6)
    lam.get_waiter("function_active_v2").wait(FunctionName=FUNC)
    (HERE.parent / ".env").write_text(f"LAMBDA_ARN={LAMBDA_ARN}\n")
    print("FUNCTION_ARN:", LAMBDA_ARN)
    print("BUCKET:", BUCKET)
    print("wrote ../.env with LAMBDA_ARN")


def invoke():
    payload = {"image_b64": base64.b64encode(BUS.read_bytes()).decode(), "user": "setup-test"}
    t = time.time()
    out = json.loads(lam.invoke(FunctionName=FUNC, Payload=json.dumps(payload))["Payload"].read())
    print(f"took {time.time() - t:.1f}s — {len(out['boxes'])} boxes: {[b['label'] for b in out['boxes']]}")


def role():
    arn = ensure_role(
        ROLE,
        {
            "Version": "2012-10-17",
            "Statement": [{
                "Effect": "Allow",
                "Principal": {"AWS": f"arn:aws:iam::{ACCOUNT}:user/{SMALL_PRINCIPAL_USER}"},
                "Action": "sts:AssumeRole",
                "Condition": {"StringEquals": {"sts:ExternalId": ORG}},
            }],
        },
        {"Version": "2012-10-17", "Statement": [{"Effect": "Allow", "Action": "lambda:InvokeFunction", "Resource": LAMBDA_ARN}]},
    )
    print("paste into small.toml [aws]:")
    print(f'role_arn = "{arn}"')


if __name__ == "__main__":
    {"rig": rig, "invoke": invoke, "role": role}[sys.argv[1]]()
