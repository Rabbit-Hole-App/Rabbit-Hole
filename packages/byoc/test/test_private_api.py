import importlib.util
import io
import json
import os
from pathlib import Path
import time
import unittest
from unittest.mock import Mock, patch


spec = importlib.util.spec_from_file_location("private_api", Path(__file__).parents[1] / "private_api.py")
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)

ENV = {"COGNITO_POOL_ID": "us-east-1_TestPool", "COGNITO_CLIENT_ID": "testclient123",
       "COGNITO_DOMAIN": "https://small-test.auth.us-east-1.amazoncognito.com",
       "WORKSPACE": "w-small-aws", "PRIVATE_API_ID": "api123", "METADATA_TABLE": "private-test", "ACCOUNT_ID": "503561429929"}


def event(path="/api/apps", method="GET", subject="owner-sub", **claims):
    return {"rawPath": path, "headers": {}, "requestContext": {"apiId": "api123",
        "http": {"method": method}, "authorizer": {"jwt": {"claims": {
            "sub": subject, "iss": "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_TestPool",
            "client_id": "testclient123", "token_use": "access", "scope": "openid email",
            "exp": int(time.time()) + 900, **claims}}}}}


class PrivateApiTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, ENV)
        self.env.start()
        self.addCleanup(self.env.stop)
        self.db = Mock()
        store_patch = patch.object(api, "table", return_value=self.db)
        self.store = store_patch.start()
        self.addCleanup(store_patch.stop)
        self.member = {"sub": "owner-sub", "email": "owner@example.test", "role": "owner"}
        self.workspace = {"name": "Small AWS"}
        self.db.get_item.side_effect = lambda **kw: {"Item": self.member if kw["Key"]["sk"].startswith("MEMBER#") else self.workspace}
        self.db.query.return_value = {"Items": []}

    def call(self, request):
        response = api.handler(request, None)
        self.assertEqual(response["headers"]["Cache-Control"], "no-store")
        return response["statusCode"], json.loads(response["body"])

    def test_public_config_contains_only_login_settings(self):
        request = event("/api/auth/config")
        del request["requestContext"]["authorizer"]
        status, body = self.call(request)
        self.assertEqual(status, 200)
        self.assertEqual(set(body), {"issuer", "clientId", "cognitoDomain", "cliRedirectUri"})
        self.store.assert_not_called()

    def test_missing_or_wrong_authorizer_never_reads_customer_metadata(self):
        for update in [{"iss": "https://other.example"}, {"client_id": "other"},
                       {"token_use": "id"}, {"exp": 1}, {"exp": "bad"},
                       {"sub": ""}, {"scope": "email"}]:
            with self.subTest(update=update):
                self.assertEqual(self.call(event(**update))[0], 401)
        request = event()
        del request["requestContext"]["authorizer"]
        self.assertEqual(self.call(request)[0], 401)
        request = event()
        request["requestContext"]["apiId"] = "another-api"
        self.assertEqual(self.call(request)[0], 401)
        self.store.assert_not_called()

    def test_membership_and_workspace_are_checked_on_every_request(self):
        self.member = None
        self.assertEqual(self.call(event())[0], 403)
        self.member = {"email": "viewer@example.test", "role": "member"}
        request = event()
        request["headers"]["x-small-workspace"] = "other-workspace"
        self.assertEqual(self.call(request)[0], 403)
        self.db.query.assert_not_called()

    def test_normal_dashboard_reads_actual_local_empty_catalog(self):
        status, data = self.call(event())
        self.assertEqual(status, 200)
        self.assertEqual((data["org"], data["orgName"], data["email"]),
                         ("w-small-aws", "Small AWS", "owner@example.test"))
        self.assertEqual(data["apps"], [])
        self.assertEqual(data["folders"], [])
        self.assertTrue(data["privateByoc"])
        self.assertTrue(all(call.kwargs["ConsistentRead"] for call in self.db.get_item.call_args_list))

    def test_app_visibility_does_not_follow_email_domain(self):
        self.member = {"email": "colleague@example.test", "role": "member"}
        self.db.query.return_value = {"Items": [
            {"name": "private", "owner_sub": "someone-else", "visibility": "private"},
            {"name": "shared", "owner_sub": "someone-else", "visibility": "private", "shared_with": ["viewer-sub"]},
            {"name": "workspace-app", "owner_sub": "someone-else", "visibility": "domain"},
        ]}
        _, data = self.call(event(subject="viewer-sub"))
        self.assertEqual([row["name"] for row in data["apps"]], ["shared", "workspace-app"])
        self.assertNotIn("shared_with", data["apps"][0])
        self.assertFalse(data["apps"][0]["canDeploy"])
        self.assertEqual(data["apps"][0]["aws_connection"], {"private": True, "account_id": "503561429929", "region": "us-east-1"})

    def test_workspace_and_members_fit_the_existing_settings(self):
        _, data = self.call(event("/api/workspaces"))
        self.assertEqual(data["active"], "w-small-aws")
        self.assertEqual(data["workspaces"][0]["role"], "owner")
        self.db.query.return_value = {"Items": [{"sk": "MEMBER#private-id", **self.member}]}
        _, data = self.call(event("/api/members"))
        self.assertEqual(data["members"], ["owner@example.test"])
        self.assertNotIn("private-id", json.dumps(data))

    def test_unimplemented_actions_fail_without_external_calls(self):
        for route in ["/api/byoc/grant", "/api/share", "/api/org/ai", "/api/ask", "/api/deploys"]:
            with self.subTest(route=route):
                self.assertEqual(self.call(event(route, "POST"))[0], 501)
        self.db.put_item.assert_not_called()

    def test_failure_does_not_expose_internal_exception(self):
        self.db.get_item.side_effect = RuntimeError("sensitive database connection details")
        status, data = self.call(event())
        self.assertEqual(status, 503)
        self.assertNotIn("sensitive", json.dumps(data))

    def job_fixture(self, app=None, result=None):
        os.environ["JOB_API_FUNCTION"] = "customer-job-api"
        self.addCleanup(lambda: os.environ.pop("JOB_API_FUNCTION", None))
        self.db.get_item.side_effect = lambda **kw: {"Item": self.member if kw["Key"]["sk"].startswith("MEMBER#")
            else self.workspace if kw["Key"]["sk"] == "META" else app}
        invoke = Mock()
        invoke.invoke.return_value = {"Payload": io.BytesIO(json.dumps({"statusCode": 200, "body": json.dumps(result or {"status": "uploading", "id": "deployment"})}).encode())}
        patcher = patch.object(api.boto3, "client", return_value=invoke)
        patcher.start()
        self.addCleanup(patcher.stop)
        return invoke

    def test_private_deploy_uses_verified_owner_and_registers_the_real_app(self):
        invoke = self.job_fixture()
        request = event("/api/jobs/apps/first-job/deploys", "POST")
        request.update(body=json.dumps({"entry": "job.py", "inputs": {}}), actor={"email": "attacker@example.test"})
        status, _ = self.call(request)
        self.assertEqual(status, 200)
        saved = self.db.put_item.call_args.kwargs["Item"]
        self.assertEqual((saved["name"], saved["owner_sub"]), ("first-job", "owner-sub"))
        forwarded = json.loads(invoke.invoke.call_args.kwargs["Payload"])
        self.assertEqual(forwarded["actor"], {"org": "w-small-aws", "app": "first-job", "email": "owner@example.test", "permissions": ["read", "run", "deploy"]})
        self.assertNotIn("authorizer", forwarded["requestContext"])
        self.assertNotIn("headers", forwarded)

    def test_member_cannot_create_deploy_or_read_an_unshared_app(self):
        self.member = {"email": "member@example.test", "role": "member"}
        invoke = self.job_fixture()
        self.assertEqual(self.call(event("/api/jobs/apps/new-job/deploys", "POST", subject="member-sub"))[0], 404)
        self.db.put_item.assert_not_called()
        self.job_fixture({"name": "private-job", "owner_sub": "owner-sub", "visibility": "private"})
        self.assertEqual(self.call(event("/api/jobs/apps/private-job/runs", subject="member-sub"))[0], 404)
        invoke.invoke.assert_not_called()

    def test_member_runs_a_visible_app_without_deploy_authority(self):
        self.member = {"email": "member@example.test", "role": "member"}
        invoke = self.job_fixture({"name": "shared-job", "owner_sub": "owner-sub", "visibility": "domain"}, {"run_id": "run"})
        request = event("/api/jobs/apps/shared-job/runs", "POST", subject="member-sub")
        request["body"] = '{"inputs":{"count":3}}'
        self.assertEqual(self.call(request)[0], 200)
        actor = json.loads(invoke.invoke.call_args.kwargs["Payload"])["actor"]
        self.assertEqual(actor["permissions"], ["read", "run"])
        self.assertEqual(self.call(event("/api/jobs/apps/shared-job/deploys", "POST", subject="member-sub"))[0], 403)

    def test_jobs_fail_closed_for_bad_identity_path_or_s3_access(self):
        invoke = self.job_fixture({"name": "job", "owner_sub": "owner-sub"})
        self.assertEqual(self.call(event("/api/jobs/apps/job/runs", token_use="id"))[0], 401)
        self.assertEqual(self.call(event("/api/jobs/apps/../runs"))[0], 404)
        request = event("/api/jobs/apps/job/deploys", "POST")
        request["body"] = '{"entry":"job.py","s3_read":"s3://bucket/folder/"}'
        self.assertEqual(self.call(request)[0], 501)
        invoke.invoke.assert_not_called()


if __name__ == "__main__":
    unittest.main()
