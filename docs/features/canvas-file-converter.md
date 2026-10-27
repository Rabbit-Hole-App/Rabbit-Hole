# Canvas file converter (dev): `rabbit-hole-convert-dev`

The native conversion service for canvas file imports (owner decision A, 2026-10-16): one dev-only Fly app,
`rabbit-hole-convert-dev`, in the `rabbit-hole` org. It converts DOC/DOCX to PDF, PPTX to PDF plus slide images and
text, audio to a browser playback copy, and STEP to a GLB viewing mesh. Sources, finished derivatives and durable job
state live in R2 and the control plane (`docs/features/canvas-file-imports.md`, sections 4 and 5); converter disk is
scratch only. Code: `packages/file-convert/`.

**Production: not live.** Only the dev app exists. The production plan (a second Fly app, its two secrets, the two config
vars, the owner commands, acceptance, rollback, cost and the honest verification status) is section 7.

## 1. Converter API (contract for the control-plane job runner)

This section is the converter half of the job contract. The durable job record (`file_jobs`), its states, the lease and
the retry decision belong to the control plane (Lane 1 / JOBS lane). The converter never writes D1, never chooses an
attempt number and never decides that a job is finished: it reports, and the control plane commits.

### 1.1 Roles and auth

| Direction | Auth | Notes |
|---|---|---|
| control plane -> converter | `Authorization: Bearer <CONVERT_TOKEN>` | one service token, a Fly secret on the converter and a Worker secret on the control plane; at least 32 characters; compared in constant time |
| converter -> control plane | `Authorization: Bearer <callback.token>` | minted by the control plane per (job id, attempt), sent in the dispatch body; short-lived (expiry at least the hard timeout + 10 min); scoped to reading that job's source and writing that attempt's outputs; the converter treats it as opaque and never logs it |

The converter sends a callback token only to an origin in its `CONVERT_ALLOWED_ORIGINS` list (the control plane's
origin), never follows redirects (a 3xx is a failure), and refuses a dispatch whose `source.url` or `callback.url` is on
another origin. The sandboxed conversion child never sees either token and has no network.

### 1.2 Endpoints on the converter

| Method and path | Auth | Answer |
|---|---|---|
| `GET /health` | none | `200 { ok, service: "rabbit-hole-convert", version, sandbox, busy, active, slots, limits, converters: { <name>: <converter_version> }, tools, resource_backend, workspace_entries, idle_stop_seconds }`. No secrets, no job ids. `ok:false` + `degraded` when a sandbox cleanup failed (the machine needs a restart; dispatch gets 503). |
| `POST /jobs` | service | dispatch one attempt (1.3) |
| `GET /jobs/<job id>/<attempt>` | service | best-effort status from memory: `{ job_id, attempt, state, stage, error?, metrics?, sandbox?, resources? }` (`sandbox`: what the child saw - uid, network, env keys; `resources`: the cgroup limits and peaks); `404` when unknown (e.g. the machine restarted). Never the source of truth: D1 is. |
| `POST /jobs/<job id>/<attempt>/cancel` | service | stops the attempt: aborts a fetch or upload, kills the sandbox's whole process tree, removes the workspace, then reports `fail` with `error: "cancelled"`. `200 { state: "cancelled" }`; idempotent; `404` when unknown. |

Any other path is `404`; a wrong method `405`; no or wrong token `401` (health excepted).

### 1.3 Dispatch: `POST /jobs`

```json
{
  "schema": "file-convert/1",
  "job_id": "fj_0123456789abcdef01234567",
  "attempt": 1,
  "converter": "office-pdf | slides | audio-playback | step-glb",
  "options": {},
  "source": { "url": "https://<cp>/api/learn/files/jobs/<job id>/source", "bytes": 48213, "sha256": "<64 hex>", "media_type": "application/msword" },
  "callback": { "url": "https://<cp>/api/learn/files/jobs/<job id>/attempts/1", "token": "<opaque>", "expires_at": "2026-10-16T21:00:00Z" }
}
```

- `job_id` matches `^[A-Za-z0-9_-]{1,64}$`; `attempt` is an integer 1..100; the body is at most 16 KiB.
- `source.bytes` must be within the converter's source cap (1.6) and is checked against the bytes actually read;
  `source.sha256` is checked against their hash. A mismatch fails the attempt (`source_mismatch`, not retryable).
- `options` per converter (unknown keys are refused):
  - `office-pdf`: `{ poster?: boolean }` (default true: a first-page PNG).
  - `slides`: `{ from?: int, to?: int, width?: 320..1920 }` (1-based inclusive slide range for images, default all up
    to the slide cap; default width 1280). The PDF always holds every slide, hidden slides included.
  - `audio-playback`: `{ bitrate_kbps?: 64..256 }` (default 128).
  - `step-glb`: `{ quality?: "draft" | "normal" | "fine" }` (default normal).

Answers:

| Status | When | Body |
|---|---|---|
| `202` | a new attempt was accepted and started | `{ job_id, attempt, state: "accepted" }` |
| `200` | this exact (job id, attempt) is already running or finished on this machine | `{ job_id, attempt, state, duplicate: true }`; nothing is started again |
| `409` | a newer attempt of the same job is already known here | `{ error: "superseded", attempt: <newer> }` |
| `429` | every slot is in use | `{ error: "busy", slots, active }`; the control plane keeps the job queued and re-dispatches on its next alarm (back-off), never as a new attempt |
| `400` / `413` | invalid body / too large | `{ error, errors? }` |
| `503` | `degraded` (restart needed) or `draining` (the machine is stopping) | `{ error }`; re-dispatch later |

A newer attempt of a job that is still running here cancels the older one locally (it could not commit anyway).

### 1.4 (job id, attempt) idempotency

- The converter's workspace id is `sha256("<job id>:<attempt>")[0..32]`; one attempt has at most one workspace and one
  running sandbox per machine. A duplicate dispatch of the same pair returns `200 duplicate` and does nothing.
- After a machine restart the converter has no memory of the attempt. A re-dispatch of the same pair runs again from
  the source; that is safe because outputs are keyed by (job id, attempt, name), uploads of identical bytes are
  no-ops, and `complete` is idempotent (1.5).
- The control plane makes a crash recovery a NEW attempt (`attempt + 1`) after the lease expires; it rejects every
  callback whose attempt is not the job's current attempt with `409`, so a late result of an old attempt can never
  commit.

### 1.5 Converter -> control plane callbacks

All under `callback.url`, Bearer `callback.token`, JSON unless stated. The converter retries a network error or a 5xx
three times (1 s, 3 s back-off); a 4xx is final.

1. `GET source.url` - the original bytes (no Range needed). Read with a byte cap and hashed while streaming.
2. `POST {callback.url}/progress` `{ job_id, attempt, stage }` on each stage change and every 20 s while working.
   `stage` is one of `validating` (fetching and checking the source), `converting`, `preparing_preview` (validating
   and uploading outputs). The control plane extends the lease (e.g. `lease_until = now + 90 s`) and shows the stage.
   A heartbeat that stops means the machine or process died: the lease expires and the runner retries.
3. `PUT {callback.url}/outputs/<name>` - raw bytes of one output, headers `Content-Type`, `Content-Length`,
   `X-Content-SHA256: <64 hex>`. The control plane writes them to a STAGING key for this attempt
   (e.g. `file-jobs/<job id>/<attempt>/<name>`, `onlyIf` absent). The same name with the same sha256 again: `200`, no
   change. The same name with different bytes: `409`. Staged bytes are not a derivative: nothing reads them.
   `<name>` matches `^[a-z0-9][a-z0-9._-]{0,63}$` and is one of the converter's declared output names (1.6).
4. `POST {callback.url}/complete` - the manifest, sent only after every PUT succeeded:

   ```json
   {
     "schema": "file-convert-result/1", "job_id": "fj_...", "attempt": 1,
     "converter": "slides", "converter_version": "slides/1+libreoffice-25.2.3+poppler-25.03.0",
     "service_version": "file-convert-1-<hash>",
     "outputs": [ { "name": "preview.pdf", "kind": "preview", "media_type": "application/pdf", "bytes": 1234, "sha256": "...", "meta": { "pages": 4 } } ],
     "coverage": { "text": "extracted", "units": "slides", "count": 4 },
     "limitations": ["Animations and transitions are not rendered"],
     "metrics": { "fetch_ms": 120, "convert_ms": 4100, "upload_ms": 300, "memory_peak_bytes": 412000000, "cpu_usage_us": 3900000 }
   }
   ```

   The control plane checks that every listed output is staged with that sha256 and size, then in ONE D1 batch, guarded
   by `attempt = current AND state not terminal`, inserts the `file_derivatives` rows (`ready`, unique per source
   revision + `kind` + `converter_version` + options hash), points them at the staged objects (or copies them to
   `file-sources/<source id>/d/<derivative id>` first) and sets the job `ready` / `ready_with_limitations`. That one
   batch is the commit: before it, no derivative exists; after it, all of them do. Answers: `200` committed (also for
   a repeated identical `complete`), `409` stale attempt or job already terminal, `422` a listed output is missing or
   differs.
5. `POST {callback.url}/fail` `{ job_id, attempt, error, detail, retryable }` - the attempt ended without outputs.
   `retryable: true` for infrastructure failures (`source_unavailable`, `upload_failed`, `converter_restarted`,
   `converter_crashed` - the conversion process was killed or crashed without a result - and `sandbox_failure`);
   `false` for deterministic ones (`unsupported_format`, `invalid_source`, `source_mismatch`, `timeout`,
   `memory_limit_exceeded`, `output_too_large`, `too_complex`, `cancelled`). The control plane decides whether to retry
   within `max_attempts`. Staged outputs of a failed or superseded attempt are removed by retention cleanup, never read.

The converter removes its workspace after every attempt (success, failure, cancel, timeout) and the whole jobs
directory at start-up, so a killed machine leaves nothing behind on its disk; `GET /health` reports
`workspace_entries`.

### 1.6 Converters, outputs and limits

| Converter | Accepts (sniffed, not by name) | Outputs (`name`: kind) |
|---|---|---|
| `office-pdf` | DOC (OLE2 Word), DOCX, ODT, RTF | `preview.pdf`: preview; `text.json`: text (per page); `poster.png`: poster (page 1) |
| `slides` | PPTX, PPT, ODP | `preview.pdf`: preview (one page per slide, hidden slides included); `slide-001.png`...: slide; `text.json`: text (per slide, notes labelled) |
| `audio-playback` | MP3, WAV, OGG (Vorbis/Opus), M4A/MP4 audio (AAC/ALAC), FLAC, AIFF, WebM/Matroska audio | `playback.m4a`: playback (AAC-LC in MP4, faststart); `probe.json`: metadata |
| `step-glb` | STEP AP203/AP214/AP242 (`ISO-10303-21`) | `model.glb`: mesh (glTF 2.0, metres, assembly tree as nodes); `structure.json`: units, parts, tree |

`text.json` is the shared extracted-text shape chat citations read (the docs lane's `file-text-units.js`):
`{ v: 1, units: [{ loc, text }], complete, limited? }` with one unit per PDF page (`loc: { page }`) or slide
(`loc: { slide }`), speaker notes as their own unit (`loc: { slide, notes: true }`), a hidden slide's text starting with
`[Hidden slide]`, and `limited` saying what was left out (`complete: false`). Converter revs: `office-pdf/3`, `slides/3` (3: private-use Symbol bullets read as "•"). Limits (service-enforced; the
control plane's family limits stay authoritative for uploads): source at most 64 MiB, one output at most 50 MiB, all
outputs at most 100 MiB, `model.glb` at most 20 MiB and 5,000,000 accessor elements (the existing viewer's
`inspectGlb` bounds), at most 300 slide images, text at most 4 MiB, audio at most 4 h, hard timeout 300 s per attempt.
Measured runtime, memory and the per-job cgroup limits: section 3.

### 1.7 Machine lifecycle

`auto_stop_machines = "off"`, `auto_start_machines = true`, `min_machines_running = 0`. A dispatch through the Fly
proxy starts a stopped machine. Fly never stops it for lack of HTTP traffic, so a conversion continues after the
dispatching request has returned. The service exits (machine `stopped`, restart policy `on-failure`) only after
`idle_stop_seconds` with zero active attempts and no authenticated request. A dispatch that races that exit gets a
connection error or 503 and is re-dispatched by the runner's next alarm.

### 1.8 Portability

Nothing in this API is Fly-specific: a container host that runs the image, routes HTTPS to port 8080 and starts it on
demand can serve it (Cloudflare Containers, Cloud Run, ECS; production runs the Fly image, section 7). The control plane needs only `CONVERT_URL`,
`CONVERT_TOKEN` and the callback routes above. Production hosting is undecided (section 4).

## 2. Image, versions and licences

Built by `packages/file-convert/context.sh` (a `git archive` of `packages/file-convert` at HEAD) and
`packages/file-convert/Dockerfile` on a Fly remote builder (this host has no Docker). The image records its own versions
and FFmpeg's licence evidence in `/app/build-info.json` (`build-info.mjs`), served in `/health` as `tools`, and the build
FAILS if FFmpeg is not LGPL, links anything beyond the C library or lacks the `aac` encoder.

| Component | Pin | Licence | Notes |
|---|---|---|---|
| Base | `node:24.19.0-trixie-slim@sha256:ab3eebe934147fee049b5eb83c570f68c849a13c930bdfa482de99fcdfa3b3de` (Debian 13, Node 24.19.0) | - | |
| Debian packages | `snapshot.debian.org` at `20261016T000000Z` (main, updates, security) AND exact versions | per package | a rebuild installs the same bytes |
| LibreOffice | `libreoffice-{core,writer,impress}-nogui 4:25.2.3-2+deb13u8` (reports 25.2.3.2) | MPL-2.0 | server-side only, headless, no GUI, no Java, no Python |
| poppler-utils | 25.03.0, Debian package `poppler-utils=25.03.0-5+deb13u4` from the pinned snapshot (`pdfinfo`, `pdftotext`, `pdftoppm`) | GPL-2.0-or-later | **approved dependency (owner, 2026-10-16)**: run server-side only, as separate processes; never linked into application code. Its notices stay in the image and the build fails without them (below) |
| Fonts | `fonts-liberation 1:2.1.5-3`, `fonts-crosextra-carlito 20230309-2`, `fonts-crosextra-caladea 20200211-2`, `fonts-dejavu-core 2.37-8` | OFL-1.1 / Apache-2.0 / Bitstream Vera | metric-compatible Arial/Times/Courier, Calibri, Cambria; no CJK fonts |
| FFmpeg | 8.1.3 release tarball, sha256 `7138d28c96d9d3e3af4ee3d8cad72741f8ffb40da90c1112235dea3ecd3178a3`; its `.asc` verified against the FFmpeg release key `FCF9 86EA 15E6 E293 A564 4F10 B432 2F04 D676 58D8` when pinned | LGPL-2.1-or-later | built from source in the image's first stage; configure flags below |
| occt-import-js | 0.0.23, npm tarball sha512 `4457d841...65809` (integrity `sha512-RFfYQXYF...oZYCQ==`), `dist/` only | LGPL-2.1 (`LICENSE.md`, shipped in the image) | WebAssembly build of OpenCascade Technology 7.6.1 (submodule commit `d2abb6d844231cb8f29be6894440874a4700e4a5`, "Update version up to 7.6.1"), LGPL-2.1 with the OCCT exception (`dist/license.occt.txt`); compiled with Emscripten (runtime MIT / University of Illinois NCSA) |

FFmpeg configure (from `ffmpeg -buildconf` on the built binary, section 3 records the observed output):

```
--prefix=/opt/ffmpeg --disable-autodetect --disable-everything --disable-network --disable-doc --disable-debug
--disable-ffplay --enable-ffmpeg --enable-ffprobe --enable-static --disable-shared --enable-protocol=file,pipe
--enable-demuxer=mp3,wav,w64,ogg,mov,flac,aac,matroska,aiff
--enable-decoder='mp3*,pcm_*,adpcm_ima_wav,adpcm_ms,vorbis,opus,flac,aac,aac_fixed,alac'
--enable-parser=mpegaudio,aac,flac,vorbis,opus --enable-encoder=aac,opus --enable-muxer=mp4,ipod,ogg,webm,null
--enable-bsf=aac_adtstoasc --enable-filter=aresample,aformat,anull,atrim
```

No `--enable-gpl`, `--enable-nonfree` or `--enable-version3`, and `--disable-autodetect` links no external library
(no x264/x265, fdk-aac, zlib, iconv). Only the native `aac` and `opus` encoders exist; the playback copy uses `aac`.
Untrusted input meets only the listed demuxers and decoders; no network protocol exists in the binary.

poppler-utils approval (owner, 2026-10-16): `pdfinfo`, `pdftotext` and `pdftoppm` are approved as separate command-line
programs in the dev converter, in the existing architecture (the sandboxed child spawns them; no code links libpoppler).
The image keeps `/usr/share/doc/poppler-utils/copyright` and the `libpoppler*` copyright file; `build-info.mjs` fails
the build if either is missing or lacks its GPL terms, and lists them in `/app/build-info.json` as `poppler_notices`.
Owner's note: **reassess the licence obligations if the converter image is ever distributed or packaged for customers**
(GPL-2.0+ obligations attach to distributing poppler's binaries, not to running them on our servers).

Notices: the LGPL texts ship in the image (`/opt/ffmpeg/COPYING.LGPLv2.1`, `/app/vendor/occt-import-js/LICENSE.md`,
`dist/license.occt.txt`, Debian's `/usr/share/doc/*/copyright`). The image is not distributed to users; derivatives
(PDF, PNG, M4A, GLB) are data and carry no licence obligation from these tools.

Sandbox (same structure as the Fly-proven motion renderer): `sudo` runs the root-owned `convert-sandbox <id> <slot>`;
`resource-control.mjs` (an adapted copy of motion's) puts it in per-job cgroup v1 groups before anything starts (memory
1.5 GiB with no swap allowance, 512 tasks, 1 CPU); `unshare --net --pid --mount --ipc --uts` gives it no network
(loopback down) and its own processes; `sandbox-init` hides the service tree, homes and `/.fly`, mounts `/app` read-only,
gives a 1 GiB private `/tmp`, and drops to `convert-run<slot>` (one uid per slot, so the "no process left" check stays
per job) with no capabilities, no environment and a 256 MiB file-size limit. The child checks its own boundary and
refuses to convert when it can reach the network, runs as root or sees the service tree. The service removes the
workspace after every attempt and the whole jobs directory at start-up.

## 3. Measurements (deployed dev app, 2026-10-16 PT)

Deployed: commit `71c8f11a`, Fly release v5, image
`registry.fly.io/rabbit-hole-convert-dev:deployment-01M53PBBFP0WFE9ZKK3896S2W9@sha256:989b359ead1a329e4ff19b77b66d9d036e99346c1c31a7deb6e4d2d910a2e75c`
(226 MB compressed), `/health` version `file-convert-1-<hash>+71c8f11ab2ca`. Machine `shared-cpu-2x`, 4 GB, `iad`,
kernel `6.12.105-fly`, `resource_backend: cgroup-v1` (memory, memsw, pids, cpu, cpuacct, freezer). Per job: 1.5 GiB, no
swap, 512 tasks, 1 CPU; 2 slots.

Driven by `packages/file-convert/proof/run-proofs.mjs` through `fly proxy` to `proof/harness.mjs`, which ran as a
separate machine in the same app and played the control plane over Fly's private network (source GET, staged PUTs,
one `complete`, attempt checks). The converter was always called through its public URL, so the Fly proxy (and its
auto-start) sat in the path. Every output was downloaded and checked here: sha256 against the manifest, PDF header and
page objects, PNG dimensions, GLB through the canvas viewer's own `inspectGlb`, MP4 `ftyp`/`moov`-before-`mdat`/`mp4a`.
One sample per fixture: these are single observations, not distributions.

| Fixture (bytes) | Converter | Wall (dispatch to commit) | Convert (child) | Peak memory (cgroup) | Outputs, validated |
|---|---|---|---|---|---|
| `sample.doc` (29,696; Word 97-2003 from Word) | office-pdf | 11.6 s (first LibreOffice run after deploy) | 10.6 s | 302 MiB | PDF 2 pages Letter; text by page (page 2 text on page 2); poster 800x1036 |
| `sample.docx` (16,011) | office-pdf | 2.2 s | 1.9 s | 166 MiB | PDF 2 pages; text; poster |
| `sample.pptx` (44,250; 3 slides, notes, slide 3 hidden) | slides | 2.5 s | 2.1 s | 166 MiB | PDF 3 pages 960x540 pt; 3 PNG 1280x720; text: slide 2 notes, slide 3 `hidden: true` |
| `deck-40.pptx` (82,481; 40 slides), two at once | slides | 5.7 s each | - | 174 MiB each | committed both |
| WAV 5 s 44.1 kHz stereo (882,044, synthesized) | audio-playback | 0.65 s | 0.47 s | 24 MiB | AAC-LC 128 kb/s 44.1 kHz stereo, 81,542 bytes, faststart |
| WAV 600 s 48 kHz mono (57,600,044) | audio-playback | 8.4 s (fetch 0.84 s) | 7.3 s (89.6x real time) | 144 MiB | AAC 9,739,229 bytes, 600 s |
| `as1-oc-214.stp` (441,968; CAx-IF AP214 assembly) | step-glb | 4.5 s | 3.9 s (OCCT read 2.0 s) | 306-373 MiB | GLB 169,436 bytes: 18 parts, 24 nodes, 5 materials, 5,040 triangles; unit millimetre |
| `cube-in.step` (18,998; inch) | step-glb | 2.9 s | 2.7 s | 290-323 MiB | GLB 1,796 bytes; `source_unit: inch` |

Each conversion's child reported `network: ENETUNREACH`, `uid 10030` (`convert-run0`), the environment
`CONVERT_SANDBOX HOME LANG NODE_ENV PATH TMPDIR` only, and `cleanup.ok: true` (no process or group left).

| Proof | Result |
|---|---|
| `/health` without auth | 200, version, `busy`, `workspace_entries: 0`; contains no token |
| `POST /jobs` with no token / a wrong token | 401 / 401; with the token and `{}`: 400 with the field errors |
| 429 | three 40-slide jobs dispatched at once on 2 slots: `202, 429, 202`; 429 body `{ error: "busy", slots: 2, active: 2 }`; both accepted jobs committed |
| Cancel mid-conversion | `cancel` -> 200; the harness got `fail { error: "cancelled", retryable: false }`; nothing staged, nothing committed; `workspace_entries: 0`, `active: 0` |
| Kill the conversion process | a root waiter on the machine SIGKILLed the child 2 s into a 10-minute WAV: attempt 1 `fail { error: "converter_crashed", retryable: true }`, nothing staged; the runner's attempt 2 committed both outputs; `workspace_entries: 0` |
| Kill the machine | `fly machine stop --signal SIGKILL` about 2 s into the conversion of the 10-minute WAV: the heartbeats stopped (last `converting` at 01:13:10Z, none in the next 45 s), no `fail`, nothing staged or committed for attempt 1. Attempt 2, dispatched through the proxy to the stopped machine, auto-started it (dispatch answered 202 in 2.68 s), and committed; `workspace_entries` after the restart: 0 |
| Conversion outlives its HTTP request | every dispatch answered 202 in 9-36 ms; the conversions (up to 8.4 s) continued and committed afterwards (`auto_stop_machines = "off"`) |
| Idle self-stop and cold start | 300 s after the last authenticated request with nothing active the service logged `idle 300s with no active attempt: stopping`, exited 0, and Fly recorded `machine exited with exit code 0, not restarting` (state `stopped`). The next `/health` through the proxy started it (`machine started in 1.36 s`) and answered in **2.7 s** (cold); warm `/health` 6 ms. A dispatch to the stopped machine answered 202 in 2.68 s |

The full recovery demo (upload, submit, close the browser, return; the D1 job runner re-dispatching after its lease
expires) needs the JOBS lane's runner; the converter half is proven above with the harness standing in for it.

**Update, release v7 (commit `da465927`, image `...deployment-01M53R6AFRY6TR2FTTPWF93HRA@sha256:3a9207a729f032f7f4baf8caf64bc7c8379f8c8c8aaed973d4114ff5459175ee`,
`/health` version `file-convert-1-c05844c15f81+da4659275eb1`, same pinned bases):** `text.json` moved to the shared units
shape (1.6). Re-proved with `proof/in-image-convert.sh` over `fly ssh` (the real sandboxed child in the deployed image;
the allowlist now holds only the JOBS dev clone, so the harness was not used): `sample.doc` gives
`{ v: 1, units: [{ loc: { page: 1 } }, { loc: { page: 2 } }], complete: true }`; `sample.pptx` gives slide units 1, 2,
`{ slide: 2, notes: true }` ("Speaker notes for slide two") and 3 ("[Hidden slide]
..."), `complete: true`; every unit
is exactly `{ loc, text }`; network `ENETUNREACH` in the child. Known: Word's Symbol-font bullets come through
pdftotext as private-use characters (U+F0B7).

### 3.1 Machine size

Peaks above: LibreOffice 166-302 MiB, OpenCascade 290-373 MiB for small models, FFmpeg 24-144 MiB. Two 1.5 GiB slots
fit a 4 GB machine with room for the service, and leave headroom for larger STEP models (OpenCascade memory grows with
model size and tessellation; not measured beyond 442 KB). CPU is 1 CPU quota per job on 2 shared vCPUs. Kept:
`shared-cpu-2x`, 4 GB, 2 slots. A 2 GB machine with 2 x 768 MiB would hold every fixture measured here but not a large
assembly.

### 3.2 Cost (estimates from Fly's published iad prices, 2026-10-16; not measured bills)

- Running: shared-cpu-2x $0.00000169/s plus 3.5 GB extra RAM at $0.00000232/GB/s = about **$0.035 per hour**
  ($25.4/month if it never stopped).
- Per conversion: 2-9 s of compute is $0.00002-0.0001; each wake-up then idles 300 s before stopping, about
  **$0.003 per burst**. 100 bursts a day is about 8 machine-hours a day, about $9/month.
- Stopped: root filesystem at $0.15/GB/month, under $0.20/month for this image.
- Transfer: sources arriving from the control plane are inbound (free); derivatives sent back are outbound at
  $0.02/GB in North America (a 10 MB playback copy is $0.0002).
- Storage of originals and derivatives is R2's (control plane), not the converter's: $0.015/GB-month plus operations.

## 4. Cloudflare Workers vs Cloudflare Containers

They are different products. An ordinary **Cloudflare Worker** is a V8 isolate: JavaScript/WebAssembly only, no
processes, no native binaries, no filesystem, 128 MB memory and a CPU-time budget per request. It cannot run
LibreOffice, FFmpeg or a 1.5 GiB OpenCascade job; it can run small deterministic parsers (SheetJS, mammoth) and is
where the control plane, the job record and the Durable Object runner live. **Cloudflare Containers** run an OCI image
(this one would do) on Cloudflare, started on demand and addressed through a Durable Object from a Worker; it is a
separately billed product with its own instance sizes and limits, and the image would need its sandbox re-proved there
(namespaces and cgroup delegation differ by host). Nothing here commits to it: the converter API (section 1) is plain
HTTPS with bearer tokens and callback URLs, so the same image can run on Fly (dev, now), Cloudflare Containers, Cloud
Run or ECS. The production plan is a second Fly app (section 7); moving to Cloudflare Containers stays an option.

## 5. Open points

- Verified in the deployed dev image with one fixture per path: DOC, DOCX, PPTX, WAV, STEP (AP214 assembly and an inch
  part). Not yet verified with the real tools: PPT, ODT, ODP, RTF; MP3, OGG Vorbis/Opus, M4A (AAC/ALAC), FLAC, AIFF and
  WebM audio (the decoders and demuxers are in the build: section 2), and large assemblies. Lane 3 and Lane 4 fixtures
  should be run through `proof/run-proofs.mjs`-style jobs before those formats are marked supported. What the local
  fixture run (`fixtures.test.mjs`, 2026-10-26) adds, and what it does not, is section 7.6.
- Those formats are also not reachable by a user: the upload families accept only `.docx`, `.pptx`, `.mp3 .wav .ogg
  .m4a .flac` and `.step .stp` (`packages/web/src/file-capabilities.js`; `.doc` is a `planned` family that is refused on
  drop). Making PPT, ODT, ODP, RTF, DOC, AIFF or WebM usable is a product decision, not part of the converter.
- No STEP thumbnail is generated here: the poster for a CAD card comes from the 3D card renderer (Lane 4).
- Text from DOC/DOCX is the PDF text layer by page (no heading/list structure); scanned documents report
  `coverage.text: none` and OCR is not run.
- No CJK fonts in the image: such documents render with substituted glyphs.
- The proof harness (`proof/harness.mjs`) is a reference for the control-plane half, not the runner.

## 6. Operating the dev app

- Secrets on `rabbit-hole-convert-dev`: `CONVERT_TOKEN` (fresh, stored outside the repo in `C:/s/convert-secrets/`),
  `CONVERT_ALLOWED_ORIGINS` (set to the proof harness during the proofs; set it to the dev control plane origin that
  serves `/api/learn/files/jobs/...` before the JOBS lane dispatches), and `HARNESS_TOKEN` / `CALLBACK_SECRET` used
  only by the proof harness machine.
- Deploy a commit: `sh packages/file-convert/context.sh <dir>`, then the printed `fly deploy ... --ha=false --remote-only`.
- Tests: `node --test "packages/file-convert/*.test.mjs" "packages/file-convert/activation/*.test.mjs"` (in `make test-unit`
  since 2026-10-26; before that this line was wrong: `run.sh` never ran them).

## 7. Production: what is supported, activation, acceptance, status

Status 2026-10-26: **implemented and unit-tested; not deployed, not enabled, not production-accepted.** The FILE_JOBS plumbing
(Durable Object binding, `file-jobs-1`, the `FileJobs` export) is live in main and enables nothing
(`docs/features/file-jobs-production.md`); the converter code, `fly.prod.toml` and the owner commands are in main (batch B1,
`d0e8b2b0`). Production still lacks the converter app, its two secrets and the two config vars. Until all of them exist a
submitted conversion is accepted and then fails with "File conversion is not configured on this server."

### 7.1 Supported formats and limits (the published list)

What a user can convert today, once activated. "Verified" says how far each row is proven; nothing here is proven on production yet.

| Input (upload extensions) | Result | Verified so far |
|---|---|---|
| Word `.docx` | PDF preview, page text (`text.json`, one unit per page), page-1 poster (800 px) | real LibreOffice + poppler in the dev image (2026-10-16); acceptance `docx` is the production proof |
| PowerPoint `.pptx` | PDF (hidden slides included), one 1280 px PNG per slide, slide text with speaker notes and hidden-slide marks | dev image (2026-10-16); acceptance `pptx` |
| Audio `.mp3 .wav .ogg .m4a .flac` (PCM and IMA/MS ADPCM WAV; MP3; Vorbis and Opus in Ogg; AAC and ALAC in M4A; FLAC) | a browser playback copy: AAC-LC 128 kb/s in MP4, index first, at most stereo, 44.1 or 48 kHz, and a `probe.json` of source and copy | WAV in the dev image; the other codecs only through stub tools until the real-tool proof (7.5) and the acceptance run |
| STEP `.step .stp` (AP203, AP214, AP242 geometry) | `model.glb` (glTF 2.0, metres, assembly tree as nodes) and `structure.json` (units, parts, tree) | real OpenCascade in the dev image and locally (AP214 assembly, inch part, an AP242-labelled part); acceptance `step`, `stp` |

Limits that apply (all read from the code: `file-capabilities.js`, `contract.mjs`, `file-jobs.js`):

| Limit | Value |
|---|---|
| Upload size | 25 MiB for each family above (the converter itself accepts up to 64 MiB) |
| Audio length | 4 hours (longer fails `too_complex`) |
| Slides | 500 per deck accepted; images for at most 300 slides (the PDF holds all; the card says "Slide images 1-300 of N") |
| Extracted text | 4 MiB per document (more is cut and marked partial) |
| Outputs | 50 MiB each, 100 MiB per job, at most 400 per job |
| 3D | `model.glb` at most 20 MiB and 5,000,000 accessor elements (the viewer's bounds); more fails `too_complex` |
| Time | 300 s per attempt (then `timeout`, not retried); up to 3 automatic attempts per submit or Retry; an attempt that stops heartbeating is presumed dead after 90 s |
| Concurrency | 2 conversions at once in the whole product (2 converter slots, one machine); others wait in the queue, up to about an hour, then fail |
| Per conversion | 1.5 GiB memory, 1 CPU, 512 tasks, no network, 256 MiB file size, private 1 GiB `/tmp` |
| Credits | none: conversions are free to the user and touch no credit figure (the acceptance checks this) |

**Not supported** (the converter or the browser alone may handle some of these; the product does not offer them through the converter):

| Format | Today |
|---|---|
| `.doc` (Word 97-2003) | the converter converts it, but the upload family `word-legacy` is `planned`: dropping a `.doc` is refused |
| `.ppt`, `.odp`, `.odt`, `.rtf` | the converter accepts them; **no upload family exists**, so a user cannot send them |
| AIFF, WebM/Matroska audio | the converter accepts them; the audio family lists neither extension |
| AC-3 (Dolby Digital) audio in M4A, WMA, raw AAC | no decoder in the image (`Dockerfile`): the job fails; the note in `file-capabilities.js` that promises AC-3 conversion is wrong until a decoder is added |
| Scanned documents (OCR), password-protected or macro documents, animations/transitions/video inside slides, CJK fonts | not converted / not rendered faithfully (no OCR, no CJK fonts in the image) |
| STEP PMI, parametric history, B-rep | dropped: the mesh is a tessellated preview, not for measurement |
| Files over 25 MiB, video files | out of scope of this converter |

Opening any "no upload family" format is a product decision (new families, caps, cards, tests and real-tool fixtures), not part of
the converter's activation; it is out of scope here by the owner's instruction to publish the exact supported list.

### 7.2 What exists

| Piece | File | Notes |
|---|---|---|
| Fly app config | `packages/file-convert/fly.prod.toml` | app `rabbit-hole-convert-prod`, the dev runtime/VM unchanged (a test equates them), `CONVERT_ALLOWED_ORIGINS = "https://digrabbithole.com"` in `[env]` (an origin is not a secret) |
| Owner command | `packages/file-convert/activation/prod-convert.mjs` | `--dry-run` (offline), `--preflight` (reads names and listings), `run --sha <commit>`, `rotate`, `rollback L1\|L2\|L3`. Resumable (state `C:/s/spec/fj-converter/prod-convert-state.txt`), stops at the first error, every mutation behind a typed phrase read from the terminal only |
| Acceptance | `packages/file-convert/activation/acceptance.mjs` | 12 conversions plus usage, duplicate, reload, failure, cancel, another account and kill-and-retry (7.4); each with a stated criterion; `--dry-run` prints them; the last line is `COMPLETE` only when every criterion passed |
| Harnesses | `activation/*.test.mjs`, `fixtures.test.mjs`, `real-tools.test.mjs` | simulated Fly, Cloudflare and Rabbit Hole; the real entries also run as children with a stripped environment, stub-only PATH and Node's permission model denying every child process |
| Real-tool proof | `packages/file-convert/proof/real-tools.mjs` | a separate package (7.5); not run |

### 7.3 Owner steps, in order

**PROPOSED recurring cost, not approved.** The production converter is new infrastructure with a recurring Fly bill. Estimates from
section 3.2 (Fly's published iad prices, not a measured bill): about US$0.035 per running hour; about **US$1.5 to US$9.8 a month**
at 10 to 100 conversion bursts a day (one `shared-cpu-2x` 4 GB machine that stops itself after 300 s idle); under US$0.20 a month
stopped. The first deploy also costs a remote image build (a few cents of builder time, not measured). Reprioritising the converter
does not approve this spend: the owner approves it explicitly, in the phrase the command asks for at step 3.

Environment for every step: Git Bash or PowerShell in a checkout that contains `rabbit-hole/main` at or after `d0e8b2b0`
(`git fetch rabbit-hole main`); `flyctl` on PATH; wrangler 4.150.0 in the checkout's `node_modules`; `small-deploy/.env` supplies
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and `FLY_ORG_TOKEN` by name. Do not export `FLY_*`, `WRANGLER_*`, `CLOUDFLARE_*`,
`CONVERT_*` or proxy variables: the command refuses to start with them. `<sha>` is a commit of `rabbit-hole/main` that holds
`packages/file-convert/fly.prod.toml` (`d0e8b2b029cf7de168a009404ea8b5e2da080ed1` or later).

| Step | Command | Expected output | Cost |
|---|---|---|---|
| 1. Plan | `node packages/file-convert/activation/prod-convert.mjs --dry-run run --sha <sha>` | the plan and `Nothing was run, called or changed.` | none |
| 2. Preflight | `node packages/file-convert/activation/prod-convert.mjs --preflight --sha <sha>` | `Fly app rabbit-hole-convert-prod does not exist`, `commit ... is in rabbit-hole/main`, `preflight finished` | none (reads names only) |
| 3. Create, secrets, deploy, health | `node packages/file-convert/activation/prod-convert.mjs run --sha <sha>` asks for `CREATE rabbit-hole-convert-prod AND ACCEPT THE FLY COST`, then `SET CONVERT SECRETS`, then `DEPLOY CONVERTER` | `rabbit-hole-convert-prod created`, `verified: CONVERT_TOKEN and FILE_JOB_SECRET on rabbit-hole-app ...`, `deployed <sha12>`, `health: ... converters audio-playback, office-pdf, slides, step-glb`, `POST /jobs with no token: 401`, `... a wrong token: 401`, `converter healthy at https://rabbit-hole-convert-prod.fly.dev`. State file: APP, SECRETS, DEPLOY, HEALTH. After any failure run the same command again: finished steps are skipped | **starts the recurring Fly bill (above)** |
| 4. Activate | merge `feat/file-converter-activate-2` (adds `CONVERT_URL`, `FILE_JOB_ORIGIN` to `wrangler.rabbit-hole-prod.jsonc`; config change = full gate; the owner's `!` push). HELD until step 3 succeeded | the production release run succeeds; conversion is now on | none |
| 5. Acceptance | `node packages/file-convert/activation/acceptance.mjs --full --out C:/s/spec/fj-converter/acceptance-receipt.json` asks for your `small_session` cookie for digrabbithole.com, a second account's cookie, and `KILL CONVERTER MACHINE` | every line `<criterion>: PASS`, then `COMPLETE: 19 criteria passed`. It leaves one canvas "File converter acceptance ..." in your account to delete. The kill drill takes about two minutes (the lease must expire) | none (a few seconds of converter time per file) |

**Rollback**, at any point:

| Level | Command | Effect |
|---|---|---|
| L1 | `node packages/file-convert/activation/prod-convert.mjs rollback L1` (`DISABLE CONVERSION`) | deletes only `CONVERT_TOKEN` from `rabbit-hole-app`: conversion is off at once, no deploy; new jobs fail with the not-configured message. `rotate` turns it back on |
| L2 | `rollback L2` (`STOP CONVERTER`) | stops every machine of the app (a dispatch would start one: do L1 first) |
| L3 | `rollback L3` (`DESTROY CONVERTER APP`) | destroys the Fly app (irreversible; stops the recurring cost); also release the removal of the two vars |

### 7.4 Acceptance: what each criterion is

`acceptance.mjs --dry-run` prints this table from the code. Common to every conversion: the job reaches `ready` or `ready_with_limitations`;
its derivatives are exactly the listed outputs; each downloads with the sha256 the server recorded and the right magic bytes. The
requests use the options the product's own code sends (a unit test pins them to `file-job.js`, `media-playback.js` and `model-cad.js`).

| Id | File | Extra pass criterion |
|---|---|---|
| docx | `sample.docx` | text.json has page 1 (heading) and page 2 ("Second page text"); poster is 800 px wide |
| pptx | `sample.pptx` | 3 slide PNGs of 1280x720; deck title, slide 2's speaker notes and slide 3's `[Hidden slide]` in text.json |
| wav, adpcm, mp3, ogg, opus, m4a, alac, flac | a short tone in each codec | `playback.m4a` is AAC with `moov` before `mdat`; `probe.json` names the expected source codec; copy length within 10% of the source |
| step, stp | `as1-oc-214.stp` (18 parts, mm), `cube-in.step` (1 part, inch) | valid GLB 2.0 whose length matches; `structure.json` has the parts and the declared unit |
| usage | all of the above | `usedCredits`, `reservedCredits`, `unknownAttempts` equal before and after (not checked, and not counted, if the summary is unavailable) |
| duplicate | the DOCX again | the same file and key give the same source and job (200, not created); a second card adds no derivative |
| reload | the DOCX card | the board is SAVED with a card for the file (the app's own PUT), then a fresh read of it finds the card, the finished job, and the same derivatives listed and downloaded through the board (`&app=<canvas>&board=main`) |
| failure | a truncated PPTX | ends `failed` with a plain reason (no dollar text), no derivative, no credit change; or is refused at upload with a plain error |
| cancel | `deck-40.pptx` | ends `cancelled` (a job that finished first is reported and not counted) |
| other | a second account | 404 for the job and every derivative |
| retry | `deck-40.pptx` | after `SIGKILL` of the converter machine while Converting, the job settles ready on attempt 2 or later with the same outputs |

Two ways to read your own file, and why the acceptance uses both (found by the first production run, 2026-10-26, which stopped at a 404):
the **owner path** (no query: `authorizeFileSource` lets the source's owner read it, no board involved) is what every conversion criterion
uses; the **board path** (`&app=<canvas>&board=main`) needs the board row and a `file_source_refs` row, which only a board save with a card
naming the source writes, and answers the same 404 "Not available" otherwise. Only the `reload` criterion uses the board path, after the save.

Rerunning after a stopped run: the script is safe to run again. It creates a NEW canvas each run (titled with the time) and a new job per
file (the idempotency key carries the time); an identical file by the same owner reuses the stored source. Clean up with
`node packages/file-convert/activation/acceptance.mjs --trash canvas-xxxxxxxx,canvas-yyyyyyyy` (the canvas names the runs printed), which
moves them to Trash through the app's own route; empty Trash in the app to remove them for good.

Not covered by any run: `.doc`, PPT, ODT/ODP, RTF, AIFF, WebM (no upload family), AC-3, files near 25 MiB, many users at once.

### 7.5 Proving the real tools before activation (a separate package; not run)

Why: LibreOffice and FFmpeg have run for real only in the dev image, for DOC, DOCX, PPTX and WAV. MP3, Ogg, M4A, FLAC, ALAC and
ADPCM, which are in the supported list, have only run through stub tools. This host has no LibreOffice, FFmpeg, Docker or WSL.

| Option | Steps | Cost | Fidelity |
|---|---|---|---|
| **A (recommended): the dev Fly app** | 1. `sh packages/file-convert/context.sh <dir>` on the commit under test, then the printed `fly deploy ... --ha=false --remote-only` (rebuilds the dev image so it holds the new fixtures). 2. `node C:/s/spec/budget/budget.mjs reserve <runId> file-convert-real-tools 2` (the integrator's say-so). 3. `node packages/file-convert/proof/real-tools.mjs --reserved <runId>` starts the dev machine, runs 15 rows over `fly ssh` through the real sandboxed child, stops the machine. 4. `node C:/s/spec/budget/budget.mjs settle <runId> <actual>` from the Fly bill | estimate under US$0.50 (about 20 minutes of a US$0.035/hour machine plus one remote build); **reserve US$2** (shared cap US$100; about US$81.75 remained on 2026-10-26) | the exact production image bits and sandbox |
| B: a Linux GitHub runner with Docker | build the Dockerfile and run the same rows in the container; needs a workflow file, so an owner `!` push | about 30 to 35 minutes of Linux runner (about US$0.3 at list price) | same Dockerfile, different host kernel (cgroup behaviour can differ) |
| C: LibreOffice and FFmpeg apt packages on a runner | install and run the converter child on them | about 5 minutes | different versions from the image: weak evidence, not recommended |

Pass condition: all 15 rows `PASS` (status ready, sandbox network `ENETUNREACH` and not root, sniffed kind, exact output names, AAC
playback copies, the 40-slide deck producing 40 images, the wrong-converter row failing cleanly). It proves the tools; it does not replace
the production acceptance.

### 7.6 Verification status (honest)

| Claim | State | Evidence |
|---|---|---|
| FILE_JOBS binding, tag and export in production config | in main (B1 live) | wrangler.rabbit-hole-prod.jsonc, app-worker.js, prod-config test |
| Converter service, API, sandbox, DOC/DOCX/PPTX/WAV/STEP in the real image | verified on the DEV app 2026-10-16/17 (section 3) | not repeated here |
| Every path through the real child with stub tools (sniff, command lines, output names, error mapping) | unit-tested, in `make test-unit` | `fixtures.test.mjs`: proves our wiring, NOT the real tools' output |
| STEP with the real OpenCascade: `cube-in.step`, `as1-oc-214.stp`, an AP214 part relabelled AP242 | passes locally; equals the dev measurements | needs `CONVERT_OCCT_DIR`; skipped in CI. The AP242 fixture is not CAD-tool-authored: PMI and tessellated AP242 are unproven |
| MP3, Ogg Vorbis/Opus, M4A AAC/ALAC, FLAC, ADPCM WAV with the real FFmpeg | NOT verified (fixtures added: `proof/fixtures/tone*`) | 7.5 |
| Sniff fix: an OLE directory past 4 MiB | fixed with a failing-on-old-code test | not shown with a real large .doc |
| Command and acceptance harnesses; real-tool proof package | unit-tested against simulations | the commands have never touched a real service |
| Production converter, secrets, vars, callback reachability, the acceptance, kill-and-retry | NOT done | needs the owner steps in 7.3 |

Do not call the converter "available in production" before step 5 of 7.3 prints `COMPLETE` (CLAUDE.md: deployed but disabled is
incomplete, and enabled but unverified is incomplete).
