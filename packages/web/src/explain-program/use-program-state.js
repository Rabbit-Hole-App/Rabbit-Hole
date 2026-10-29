import { useEffect, useRef, useState } from 'react';
import { STATEFUL_SCHEMA_VERSION } from './contract.js';
import { normalizeFrame } from './frame.js';
import { createInteractionController } from './interaction.js';
import { evaluateRequestFor, programInputs, programSeed, programStateFor } from './program-card.js';

// ProgramScene's thin binding to interaction.js for a schema 2 card: one controller per host, the committed state for the frame
// scheduler, settled states saved through persist (the owner's quiet board save, or a share-link visitor's in-memory copy). A schema 1
// card gets { stateful: false, ready: true } and nothing else runs.
//   useProgramState({ host, hostKey, artifact, block, time, persist, fail }) -> { stateful, envelope, ready, dispatch(event, context), reset(inputs) }
export function useProgramState({ host, hostKey, artifact, block, time, persist, fail }) {
  const stateful = artifact?.schemaVersion === STATEFUL_SCHEMA_VERSION;
  const [envelope, setEnvelope] = useState(null);
  const controller = useRef(null);
  const latest = useRef(null);
  latest.current = { block, time, persist, fail };
  useEffect(() => {
    setEnvelope(null);
    if (!stateful || !host) return undefined;
    const { block: start } = latest.current;
    const saved = programStateFor(start, artifact);
    let checks = 0;
    const created = createInteractionController({
      host, bundleHash: artifact.bundleHash, seed: saved?.seed ?? programSeed(start), saved,
      publish: setEnvelope,
      persist: next => latest.current.persist(next),
      fail: error => latest.current.fail(error),
      // A new state is kept only if its frame at the current moment is valid too.
      check: async next => {
        const { block: now, time: at } = latest.current;
        const reply = await host.evaluate(evaluateRequestFor(artifact.manifest, now, at, `c${++checks}`, next.state), { supersede: false });
        const out = normalizeFrame(reply.frame, artifact.manifest);
        if (!out.ok) throw out.error;
      },
    });
    controller.current = created;
    created.start(programInputs(artifact.manifest, start));
    return () => { created.dispose(); if (controller.current === created) controller.current = null; };
  }, [stateful, host, hostKey, artifact]);
  return {
    stateful, envelope, ready: !stateful || !!envelope,
    dispatch: (event, context) => controller.current?.dispatch(event, context) ?? false,
    reset: inputs => controller.current?.reset(inputs),
  };
}
