// Counts registered references (reference-library.js diagramReferences, the list explanation-references.js selects from) whose spec shows 2+ visuals.
// Visuals of a reference = child diagrams of its spec (kind 'panels': 2-3; comparison variant 'panels': 2-3; transformation variant 'visual': before+after = 2;
// otherwise 1) plus 1 when it carries a detailSpec (a second, separate visual: explanation-references.js:167-172). The reference the author is given at a depth is
// {...ref, ...ref.depths[level]} with brief=overview, balanced=standard, detailed=deep (explanation-references.js:84,100), so each level is counted as that merge.
import { diagramReferences as R } from 'file:///C:/s/s2-prev/packages/web/src/tutor-diagrams/reference-library.js';
import { singleDiagramReferences as S } from 'file:///C:/s/s2-prev/packages/web/src/tutor-diagrams/reference-single-variants.js';
const inSpec = d => !d ? 0 : d.kind === 'panels' || (d.kind === 'comparison' && d.variant === 'panels') ? (d.panels?.length ?? 0)
  : d.kind === 'transformation' && d.variant === 'visual' ? ['before', 'after'].filter(s => d[s]?.diagram).length : 1;
const form = d => d.kind === 'panels' ? 'panels' : d.kind === 'comparison' && d.variant === 'panels' ? 'comparison/panels' : d.kind === 'transformation' && d.variant === 'visual' ? 'transformation/visual' : 'single-diagram spec';
const LEVELS = { brief: 'overview', balanced: 'standard', detailed: 'deep' };
const at = (ref, level) => (ref.depths?.[level] ? { ...ref, ...ref.depths[level] } : ref);
const count = ref => inSpec(ref.spec?.diagram) + (ref.detailSpec ? 1 : 0);
const rows = R.map(ref => ({ id: ref.id, form: form(ref.spec.diagram), topLevelDetailSpec: !!ref.detailSpec, brief: count(at(ref, 'overview')), balanced: count(at(ref, 'standard')), detailed: count(at(ref, 'deep')) }));
const any = rows.filter(r => Math.max(r.brief, r.balanced, r.detailed) >= 2);
const tally = f => rows.filter(f).length;
console.log('registered references:', R.length);
console.log('2+ visuals as offered at Brief (overview):', tally(r => r.brief >= 2), '| Balanced (standard):', tally(r => r.balanced >= 2), '| Detailed (deep):', tally(r => r.detailed >= 2), '| at any depth:', any.length);
console.log('3 visuals at some depth:', rows.filter(r => Math.max(r.brief, r.balanced, r.detailed) >= 3).length);
const ofForm = {}; for (const r of any) ofForm[r.form] = (ofForm[r.form] || 0) + 1; console.log('by base spec form (2+ at any depth):', ofForm);
console.log('base spec itself composes 2+ child diagrams (panels / comparison-panels / transformation-visual):', rows.filter(r => r.form !== 'single-diagram spec').length);
console.log('carry a top-level detailSpec:', rows.filter(r => r.topLevelDetailSpec).length, '| a detailSpec inside depths.deep:', R.filter(r => r.depths?.deep?.detailSpec).length, '| depths.overview:', R.filter(r => r.depths?.overview?.detailSpec).length, '| depths.standard:', R.filter(r => r.depths?.standard?.detailSpec).length);
const composed = rows.filter(r => r.form !== 'single-diagram spec');
console.log('single-diagram (-single) variants registered:', S.length, '| composed refs that have one:', composed.filter(r => S.some(s => s.panelReferenceId === r.id)).length, 'of', composed.length);
console.log('\nIDS, base spec composes 2+ child diagrams (' + composed.length + '):\n' + composed.map(r => `${r.id} [${r.form}]`).join('\n'));
console.log('\nIDS, 2+ only through detailSpec (' + any.filter(r => r.form === 'single-diagram spec').length + ') [brief/balanced/detailed visuals]:\n' + any.filter(r => r.form === 'single-diagram spec').map(r => `${r.id} [${r.brief}/${r.balanced}/${r.detailed}]${r.topLevelDetailSpec ? ' top-level' : ''}`).join('\n'));
