"""Install a packaged Small private release using the customer's AWS CLI profile.

No boto3/Node dependency on the customer's machine; no .env or platform keys.
The explicit --account-id must match STS before any AWS mutation.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys


class Installer:
    def __init__(self, root, account_id, profile, runner=subprocess.run):
        self.root, self.runner = Path(root).resolve(), runner
        self.manifest = json.loads((self.root / "release.json").read_text())
        self.config = self.manifest["installation"]
        if not re.fullmatch(r"\d{12}", account_id) or self.config["accountId"] != account_id:
            raise RuntimeError("The requested account must match this release's installation account.")
        if self.config["region"] != "us-east-1":
            raise RuntimeError("This pilot supports us-east-1 only.")
        self.account_id = account_id
        self.env = {key: value for key, value in os.environ.items() if key not in
                    ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_SECURITY_TOKEN")}
        self.env.update(AWS_PROFILE=profile, AWS_DEFAULT_REGION="us-east-1", AWS_PAGER="")
        self.state = self.root / ".install"

    def aws(self, *args):
        result = self.runner(["aws", *args, "--output", "json"], env=self.env, capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError(result.stderr.strip() or "AWS command failed")
        return json.loads(result.stdout) if result.stdout.strip() else {}

    def verify(self):
        for relative, expected in self.manifest["sha256"].items():
            path = (self.root / relative).resolve()
            if self.root not in path.parents or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
                raise RuntimeError("Release checksum mismatch: " + relative)
        identity = self.aws("sts", "get-caller-identity")
        if identity["Account"] != self.account_id:
            raise RuntimeError("Refusing to deploy: AWS profile resolves to account " + identity["Account"])
        pool = self.aws("cognito-idp", "describe-user-pool", "--user-pool-id", self.config["poolId"])["UserPool"]
        if pool["Arn"].split(":")[4] != self.account_id or not pool.get("AdminCreateUserConfig", {}).get("AllowAdminCreateUserOnly"):
            raise RuntimeError("Use the customer-owned Cognito pool with self-registration disabled.")
        domain = "https://" + pool.get("Domain", "") + ".auth.us-east-1.amazoncognito.com"
        if domain != self.config["cognitoDomain"]:
            raise RuntimeError("Cognito domain does not match the release configuration.")
        client = self.client()
        if client.get("ClientSecret") or "code" not in client.get("AllowedOAuthFlows", []) or not {"openid", "email"}.issubset(client.get("AllowedOAuthScopes", [])):
            raise RuntimeError("The Cognito client must be a public SPA client with code flow and openid/email scopes.")
        return {"account": identity["Account"], "identity": identity["Arn"], "pool": pool["Id"], "release": self.manifest["version"]}

    def client(self):
        return self.aws("cognito-idp", "describe-user-pool-client", "--user-pool-id", self.config["poolId"],
                        "--client-id", self.config["clientId"])["UserPoolClient"]

    def stack(self, name=None, purpose="small-private-byoc"):
        name = name or self.config["stackName"]
        try:
            stack = self.aws("cloudformation", "describe-stacks", "--stack-name", name)["Stacks"][0]
        except RuntimeError as error:
            if "does not exist" in str(error):
                return None
            raise
        tags = {row["Key"]: row["Value"] for row in stack.get("Tags", [])}
        if tags.get("Purpose") != purpose or stack["StackId"].split(":")[4] != self.account_id:
            raise RuntimeError("Refusing to change a stack that is not this customer-owned Small installation.")
        return stack

    def template_input(self):
        template = self.root / "template.json"
        parameters = json.loads(template.read_text()).get("Parameters", {})
        if template.stat().st_size <= 51200 and "ReleaseBucketArn" not in parameters:
            return ["--template-body", "file://" + str(template)]
        # CloudFormation limits inline templates to 51,200 bytes. A tiny customer
        # stack owns a private release bucket, separate from public web assets.
        name = self.config["stackName"] + "-releases"
        stack = self.stack(name, "small-private-releases")
        if not stack:
            bootstrap = {
                "Resources": {
                    "Bucket": {
                        "Type": "AWS::S3::Bucket", "DeletionPolicy": "Retain", "UpdateReplacePolicy": "Retain",
                        "Properties": {
                            "PublicAccessBlockConfiguration": {"BlockPublicAcls": True, "BlockPublicPolicy": True, "IgnorePublicAcls": True, "RestrictPublicBuckets": True},
                            "VersioningConfiguration": {"Status": "Enabled"},
                            "BucketEncryption": {"ServerSideEncryptionConfiguration": [{"ServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]},
                        },
                    },
                },
                "Outputs": {"Bucket": {"Value": {"Ref": "Bucket"}}},
            }
            self.aws("cloudformation", "create-stack", "--stack-name", name, "--template-body",
                     self.input_file("release-bucket.json", bootstrap), "--tags", "Key=Purpose,Value=small-private-releases")
            self.aws("cloudformation", "wait", "stack-create-complete", "--stack-name", name)
            stack = self.stack(name, "small-private-releases")
        if stack["StackStatus"] not in ("CREATE_COMPLETE", "UPDATE_COMPLETE"):
            raise RuntimeError("The private release-bucket stack is not ready: " + stack["StackStatus"])
        bucket = next(row["OutputValue"] for row in stack["Outputs"] if row["OutputKey"] == "Bucket")
        self.release_bucket = bucket
        key = "releases/" + self.manifest["version"] + "/template.json"
        self.aws("s3api", "put-object", "--bucket", bucket, "--key", key, "--body", str(template),
                 "--expected-bucket-owner", self.account_id, "--content-type", "application/json")
        return ["--template-url", "https://" + bucket + ".s3.us-east-1.amazonaws.com/" + key]

    def deploy(self):
        self.verify()
        stack = self.stack()
        template = self.template_input()
        self.aws("cloudformation", "validate-template", *template)
        args = ["cloudformation", "update-stack" if stack else "create-stack", "--stack-name", self.config["stackName"],
                *template, "--capabilities", "CAPABILITY_IAM", "--tags", "Key=Purpose,Value=small-private-byoc",
                "Key=Release,Value=" + self.manifest["version"]]
        if "ReleaseBucketArn" in json.loads((self.root / "template.json").read_text()).get("Parameters", {}):
            args += ["--parameters", "ParameterKey=ReleaseBucketArn,ParameterValue=arn:aws:s3:::" + self.release_bucket]
            if stack and any(p["ParameterKey"] == "AppGrantActions" for p in stack.get("Parameters", [])):
                args += ["ParameterKey=AppGrantActions,UsePreviousValue=true"]
        try:
            self.aws(*args)
        except RuntimeError as error:
            if "No updates are to be performed" not in str(error):
                raise
        return self.status()

    def status(self):
        stack = self.stack()
        if not stack:
            return {"status": "NOT_INSTALLED"}
        result = {"stack": self.config["stackName"], "status": stack["StackStatus"],
                  "outputs": {row["OutputKey"]: row["OutputValue"] for row in stack.get("Outputs", [])}}
        if "FAILED" in stack["StackStatus"] or "ROLLBACK" in stack["StackStatus"]:
            events = self.aws("cloudformation", "describe-stack-events", "--stack-name", self.config["stackName"])["StackEvents"]
            result["failures"] = [{"resource": row["LogicalResourceId"], "reason": row.get("ResourceStatusReason", "")}
                                  for row in events if "FAILED" in row["ResourceStatus"]][:5]
        return result

    def input_file(self, name, data):
        self.state.mkdir(exist_ok=True)
        path = self.state / name
        path.write_text(json.dumps(data))
        return "file://" + str(path)

    def seed(self, table, key, values):
        item_key = {"pk": {"S": self.config["workspace"]}, "sk": {"S": key}}
        current = self.aws("dynamodb", "get-item", "--table-name", table, "--key", json.dumps(item_key), "--consistent-read").get("Item")
        if current:
            if key.startswith("MEMBER#") and current.get("role", {}).get("S") != "owner":
                raise RuntimeError("An existing member cannot be silently promoted by reinstalling.")
            if key == "META" and current.get("owner_sub", {}).get("S") != values["owner_sub"]:
                raise RuntimeError("This workspace already has a different installation owner.")
            return
        self.aws("dynamodb", "put-item", "--table-name", table, "--item", json.dumps({**item_key, **{k: {"S": v} for k, v in values.items()}}),
                 "--condition-expression", "attribute_not_exists(pk)")

    def finish(self):
        self.verify()
        status = self.status()
        if status["status"] not in ("CREATE_COMPLETE", "UPDATE_COMPLETE"):
            raise RuntimeError("Wait for the stack to finish successfully before completing installation.")
        output = status["outputs"]
        users = self.aws("cognito-idp", "list-users", "--user-pool-id", self.config["poolId"], "--filter",
                         'email = "' + self.config["ownerEmail"] + '"', "--limit", "2", "--no-paginate")["Users"]
        if len(users) != 1 or users[0]["UserStatus"] != "CONFIRMED":
            raise RuntimeError("The installation owner must match one confirmed Cognito user.")
        attrs = {row["Name"]: row["Value"] for row in users[0]["Attributes"]}
        self.seed(output["MetadataTable"], "META", {"name": self.config["workspaceName"], "owner_sub": attrs["sub"]})
        self.seed(output["MetadataTable"], "MEMBER#" + attrs["sub"], {"sub": attrs["sub"], "email": attrs["email"], "role": "owner"})
        # Use the CLI's own input schema to preserve every writable client setting.
        current = self.client()
        schema = self.aws("cognito-idp", "update-user-pool-client", "--generate-cli-skeleton", "input")
        updated = {key: value for key, value in current.items() if key in schema}
        updated.update(UserPoolId=self.config["poolId"], ClientId=self.config["clientId"])
        for key, suffix in (("CallbackURLs", "/auth/callback"), ("LogoutURLs", "/login")):
            updated[key] = list(dict.fromkeys([*(current.get(key) or []), output["SmallUrl"] + suffix]))
        cli_callback = self.config.get("cliRedirectUri", "http://127.0.0.1:8766/auth/callback")
        if not re.fullmatch(r"http://(?:127\.0\.0\.1|localhost):8766/auth/callback", cli_callback):
            raise RuntimeError("Invalid CLI callback; it must use the local Small login port.")
        updated["CallbackURLs"] = list(dict.fromkeys([*updated["CallbackURLs"], cli_callback]))
        self.input_file("previous-cognito-client.json", {k: v for k, v in current.items() if k != "ClientSecret"})
        self.aws("cognito-idp", "update-user-pool-client", "--cli-input-json", self.input_file("cognito-client.json", updated))
        self.aws("s3", "sync", str(self.root / "web"), "s3://" + output["WebBucket"],
                 "--cache-control", "public,max-age=31536000,immutable", "--exclude", "index.html", "--only-show-errors")
        self.aws("s3", "cp", str(self.root / "web" / "index.html"), "s3://" + output["WebBucket"] + "/index.html",
                 "--content-type", "text/html", "--cache-control", "no-cache,no-store,must-revalidate", "--only-show-errors")
        self.aws("cloudfront", "create-invalidation", "--distribution-id", output["DistributionId"], "--paths", "/index.html")
        return {"account": self.account_id, "url": output["SmallUrl"] + "/apps", "owner": attrs["email"], "release": self.manifest["version"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("inspect", "deploy", "status", "finish"))
    parser.add_argument("--account-id", required=True)
    parser.add_argument("--profile", default="default")
    args = parser.parse_args()
    installer = Installer(Path(__file__).parent, args.account_id, args.profile)
    if args.action == "inspect":
        result = installer.verify()
    else:
        if args.action == "status":
            installer.verify()
        result = getattr(installer, args.action)()
    print(json.dumps(result))


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
