# s3-job — fetch an object from S3, summarize it, write the report both to
# $SMALL_OUTPUTS (run outputs, small run --download) and back to an S3 bucket.
# AWS creds come from the [aws] role in small.toml — per-run STS session in the
# env, nothing stored. boto3 finds them on its own.
import hashlib
import json
import os

import boto3

source = os.environ["SMALL_INPUT_SOURCE"]  # s3://bucket/key
dest_bucket = os.environ["SMALL_INPUT_OUTPUT_BUCKET"].removeprefix("s3://").rstrip("/")
out_dir = os.environ["SMALL_OUTPUTS"]

bucket, key = source.removeprefix("s3://").split("/", 1)
s3 = boto3.client("s3")
local = os.path.join(out_dir, "..", os.path.basename(key))
s3.download_file(bucket, key, local)

with open(local, "rb") as f:
    data = f.read()
report = {"source": source, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}

report_path = os.path.join(out_dir, "report.json")
with open(report_path, "w") as f:
    json.dump(report, f)
report_key = f"reports/{os.path.basename(key)}.report.json"
s3.upload_file(report_path, dest_bucket, report_key)
print(f"{report['bytes']} bytes, sha256 {report['sha256'][:12]}… → s3://{dest_bucket}/{report_key}")
