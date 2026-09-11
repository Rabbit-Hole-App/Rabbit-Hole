import base64
import hashlib
import importlib.util
import json
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location('aws_file_runner', Path(__file__).parents[2] / 'runtime' / 'aws_runner.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


def test_file_input_becomes_a_local_path_and_names_do_not_collide(monkeypatch, tmp_path):
    content = b'event-1\n'
    checksum = base64.b64encode(hashlib.sha256(content).digest()).decode()
    manifest = [{'name': name, 'filename': 'events.txt', 'size': len(content), 'sha256': checksum, 'url': 'file'} for name in ['first', 'second']]
    monkeypatch.setenv('SMALL_INPUT_MANIFEST_URL', 'manifest')
    monkeypatch.setattr(runner, 'input_bytes', lambda url, limit: json.dumps(manifest).encode() if url == 'manifest' else content)
    values = runner.download_inputs({'first': 'events.txt', 'second': 'events.txt', 'label': 'keep'}, tmp_path)
    assert values['label'] == 'keep'
    assert values['first'] != values['second']
    assert Path(values['first']).read_bytes() == content == Path(values['second']).read_bytes()
    manifest[0]['sha256'] = 'changed'
    with pytest.raises(ValueError, match='checksum'):
        runner.download_inputs({'first': 'events.txt', 'second': 'events.txt'}, tmp_path)
    manifest[0]['filename'] = '../escape.txt'
    with pytest.raises(ValueError):
        runner.download_inputs({'first': '../escape.txt', 'second': 'events.txt'}, tmp_path)


@pytest.mark.parametrize('url', ['http://customer.s3.us-east-1.amazonaws.com/file',
    'https://other.s3.us-east-1.amazonaws.com/file', 'https://customer.s3.us-east-1.amazonaws.com@evil.example/file',
    'https://127.0.0.1/file', 'file:///etc/passwd'])
def test_file_download_cannot_leave_the_customer_bucket(monkeypatch, url):
    monkeypatch.setenv('SMALL_AWS_BUCKET', 'customer')
    with pytest.raises(ValueError):
        runner.input_bytes(url, 100)
