#!/usr/bin/env python3
"""Export self-contained, single-card HTML for owner feedback; no catalog chrome."""
from pathlib import Path
from ui_fragments import read_markup
import html,json,re
ROOT=Path(__file__).resolve().parents[1]
EXPORTS=[
 ('01-split-comparison','cards/split-comparison'),
 ('02-decision-tracer','cards/decision-tracer'),
 ('03-impurity-metrics','cards/impurity-metrics'),
 ('04-split-explorer','cards/split-explorer'),
 ('05-timed-toss','cards/timed-toss'),
 ('06-bootstrap-sampling','cards/bootstrap-sampling'),
 ('07-chat-composer','tutor/composer'),
 ('08-markdown-header','sources/document-headers'),
 ('09-pdf-header','sources/document-headers'),
 ('10-green-toggle','controls/toggle'),
 ('11-chat-panel','tutor/chat-panel'),
 ('12-start-rabbit-hole','sources/start-rabbit-hole'),
 ('13-source-picker-tabs','sources/source-picker-tabs'),
 ('14-file-upload-drop-zone','sources/file-upload-drop-zone'),
 ('15-added-source-row','sources/added-source-row'),
 ('16-sidebar','navigation/sidebar'),
 ('17-sidebar-search','navigation/sidebar-search'),
 ('18-sidebar-trash','navigation/sidebar-trash'),
 ('19-sidebar-notifications','navigation/sidebar-notifications'),
 ('20-sidebar-feedback','navigation/sidebar-feedback'),
 ('21-settings', 'navigation/settings'),
 ('22-settings-appearance', 'navigation/settings-appearance'),
 ('23-settings-learning', 'navigation/settings-learning'),
 ('24-settings-usage', 'navigation/settings-usage'),
 ('25-settings-privacy', 'navigation/settings-privacy'),
 ('26-settings-purchase', 'navigation/settings-purchase'),
 ('27-settings-loading', 'navigation/settings-loading'),
 ('28-settings-profile-unavailable', 'navigation/settings-profile-unavailable'),
 ('29-settings-save-failure', 'navigation/settings-save-failure'),
 ('30-settings-handle-taken', 'navigation/settings-handle-taken'),
 ('31-settings-avatar-failure', 'navigation/settings-avatar-failure'),
 ('32-settings-usage-empty', 'navigation/settings-usage-empty'),
 ('33-settings-usage-exhausted', 'navigation/settings-usage-exhausted'),
 ('34-settings-usage-unavailable', 'navigation/settings-usage-unavailable'),
 ('35-settings-preference-failure', 'navigation/settings-preference-failure'),
 ('36-canvas-card', 'cards/canvas-summary'),
 ('37-home','navigation/home'),
 ('38-home-loading','navigation/home-loading'),
 ('39-home-error','navigation/home-error'),
 ('40-home-empty','navigation/home-empty'),
 ('41-home-no-topic','navigation/home-no-topic'),
 ('42-folders','navigation/folders'),
 ('43-library','navigation/library'),
 ('44-library-folder','navigation/library-folder'),
 ('45-library-empty','navigation/library-empty'),
 ('46-library-folder-empty','navigation/library-folder-empty'),
 ('47-explore-empty','navigation/explore-empty'),
 ('48-explore-canvases','navigation/explore'),
 ('49-explore-canvas-search','navigation/explore-canvas-search'),
 ('50-explore-creator-search','navigation/explore-creator-search'),
 ('51-explore-library-search','navigation/explore-library-search'),
 ('52-creator-profile','navigation/creator-profile'),
 ('53-creator-profile-empty','navigation/creator-profile-empty'),
 ('54-creator-profile-error','navigation/creator-profile-error'),
 ('55-creator-profile-not-found','navigation/creator-profile-not-found'),
 ('56-creator-profile-owner','navigation/creator-profile-owner'),
 ('57-creator-profile-signed-out','navigation/creator-profile-signed-out'),
 ('60-chat-answer-detail','tutor/composer'),
 ('61-slash-commands','tutor/chat-slash-picker'),
 ('62-canvas-search','tutor/canvas-search')]
def main():
 out=ROOT/'clean';out.mkdir(exist_ok=True)
 for filename,ident in EXPORTS:
  folder=ROOT/'components'/ident;c=json.loads((folder/'component.json').read_text())
  markup=read_markup(folder)
  title=c['title']
  if filename=='60-chat-answer-detail':
   title='Chat composer · Answer detail'
   markup=markup.replace('<div class="rh-composer-example">','<div class="rh-composer-example" data-open-menu="depth">',1)
   markup=markup.replace('data-composer-menu="depth">','data-composer-menu="depth" open>',1)
  templates='\n'.join((ROOT/'templates'/(t+'.html')).read_text() for t in c['templates'])
  styles='\n'.join((ROOT/'styles'/(s+'.css')).read_text() for s in c['styles'])+'\n'+(ROOT/'foundations/palette.css').read_text()
  scripts='\n'.join((ROOT/'scripts'/(s+'.js')).read_text() for s in c['scripts'])
  # Every sprite is embedded so files work standalone without network or neighboring files.
  sprites=set(re.findall(r'\.\./\.\./\.\./icons/([\w-]+)\.svg#',markup+scripts))
  symbols=''
  for sprite in sorted(sprites):
   svg=re.sub(r'^<svg[^>]*>|</svg>$','',(ROOT/'icons'/(sprite+'.svg')).read_text())
   svg=re.sub(r'id="([^"]+)"',lambda m:'id="'+sprite+'--'+m[1]+'"',svg)
   symbols+=svg
  markup=re.sub(r'\.\./\.\./\.\./icons/([\w-]+)\.svg#',lambda m:'#'+m[1]+'--',markup)
  scripts=re.sub(r'\.\./\.\./\.\./icons/([\w-]+)\.svg#',lambda m:'#'+m[1]+'--',scripts)
  # The teaching example label is documentation chrome, not part of the card.
  scripts=scripts.replace('demo.append(name, card.node);','demo.append(card.node);')
  if ident=='sources/document-headers':
   articles=re.findall(r'<article\b[\s\S]*?</article>',markup)
   markup=articles[0 if filename=='08-markdown-header' else 1]
  extra='''
html,body { min-height:100%; }
body { margin:0; background:#f5f4ed; }
main.clean-stage { max-width:1020px; margin:0 auto; padding:28px 20px; }
.clean-stage .demo { margin-top:0; }
.clean-stage #examples,.clean-stage #example-cards { display:block; }
.clean-stage .demo-label,.clean-stage .rh-grip-guide { display:none; }
.clean-stage > section { margin-top:0; }
.clean-stage .examples { display:grid; gap:16px; grid-template-columns:repeat(2,minmax(0,1fr)); }
#resize-guide,#clean-resize-help { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); }
@media(max-width:600px) { main.clean-stage{padding:16px 12px;} .clean-stage .examples{grid-template-columns:1fr;} }
'''
  if ident.startswith(('navigation/sidebar','navigation/settings','navigation/home','navigation/library','navigation/explore','navigation/creator-profile')) or ident == 'cards/canvas-summary':
   extra+='\nmain.clean-stage{max-width:none;margin:0;padding:0;}\n'
  if ident=='controls/toggle':
   # A single switch with its label, without availability and usage documentation.
   scripts+='\nconst sampleNode=document.querySelector(".sample"); if(sampleNode){const mount=sampleNode.querySelector("[data-mount]");sampleNode.replaceChildren(mount);}\n'
  notice=(ROOT/'icons/NOTICE.txt').read_text()
  for sprite in sorted(sprites):
   extra_notice=ROOT/'icons'/(sprite+'-NOTICE.txt')
   if extra_notice.exists():notice+='\n'+extra_notice.read_text()
  output=f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(title)}</title><style>{styles}\n{extra}</style></head>
<body data-ui-palette="{c.get('paletteRole','shared')}">
<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">{symbols}</svg>
<main class="clean-stage">{markup}</main>{templates}
<script>{scripts}</script>
<!-- {notice.replace('--','—')} -->
</body></html>
'''
  output='\n'.join(line.rstrip() for line in output.splitlines())+'\n'
  (out/(filename+'.html')).write_text(output)
 print(f'Exported {len(EXPORTS)} standalone files to {out}')
if __name__=='__main__':main()
