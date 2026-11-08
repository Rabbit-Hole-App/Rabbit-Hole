#!/usr/bin/env python3
"""Bundle the component catalog and interactive specimens into one portable HTML."""
from pathlib import Path
from ui_fragments import read_markup
import json,re,html,base64
ROOT=Path(__file__).resolve().parents[1]
records=json.loads((ROOT/'registry.json').read_text())['components']
records=[c for c in records if c.get('catalogVisible',True)]
items=[]
for c in records:
 folder=ROOT/c['path']; doc=(folder/'preview.html').read_text()
 doc=re.sub(r'<div class="catalog-note">[\s\S]*?</div>','',doc,count=1)
 def css(m):return '<style>'+(folder/m.group(1)).resolve().read_text()+'</style>'
 doc=re.sub(r'<link rel="stylesheet" href="([^"]+)">',css,doc)
 def js(m):return '<script>'+(folder/m.group(1)).resolve().read_text()+'</script>'
 doc=re.sub(r'<script src="([^"]+)"></script>',js,doc)
 sprites=set(re.findall(r'\.\./\.\./\.\./icons/([\w-]+)\.svg#',doc))
 symbols=''
 for sprite in sorted(sprites):
  svg=re.sub(r'^<svg[^>]*>|</svg>$','',(ROOT/'icons'/(sprite+'.svg')).read_text())
  svg=re.sub(r'id="([^"]+)"',lambda m:'id="'+sprite+'--'+m[1]+'"',svg)
  symbols+=svg
 doc=re.sub(r'\.\./\.\./\.\./icons/([\w-]+)\.svg#',lambda m:'#'+m[1]+'--',doc)
 doc=doc.replace('</head>','<style>html,body{min-height:0!important;}body{margin:0!important;padding:18px!important;box-sizing:border-box;} .catalog-preview{padding:0!important;} main{margin-top:0!important;} .demo-label{display:none!important;}</style></head>')
 doc=re.sub(r'(<body[^>]*>)',lambda m:m.group(1)+'<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">'+symbols+'</svg>',doc,count=1)
 # Local navigation in archived flows points to the corresponding repository source.
 def link(m):
  url=m.group(1)
  if url.startswith(('#','data:','http:','https:','mailto:','javascript:')):return m.group(0)
  target=(folder/url).resolve()
  try:relative=target.relative_to(ROOT.parents[1]).as_posix()
  except ValueError:return m.group(0)
  return 'href="https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/chatgpt/tutor/'+relative+'"'
 doc=re.sub(r'href="([^"]+)"',link,doc)
 items.append({**c,'document':doc,'search':(' '.join([c['id'],c['title'],c['source_file'],c['notes'],*c['implementation'],*c['issues'],*c.get('keywords',[])])+' '+re.sub('<[^>]+>',' ',read_markup(folder))).lower()})
css='''
*{box-sizing:border-box}body{margin:0;background:#f5f4ed;color:#282a27;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}header,main{max-width:1440px;margin:auto;padding:30px 28px}header{padding-bottom:18px}h1{font-size:32px;line-height:1.15;margin:8px 0 12px;font-weight:650}p{margin:8px 0;color:#646660}.eyebrow{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#6b7168}.palette{display:flex;gap:18px;flex-wrap:wrap;margin:18px 0}.dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px}.tools{position:sticky;top:0;z-index:3;background:#f5f4edf5;border-block:1px solid #d8d9d0;padding:14px 28px;backdrop-filter:blur(12px)}.tool-inner{max-width:1384px;margin:auto}input{font:inherit;width:100%;padding:12px 14px;border:1px solid #bfc5bb;background:#fffef9;border-radius:8px}nav{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}button{font:inherit;border:1px solid #cdd1c6;border-radius:8px;background:#fffef9;color:#3d433c;padding:7px 12px;cursor:pointer}button:hover{background:#e9ece4}button[aria-pressed=true]{background:#e1eaf2;border-color:#779bb6;color:#285d80}button:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid #3674a0;outline-offset:3px}.section-title{font-size:23px;margin:24px 0 14px;text-transform:capitalize}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px}.entry{min-width:0;background:#fffef9;border:1px solid #d6d9cf;border-radius:12px;overflow:hidden}.entry-head{padding:16px 18px;display:flex;gap:12px;align-items:center;justify-content:space-between;border-bottom:1px solid #e1e2da}.entry h3{font-size:17px;margin:0}.ident{font-size:12px;color:#74796e;margin:3px 0 0;overflow-wrap:anywhere}iframe{display:block;width:100%;height:650px;border:0;background:#f5f4ed}details{padding:12px 18px;border-top:1px solid #e1e2da;font-size:13px}summary{cursor:pointer;color:#346584}details p{overflow-wrap:anywhere}a{color:#285d80}code{overflow-wrap:anywhere}#count{font-size:13px;margin:10px 0 0}footer{max-width:1440px;margin:auto;padding:24px 28px;color:#777b71;font-size:13px}[hidden]{display:none!important}@media(max-width:950px){.grid{grid-template-columns:1fr}}@media(max-width:600px){header,main{padding:22px 12px}.tools{padding:12px}h1{font-size:27px}.entry-head{align-items:flex-start}.entry-head button{font-size:12px}}
'''
js='''
const categories=['cards','controls','tutor','sources','feedback','icons','foundations','layout','navigation'];
const labels={cards:'Cards',controls:'Controls',tutor:'Tutor',sources:'Source documents',feedback:'Overlays & feedback',icons:'Icons',foundations:'Design values',layout:'Layout',navigation:'Navigation',patterns:'Archived references'};
const host=document.getElementById('catalog'),nav=document.querySelector('nav');let selected='';
function el(tag,text,cls){const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n}
for(const category of ['',...categories]){const b=el('button',category?labels[category]:'All components');b.type='button';b.dataset.category=category;b.setAttribute('aria-pressed',String(category===''));b.onclick=()=>{selected=category;filter()};nav.append(b)}
const frames=[];
for(const category of categories){const section=el('section');section.dataset.category=category;section.append(el('h2',labels[category],'section-title'));const grid=el('div',null,'grid');section.append(grid);host.append(section);
 for(const c of items.filter(c=>c.category===category)){const a=el('article',null,'entry');a.dataset.search=c.search;const head=el('div',null,'entry-head'),title=el('div');title.append(el('h3',c.title),el('p',c.id,'ident'));head.append(title);const open=el('button','Open preview');open.type='button';open.onclick=()=>{const url=URL.createObjectURL(new Blob([c.document],{type:'text/html'}));window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000)};head.append(open);a.append(head);
 const frame=el('iframe');frame.title=c.title;frame.setAttribute('sandbox','allow-scripts allow-popups');frame.dataset.item=String(items.indexOf(c));if(c.id==='tutor/chat-panel')frame.style.height='820px';a.append(frame);frames.push(frame);
 const details=el('details');details.append(el('summary','Mapping, status & review notes'),el('p',c.status+' · '+c.notes));for(const path of c.implementation)details.append(el('p',path));if(c.issues.length)details.append(el('p','Review items: '+c.issues.join(', ')));const source=el('a','Original source');source.href=c.source;source.target='_blank';source.rel='noopener';details.append(source);a.append(details);grid.append(a);
 }}
function load(frame){if(!frame.srcdoc)frame.srcdoc=items[Number(frame.dataset.item)].document}
const observer='IntersectionObserver' in window?new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){load(e.target);observer.unobserve(e.target)}}),{rootMargin:'200px'}):null;
frames.forEach(f=>observer?observer.observe(f):load(f));
function filter(){const q=document.getElementById('search').value.trim().toLowerCase();let count=0;document.querySelectorAll('nav button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.category===selected)));for(const s of host.children){let n=0;for(const a of s.querySelectorAll('.entry')){const show=(!selected||s.dataset.category===selected)&&q.split(/\\s+/).every(word=>a.dataset.search.includes(word));a.hidden=!show;if(show)n++}s.hidden=n===0;count+=n}document.getElementById('count').textContent=count+' of '+items.length+' components';document.getElementById('empty').hidden=count!==0}
document.getElementById('search').addEventListener('input',filter);filter();
'''
data=json.dumps(items,ensure_ascii=False).replace('<','\\u003c')
output='''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rabbit Hole · Component Library</title><style>'''+css+'''</style></head><body><header><p class="eyebrow">Rabbit Hole · UI assets</p><h1>Component library</h1><p>Browse the working specimens. Search by component, command, state or app file. Open any preview on its own for a closer look.</p><div class="palette"><span><i class="dot" style="background:#3475a0"></i>Blue · app actions & playback</span><span><i class="dot" style="background:#c76b49"></i>Claude red · experiments</span><span><i class="dot" style="background:#267657"></i>Green · toggles & completion</span></div></header><div class="tools"><div class="tool-inner"><label for="search">Find a component</label><input type="search" id="search" placeholder="Search slider, composer, Accept, /quiz, disabled…"><nav aria-label="Component categories"></nav><p id="count" role="status"></p></div></div><main><div id="catalog"></div><p id="empty" hidden>No components match this search.</p></main><footer>Reference specimens for feedback. Browser visual acceptance and app integration remain pending.</footer><script>const items='''+data+';\n'+js+'</script></body></html>'
(ROOT/'rabbit-hole-component-library.html').write_text(output)
print(f'Bundled {len(items)} specimens; {len(output.encode()):,} bytes')
