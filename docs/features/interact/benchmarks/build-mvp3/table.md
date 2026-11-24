# Build MVP 3: the whole path live (brief 48)

"/interactive what changes a pendulum swing" at Deep on the local interactive stack (8879), no hand in between: Design (Gemini 4 Hydrogen at high: the quantities call, the dice, the blueprint call, checks 1 to 9, one correction), then the Build call (Hydrogen at high: build-mvp1's prompts and measurements), the Program writer, validate, the headless run and the frame rules (inside the design stage, one repair call to the Build model on a failure that is not motion decoration), then the job's own validate, headless run, frame rules, seal and canvas. Made by `scripts/interact/build-live-collect.mjs`. Seconds: design and build are the phases' own (build includes the measurements and the frame check); total is from the prompt sent to the card ready. Each run's blueprint, build-schema, Program (as the writer writes it from them), checks and the whole-viewport shot at t = 0.3 s are in `run-N/`.

| Run | Seed | Dice pick (of the control quantities) | Design s / $ | Build s / $ | Repair | Total s | Result | Canvas | Shot | Program |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 2811361551 | length, amplitude, gravity (of length, mass, amplitude, gravity) | 74.261 s / $0.119 | 96.67 s / $0.157 | none | 171.4 | card ready | http://127.0.0.1:8879/apps/canvas-99b2b08a | run-1/viewport-t0.3s.png | 14967 B |
| 2 | 1171958770 | gravity, mass (of length, gravity, mass, amplitude) | 53.852 s / $0.109 | 100.988 s / $0.191 | none | 155.3 | card ready | http://127.0.0.1:8879/apps/canvas-3df95177 | run-2/viewport-t0.3s.png | 14675 B |
| 3 | 1097283186 | gravity, mass, angle0 (of length, gravity, mass, angle0) | 60.079 s / $0.116 | 111.31 s / $0.198 | none | 171.8 | card ready | http://127.0.0.1:8879/apps/canvas-718e0c70 | run-3/viewport-t0.3s.png | 14799 B |

Total model cost: $0.890.

## Earlier attempts that are not in this table

- A first live run (job `ej_d0159c620422439787dd84214f4a983d`, 11-21) passed Design and Build (no repair) and then failed in the job's own headless run on the engine's 50 ms time limit; the Program then sampled a graph at 96 positions and a trace at 32 points, which `e908a844f` cut to 48 and 24. Its records are in git history (`e908a844f`, `build-mvp3/run-1`). The three runs here use the cut.
- The three runs of 11-21 17:09 failed at the first call with the provider's HTTP 402 (prepayment credits depleted) before the top-up, and a retry of the three in parallel was stopped by the harness for low memory. These three were run one at a time on 11-24 after the stack was restarted.
- The repair path (one call to the Build model on a frame failure) did not run in any of these three: every first Build answer passed the schema and all 9 frames.
