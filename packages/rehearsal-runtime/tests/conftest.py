import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

ROOT = Path(__file__).resolve().parent.parent
SCHEMAS = ROOT / 'schemas'
FIXTURE = ROOT / 'fixtures' / 'nanogpt-3adf61e'


def load(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


@pytest.fixture(scope='session')
def registry():
    return Registry().with_resources((s['$id'], Resource.from_contents(s)) for s in (load(p) for p in SCHEMAS.glob('*.json')))


@pytest.fixture(scope='session')
def validator(registry):
    def make(name):
        return Draft202012Validator(load(SCHEMAS / (name + '.json')), registry=registry)
    return make


def route_from_fixture():
    """The fixture's expected-route.json reshaped to schemas/route.json (the fixture keeps extra comparison fields)."""
    e = load(FIXTURE / 'expected-route.json')
    return {
        'routeId': e['routeId'],
        'title': 'Train a character-level GPT on Shakespeare',
        'whyChosen': 'README says about 3 minutes; fits cpu and a 20 minute budget',
        'alternatives': [{'routeId': a['routeId'], 'rejected': a['rejectedBecause']} for a in e['alternatives']],
        'install': [{'cmd': 'pip install torch numpy requests tiktoken', 'source': i['source'], 'trimmedFrom': i['cmd']} for i in e['install']],
        'steps': [{k: s[k] for k in ('id', 'cmd', 'source', 'timeoutSec', 'checks')} for s in e['steps']],
        'knobs': [{k: v for k, v in kb.items() if k in ('step', 'flag', 'default', 'type', 'source', 'safeValue', 'optional')} for kb in e['knobs']],
    }
