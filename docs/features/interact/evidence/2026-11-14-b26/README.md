# Brief 26 evidence (2026-11-14)

- `results.jsonl`: the pinned merge-sort Brief run (clone Version dd6a5966, INTERACT_DESIGN_FIXTURE=stepper, INTERACT_INPUTS_V2=on). It ended `capability_gap` at design_verifying: `scene.runtime.requiredCapabilities: "inputs_v2" is not a program capability; scene.runtime.programTuple: a program needing inputs_v2 is sealed as sdk-2 schema 1, not sdk-8 schema 1`. No card was built, so there are no manifest or frames.
- `live/results.jsonl`: the two live-path runs without a pin (clone Version c4be9adf).
- `../2026-11-14-b26-first-attempts/`: the earlier runs: the deploy that failed (the shared node_modules was gone), a run where the pin was ignored under INTERACT_DESIGN_KIND=fast, and a run where the pinned job looped between revising and verifying (fixed in 57482201f).
