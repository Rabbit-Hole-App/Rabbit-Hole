import { useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { explainClient, sharedProgramClient } from './explain-client.js';
import { CardSourceScope } from './use-card-source.js';
import { Frame } from './AnimatedScene.jsx';
import { evaluateScene } from './scene-evaluate.js';
import { getSceneState, validateScene } from './animation-scene.js';
import { legibleFrame } from './explain-program/frame.js';
import { INTERACT_LOOK } from './interact-style.js';
import { createProgramHost, programStamps } from './explain-program/host.js';
import { fixturesAdmitted, programErrorMessage } from './explain-program/program-card.js';
import { MdInline } from './Md.jsx';
import { DESCRIPTION_STYLE } from './interact-description-fit.js';
import { supportInputs, snapshotKey } from './interact-card-layout.js';
import { TEACHING, TEACHING_CHROME } from './tutor-diagrams/teaching-theme.js';
import { artifactKey, programSnapshot, resolveSupportArtifact, supportSnapshots } from './interact-support-snapshots.js';

// INT-06-C02/C03: the introduction of an /interact card, above its main scene: the card description (2 to 4 lines, the style that
// interact-description-fit.js measured) and the supporting visuals. A supporting panel is visual only: one read-only frame of its own
// artifact at the main scene's current inputs, with no clock, transport, controls, Notes or practice. It uses the card's existing frame
// (the shared Frame inside the bordered white box the main scene sits in) and the Interact box's small caps label for its title.
const NOOP = () => {};
const STILL = { duration: 0 };
const BOX = 'rounded-lg border border-line';
// A supporting panel sits on the teaching inset, as the written diagrams' inset panels do.
const BOX_STYLE = { background: TEACHING.inset };
// The experiment box's light colours (index.css [data-interact-experiment] reads them as --xpt-*, and takes the app's own tokens in the dark theme): the teaching theme's, never a literal.
export const EXPERIMENT_STYLE = Object.freeze({
  '--xpt-card': TEACHING.surface, '--xpt-panel': TEACHING.inset, '--xpt-border': TEACHING.line, '--xpt-ink': TEACHING.ink, '--xpt-muted': TEACHING.muted,
  '--xpt-blue': TEACHING.blue, '--xpt-blue-soft': TEACHING.blueSoft, '--xpt-blue-border': TEACHING_CHROME.blueBorder, '--xpt-blue-ink': TEACHING_CHROME.blueInk,
  '--xpt-blue-hover': TEACHING_CHROME.blueHover, '--xpt-blue-pressed': TEACHING_CHROME.bluePressed,
});

// A declarative (spec) panel: the scene at its finished frame for the bound inputs. Sync and pure.
function specFrame(spec, inputs) {
  const interactive = Array.isArray(spec.inputs) && spec.inputs.length > 0;
  const scene = interactive ? evaluateScene(spec, 0, inputs).scene : validateScene(spec);
  return { scene, state: getSceneState(scene, scene.duration) };
}

// The frame of one panel: null while it is being made, { frame } when drawn, { error } when it cannot be. Program snapshots wait their turn in
// the page's one service (INT-04-C14); a result for inputs or an artifact that has since changed is dropped (the live fence).
function usePanelFrame(panel, block, mainInputs) {
  const scope = useContext(CardSourceScope);
  const token = scope?.token || null, boardId = block.explain?.canvas?.boardId;
  const bound = useMemo(() => supportInputs(panel, mainInputs), [panel, JSON.stringify(mainInputs)]); // eslint-disable-line react-hooks/exhaustive-deps
  const [state, setState] = useState({ key: null, frame: null, error: null });
  const key = snapshotKey(artifactKey(panel), bound);
  useEffect(() => {
    let live = true;
    if (panel.artifact.kind === 'spec') {
      try { setState({ key, frame: specFrame(panel.artifact.spec, bound), error: null }); } catch (problem) { setState({ key, frame: null, error: problem }); }
      return () => { live = false; };
    }
    const client = token ? sharedProgramClient(token) : boardId ? explainClient(api, boardId) : null;
    supportSnapshots.request({
      artifact: artifactKey(panel), inputs: bound, live: () => live,
      run: async () => {
        const out = await resolveSupportArtifact(panel, { block, client, fixtures: fixturesAdmitted(import.meta.env), stamps: await programStamps() });
        if (!out.ok) throw out.error;
        return programSnapshot({ artifact: out.artifact, inputs: bound, createHost: createProgramHost });
      },
    }).then(frame => { if (live && frame) setState({ key, frame, error: null }); }, error => { if (live) setState({ key, frame: null, error }); });
    return () => { live = false; };
  }, [key, block.id, token, boardId]); // eslint-disable-line react-hooks/exhaustive-deps
  // A frame made for other inputs is never shown as this panel's.
  return state.key === key ? state : { key, frame: null, error: null };
}

function SupportPanel({ panel, block, mainInputs }) {
  const { frame, error } = usePanelFrame(panel, block, mainInputs);
  const legible = frame ? legibleFrame(frame.scene, INTERACT_LOOK) : null;
  return (
    <div data-interact-support={panel.id} data-interact-support-state={error ? 'failed' : frame ? 'drawn' : 'loading'} className={BOX} style={BOX_STYLE}>
      <p className="px-3 pt-1.5 text-xs font-semibold tracking-wide text-ink-2 uppercase">{panel.title}</p>
      {error
        ? <p role="alert" data-interact-support-error className="grid min-h-16 place-content-center p-3 text-center text-xs text-red-700">{programErrorMessage(error)}</p>
        : !frame
          ? <p data-interact-support-loading className="grid min-h-16 place-content-center p-3 text-center text-xs text-ink-2">Preparing the explanation</p>
          : (
            <div className="flex overflow-auto">
              <div role="img" aria-label={panel.title} className="flex-1" style={{ minWidth: legible.w, minHeight: legible.h }}>
                <Frame scene={frame.scene} state={frame.state} selecting={false} marked={null} picked={null} pop={STILL} fixedView onPick={NOOP} onRegion={NOOP} />
              </div>
            </div>
          )}
    </div>
  );
}

// The description, then the supporting panels in the composition's order. Marked data-interact-intro so Focus can measure its live height.
export function InteractIntro({ composition, block, mainInputs, instructions }) {
  return (
    <div data-interact-intro className="flex shrink-0 flex-col gap-2">
      <p data-card-description className={DESCRIPTION_STYLE.className} style={{ maxWidth: DESCRIPTION_STYLE.focusMeasurePx }}><MdInline text={composition.cardDescription} mathOnly /></p>
      {/* The plan's instructions (owner brief 2026-11-13 codex match): a bold Instructions label, then the paragraph, 15 px muted at 1.55 (the Codex reference). */}
      {instructions && (
        <div data-card-instructions className="shrink-0 text-[15px] leading-[1.55] text-ink-2" style={{ maxWidth: DESCRIPTION_STYLE.focusMeasurePx }}>
          <strong className="mb-[5px] block text-ink" style={{ fontWeight: 650 }}>Instructions</strong>
          <p className="m-0">{instructions}</p>
        </div>
      )}
      {composition.supports.map(panel => <SupportPanel key={panel.id} panel={panel} block={block} mainInputs={mainInputs} />)}
    </div>
  );
}
