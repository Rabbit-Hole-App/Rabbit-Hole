# Example job: a few seconds of fake work, progress to stdout, result JSON to S3.
import json
import os
import sys
import time
import uuid

import boto3


def main():
    run_id = os.environ.get("SMALL_RUN_ID") or uuid.uuid4().hex[:12]
    started = time.time()
    print(f"starting run {run_id}")
    for step in range(1, 6):
        time.sleep(1)
        print(f"step {step}/5 done")
    result = {
        "run_id": run_id,
        "started": started,
        "finished": time.time(),
        "user": os.environ.get("SMALL_USER"),
    }
    bucket = os.environ["S3_BUCKET"]
    key = f"runs/{run_id}.json"
    boto3.client("s3").put_object(Bucket=bucket, Key=key, Body=json.dumps(result).encode())
    print(f"wrote s3://{bucket}/{key}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"failed: {e}", file=sys.stderr)
        sys.exit(1)
