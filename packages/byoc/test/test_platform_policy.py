import importlib.util
from pathlib import Path
import unittest
from unittest.mock import Mock

spec = importlib.util.spec_from_file_location("byoc_admin", Path(__file__).resolve().parents[3] / "scripts/byoc-admin.py")
admin = importlib.util.module_from_spec(spec)
spec.loader.exec_module(admin)


class PlatformPolicyTests(unittest.TestCase):
    def test_cross_account_access_is_limited_to_connection_roles_with_external_ids(self):
        policy = admin.platform_policy("installer-fixture")
        self.assertEqual(policy["Statement"], [
            {"Effect": "Allow", "Action": ["s3:GetObject", "s3:PutObject"], "Resource": "arn:aws:s3:::installer-fixture/templates/*"},
            {"Effect": "Allow", "Action": "sts:AssumeRole", "Resource": "arn:aws:iam::*:role/small-byoc-????????????-connection",
             "Condition": {"Null": {"sts:ExternalId": "false"}}},
        ])

    def test_operator_refuses_to_overwrite_unrelated_policy_changes(self):
        aws, iam = Mock(), Mock()
        aws.client.return_value = iam
        iam.get_user.return_value = {"User": {"Arn": "arn:aws:iam::637423432890:user/small-byoc-dev"}}
        iam.list_user_tags.return_value = {"Tags": [{"Key": "Purpose", "Value": "small-byoc-preview"}]}
        iam.get_user_policy.return_value = {"PolicyDocument": {"Version": "2012-10-17", "Statement": []}}
        with self.assertRaisesRegex(RuntimeError, "unrelated changes"):
            admin.enable_cross_account(aws)
        iam.put_user_policy.assert_not_called()


if __name__ == "__main__":
    unittest.main()
