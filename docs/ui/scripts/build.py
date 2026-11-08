#!/usr/bin/env python3
"""Build the catalog from component metadata/fragments using Python's standard library."""
from pathlib import Path
from ui_fragments import read_markup
import argparse, html, json, re, urllib.parse

ROOT=Path(__file__).resolve().parents[1]
def write(p,s):
 p.parent.mkdir(parents=True,exist_ok=True);p.write_text(s)
def escape(s): return html.escape(str(s),quote=True)
def load_records():
 return sorted((json.loads(p.read_text()) for p in ROOT.glob('components/*/*/component.json')),key=lambda c:c['id'])
def render(record):
 folder=ROOT/record['path']; fragment=read_markup(folder)
 # Preview-local fragments stay local. Links to source-only sections retain their original context.
 ids=set(re.findall(r'\bid=["\']([^"\']+)',fragment))
 def link(m):
  target=m[2]
  if target.startswith('#') and target[1:] not in ids: target=record['source'].split('#')[0]+target
  elif not target.startswith(('#','http:','https:','mailto:','data:','../../../')):
   target=urllib.parse.urljoin(record['source'],target)
  return 'href='+m[1]+target+m[1]
 fragment=re.sub(r'href=(["\'])([^"\']+)\1',link,fragment)
 templates='\n'.join((ROOT/'templates'/f'{t}.html').read_text() for t in record['templates'])
 css='\n'.join(f'<link rel="stylesheet" href="../../../styles/{escape(s)}.css">' for s in record['styles'])
 scripts='\n'.join(f'<script src="../../../scripts/{escape(s)}.js"></script>' for s in record['scripts'])
 if False and record['id'].endswith('-contract'):
  fragment='<p>This is a host-populated contract. The slots below need renderer data and event bindings.</p><pre>'+escape(fragment)+'</pre>'
 text=f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{escape(record['title'])} · Rabbit Hole UI</title>
{css}
<link rel="stylesheet" href="../../../foundations/palette.css">
<link rel="stylesheet" href="../../../styles/preview.css"></head>
<body data-ui-palette="{escape(record.get('paletteRole','shared'))}"><div class="catalog-note"><a href="../../../index.html">UI catalog</a> · <a href="README.md">Component mapping</a> · <a href="{escape(record['source'])}">Source</a><p>{escape(record['status'])} — {escape(record['notes'])}</p></div>
<div class="catalog-preview">{fragment}</div>
{templates}
{scripts}
</body></html>
'''
 write(folder/'preview.html',text)
 impl='\n'.join('- ['+p+'](../../../../../'+p+')' for p in record['implementation']) or '- No app mapping asserted; this is a reference/workflow asset.'
 issues=', '.join(record['issues']) or 'See the collection review and verification checklist.'
 readme=f'''# {record['title']}

Stable ID: `{record['id']}` · Status: **{record['status']}**

[Open preview](preview.html) · [Markup](markup.html) · [Metadata](component.json) · [Original source]({record['source']}) · [Collection review](../../../REVIEW.md)

{record['notes']}

Palette role: **{record.get('paletteRole','shared')}**. [Current blue/red balance](../../../foundations/PALETTE.md) supersedes the all-blue experiment controls in aa2cfb1. Flow previews use the current palette; linked archived sources preserve their original styling. Original shared CSS is retained for review; the explicit semantic overlay is `foundations/palette.css`.

## Edit and find

Edit `markup.html` and `component.json` here. Shared styles: {', '.join('`styles/'+s+'.css`' for s in record['styles']) or 'none'}. Behavior: {', '.join('`scripts/'+s+'.js`' for s in record['scripts']) or 'static/native HTML only'}. Paths are relative to `docs/ui/`. Run `python docs/ui/scripts/build.py` from the repository root after editing. `preview.html`, this README, the index and registry are generated; do not edit those outputs directly.

Template dependencies: {', '.join('`templates/'+t+'.html`' for t in [*record['templates'],*record.get('includes',[])]) or 'none'}.

## App mapping candidates

These are existing integration landmarks, not proof this reference is implemented. Resolve the latest integrated implementation before changing the app; the audit snapshot is `aa2cfb1`.

{impl}

## Acceptance and gaps

Review items: {issues}

Before app adoption: verify applicable default, hover, pressed, selected, focus, disabled, empty, loading and error states; keyboard interaction; long text; 320 px / 440 px / Focus layout; reduced motion for animated components. Not every state applies to every component. Static references do not prove selection wiring, persistence, source navigation or renderer registration. Browser visual acceptance remains pending.
'''
 write(folder/'README.md',readme)
def main():
 records=load_records()
 for r in records: render(r)
 write(ROOT/'registry.json',json.dumps({'schemaVersion':1,'baseline':'aa2cfb19a2ca551f2c99aad5cbbacf968c7b9f56','components':records},indent=2)+'\n')
 rows=[]
 for r in records:
  if not r.get('catalogVisible',True):continue
  markup=read_markup(ROOT/r['path'])
  visible=html.unescape(re.sub(r'<[^>]+>',' ',markup))
  labels=' '.join(re.findall(r'(?:aria-label|title)=["\']([^"\']+)',markup))
  hay=' '.join([r['id'],r['title'],r['status'],r['source_file'],r['notes'],visible,labels,*r['keywords'],*r['implementation'],*r['issues']]).lower()
  hay=' '.join(hay.split())
  rows.append(f'<article class="entry" data-search="{escape(hay)}" data-category="{escape(r["category"])}"><h2><a href="{escape(r["path"])}/preview.html">{escape(r["title"])}</a></h2><p class="id">{escape(r["id"])}</p><p>{escape(r["status"])}</p><p>{escape(r["notes"])}</p><a href="{escape(r["path"])}/README.md">Mapping and files</a></article>')
 cats=sorted({r['category'] for r in records if r.get('catalogVisible',True)})
 index='''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rabbit Hole UI assets</title><link rel="stylesheet" href="styles/catalog.css"></head><body><main><header><p class="eyebrow">Rabbit Hole · UI reference assets</p><h1>Find a component</h1><p>Search names, commands, source files, app paths, states and review IDs. References are separate from app integration.</p><nav><a href="README.md">Read me</a><a href="INVENTORY.md">All source files</a><a href="MAPPING.md">App mapping</a><a href="REVIEW.md">Inconsistencies and gaps</a><a href="VERIFICATION.md">Verification</a></nav><label for="search">Search</label><input id="search" type="search" placeholder="Try composer, slider, source, UI-01"><label for="category">Category</label><select id="category"><option value="">All categories</option>'''+''.join('<option>'+escape(c)+'</option>' for c in cats)+'''</select><p id="count" role="status"></p></header><section id="entries">'''+''.join(rows)+'''</section><p id="empty" hidden>No matching components. Try a broader term.</p></main><script src="scripts/catalog.js"></script></body></html>'''
 write(ROOT/'index.html',index)
 table='| ID | Preview | Status | App landmarks |\n| --- | --- | --- | --- |\n'
 for r in records:
  table+='| `'+r['id']+'` | ['+r['title']+']('+r['path']+'/preview.html) | '+r['status']+' | '+', '.join('`'+p+'`' for p in r['implementation'])+' |\n'
 write(ROOT/'MAPPING.md','# Component to app mapping\n\n'+str(len(records))+' searchable component and behavior entries. These are candidate integration landmarks. Path existence is checked against the pinned branch tree; full app integration is not claimed. The historical `InteractCardContent.jsx` starting point is absent from this branch; see UI-10.\n\n'+table)
 print(f'Built {len(records)} previews, component READMEs, registry, index and mapping.')
if __name__=='__main__': main()
