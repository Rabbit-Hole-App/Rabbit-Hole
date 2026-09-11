"""One CPU job: stdout to ECS/CloudWatch, bounded outputs directly to customer S3."""
import json
import base64
import hashlib
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.request
from urllib.parse import urlsplit
import uuid


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def input_bytes(url, limit):
    parsed = urlsplit(url)
    expected = os.environ["SMALL_AWS_BUCKET"] + ".s3.us-east-1.amazonaws.com"
    if parsed.scheme != "https" or parsed.netloc != expected or parsed.fragment:
        raise ValueError("Invalid customer input URL")
    with urllib.request.build_opener(NoRedirect).open(url, timeout=60) as response:
        content = response.read(limit + 1)
    if len(content) > limit:
        raise ValueError("Input exceeds its declared limit")
    return content


def download_inputs(inputs, root):
    url = os.environ.get("SMALL_INPUT_MANIFEST_URL")
    if not url:
        return inputs
    manifest = json.loads(input_bytes(url, 20000))
    if not isinstance(manifest, list) or not 1 <= len(manifest) <= 5:
        raise ValueError("Invalid input manifest")
    values, names = dict(inputs), set()
    for info in manifest:
        name, filename, size = info["name"], info["filename"], info["size"]
        if (not re.fullmatch(r"[a-zA-Z][a-zA-Z0-9_]{0,39}", name) or name in names or inputs.get(name) != filename
                or not re.fullmatch(r"[^/\\:\x00-\x1f]{1,160}", filename) or filename in (".", "..")
                or type(size) is not int or not 0 <= size <= 10 * 1024 * 1024):
            raise ValueError("Invalid file input")
        names.add(name)
        content = input_bytes(info["url"], size)
        if len(content) != size or base64.b64encode(hashlib.sha256(content).digest()).decode() != info["sha256"]:
            raise ValueError("Input checksum does not match")
        destination = root / name / filename
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(content)
        destination.chmod(0o600)
        values[name] = str(destination)
    return values


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
    env = {k: v for k, v in os.environ.items() if k not in ("SMALL_OUTPUT_POST", "SMALL_RESULT_URL", "SMALL_INPUT_MANIFEST_URL")}
    env["SMALL_OUTPUTS"] = str(outputs)
    env["SMALL_INPUTS"] = "/tmp/small-inputs.json"
    print("runner: starting AWS CPU job", flush=True)
    try:
        inputs = download_inputs(inputs, Path("/tmp/small-uploaded-inputs"))
        Path(env["SMALL_INPUTS"]).write_text(json.dumps(inputs))
        for name, value in inputs.items():
            env["SMALL_INPUT_" + name.upper()] = str(value).lower() if isinstance(value, bool) else str(value)
        code = subprocess.run(argv, env=env, timeout=900).returncode
    except subprocess.TimeoutExpired:
        print("runner: job exceeded the 15 minute limit", flush=True)
        code = 124
    except Exception as error:
        print("runner: input preparation or job start failed (" + type(error).__name__ + ")", flush=True)
        code = 1
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
