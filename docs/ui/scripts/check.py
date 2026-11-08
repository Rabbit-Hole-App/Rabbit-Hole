#!/usr/bin/env python3
"""Offline structural checks; deliberately does not drive a browser."""
from pathlib import Path
from html.parser import HTMLParser
from collections import Counter
from urllib.parse import urlsplit,unquote
import json,re,subprocess,sys,xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
class Page(HTMLParser):
 def __init__(self,text):
  super().__init__();self.ids=[];self.links=[];self.idrefs=[];self.feed(text)
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if a.get('id'):self.ids.append(a['id'])
  for k in ['src','href']:
   if a.get(k):self.links.append((tag,k,a[k]))
  for k in ['aria-labelledby','aria-describedby','for','aria-controls']:
   if a.get(k):self.idrefs.extend(a[k].split())
def main():
 errors=[];warnings=[];registry=json.loads((ROOT/'registry.json').read_text());records=registry['components']
 def require(ok,message):
  if not ok:errors.append(message)
 ids=[c['id'] for c in records];require(len(ids)==len(set(ids)),'Duplicate registry IDs')
 paths=set(json.loads((ROOT/'verification/repository-paths.json').read_text())['paths'])
 for c in records:
  folder=ROOT/c['path'];require(c['paletteRole'] in ['shared','experiment','balanced-card','historical'],f'{c["id"]}: palette role')
  for f in ['component.json','markup.html','preview.html','README.md']:require((folder/f).is_file(),f'{c["id"]}: missing {f}')
  for p in c['implementation']:require(p in paths,f'{c["id"]}: missing app path {p}')
  for typ,extension in [('styles','css'),('scripts','js'),('templates','html')]:
   for f in c[typ]:require((ROOT/typ/(f+'.'+extension)).is_file(),f'{c["id"]}: missing {typ}/{f}')
  text=(folder/'preview.html').read_text();page=Page(text)
  duplicates=[i for i,n in Counter(page.ids).items() if n>1]
  require(not duplicates,f'{c["id"]}: duplicate HTML IDs {duplicates}')
  for ident in page.idrefs:
   # A small number of inherited host-populated references are not realized in raw contracts.
   if ident not in page.ids: warnings.append(f'{c["id"]}: unresolved ID reference {ident} (check dynamic/host ownership)')
  for tag,attr,value in page.links:
   u=urlsplit(value)
   if u.scheme or value.startswith('//'):continue
   target=(folder/unquote(u.path)).resolve() if u.path else folder/'preview.html'
   require(target.exists(),f'{c["id"]}: broken {tag} {attr} {value}')
   if target.suffix=='.svg' and target.exists() and u.fragment:
    require(re.search(r'\bid=["\']'+re.escape(u.fragment)+r'["\']',target.read_text()) is not None,f'{c["id"]}: missing SVG symbol {value}')
  script_text='\n'.join((ROOT/'scripts'/(s+'.js')).read_text() for s in c['scripts'] if s not in ['standards','review-corrections'])
  for ident in re.findall(r"getElementById\(['\"]([^'\"]+)['\"]\)",script_text):
   # Standards uses event-delegated handlers shared by independent specimens, so absent unrelated roots are expected.
   if c['scripts']!=['standards'] and ident not in page.ids:warnings.append(f'{c["id"]}: script ID {ident} is dynamic or absent')
 for p in sorted((ROOT/'scripts').glob('*.js')):
  result=subprocess.run(['node','--check',str(p)],capture_output=True,text=True)
  require(result.returncode==0,p.name+': '+result.stderr.strip())
 for p in (ROOT/'icons').glob('*.svg'):
  try:ET.fromstring(p.read_text())
  except Exception as e:errors.append(p.name+': '+str(e))
 require({'cards/split-comparison','cards/decision-tracer','tutor/composer','patterns/explanation-actions','patterns/source-navigation','patterns/standard-toss-drop-card','patterns/original-component-kit'}<=set(ids),'Missing critical reference entry')
 for p in ROOT.rglob('*.html'):
  require('href="../../../icons/' not in p.read_text() or p.name in ['preview.html','markup.html'],'Unexpected sprite-relative path owner '+str(p))
 clean_files=sorted((ROOT/'clean').glob('*.html'))
 require(len(clean_files)==11,'Expected 11 separate clean previews')
 for p in clean_files:
  content=p.read_text(); page=Page(content)
  require(len(page.ids)==len(set(page.ids)),f'{p.name}: duplicate IDs')
  for ref in page.idrefs:
   require(ref in page.ids,f'{p.name}: unresolved accessibility ID {ref}')
  for tag,attr,value in page.links:
   if tag in ['a']:continue
   require(value.startswith(('data:','#')),f'{p.name}: non-embedded asset {value}')
   if value.startswith('#'):require(value[1:] in page.ids,f'{p.name}: missing symbol {value}')
  require(not re.search(r'url\(\s*["\']?(?!data:|#)[a-zA-Z./]', '\n'.join(re.findall(r'<style>([\s\S]*?)</style>',content))),f'{p.name}: external CSS asset')
  script='\n'.join(re.findall(r'<script>([\s\S]*?)</script>',content))
  result=subprocess.run(['node','--check'],input=script,capture_output=True,text=True)
  require(result.returncode==0,f'{p.name}: '+result.stderr.strip())
 report={'standalone_previews':len(clean_files),'result':'PASS' if not errors else 'FAIL','components':len(records),'javascript_files':len(list((ROOT/'scripts').glob('*.js'))),'errors':errors,'warnings':sorted(set(warnings)),'browser':'Not run; visual and interaction acceptance pending.'}
 (ROOT/'verification/structural-check.json').write_text(json.dumps(report,indent=2)+'\n')
 print(json.dumps(report,indent=2))
 sys.exit(bool(errors))
if __name__=='__main__':main()
