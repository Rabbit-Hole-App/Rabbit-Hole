import base64
import hashlib
import hmac
import importlib.util
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch, Mock
from botocore.exceptions import ClientError

os.environ.update(INSTALLATION_ID="install-123", WORKSPACE="gmail-com", JOB_NAME="aws-cpu-proof", TASK_ROLE="arn:empty-task-role")
spec = importlib.util.spec_from_file_location("byoc_api", Path(__file__).parents[1] / "api.py")
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


def token(**changes):
    body = dict(iss="small-byoc", aud="install-123", org="gmail-com", sub="owner@example.test",
                iat=1000, exp=1180, permissions=["read", "run", "deploy"])
    body.update(changes)
    enc = lambda x: base64.urlsafe_b64encode(json.dumps(x).encode()).decode().rstrip("=")
    data = enc({"alg": "HS256", "typ": "JWT"}) + "." + enc(body)
    sig = base64.urlsafe_b64encode(hmac.new(b"test-secret", data.encode(), hashlib.sha256).digest()).decode().rstrip("=")
    return data + "." + sig


class ManagedPermissionTests(unittest.TestCase):
    def test_current_customer_metadata_controls_new_runs_and_blocks_incomplete_updates(self):
        scope = "s3://company-data/reports/"
        db = Mock()
        def state(value):
            db.get_item.return_value = {"Item": {"payload": {"S": json.dumps(value)}}}
        with patch.dict(os.environ, {"ACCESS_TABLE": "permissions", "S3_ACCESS": json.dumps({"legacy": scope}),
            "S3_ROLE_ARN_PREFIX": "arn:legacy-", "ACCESS_ROLE_ARN_PREFIX": "arn:managed-"}), patch.object(api, "client", return_value=db):
            state({"apps": {"report": scope}})
            self.assertEqual(api.task_role("report", scope), "arn:managed-report")
            self.assertEqual(api.task_role("legacy", scope), "arn:legacy-legacy")
            self.assertEqual(api.task_role("report", None), "arn:empty-task-role")
            with self.assertRaises(api.Rejected):
                api.task_role("other", scope)
            state({"apps": {"report": scope}, "pending": {"app_name": "report"}})
            with self.assertRaises(api.Rejected):
                api.task_role("report", scope)
            state({"apps": {"report": None, "legacy": None}})
            for app in ["report", "legacy"]:
                with self.assertRaises(api.Rejected):
                    api.task_role(app, scope)
            self.assertTrue(all(call.kwargs["ConsistentRead"] for call in db.get_item.call_args_list))


class AuthorizationTests(unittest.TestCase):
    def test_valid_grant_is_scoped_to_installation_workspace_and_operation(self):
        claims = api.authorize("Bearer " + token(), "test-secret", "deploy", now=1050)
        self.assertEqual(claims["sub"], "owner@example.test")

    def test_rejects_expiry_other_workspace_other_installation_and_excessive_lifetime(self):
        for changes in [dict(exp=1049), dict(org="other-org"), dict(aud="other-install"), dict(exp=9999), dict(iat=1100)]:
            with self.subTest(changes=changes), self.assertRaises(api.Rejected):
                api.authorize("Bearer " + token(**changes), "test-secret", "read", now=1050)

    def test_viewer_cannot_deploy(self):
        with self.assertRaises(api.Rejected):
            api.authorize("Bearer " + token(permissions=["read", "run"]), "test-secret", "deploy", now=1050)

    def test_forged_signature_is_rejected(self):
        with self.assertRaises(api.Rejected):
            api.authorize("Bearer " + token()[:-8] + "aaaaaaaa", "test-secret", "run", now=1050)

    def test_unauthenticated_request_does_not_read_customer_data(self):
        with patch.object(api, "signing_secret", return_value="test-secret"), patch.object(api, "client") as aws:
            response = api.handler({"rawPath": "/runs", "requestContext": {"http": {"method": "POST"}},
                                    "headers": {}, "body": "{}"}, None)
        self.assertEqual(response["statusCode"], 401)
        aws.assert_not_called()


class InputTests(unittest.TestCase):
    def test_defaults_and_typed_scalars(self):
        schema = {"count": {"type": "number", "default": 3}, "label": {"type": "text", "required": True}}
        self.assertEqual(api.validate_inputs(schema, {"label": "demo"}), {"count": 3, "label": "demo"})

    def test_unknown_input_and_wrong_type_fail(self):
        for value in [{"unknown": "x"}, {"count": "not-a-number"}, {"count": float("nan")}]:
            with self.subTest(value=value), self.assertRaises(api.Rejected):
                api.validate_inputs({"count": {"type": "number"}}, value)

    def test_file_inputs_are_explicitly_unsupported(self):
        with self.assertRaises(api.Rejected):
            api.validate_schema({"file": {"type": "file"}})

    def test_identifiers_and_output_paths_cannot_escape_run(self):
        for value in ["../secret", "r-1/../../secret", "", "r-123"]:
            with self.subTest(value=value), self.assertRaises(api.Rejected):
                api.record_id(value, "r")


class DeploymentTests(unittest.TestCase):
    def test_failed_build_start_can_be_retried_with_the_same_idempotency_token(self):
        deploy_id = "d-1234567890123-abcdefabcdef"
        stored = {"deploys/" + deploy_id + "/record.json": {"status": "uploading"}}
        def write(key, doc, **extra):
            if extra.get("IfNoneMatch") == "*" and key in stored:
                raise ClientError({"Error": {"Code": "PreconditionFailed"}}, "PutObject")
            stored[key] = dict(doc)
        s3, build = Mock(), Mock()
        s3.head_object.return_value = {"ContentLength": 100, "VersionId": "version-1"}
        build.start_build.side_effect = [ClientError({"Error": {"Code": "ThrottlingException"}}, "StartBuild"), {"build": {"id": "build-1"}}]
        with patch.dict(os.environ, {"BUCKET": "test", "BUILD_PROJECT": "test"}), \
                patch.object(api, "get_doc", side_effect=lambda key: dict(stored[key])), patch.object(api, "put_doc", side_effect=write), \
                patch.object(api, "client", side_effect=lambda service: s3 if service == "s3" else build):
            with self.assertRaises(ClientError):
                api.dispatch("POST", "/deploys/" + deploy_id + "/build", {}, {}, {})
            result = api.dispatch("POST", "/deploys/" + deploy_id + "/build", {}, {}, {})
        self.assertEqual(result["status"], "building")
        self.assertEqual(result["build_id"], "build-1")
        self.assertEqual([c.kwargs["idempotencyToken"] for c in build.start_build.call_args_list], [deploy_id, deploy_id])

    def test_reading_a_completed_build_cannot_publish_a_deployment(self):
        repo = "123456789012.dkr.ecr.us-east-1.amazonaws.com/test"
        build = Mock()
        build.batch_get_builds.return_value = {"builds": [{"buildStatus": "SUCCEEDED", "exportedEnvironmentVariables": [
            {"name": "IMAGE_URI", "value": repo + "@sha256:" + "a" * 64}]}]}
        with patch.dict(os.environ, {"REPOSITORY": repo}), patch.object(api, "get_doc", return_value={"status": "building", "build_id": "b"}), \
                patch.object(api, "client", return_value=build) as aws, patch.object(api, "put_doc") as write:
            result = api.deployment("d-1234567890123-abcdefabcdef", refresh=True)
        self.assertEqual(result["status"], "built")
        aws.assert_called_once_with("codebuild")
        write.assert_not_called()
        build.register_task_definition.assert_not_called()


class RunStartTests(unittest.TestCase):
    def test_rejected_or_failed_starts_never_leave_a_taskless_starting_run(self):
        for oversized in [False, True]:
            with self.subTest(oversized=oversized):
                s3, ecs, stored = Mock(), Mock(), {}
                s3.generate_presigned_post.return_value = {"url": "https://s3.example", "fields": {"policy": "x" * (9000 if oversized else 10)}}
                s3.generate_presigned_url.return_value = "https://s3.example/result"
                ecs.run_task.side_effect = ClientError({"Error": {"Code": "AccessDeniedException"}}, "RunTask")
                def write(key, doc, **extra):
                    stored[key] = dict(doc)
                with patch.dict(os.environ, {"BUCKET": "test", "CLUSTER": "test", "SUBNETS": "subnet", "TASK_SECURITY_GROUP": "sg"}), \
                        patch.object(api, "deployment", return_value={"id": "d", "status": "ready", "inputs": {}, "task_definition": "task"}), \
                        patch.object(api, "client", side_effect=lambda service: s3 if service == "s3" else ecs), \
                        patch.object(api, "put_doc", side_effect=write):
                    with self.assertRaises(api.Rejected if oversized else ClientError):
                        api.dispatch("POST", "/runs", {"deploy_id": "d"}, {}, {"sub": "owner@test"})
                self.assertTrue(all(doc["status"] == "failed" for doc in stored.values()))
                if oversized:
                    ecs.run_task.assert_not_called()
                else:
                    self.assertEqual(len(stored), 1)
                    self.assertEqual(next(iter(stored.values()))["exit_code"], -1)


class MultipleAppTests(unittest.TestCase):
    def setUp(self):
        self.stored, self.s3, self.ecs = {}, Mock(), Mock()
        self.s3.generate_presigned_url.return_value = "https://customer.s3.us-east-1.amazonaws.com/fixture"
        self.s3.generate_presigned_post.return_value = {"url": "https://customer.s3.us-east-1.amazonaws.com/", "fields": {}}
        self.ecs.run_task.return_value = {"tasks": [{"taskArn": "arn:task/fixture"}]}
        self.ecs.describe_tasks.return_value = {"tasks": [{"lastStatus": "RUNNING"}]}
        def prefixes(kind, limit=20):
            start = kind + "/"
            return sorted({start + key[len(start):].split("/")[0] + "/" for key in self.stored if key.startswith(start)}, reverse=True)[:limit]
        patches = [patch.dict(os.environ, {"BUCKET": "test", "CLUSTER": "test", "SUBNETS": "subnet", "TASK_SECURITY_GROUP": "sg"}),
                   patch.object(api, "get_doc", side_effect=lambda key, missing=None: self.stored.get(key, missing)),
                   patch.object(api, "put_doc", side_effect=lambda key, doc, **kw: self.stored.update({key: dict(doc)})),
                   patch.object(api, "prefixes", side_effect=prefixes), patch.object(api, "signing_secret", return_value="test-secret"),
                   patch.object(api.time, "time", return_value=1788980000),
                   patch.object(api, "client", side_effect=lambda service: self.s3 if service == "s3" else self.ecs)]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    def request(self, path, method="GET", body=None, viewer=False):
        return api.handler({"rawPath": path, "requestContext": {"http": {"method": method}},
                            "headers": {"authorization": "Bearer " + token(iat=1788980000, exp=1788980180,
                                permissions=["read", "run"] if viewer else ["read", "run", "deploy"])},
                            "body": json.dumps(body or {})}, None)

    def create(self, name, field):
        response = self.request("/apps/" + name + "/deploys", "POST", {"entry": "job.py", "inputs": {field: {"type": "text", "default": name}}})
        self.assertEqual(response["statusCode"], 200, response)
        doc = json.loads(response["body"])
        self.stored[api.app_key(name, "deploys/" + doc["id"] + "/record.json")].update(status="ready", task_definition="task:" + name)
        return doc

    def test_catalog_and_latest_deployments_preserve_legacy_and_separate_apps(self):
        first, second = self.create("aws-cpu-proof", "label"), self.create("word-count", "text")
        self.assertEqual(json.loads(self.request("/apps")["body"]), {"apps": [{"name": "aws-cpu-proof"}, {"name": "word-count"}]})
        for path in ["/job", "/apps/aws-cpu-proof/job"]:
            self.assertEqual(json.loads(self.request(path)["body"])["deployment"]["id"], first["id"])
        job = json.loads(self.request("/apps/word-count/job")["body"])
        self.assertEqual(job["deployment"]["id"], second["id"])
        self.assertEqual(set(job["deployment"]["inputs"]), {"text"})
        self.assertIn("deploys/" + first["id"] + "/record.json", self.stored)
        self.assertTrue(all(call.kwargs["Params"]["Key"].startswith("sources/") for call in self.s3.generate_presigned_url.call_args_list))

    def test_runs_pin_each_apps_task_and_scope_records_outputs_and_lists(self):
        self.create("aws-cpu-proof", "label")
        self.create("word-count", "text")
        runs = {}
        for name in ["aws-cpu-proof", "word-count"]:
            response = self.request("/apps/" + name + "/runs", "POST", {}, viewer=True)
            self.assertEqual(response["statusCode"], 200, response)
            runs[name] = json.loads(response["body"])["run_id"]
            self.assertEqual(self.ecs.run_task.call_args.kwargs["taskDefinition"], "task:" + name)
            prefix = api.app_key(name, "runs/" + runs[name])
            self.assertEqual(self.s3.generate_presigned_post.call_args.kwargs["Key"], prefix + "/outputs/${filename}")
            self.assertEqual(self.s3.generate_presigned_url.call_args.kwargs["Params"]["Key"], prefix + "/result.json")
        for name, run_id in runs.items():
            rows = json.loads(self.request("/apps/" + name + "/runs")["body"])["runs"]
            self.assertEqual([row["run_id"] for row in rows], [run_id])
            self.s3.list_objects_v2.return_value = {"Contents": []}
            self.assertEqual(self.request("/apps/" + name + "/runs/" + run_id + "/outputs")["statusCode"], 200)
            self.assertEqual(self.s3.list_objects_v2.call_args.kwargs["Prefix"], api.app_key(name, "runs/" + run_id + "/outputs/"))

    def test_cross_app_records_and_viewer_deploys_are_rejected_before_aws_operations(self):
        first = self.create("aws-cpu-proof", "label")
        run = json.loads(self.request("/apps/aws-cpu-proof/runs", "POST")["body"])
        self.s3.reset_mock()
        self.ecs.reset_mock()
        paths = ["/deploys/" + first["id"], "/deploys/" + first["id"] + "/logs",
                 "/runs/" + run["run_id"], "/runs/" + run["run_id"] + "/logs", "/runs/" + run["run_id"] + "/outputs"]
        for path in paths:
            self.assertEqual(self.request("/apps/word-count" + path)["statusCode"], 404)
        for path in ["/deploys", "/deploys/" + first["id"] + "/finalize", "/deploys/" + first["id"] + "/build"]:
            self.assertEqual(self.request("/apps/word-count" + path, "POST", viewer=True)["statusCode"], 403)
        self.assertEqual(self.request("/apps/word-count/runs", "POST", {"deploy_id": first["id"]})["statusCode"], 404)
        self.assertFalse(self.s3.mock_calls)
        self.assertFalse(self.ecs.mock_calls)

    def test_invalid_app_names_do_not_reach_storage(self):
        for name in ["..", "%2e%2e", "UPPER", "a" * 41, ""]:
            self.assertEqual(self.request("/apps/" + name + "/job")["statusCode"], 400)
        self.assertFalse(self.s3.mock_calls)

    def test_unapproved_scope_and_client_supplied_role_never_get_upload_urls(self):
        for extra in [{"s3_read": "s3://company-data/reports/"}, {"task_role_arn": "arn:privileged"}]:
            response = self.request("/apps/reports/deploys", "POST", {"entry": "job.py", **extra})
            self.assertIn(response["statusCode"], [400, 409])
        self.assertFalse(self.s3.mock_calls)
        self.assertFalse(self.stored)

    def test_approved_app_uses_its_role_other_apps_and_old_deploys_cannot_inherit_it(self):
        scope = "s3://company-data/reports/"
        with patch.dict(os.environ, {"S3_ACCESS": json.dumps({"reports": scope}), "S3_ROLE_ARN_PREFIX": "arn:task-"}):
            response = self.request("/apps/reports/deploys", "POST", {"entry": "job.py", "s3_read": scope})
            self.assertEqual(response["statusCode"], 200, response)
            doc = json.loads(response["body"])
            key = api.app_key("reports", "deploys/" + doc["id"] + "/record.json")
            self.stored[key].update(status="ready", task_definition="task:reports")
            result = self.request("/apps/reports/runs", "POST", {}, viewer=True)
            self.assertEqual(result["statusCode"], 200, result)
            overrides = self.ecs.run_task.call_args.kwargs["overrides"]
            self.assertEqual(overrides["taskRoleArn"], "arn:task-reports")
            env = {v["name"]: v["value"] for v in overrides["containerOverrides"][0]["environment"]}
            self.assertEqual(env["SMALL_S3_BUCKET"], "company-data")
            self.assertEqual(env["SMALL_S3_PREFIX"], "reports/")
            self.assertEqual(self.request("/apps/other/deploys", "POST", {"entry": "job.py", "s3_read": scope})["statusCode"], 409)
            self.create("other", "text")
            self.assertEqual(self.request("/apps/other/runs", "POST")["statusCode"], 200)
            self.assertEqual(self.ecs.run_task.call_args.kwargs["overrides"]["taskRoleArn"], "arn:empty-task-role")
            # A pre-permission deployment of the approved app still has no data access.
            self.stored[key]["s3_read"] = None
            self.request("/apps/reports/runs", "POST")
            self.assertEqual(self.ecs.run_task.call_args.kwargs["overrides"]["taskRoleArn"], "arn:empty-task-role")
            self.stored[key]["s3_read"] = scope
        self.ecs.reset_mock()
        self.s3.reset_mock()
        # An old deployment stops before a run record/upload grant/task is created.
        with patch.dict(os.environ, {"S3_ACCESS": "{}"}):
            self.assertEqual(self.request("/apps/reports/runs", "POST")["statusCode"], 409)
        self.assertFalse(self.ecs.mock_calls)
        self.assertFalse(self.s3.mock_calls)


if __name__ == "__main__":
    unittest.main()
