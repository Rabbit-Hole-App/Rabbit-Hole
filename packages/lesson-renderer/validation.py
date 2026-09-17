"""Validate the same declarative schema used at the API boundary; no executable inputs."""
import json
import math
import re
from pathlib import Path

SCHEMA = json.loads(Path(__file__).with_name('scene-schema.json').read_text())

def check(value, schema, path='scene'):
    kind = schema.get('type')
    valid = {'object': isinstance(value, dict), 'array': isinstance(value, list),
             'string': isinstance(value, str), 'number': isinstance(value, (int, float)) and not isinstance(value, bool)}
    if not valid.get(kind, False):
        raise ValueError(f'{path}: expected {kind}')
    if 'enum' in schema and value not in schema['enum']:
        raise ValueError(f'{path}: unsupported value')
    if kind == 'object':
        if set(value) - set(schema['properties']) or any(k not in value for k in schema.get('required', [])):
            raise ValueError(f'{path}: unexpected or missing fields')
        for key, item in value.items(): check(item, schema['properties'][key], f'{path}.{key}')
    elif kind == 'array':
        if not schema.get('minItems', 0) <= len(value) <= schema.get('maxItems', 100): raise ValueError(f'{path}: invalid item count')
        for item in value: check(item, schema['items'], path)
    elif kind == 'string':
        if not schema.get('minLength', 0) <= len(value.strip()) <= schema.get('maxLength', 1000): raise ValueError(f'{path}: invalid length')
        if 'pattern' in schema and not re.fullmatch(schema['pattern'], value): raise ValueError(f'{path}: invalid format')
    elif not math.isfinite(value) or not schema.get('minimum', -math.inf) <= value <= schema.get('maximum', math.inf):
        raise ValueError(f'{path}: out of range')

def validate(data):
    check(data, SCHEMA)
    objects = data['scene']['objects']; ids = {o['id']: o for o in objects}
    if len(ids) != len(objects): raise ValueError('Duplicate object ids')
    common = {'id', 'type', 'parent', 'position', 'rotation', 'scale', 'color'}
    fields = {'cube': set(), 'sphere': set(), 'arrow': {'start', 'end', 'thickness'}, 'coordinate_frame': {'length', 'thickness'}, 'camera_frustum': {'near', 'far', 'fov', 'aspect', 'thickness'}}
    for o in objects:
        if set(o) - common - fields[o['type']]: raise ValueError('Unsupported primitive fields')
        seen = {o['id']}; parent = o.get('parent')
        while parent:
            if parent not in ids or parent in seen: raise ValueError('Invalid or cyclic parent')
            seen.add(parent); parent = ids[parent].get('parent')
        if o['type'] == 'arrow' and (not o.get('start') or not o.get('end') or o['start'] == o['end']): raise ValueError('Arrow needs distinct endpoints')
        if o['type'] == 'camera_frustum' and o.get('near', .1) >= o.get('far', 3): raise ValueError('Invalid frustum planes')
    channels = set()
    for a in data['scene'].get('animations', []):
        if a['target'] not in ids or not a['start'] < a['end'] <= data.get('duration', 3): raise ValueError('Invalid animation target or interval')
        if a['type'] == 'scale' and any(not .01 <= v <= 20 for v in a['from'] + a['to']): raise ValueError('Invalid animated scale')
        channel = (a['target'], a['type'])
        if channel in channels: raise ValueError('Duplicate animation channel')
        channels.add(channel)
    return {**data, 'duration': data.get('duration', 3)}
