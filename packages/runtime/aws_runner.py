"""One CPU job: stdout to ECS/CloudWatch, bounded outputs directly to customer S3."""
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.request
import uuid


def upload_file(post, name, content):
    boundary = "small-" + uuid.uuid4().hex
    fields = {**post["fields"], "key": post["fields"]["key"].replace("${filename}", name)}
    parts = []
    for key, value in fields.items():
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode())
    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="output"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode())
    parts.extend([content, f"\r\n--{boundary}--\r\n".encode()])
    request = urllib.request.Request(post["url"], data=b"".join(parts), method="POST",
        headers={"Content-Type": "multipart/form-data; boundary=" + boundary})
    with urllib.request.urlopen(request, timeout=60):
        pass


def main(argv):
    outputs = Path("/tmp/small-outputs")
    outputs.mkdir(parents=True, exist_ok=True)
    inputs = json.loads(os.environ["SMALL_RUN_INPUTS"])
    env = {k: v for k, v in os.environ.items() if k not in ("SMALL_OUTPUT_POST", "SMALL_RESULT_URL")}
    env["SMALL_OUTPUTS"] = str(outputs)
    env["SMALL_INPUTS"] = "/tmp/small-inputs.json"
    Path(env["SMALL_INPUTS"]).write_text(json.dumps(inputs))
    for name, value in inputs.items():
        env["SMALL_INPUT_" + name.upper()] = str(value).lower() if isinstance(value, bool) else str(value)
    print("runner: starting AWS CPU job", flush=True)
    try:
        code = subprocess.run(argv, env=env, timeout=900).returncode
    except subprocess.TimeoutExpired:
        print("runner: job exceeded the 15 minute limit", flush=True)
        code = 124
    try:
        post = json.loads(os.environ["SMALL_OUTPUT_POST"])
        files = [p for p in outputs.rglob("*") if p.is_file()]
        if len(files) > 100:
            raise ValueError("at most 100 output files are supported")
        total = 0
        for file in files:
            name = file.relative_to(outputs).as_posix()
            if file.is_symlink() or not file.resolve().is_relative_to(outputs.resolve()):
                raise ValueError("output symlinks are not supported")
            size = file.stat().st_size
            total += size
            if size > 10 * 1024 * 1024 or total > 50 * 1024 * 1024:
                raise ValueError("outputs exceed the 10 MB per-file / 50 MB total limit")
            upload_file(post, name, file.read_bytes())
            print(f"runner: uploaded {name} ({size} bytes)", flush=True)
        request = urllib.request.Request(os.environ["SMALL_RESULT_URL"], data=json.dumps({"exit_code": code}).encode(),
            headers={"Content-Type": "application/json"}, method="PUT")
        with urllib.request.urlopen(request, timeout=30):
            pass
    except Exception as error:
        print("runner: output upload failed (" + type(error).__name__ + ")", flush=True)
        return 1
    print("runner: finished with exit " + str(code), flush=True)
    return code


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
