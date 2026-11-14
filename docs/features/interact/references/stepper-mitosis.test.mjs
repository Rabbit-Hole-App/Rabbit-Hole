// Offline checks for the biological model and the actual generated drawing.
// The SVG script runs in Node; this is not browser or visual acceptance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { buildScene, chromosomeModel, modelCounts } from './stepper-mitosis.mjs';

const files = [['overview', 'brief'], ['standard', 'balanced'], ['deep', 'detailed']];
const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const dnaIds = model => model.chromosomes.flatMap(chromosome => chromosome.chromatids.map(chromatid => chromatid.id)).sort();
const sourceIds = model => [...new Set(model.chromosomes.flatMap(chromosome => chromosome.chromatids.map(chromatid => chromatid.source)))].sort();
const phaseRegions = variant => variant.regions.filter(region => region.kind === 'mitosis-cell');
const script = (html, id) => {
  const match = html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`));
  assert.ok(match, id);
  return match[1];
};
function drawing(name) {
  const html = read(`${name}-stepper-mitosis.html`), view = script(html, 'scene-view');
  const uiStart = view.indexOf('(function referenceUI()');
  assert.ok(uiStart > 0, 'the shared kit supplies the drawing and UI separately');
  const context = {};
  runInNewContext(`${script(html, 'scene-model')}\n${view.slice(0, uiStart)}\nglobalThis.scene=Scene;
globalThis.pictureAt=(index, option=0, previousIndex=null)=>drawPicture(Scene.variants[option].states[index], Scene.variants[option], Scene, previousIndex===null?[]:Scene.variants[option].states[previousIndex].active);`, context);
  return { html, scene: JSON.parse(JSON.stringify(context.scene)), at: context.pictureAt };
}
function wrap(value, chars = 22) {
  const lines = []; let current = '';
  for (const word of value.split(/\s+/)) {
    if (current && `${current} ${word}`.length > chars) { lines.push(current); current = ''; }
    current += `${current ? ' ' : ''}${word}`;
  }
  if (current) lines.push(current);
  return lines;
}

test('the toy genome contains sister copies before mitosis, then separates without making DNA', () => {
  const before = chromosomeModel('before'), metaphase = chromosomeModel('metaphase'), anaphase = chromosomeModel('anaphase');
  assert.equal(before.chromosomes.length, 2, 'the authored toy input is two chromosomes, not the human complement');
  assert.ok(before.chromosomes.every(chromosome => chromosome.chromatids.length === 2));
  assert.deepEqual(dnaIds(before), ['A.a', 'A.b', 'B.a', 'B.b']);
  assert.deepEqual(dnaIds(metaphase), dnaIds(before));
  assert.deepEqual(dnaIds(anaphase), dnaIds(before), 'anaphase conserves exactly the previously copied DNA identities');
  assert.equal(anaphase.chromosomes.length, dnaIds(before).length, 'a separated sister is now a chromosome');
  assert.ok(anaphase.chromosomes.every(chromosome => chromosome.chromatids.length === 1));
  for (const pole of ['left', 'right']) {
    const poleModel = { chromosomes: anaphase.chromosomes.filter(chromosome => chromosome.pole === pole) };
    assert.deepEqual(sourceIds(poleModel), sourceIds(before), `${pole} receives one copy from every original chromosome`);
    assert.equal(dnaIds(poleModel).length, sourceIds(before).length);
  }
  assert.equal(modelCounts(metaphase).chromosomes, before.chromosomes.length);
  assert.equal(modelCounts(anaphase).chromosomes, anaphase.chromosomes.length);
  assert.equal(modelCounts(metaphase).dnaMolecules, dnaIds(before).length);
  assert.equal(modelCounts(anaphase).dnaMolecules, dnaIds(before).length);
});

test('new nuclei and both daughter cells partition matching sets, rather than cropping the whole-view counts', () => {
  const before = chromosomeModel('before'), telophase = chromosomeModel('telophase');
  assert.equal(telophase.cellBodies.length, 1);
  assert.equal(telophase.nuclei.length, 2);
  for (const phase of ['telophase', 'cytokinesis', 'daughters']) {
    const model = chromosomeModel(phase);
    const ids = new Set(model.chromosomes.map(chromosome => chromosome.id));
    assert.deepEqual(dnaIds(model), dnaIds(before));
    assert.equal(new Set(model.nuclei.flatMap(nucleus => nucleus.chromosomeIds)).size, ids.size);
    for (const nucleus of model.nuclei) {
      const inNucleus = { chromosomes: model.chromosomes.filter(chromosome => nucleus.chromosomeIds.includes(chromosome.id)) };
      assert.deepEqual(sourceIds(inNucleus), sourceIds(before));
      assert.equal(inNucleus.chromosomes.length, before.chromosomes.length);
    }
    assert.equal(modelCounts(model).chromosomes, ids.size);
    assert.equal(modelCounts(model).perNewNucleus, before.chromosomes.length);
  }
  for (const phase of ['cytokinesis', 'daughters']) {
    const model = chromosomeModel(phase);
    assert.equal(model.cellBodies.length, model.nuclei.length);
    assert.equal(model.cellBodies.flatMap(cell => cell.chromosomeIds).length, model.chromosomes.length);
    assert.equal(new Set(model.cellBodies.flatMap(cell => cell.chromosomeIds)).size, model.chromosomes.length);
  }
  assert.equal(chromosomeModel('anaphase').cytokinesis, 'starting', 'animal-cell cytokinesis overlaps late mitosis');
  assert.equal(telophase.cytokinesis, 'constricting');
  assert.equal(chromosomeModel('daughters').spindle.status, 'disassembled');
});

test('spindle attachments target declared sister DNA identities and opposite poles', () => {
  for (const phase of ['before', 'prophase', 'prometaphase', 'metaphase', 'anaphase', 'telophase', 'cytokinesis', 'daughters']) {
    const model = chromosomeModel(phase), dna = new Set(dnaIds(model));
    const centrosomes = new Set(model.spindle.centrosomes.map(centrosome => centrosome.pole));
    for (const attachment of model.spindle.attachments) {
      assert.ok(dna.has(attachment.chromatidId), 'no attachment can point to an invented DNA copy');
      assert.ok(centrosomes.has(attachment.pole));
    }
    if (['prometaphase', 'metaphase', 'anaphase'].includes(phase)) {
      assert.equal(model.spindle.attachments.length, dna.size);
      for (const source of sourceIds(model)) {
        const poles = model.spindle.attachments.filter(attachment => attachment.chromatidId.startsWith(`${source}.`)).map(attachment => attachment.pole).sort();
        assert.deepEqual(poles, ['left', 'right']);
      }
    } else assert.equal(model.spindle.attachments.length, 0);
  }
});

for (const [name, depth] of files) {
  test(`${name}: scene and composition preserve bounded phases, structural bindings and computed readouts`, () => {
    const scene = buildScene(depth), { scene: serialized } = drawing(name);
    assert.deepEqual(serialized, scene, 'the generated artifact contains the current biological data');
    const composition = JSON.parse(read(`${name}-stepper-mitosis.composition.json`));
    assert.equal(composition.canonical, 'cycle-of-phases');
    assert.deepEqual(composition.data.variants, scene.variants);
    assert.equal(scene.parameter === null, depth === 'brief');
    for (const variant of scene.variants) {
      const regions = phaseRegions(variant), regionIds = new Set(variant.regions.map(region => region.id));
      assert.equal(variant.states.length, depth === 'brief' ? 4 : depth === 'balanced' ? 6 : 8);
      assert.ok(regionIds.size <= 10);
      assert.equal(regionIds.size, variant.regions.length);
      assert.ok(variant.links.every(link => regionIds.has(link.from) && regionIds.has(link.to)));
      const returns = variant.links.filter(link => link.context);
      assert.equal(returns.length, 1);
      assert.match(returns[0].label, /division.*growth.*DNA copying/);
      for (const state of variant.states) {
        assert.ok(state.label.length <= 20);
        assert.ok(state.short.length <= 10);
        assert.ok(state.sentence.length <= 140);
        assert.ok(state.why.length <= 100);
        assert.ok(state.active.every(id => regionIds.has(id)));
        assert.ok(regionIds.has(state.calloutRegion));
        assert.equal(state.calloutRegion, state.id, 'the callout target is a single declared phase region');
        assert.ok(wrap(state.sentence).length + (depth === 'detailed' ? wrap(state.why).length : 0) <= 8, 'callouts fit above the readout row');
        const region = regions.find(item => item.id === state.id), model = region.payload;
        assert.equal(model.dnaReplication, 'completed-in-S-phase-before-mitosis');
        if (depth === 'brief') assert.deepEqual(state.readouts, []);
        else {
          const values = Object.fromEntries(state.readouts.map(readout => [readout.id, readout.value]));
          assert.equal(values.chromosomes, String(model.chromosomes.length));
          assert.equal(values.dna, String(dnaIds(model).length));
          if (depth === 'detailed') {
            const newNuclei = model.nuclei.filter(nucleus => nucleus.pole);
            assert.equal(values['per-nucleus'], newNuclei.length ? String(newNuclei[0].chromosomeIds.length) : '—');
            assert.equal(values.cells, String(model.cellBodies.length));
          } else {
            const poleChromosomes = model.chromosomes.filter(chromosome => chromosome.pole === 'left');
            assert.equal(values['per-pole'], poleChromosomes.length ? String(poleChromosomes.length) : '—');
          }
        }
      }
      if (depth === 'detailed') {
        assert.ok(regions.find(region => region.id === 'before').payload.context);
        assert.ok(regions.find(region => region.id === 'daughters').payload.context);
        assert.equal(regions.filter(region => !region.payload.context).length, buildScene('balanced').variants[0].states.length);
      }
    }
    if (depth !== 'brief') {
      assert.deepEqual(scene.parameter.options, ['Chromosomes', 'Spindle']);
      scene.variants[0].states.forEach((state, index) => {
        const alternate = scene.variants[1].states[index];
        assert.equal(state.id, alternate.id);
        assert.notDeepEqual(state.active, alternate.active);
        assert.notEqual(state.sentence, alternate.sentence);
        assert.deepEqual(state.readouts, alternate.readouts, 'focus does not fabricate a new genome');
      });
    }
  });

  test(`${name}: actual SVG draws every model DNA copy, chromosome, envelope and spindle attachment`, () => {
    const runtime = drawing(name);
    runtime.scene.variants.forEach((variant, option) => {
      variant.states.forEach((state, index) => {
        const { svg, anchor } = runtime.at(index, option, depth === 'brief' || !index ? null : index - 1);
        assert.ok(anchor[0] >= 20 && anchor[0] <= 414 && anchor[1] >= 40 && anchor[1] <= 280);
        const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
        assert.equal(ids.length, new Set(ids).size, 'each rendered node has a stable unique id');
        for (const region of phaseRegions(variant)) {
          const model = region.payload;
          assert.equal((svg.match(new RegExp(`id="chromosome\\.${region.id}\\.`, 'g')) || []).length, model.chromosomes.length);
          assert.equal((svg.match(new RegExp(`id="dna\\.${region.id}\\.`, 'g')) || []).length, dnaIds(model).length);
          assert.equal((svg.match(new RegExp(`id="nucleus\\.${region.id}\\.`, 'g')) || []).length, model.nuclei.length);
          assert.equal((svg.match(new RegExp(`id="spindle\\.${region.id}\\.[^"]+"`, 'g')) || []).filter(match => !match.includes('.growing')).length, model.spindle.attachments.length);
          assert.match(svg, new RegExp(`id="region\\.${region.id}"[^>]+data-active="${state.active.includes(region.id)}"`));
        }
        assert.match(svg, /data-cytokinesis="starting"/);
        if (depth !== 'brief') {
          assert.match(svg, new RegExp(`id="region\\.${state.focus}"[^>]+data-active="true"`));
          if (index) assert.match(svg, new RegExp(`id="region\\.${variant.states[index - 1].id}"[^>]+data-previous="true"`));
        }
        assert.match(svg, /Next cycle after division, growth \+ DNA copying/);
      });
    });
  });

  test(`${name}: every step and Focus choice retain exactly the same picture geometry`, () => {
    const runtime = drawing(name);
    const coordinates = svg => [...svg.matchAll(/<(circle|rect|polyline|polygon|text)\b([^>]+)>/g)].map(match => {
      const attrs = Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(attribute => [attribute[1], attribute[2]]));
      return [match[1], attrs.id, ...['x', 'y', 'cx', 'cy', 'r', 'width', 'height', 'points'].map(key => attrs[key] ?? null)];
    });
    const initial = coordinates(runtime.at(0).svg);
    runtime.scene.variants.forEach((variant, option) => variant.states.forEach((state, index) => {
      assert.deepEqual(coordinates(runtime.at(index, option, index ? index - 1 : null).svg), initial);
    }));
  });
}

test('unrecognized depths fail instead of silently selecting another lesson', () => {
  assert.throws(() => buildScene('extra'), /Unknown depth/);
});
