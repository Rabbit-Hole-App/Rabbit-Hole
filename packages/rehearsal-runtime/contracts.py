"""JSON-schema validators for the frozen contracts in schemas/ (one registry so `$ref: route.json` resolves)."""
import json
from pathlib import Path

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

SCHEMAS = Path(__file__).resolve().parent / 'schemas'
_REG = Registry().with_resources((s['$id'], Resource.from_contents(s)) for s in (json.loads(p.read_text(encoding='utf-8')) for p in SCHEMAS.glob('*.json')))


def validator(name: str) -> Draft202012Validator:
    return Draft202012Validator(json.loads((SCHEMAS / (name + '.json')).read_text(encoding='utf-8')), registry=_REG)


def errors(name: str, doc) -> list:
    """Human-readable schema errors (empty when valid)."""
    return [('/'.join(str(p) for p in e.absolute_path) or '<root>') + ': ' + e.message[:300] for e in validator(name).iter_errors(doc)]
