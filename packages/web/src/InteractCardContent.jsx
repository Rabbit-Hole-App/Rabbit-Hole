import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import AnimatedScene from './AnimatedScene.jsx';
import { ShowPurposes } from './SceneControls.jsx';
import ProgramScene from './explain-program/ProgramScene.jsx';
import { InteractIntro } from './InteractSupportPanels.jsx';
import { cardLayout, layoutProblems } from './interact-card-layout.js';

// INT-06-C02: the body of an /interact card, a scoped composition around the existing players (not a new player or a new look). The title is
// the card's own header; this draws, in the order of interact-card-layout.js cardLayout: the description, the supporting panels, the main
// scene, its external timeline and the experiment controls, with no explanatory text under the scene or the controls.
//   program main: ProgramScene draws all of it (its own transport and Interact box), given the composition.
//   spec main: AnimatedScene under the same InteractIntro, with the experiments' purpose sentences off.
// A composition that does not hold together draws the existing program-error block, never a partial card.

// The spec route has no manifest to measure with: the card grows by the intro's and the controls' measured heights together.
function SpecComposition({ block, composition, onChange, onChangeQuiet, onAskAnimation, onControlsHeight }) {
  const intro = useRef(null);
  const [introH, setIntroH] = useState(0), [controlsH, setControlsH] = useState(0);
  useLayoutEffect(() => {
    if (!intro.current) return undefined;
    const observer = new ResizeObserver(() => setIntroH(intro.current ? intro.current.offsetHeight + 8 : 0));
    observer.observe(intro.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { onControlsHeight?.(introH + controlsH); }, [introH, controlsH]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onControlsHeight?.(0), []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div ref={intro}><InteractIntro composition={composition} block={block} mainInputs={block.inputs || {}} /></div>
      <ShowPurposes.Provider value={false}>
        <AnimatedScene block={block} interact={!!block.explain?.revision} onChange={onChange} onChangeQuiet={onChangeQuiet} onAskRegion={onAskAnimation} onControlsHeight={setControlsH} />
      </ShowPurposes.Provider>
    </div>
  );
}

export default function InteractCardContent({ block, composition, preview = false, onChange, onChangeQuiet, onAskAnimation, onControlsHeight, onProgramFrame, onFile }) {
  if (composition.problems || layoutProblems(cardLayout(composition)).length) {
    return (
      <div data-interact-composition-error role="alert" className="grid min-h-24 place-content-center p-4 text-center text-xs text-red-700">
        <span>This card could not be put together.</span>
      </div>
    );
  }
  if (block.program) {
    return <ProgramScene composition={composition} preview={preview} block={block} onChange={onChange} onChangeQuiet={onChangeQuiet} onControlsHeight={onControlsHeight} onProgramFrame={onProgramFrame} onFile={onFile} />;
  }
  return <SpecComposition block={block} composition={composition} onChange={onChange} onChangeQuiet={onChangeQuiet} onAskAnimation={onAskAnimation} onControlsHeight={onControlsHeight} />;
}
