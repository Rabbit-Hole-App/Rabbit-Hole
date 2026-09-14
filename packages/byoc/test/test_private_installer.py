import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock

spec = importlib.util.spec_from_file_location("installer", Path(__file__).parents[1] / "install-private.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.config = {"target": "dev", "accountId": "503561429929", "region": "us-east-1", "poolId": "us-east-1_Pool", "clientId": "client123",
                       "cognitoDomain": "https://test.auth.us-east-1.amazoncognito.com", "stackName": "small-private-byoc", "workspace": "w-small"}
        (self.root / "release.json").write_text(json.dumps({"version": "0.1", "installation": self.config, "sha256": {}}))
        self.runner = Mock()
        self.installer = module.Installer(self.root, "503561429929", "default", "dev", runner=self.runner)

    def response(self, data):
        return Mock(returncode=0, stdout=json.dumps(data), stderr="")

    def test_other_account_stops_before_any_mutation(self):
        self.runner.return_value = self.response({"Account": "637423432890"})
        with self.assertRaisesRegex(RuntimeError, "Refusing to deploy"):
            self.installer.deploy()
        self.assertEqual(self.runner.call_count, 1)
        self.assertEqual(self.runner.call_args.args[0][1:3], ["sts", "get-caller-identity"])
        self.assertEqual(self.runner.call_args.kwargs["env"]["AWS_PROFILE"], "default")
        self.assertNotIn("AWS_ACCESS_KEY_ID", self.runner.call_args.kwargs["env"])

    def test_release_account_cannot_be_silently_changed(self):
        with self.assertRaisesRegex(RuntimeError, "requested account"):
            module.Installer(self.root, "637423432890", "default", "dev", runner=self.runner)
        self.runner.assert_not_called()

    def test_release_target_cannot_be_silently_changed(self):
        with self.assertRaisesRegex(RuntimeError, "target must match"):
            module.Installer(self.root, "503561429929", "default", "live", "DEPLOY LIVE", self.runner)
        self.runner.assert_not_called()

    def test_live_mutations_require_exact_confirmation_phrase(self):
        self.config["target"] = "live"
        (self.root / "release.json").write_text(json.dumps({"version": "0.1", "installation": self.config, "sha256": {}}))
        for action in ("deploy", "finish"):
            installer = module.Installer(self.root, "503561429929", "default", "live", runner=self.runner)
            with self.assertRaisesRegex(RuntimeError, "--confirm.*DEPLOY LIVE"):
                getattr(installer, action)()
        self.runner.assert_not_called()

    def test_installer_cli_requires_explicit_target(self):
        with self.assertRaises(SystemExit):
            module.parse_args(["status", "--account-id", "503561429929"])
        args = module.parse_args(["status", "--account-id", "503561429929", "--target", "dev"])
        self.assertEqual(args.target, "dev")

    def test_corrupt_release_is_rejected_before_contacting_aws(self):
        self.installer.manifest["sha256"] = {"asset.js": "wrong"}
        (self.root / "asset.js").write_text("changed")
        with self.assertRaisesRegex(RuntimeError, "checksum"):
            self.installer.verify()
        self.runner.assert_not_called()

    def test_existing_foreign_stack_is_never_updated(self):
        self.runner.return_value = self.response({"Stacks": [{"StackId": "arn:aws:cloudformation:us-east-1:503561429929:stack/existing/id", "Tags": []}]})
        with self.assertRaisesRegex(RuntimeError, "Refusing to change"):
            self.installer.stack()

    def test_reinstall_does_not_promote_an_existing_member(self):
        self.runner.return_value = self.response({"Item": {"role": {"S": "member"}}})
        with self.assertRaisesRegex(RuntimeError, "silently promoted"):
            self.installer.seed("metadata", "MEMBER#sub", {"email": "owner@example.test", "role": "owner"})
        self.assertEqual(self.runner.call_count, 1)

    def test_finish_preserves_cognito_settings_and_existing_return_urls(self):
        self.installer.config.update(ownerEmail="owner@example.test", workspaceName="Small AWS")
        self.installer.verify = Mock()
        self.installer.status = Mock(return_value={"status": "CREATE_COMPLETE", "outputs": {
            "SmallUrl": "https://customer.example", "MetadataTable": "metadata", "WebBucket": "web", "DistributionId": "distribution"}})
        self.installer.seed = Mock()
        current = {"UserPoolId": "us-east-1_Pool", "ClientId": "client123", "ClientName": "Existing SPA",
                   "CallbackURLs": ["https://demo.example"], "LogoutURLs": None, "AllowedOAuthFlows": ["code"],
                   "AllowedOAuthScopes": ["openid", "email", "phone"], "AllowedOAuthFlowsUserPoolClient": True,
                   "RefreshTokenValidity": 30, "CreationDate": "read-only"}
        self.installer.client = Mock(return_value=current)
        update = {}

        def aws(*args):
            if args[:2] == ("cognito-idp", "list-users"):
                return {"Users": [{"UserStatus": "CONFIRMED", "Attributes": [
                    {"Name": "sub", "Value": "owner-sub"}, {"Name": "email", "Value": "owner@example.test"}]}]}
            if "--generate-cli-skeleton" in args:
                return {key: None for key in current if key != "CreationDate"}
            if args[:2] == ("cognito-idp", "update-user-pool-client"):
                update.update(json.loads(Path(args[-1].removeprefix("file://")).read_text()))
            return {}

        self.installer.aws = Mock(side_effect=aws)
        result = self.installer.finish()
        self.assertEqual(result["url"], "https://customer.example/apps")
        self.assertEqual(update["CallbackURLs"], ["https://demo.example", "https://customer.example/auth/callback", "http://127.0.0.1:8766/auth/callback"])
        self.assertEqual(update["LogoutURLs"], ["https://customer.example/login"])
        self.assertEqual(update["AllowedOAuthScopes"], current["AllowedOAuthScopes"])
        self.assertEqual(update["RefreshTokenValidity"], 30)
        self.assertNotIn("CreationDate", update)
        self.assertEqual(current["CallbackURLs"], ["https://demo.example"])
        self.assertEqual(self.installer.seed.call_args.args[1], "MEMBER#owner-sub")

    def test_large_template_uses_only_a_private_customer_release_bucket(self):
        (self.root / "template.json").write_text("{}" + " " * 51201)
        calls, created = [], False

        def aws(*args):
            nonlocal created
            calls.append(args)
            if args[:2] == ("cloudformation", "describe-stacks"):
                if not created:
                    raise RuntimeError("Stack does not exist")
                return {"Stacks": [{"StackId": "arn:aws:cloudformation:us-east-1:503561429929:stack/small-private-byoc-releases/id",
                    "StackStatus": "CREATE_COMPLETE", "Tags": [{"Key": "Purpose", "Value": "small-private-releases"}],
                    "Outputs": [{"OutputKey": "Bucket", "OutputValue": "customer-private-releases"}]}]}
            if args[:2] == ("cloudformation", "create-stack"):
                template = json.loads(Path(args[args.index("--template-body") + 1].removeprefix("file://")).read_text())
                properties = template["Resources"]["Bucket"]["Properties"]
                self.assertTrue(all(properties["PublicAccessBlockConfiguration"].values()))
                self.assertIn("BucketEncryption", properties)
                created = True
            return {}

        self.installer.aws = Mock(side_effect=aws)
        result = self.installer.template_input()
        self.assertEqual(result, ["--template-url", "https://customer-private-releases.s3.us-east-1.amazonaws.com/releases/0.1/template.json"])
        upload = next(args for args in calls if args[:2] == ("s3api", "put-object"))
        self.assertEqual(upload[upload.index("--expected-bucket-owner") + 1], "503561429929")
        self.assertTrue(all("web" not in str(args) for args in calls))

    def test_software_update_preserves_customer_actions_and_binds_release_bucket(self):
        (self.root / "template.json").write_text(json.dumps({"Parameters": {"ReleaseBucketArn": {}, "AppGrantActions": {}}}))
        self.installer.verify = Mock()
        self.installer.stack = Mock(return_value={"Parameters": [{"ParameterKey": "AppGrantActions", "ParameterValue": "s3:GetObject,sqs:SendMessage"}]})
        self.installer.template_input = Mock(return_value=["--template-url", "https://customer-releases.s3.us-east-1.amazonaws.com/template.json"])
        self.installer.release_bucket = "customer-releases"
        self.installer.status = Mock(return_value={"status": "UPDATE_IN_PROGRESS"})
        self.installer.aws = Mock()
        self.installer.deploy()
        update = self.installer.aws.call_args.args
        self.assertEqual(update[:2], ("cloudformation", "update-stack"))
        self.assertIn("ParameterKey=AppGrantActions,UsePreviousValue=true", update)
        self.assertIn("ParameterKey=ReleaseBucketArn,ParameterValue=arn:aws:s3:::customer-releases", update)


if __name__ == "__main__":
    unittest.main()
