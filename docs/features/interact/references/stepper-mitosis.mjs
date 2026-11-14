// Documentation-only drawings using stepper-reference-kit.mjs and its unchanged
// approved P primitives. No production family, SDK helper, or model call.
// Biology sources (original educational paraphrases, not reproduced passages):
// Clark, Douglas & Choi, Biology 2e, 10.2, OpenStax:
// https://openstax.org/books/biology-2e/pages/10-2-the-cell-cycle
// Alberts et al., Molecular Biology of the Cell, Mitosis, NCBI Bookshelf:
// https://www.ncbi.nlm.nih.gov/books/NBK26931/
import { pathToFileURL } from 'node:url';
import { writeSubject } from './stepper-reference-kit.mjs';

// Authored toy input: the entire picture follows two already-replicated
// chromosomes. A human somatic cell has a different chromosome complement.
const TOY_CHROMOSOMES = ['A', 'B'];
const SISTER_COPIES = ['a', 'b'];
const POLES = ['left', 'right'];

export function chromosomeModel(phase) {
  const separated = ['anaphase', 'telophase', 'cytokinesis', 'daughters'].includes(phase);
  const divided = ['cytokinesis', 'daughters'].includes(phase);
  const replicated = TOY_CHROMOSOMES.map(id => ({
    id, pole: null, chromatids: SISTER_COPIES.map(copy => ({ id: `${id}.${copy}`, source: id })),
  }));
  const chromosomes = separated ? replicated.flatMap(chromosome => chromosome.chromatids.map((chromatid, i) => ({
    id: chromatid.id, pole: POLES[i], chromatids: [chromatid],
  }))) : replicated;
  const atPole = pole => chromosomes.filter(chromosome => chromosome.pole === pole).map(chromosome => chromosome.id);
  const originalNucleus = ['before', 'prophase'].includes(phase);
  const newNuclei = ['telophase', 'cytokinesis', 'daughters'].includes(phase);
  const nuclei = originalNucleus ? [{
    id: 'original', chromosomeIds: chromosomes.map(chromosome => chromosome.id),
    envelope: phase === 'before' ? 'intact' : 'breaking', pole: null,
  }] : newNuclei ? POLES.map(pole => ({
    id: `nucleus.${pole}`, chromosomeIds: atPole(pole), envelope: 'reformed', pole,
  })) : [];
  const cellBodies = divided ? POLES.map(pole => ({
    id: `daughter.${pole}`, chromosomeIds: atPole(pole), nucleusIds: [`nucleus.${pole}`],
  })) : [{ id: 'parent', chromosomeIds: chromosomes.map(chromosome => chromosome.id), nucleusIds: nuclei.map(nucleus => nucleus.id) }];
  const attached = ['prometaphase', 'metaphase', 'anaphase'].includes(phase);
  const status = phase === 'before' ? 'not-assembled' : phase === 'prophase' ? 'assembling'
    : phase === 'prometaphase' ? 'attaching' : phase === 'metaphase' ? 'aligned'
      : phase === 'anaphase' ? 'separating' : 'disassembled';
  const spindle = {
    status,
    centrosomes: POLES.map(pole => ({ id: `centrosome.${pole}`, pole })),
    attachments: attached ? chromosomes.flatMap(chromosome => chromosome.chromatids.map((chromatid, i) => ({
      chromatidId: chromatid.id, pole: chromosome.pole || POLES[i],
    }))) : [],
  };
  return {
    kind: 'animal-cell-mitosis', phase,
    context: ['before', 'daughters'].includes(phase),
    dnaReplication: 'completed-in-S-phase-before-mitosis',
    condensed: ['prophase', 'prometaphase', 'metaphase', 'anaphase'].includes(phase),
    separated, chromosomes, cellBodies, nuclei, spindle,
    cytokinesis: phase === 'anaphase' ? 'starting' : phase === 'telophase' ? 'constricting'
      : divided ? 'complete' : 'not-started',
  };
}

export function modelCounts(model) {
  const poleSets = POLES.map(pole => model.chromosomes.filter(chromosome => chromosome.pole === pole));
  const newNuclei = model.nuclei.filter(nucleus => nucleus.pole);
  return {
    chromosomes: model.chromosomes.length,
    dnaMolecules: model.chromosomes.reduce((count, chromosome) => count + chromosome.chromatids.length, 0),
    perPole: model.separated && poleSets.every(set => set.length === poleSets[0].length) ? poleSets[0].length : null,
    perNewNucleus: newNuclei.length && newNuclei.every(nucleus => nucleus.chromosomeIds.length === newNuclei[0].chromosomeIds.length)
      ? newNuclei[0].chromosomeIds.length : null,
    cellBodies: model.cellBodies.length,
  };
}

export function buildScene(depth) {
  if (!['brief', 'balanced', 'detailed'].includes(depth)) throw new Error(`Unknown depth: ${depth}`);
  const phases = depth === 'brief' ? ['prophase', 'metaphase', 'anaphase', 'telophase']
    : depth === 'balanced' ? ['prophase', 'prometaphase', 'metaphase', 'anaphase', 'telophase', 'cytokinesis']
      : ['before', 'prophase', 'prometaphase', 'metaphase', 'anaphase', 'telophase', 'cytokinesis', 'daughters'];
  const names = {
    before: 'Before mitosis', prophase: 'Prophase', prometaphase: 'Prometaphase', metaphase: 'Metaphase',
    anaphase: 'Anaphase', telophase: 'Telophase', cytokinesis: 'Cytokinesis', daughters: 'Daughter cells',
  };
  const shorts = {
    before: 'Prepared', prophase: 'Condense', prometaphase: 'Attach', metaphase: 'Align',
    anaphase: 'Separate', telophase: 'Re-form', cytokinesis: 'Divide', daughters: 'Daughters',
  };
  const chromosomeWords = {
    before: ['Already copied', 'Chromosomes already contain sister DNA copies made in S phase.'],
    prophase: ['Copies condense', 'Chromosomes condense with their sister copies still joined.'],
    prometaphase: ['Copies attach', 'Sister chromatids gain spindle attachments but remain joined.'],
    metaphase: ['Copies line up', 'Chromosomes line up; sisters face opposite spindle poles.'],
    anaphase: ['Sisters separate', 'Sisters separate into chromosomes, without making new DNA.'],
    telophase: ['Nuclei re-form', 'Nuclei re-form around matching chromosome sets at the poles.'],
    cytokinesis: ['Cytoplasm divides', 'Chromosomes stay in new nuclei as the cytoplasm separates.'],
    daughters: ['Matching daughters', 'Each nucleus contains a matching chromosome set.'],
  };
  const spindleWords = {
    before: ['Spindle not ready', 'The spindle is not assembled; centrosomes await mitosis.'],
    prophase: ['Spindle assembles', 'The spindle assembles as centrosomes move apart.'],
    prometaphase: ['Spindle attaches', 'Spindle fibers reach sister chromatids through the open nucleus.'],
    metaphase: ['Opposite poles', 'Spindle fibers attach sister copies to opposite poles.'],
    anaphase: ['Fibers shorten', 'Spindle fibers shorten to move chromosomes apart.'],
    telophase: ['Spindle dissolves', 'The spindle disassembles as new nuclei re-form.'],
    cytokinesis: ['Spindle has gone', 'The spindle is gone as the furrow finishes dividing the cell.'],
    daughters: ['Spindle absent', 'The spindle is absent; a centrosome remains near each nucleus.'],
  };
  const reasons = {
    before: 'S phase copied DNA; this context is not a mitosis phase.',
    prophase: 'Condensation packages long DNA molecules for separation.',
    prometaphase: 'Attachment lets the spindle move each sister independently.',
    metaphase: 'Opposite attachments prepare one sister for each pole.',
    anaphase: 'Separated sisters count as chromosomes, without new DNA.',
    telophase: 'Nuclear envelopes rebuild around the separated sets.',
    cytokinesis: 'Animal-cell pinching overlaps late mitosis.',
    daughters: 'Growth and another S phase precede the next division.',
  };
  const phaseRegions = phases.map(id => ({ id, label: names[id], kind: 'mitosis-cell', payload: chromosomeModel(id) }));
  const focuses = depth === 'brief' ? [null] : ['chromosomes', 'spindle'];
  const variants = focuses.map(focus => ({
    regions: [...phaseRegions, ...(focus ? [
      { id: 'chromosomes', label: 'Chromosomes', kind: 'cell-structure', payload: { structure: 'chromosomes', within: phases } },
      { id: 'spindle', label: 'Spindle and centrosomes', kind: 'cell-structure', payload: { structure: 'spindle', within: phases } },
    ] : [])],
    links: phases.map((id, i) => ({
      from: id, to: phases[(i + 1) % phases.length],
      ...(i === phases.length - 1 ? {
        context: true, label: 'Next cycle after division, growth + DNA copying',
      } : { context: false }),
    })),
    states: phases.map(id => {
      const model = phaseRegions.find(region => region.id === id).payload;
      const counts = modelCounts(model);
      const [label, action] = (focus === 'spindle' ? spindleWords : chromosomeWords)[id];
      const sentence = `${names[id]}: ${action}`;
      const readouts = depth === 'brief' ? [] : [
        { id: 'chromosomes', label: 'Whole view: chr.', value: String(counts.chromosomes) },
        { id: 'dna', label: 'DNA molecules', value: String(counts.dnaMolecules) },
        depth === 'detailed'
          ? { id: 'per-nucleus', label: 'Per new nucleus', value: counts.perNewNucleus === null ? '—' : String(counts.perNewNucleus) }
          : { id: 'per-pole', label: 'At each pole', value: counts.perPole === null ? '—' : String(counts.perPole) },
        ...(depth === 'detailed' ? [{ id: 'cells', label: 'Cell bodies', value: String(counts.cellBodies) }] : []),
      ];
      return {
        id, label, short: shorts[id], sentence,
        why: reasons[id], active: [id, ...(focus ? [focus] : [])], calloutRegion: id,
        focus, readouts,
      };
    }),
  }));
  return {
    depth,
    prompt: 'what happens during mitosis?',
    title: 'Mitosis separates copies',
    concept: depth === 'brief'
      ? 'DNA was copied before mitosis. Follow the same sister copies as they condense, line up, separate and enter new nuclei.'
      : 'DNA copying happens in S phase before mitosis. Follow chromosome sets through nuclear division and animal-cell cytokinesis.',
    instructions: depth === 'brief'
      ? 'Use Next or drag Step to follow the highlighted phase. The loop returns only after cell division, growth and DNA copying.'
      : 'Use Next or drag Step. Switch Focus to follow chromosomes or the spindle; the faint outline marks the previous step.',
    heading: 'Follow the copies', canonical: 'cycle-of-phases',
    aha: {
      stateId: 'anaphase',
      observation: 'Separated sisters count as chromosomes; the whole view still contains the same DNA molecules.',
    },
    parameter: depth === 'brief' ? null : { label: 'Focus', options: ['Chromosomes', 'Spindle'], default: 0 },
    variants,
  };
}

export function drawPicture(frame, variant, scene, previousActive = []) {
  // Geometry stays trusted renderer data. Scene payloads supply named phases,
  // chromosome identities, compartments and attachments, never coordinates.
  const phases = variant.regions.filter(region => region.kind === 'mitosis-cell');
  const columns = phases.length / 2;
  const centers = phases.map((unused, index) => {
    const top = index < columns;
    const column = top ? index : phases.length - index - 1;
    return [70 + (288 * column / Math.max(1, columns - 1)), top ? 85 : 209];
  });
  const centerOf = id => centers[phases.findIndex(region => region.id === id)];
  const anchorOf = region => {
    const [cx, cy] = centerOf(region.id), top = phases.indexOf(region) < columns;
    return [cx + (region.payload.cellBodies.length > 1 ? 20 : 0), cy + (top ? 34 : -34)];
  };
  const active = id => frame.active.includes(id);
  const old = id => previousActive.includes(id) && !active(id);
  const localOpacity = id => active(id) ? 1 : old(id) ? 0.72 : 0.4;
  const selectedStructure = structure => !frame.focus || frame.active.includes(structure);
  const selected = (id, structure) => active(id) && selectedStructure(structure);
  const withAttributes = (markup, attributes) => markup.replace(/\/>$/, ` ${attributes}/>`);
  const circle = (id, x, y, radius, fill, stroke, ghost = false) => withAttributes(
    R.circle(id, x, y, radius, fill, stroke), ghost ? 'stroke-dasharray="4 4"' : '',
  );
  const phaseLocal = (id, structure, content) => `<g id="detail.${R.escape(id)}.${structure}" data-phase="${R.escape(id)}" data-bind="state.active" data-focus="${R.escape(structure)}" opacity="${localOpacity(id)}">${content}</g>`;
  const placement = (region, chromosome) => {
    const [cx, cy] = centerOf(region.id), model = region.payload;
    const index = model.chromosomes.indexOf(chromosome);
    if (model.separated) {
      const set = model.chromosomes.filter(item => item.pole === chromosome.pole);
      const inSet = set.indexOf(chromosome), side = chromosome.pole === 'left' ? -1 : 1;
      const distance = model.cellBodies.length > 1 ? 20 : 16;
      return [cx + side * distance, cy + (inSet - (set.length - 1) / 2) * (model.condensed ? 15 : 9)];
    }
    const offset = index - (model.chromosomes.length - 1) / 2;
    return model.phase === 'metaphase' ? [cx, cy + offset * 17]
      : [cx + offset * (model.phase === 'before' ? 15 : 18), cy + (model.phase === 'before' ? 0 : offset * 12)];
  };
  const chromatidPoint = (region, chromatidId) => {
    const chromosome = region.payload.chromosomes.find(item => item.chromatids.some(chromatid => chromatid.id === chromatidId));
    const [x, y] = placement(region, chromosome);
    const index = chromosome.chromatids.findIndex(chromatid => chromatid.id === chromatidId);
    return [x + (chromosome.chromatids.length > 1 ? (index ? 2 : -2) : 0), y];
  };
  let svg = R.text('picture.scope', 20, 42, 'Toy animal cell · whole view includes both daughters', { size: 14, color: R.C.muted });
  for (const link of variant.links) {
    const [fx, fy] = centerOf(link.from), [tx, ty] = centerOf(link.to);
    const points = link.context ? [[fx - 34, fy], [24, fy], [24, ty], [tx - 34, ty]]
      : fy !== ty ? [[fx, fy + 34], [tx, ty - 34]]
        : fx < tx ? [[fx + 34, fy], [tx - 34, ty]] : [[fx - 34, fy], [tx + 34, ty]];
    svg += `<g id="link.${R.escape(link.from)}.${R.escape(link.to)}" data-from="${R.escape(link.from)}" data-to="${R.escape(link.to)}" data-context="${link.context}">`;
    svg += R.line(`cycle.${link.from}.${link.to}`, points, !link.context && active(link.to), true, link.context);
    if (link.context) svg += R.paragraph('cycle.return.label', 68, 164, link.label, 55, { size: 13, color: R.C.muted });
    svg += '</g>';
  }
  for (const region of phases) {
    const [cx, cy] = centerOf(region.id), model = region.payload;
    const ink = active(region.id) ? R.C.blue : R.C.wire;
    let shell = '';
    if (model.cellBodies.length > 1) {
      model.cellBodies.forEach((cell, i) => {
        const x = cx + (i ? 20 : -20);
        shell += `<g data-cell="${R.escape(cell.id)}">${circle(`cell.${region.id}.${cell.id}`, x, cy, 19, R.C.surface, ink, old(region.id))}</g>`;
      });
    } else if (['starting', 'constricting'].includes(model.cytokinesis)) {
      const pinch = model.cytokinesis === 'starting' ? 26 : 17;
      const points = [[cx, cy - pinch], [cx + 13, cy - 29], [cx + 26, cy - 22], [cx + 31, cy - 9], [cx + 31, cy + 9], [cx + 26, cy + 22], [cx + 13, cy + 29], [cx, cy + pinch], [cx - 13, cy + 29], [cx - 26, cy + 22], [cx - 31, cy + 9], [cx - 31, cy - 9], [cx - 26, cy - 22], [cx - 13, cy - 29], [cx, cy - pinch]];
      shell += `<g data-cell="parent" data-cytokinesis="${model.cytokinesis}">${R.line(`cell.${region.id}.furrow`, points, active(region.id), false, old(region.id))}</g>`;
    } else shell += `<g data-cell="parent">${circle(`cell.${region.id}.parent`, cx, cy, 31, R.C.surface, ink, old(region.id))}</g>`;
    for (const nucleus of model.nuclei) {
      const side = nucleus.pole === 'left' ? -1 : nucleus.pole === 'right' ? 1 : 0;
      const nx = cx + side * (model.cellBodies.length > 1 ? 20 : 16), radius = side ? 12 : 20;
      shell += `<g data-nucleus="${R.escape(nucleus.id)}" data-envelope="${nucleus.envelope}">`;
      shell += circle(`nucleus.${region.id}.${nucleus.id}`, nx, cy, radius, R.C.surface, ink, nucleus.envelope === 'breaking' || old(region.id));
      shell += '</g>';
    }
    const [ax, ay] = anchorOf(region), side = ay > cy ? 1 : -1;
    shell += R.line(`phase.${region.id}.anchor`, [[ax, cy + side * (model.cellBodies.length > 1 ? 19 : 31)], [ax, ay]], active(region.id), false, old(region.id));
    shell += R.text(`phase.${region.id}.label`, cx, cy + 48, region.label, { size: 13, anchor: 'middle', weight: active(region.id) ? 600 : 400 });
    if (model.context) shell += R.text(`phase.${region.id}.context`, cx, cy + 63, 'Context', { size: 13, anchor: 'middle', color: R.C.muted });
    svg += R.region(region.id, frame, shell, previousActive);
  }
  const structures = { spindle: '', chromosomes: '' };
  for (const region of phases) {
    const [cx, cy] = centerOf(region.id), model = region.payload;
    const spindleActive = selected(region.id, 'spindle');
    let spindle = `<g data-spindle-status="${model.spindle.status}">`;
    const polePosition = pole => {
      if (model.phase === 'before') return [cx + (pole === 'left' ? -18 : -10), cy - 21];
      if (model.phase === 'prophase') return [cx + (pole === 'left' ? -24 : 24), cy - 9];
      if (model.spindle.status === 'disassembled') return [cx + (pole === 'left' ? -26 : 26), cy - 9];
      return [cx + (pole === 'left' ? -27 : 27), cy];
    };
    for (const centrosome of model.spindle.centrosomes) {
      const [x, y] = polePosition(centrosome.pole);
      spindle += `<g data-centrosome="${R.escape(centrosome.id)}">${circle(`pole.${region.id}.${centrosome.pole}`, x, y, 2, spindleActive ? R.C.blue : R.C.wire, spindleActive ? R.C.blue : R.C.wire)}</g>`;
      if (model.spindle.status === 'assembling') spindle += R.line(`spindle.${region.id}.${centrosome.pole}.growing`, [[x, y], [x + (centrosome.pole === 'left' ? 6 : -6), y - 11]], spindleActive, false);
    }
    for (const attachment of model.spindle.attachments) {
      spindle += `<g data-attachment="${R.escape(attachment.chromatidId)}" data-pole="${attachment.pole}">`;
      spindle += R.line(`spindle.${region.id}.${attachment.chromatidId}`, [polePosition(attachment.pole), chromatidPoint(region, attachment.chromatidId)], spindleActive, false);
      spindle += '</g>';
    }
    spindle += '</g>';
    structures.spindle += phaseLocal(region.id, 'spindle', spindle);
    let chromosomes = '';
    for (const chromosome of model.chromosomes) {
      const [x, y] = placement(region, chromosome), chromosomeActive = selected(region.id, 'chromosomes');
      chromosomes += `<g id="chromosome.${region.id}.${R.escape(chromosome.id)}" data-chromosome="${R.escape(chromosome.id)}" data-pole="${chromosome.pole || 'joined'}">`;
      chromosome.chromatids.forEach((chromatid, i) => {
        let points;
        if (!model.condensed) {
          const shift = chromosome.chromatids.length > 1 ? (i ? 2 : -2) : 0;
          points = [[x + shift - 2, y - 5], [x + shift + 2, y - 2], [x + shift - 2, y + 2], [x + shift + 2, y + 5]];
        } else if (chromosome.chromatids.length > 1) points = i ? [[x + 4, y - 8], [x, y], [x - 4, y + 8]] : [[x - 4, y - 8], [x, y], [x + 4, y + 8]];
        else {
          const direction = chromosome.pole === 'left' ? 1 : -1;
          points = [[x + direction * 4, y - 5], [x - direction, y], [x + direction * 4, y + 5]];
        }
        chromosomes += `<g data-dna="${R.escape(chromatid.id)}">${R.line(`dna.${region.id}.${chromatid.id}`, points, chromosomeActive, false)}</g>`;
      });
      chromosomes += '</g>';
    }
    structures.chromosomes += phaseLocal(region.id, 'chromosomes', chromosomes);
  }
  for (const structure of ['spindle', 'chromosomes']) {
    // Brief has only phase regions; its structural artwork is still explicitly
    // bound to the chromosome/spindle payload of each declared cell region.
    svg += frame.focus ? R.region(structure, frame, structures[structure], previousActive)
      : `<g id="structure.${structure}" data-bind="variant.regions.payload.${structure}">${structures[structure]}</g>`;
  }
  return { svg, anchor: anchorOf(phases.find(region => region.id === frame.calloutRegion)) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) writeSubject('mitosis', buildScene, drawPicture);
