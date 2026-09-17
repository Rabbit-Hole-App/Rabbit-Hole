"""Read a bounded public GitHub snapshot. Never import or execute repository code."""
import io
import json
import re
import sys
import tempfile
import zipfile
from pathlib import Path, PurePosixPath
from urllib.request import Request, urlopen
from graphify.extract import extract

VERSION = 'graphifyy-0.9.63-small-1'
MAX_ARCHIVE = 20 * 1024 * 1024
MAX_EXPANDED = 32 * 1024 * 1024
MAX_TEXT = 8 * 1024 * 1024
MAX_FILE = 512 * 1024
MAX_FILES = 2000
CODE = {'.py', '.pyi', '.js', '.jsx', '.ts', '.tsx', '.go', '.rs', '.java', '.c', '.h', '.cpp', '.rb', '.cs', '.sh'}
TEXT = CODE | {'.md', '.rst', '.txt', '.toml', '.json', '.yaml', '.yml', '.cfg', '.ini', '.sql', '.css', '.html'}

def unpack(archive, directory):
    files, skipped, expanded, total = {}, [], 0, 0
    with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
        if len(bundle.infolist()) > 5000: raise ValueError('Repository exceeds 5000 archive entries')
        for entry in bundle.infolist():
            path = PurePosixPath(entry.filename)
            if path.is_absolute() or '..' in path.parts or '\\' in entry.orig_filename:
                raise ValueError('Unsafe repository archive path')
            if entry.is_dir(): continue
            expanded += entry.file_size
            if expanded > MAX_EXPANDED: raise ValueError('Repository exceeds 32 MB expanded limit')
            relative = PurePosixPath(*path.parts[1:])
            if not relative.parts: continue
            name = relative.as_posix()
            mode = entry.external_attr >> 16
            if mode & 0o170000 == 0o120000 or any(p.startswith('.') and p not in ('.github',) for p in relative.parts):
                skipped.append({'path': name, 'reason': 'hidden file or symlink'}); continue
            if relative.suffix.lower() not in TEXT and relative.name not in ('LICENSE', 'Dockerfile', 'Makefile'):
                skipped.append({'path': name, 'reason': 'binary or unsupported format'}); continue
            if entry.file_size > MAX_FILE:
                skipped.append({'path': name, 'reason': 'file exceeds 512 KB'}); continue
            data = bundle.read(entry)
            try: content = data.decode('utf-8')
            except UnicodeDecodeError:
                skipped.append({'path': name, 'reason': 'non-UTF-8 content'}); continue
            if '\x00' in content: skipped.append({'path': name, 'reason': 'binary content'}); continue
            total += len(data)
            if total > MAX_TEXT or len(files) >= MAX_FILES: raise ValueError('Repository exceeds text indexing limit (8 MB / 2000 files)')
            if name in files: raise ValueError('Duplicate archive path')
            files[name] = content
            target = directory.joinpath(*relative.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding='utf-8')
    return files, skipped

def index(repo, commit):
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repo) or not re.fullmatch('[a-f0-9]{40}', commit):
        raise ValueError('Invalid repository or commit')
    request = Request(f'https://codeload.github.com/{repo}/zip/{commit}', headers={'User-Agent': 'Small-Learn'})
    with urlopen(request, timeout=40) as response:
        if not response.url.startswith('https://codeload.github.com/'): raise ValueError('Unexpected archive host')
        archive = response.read(MAX_ARCHIVE + 1)
    if len(archive) > MAX_ARCHIVE: raise ValueError('Repository download exceeds 20 MB')
    with tempfile.TemporaryDirectory(prefix='source-') as temp:
        root = Path(temp).resolve()
        files, skipped = unpack(archive, root)
        graph = extract([root / p for p in files if Path(p).suffix in CODE], root=root, cache_root=root/'_cache', parallel=False)
        nodes = []
        def local(path):
            path = str(path or '').replace('\\', '/')
            prefix = root.as_posix()+'/'
            return path[len(prefix):] if path.startswith(prefix) else path
        for node in graph['nodes']:
            path = local(node.get('source_file'))
            line = re.search(r'\d+', str(node.get('source_location', '1')))
            nodes.append({'id': node['id'], 'label': node.get('label', node['id']), 'path': path if path in files else None,
                          'line': int(line[0]) if line else 1, 'kind': 'symbol' if node.get('_callable') else node.get('file_type', 'symbol')})
        ids = {n['id'] for n in nodes}
        edges = []
        for edge in graph['edges']:
            # Retain external dependency nodes even when their implementation is outside this snapshot.
            for endpoint in ('source', 'target'):
                if edge[endpoint] not in ids:
                    ids.add(edge[endpoint]); nodes.append({'id': edge[endpoint], 'label': edge[endpoint], 'path': None, 'line': 1, 'kind': 'external'})
            edges.append({k: edge.get(k) for k in ('source', 'target', 'relation', 'confidence', 'context')})
        if len(nodes) > 10000 or len(edges) > 30000: raise ValueError('Graph exceeds 10000 nodes / 30000 relationships')
        return {'version': VERSION, 'repo': repo, 'commit': commit, 'files': files, 'skipped': skipped,
                'graph': {'nodes': nodes, 'edges': edges}}

if __name__ == '__main__':
    request = json.loads(Path(sys.argv[1]).read_text())
    result = index(request['repo'], request['commit'])
    Path(sys.argv[2]).write_text(json.dumps(result), encoding='utf-8')
