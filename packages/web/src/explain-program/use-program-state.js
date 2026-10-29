import { useEffect, useRef, useState } from 'react';
import { STATEFUL_SCHEMA_VERSION } from './contract.js';
import { normalizeFrame } from './frame.js';
import { ACTION_QUEUE_CAP, createInteractionController } from './interaction.js';
import { evaluateRequestFor, programInputs, programSeed, programStateFor } from './program-card.js';

// ProgramScene's thin binding to interaction.js for a schema 2 card: one controller per host, the committed state for the frame
// scheduler, settled states saved through persist (the owner's board save, or a share-link visitor's or a Proposed preview's in-memory
// copy). A schema 1 card gets { stateful: false, ready: true } and nothing else runs.
//   useProgramState({ host, hostKey, artifact, block, time, persist(envelope, { reset }), fail })
//     -> { stateful, envelope, changed, ready, full, dispatch(event, context) -> boolean, reset(inputs) }
export function useProgramState({ host, hostKey, artifact, block, time, persist, fail }) {
  const stateful = artifact?.schemaVersion === STATEFUL_SCHEMA_VERSION;
  const [envelope, setEnvelope] = useState(null);
  const [pending, setPending] = useState(0);
  const [changed, setChanged] = useState(false); // a transition since the last initialization (a rehydrated state counts as one)
  const controller = useRef(null);
  const latest = useRef(null);
  latest.current = { block, time, persist, fail };
  useEffect(() => {
    setEnvelope(null);
    setPending(0);
    setChanged(false);
    if (!stateful || !host) return undefined;
    const { block: start, time: at } = latest.current;
    const saved = programStateFor(start, artifact);
    let checks = 0;
    const created = createInteractionController({
      host, bundleHash: artifact.bundleHash, seed: saved?.seed ?? programSeed(start), saved,
      publish: (next, { initial }) => { setEnvelope(next); setChanged(!initial); setPending(created.pending()); },
      persist: (next, how) => latest.current.persist(next, how),
      fail: error => { setPending(0); latest.current.fail(error); },
      // A new state is kept only if its frame is valid too, at the inputs and time it was computed for (never newer ones).
      check: async (next, { inputs, time: moment }) => {
        const reply = await host.evaluate(evaluateRequestFor(artifact.manifest, { ...latest.current.block, inputs }, moment, `c${++checks}`, next.state), { supersede: false });
        const out = normalizeFrame(reply.frame, artifact.manifest);
        if (!out.ok) throw out.error;
      },
    });
    controller.current = created;
    const inputs = programInputs(artifact.manifest, start);
    created.start(inputs, { time: at });
    // The saved inputs are the learner's latest; a change saved after the last committed state (a reload before it committed) is applied again.
    if (saved) for (const [name, value] of Object.entries(inputs)) if (saved.inputs[name] !== value) created.dispatch({ type: 'input', input: name, value }, { inputs, time: at });
    return () => { created.dispose(); if (controller.current === created) controller.current = null; };
  }, [stateful, host, hostKey, artifact]);
  const dispatch = (event, context) => {
    const accepted = controller.current?.dispatch(event, context) ?? false;
    if (controller.current) setPending(controller.current.pending());
    return accepted;
  };
  return {
    stateful, envelope, changed, ready: !stateful || !!envelope, full: pending >= ACTION_QUEUE_CAP, dispatch,
    reset: inputs => controller.current?.reset(inputs),
  };
}
