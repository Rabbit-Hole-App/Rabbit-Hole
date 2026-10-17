# CAD executor Linux receipt — 2026-10-17

See [executor status and limits](../cad-executor.md#verification-accounting) and [machine-readable probe](linux-probe-2026-10-17.json). This receipt concerns deterministic runtime execution, not real-model or integrated card acceptance.

- Image: `sha256:957f429296b1aeca5c3ea47e1f6dc37d0ee8ba72775ca3be9774b36350ed6750`.
- Source identity: `cad-tree-1814c9a180a81cf9e511644601bb5a8bf3e73ead5a8b00837a384ffeb287cf86` (uncommitted snapshot; final implementation SHA must be recorded separately).
- Six runtime phases passed, zero failed, zero skipped. Five geometry assertions passed. Each phase verified cleanup. Source containment assertions ran inside the actual Linux namespaces.
- First geometry build: 26.359 seconds. Six-phase total: 85.474 seconds. One remote image build: 223.554 seconds.
- Build and validator use pinned cadgen0.7.21; Python3.13.5 and Chromium153.0.8010.12 observed in the built image.
- Registry compressed content995,955,736 bytes plus config10,695 bytes; wire retransmissions and billed amounts unavailable. Application budget leaves50MiB; SSH evidence download145,329 bytes. No second build.
- Ledger `reservedBytes:786432000` with reservation `registry-build-conservative-reserve` survived a machine restart. Rootfs persistence is `always`. Admission was OFF when recorded.
- Original artifacts remain outside git in the runtime worktree `cad-executor-evidence/linux-probe/`. Thumbnail was visually inspected. STL/3MF/GLB dimensions were read back independently.
- Unverified: hostile fork/timeout/cancellation recovery, integrated saved-card path, real-model generation, actual provider invoice. No executor-lane model calls.

## Shutdown commands

Only the new dedicated CAD dev executor is targeted. First preserve any additional evidence/artifacts, then disable autostart and stop before the absolute deadline15:15 Pacific on2026-10-17 or any earlier spending/egress limit:

```powershell
fly machine update 8744117f0ed658 --app rabbit-hole-cad-dev --autostart=false --yes
fly machine stop 8744117f0ed658 --app rabbit-hole-cad-dev
fly machine status 8744117f0ed658 --app rabbit-hole-cad-dev
```

Final removal of this dedicated dev app after verifying evidence preservation:

```powershell
fly apps destroy rabbit-hole-cad-dev --yes
```

Do not target the existing converter, lesson/motion renderers, web services or production. Idle shutdown alone does not prevent HTTP proxy autostart; disable autostart explicitly. Removing the executor means new CAD jobs are unavailable until a separately authorized replacement is configured; saved artifacts remain in control-plane storage.

## Final cleanup — 2026-10-17

After integrated verification completed, two keyless control probes passed (0 failed / 0 skipped): stage timeout with a sleeping descendant in2.207s and explicit SIGTERM cancellation in0.319s. Both reported cleanup.ok, remaining0 and render_user_processes0. See [control probe evidence](linux-control-probe-2026-10-17.json). These verify the runtime process tree, not the browser cancellation flow or hostile resource-exhaustion behavior.

Final durable ledger:832,569,344 bytes reserved (750MiB conservative registry reservation plus four11MiB service attempts), with6MiB remaining. No fifth attempt or additional image build occurred. Probe report download2,067 bytes and ledger438 bytes supplement the earlier145,329-byte artifact download. These are known content bytes, not a provider wire-usage meter. Full50MiB allowance plus registry content still leaves approximately25MiB for transport and diagnostic overhead; actual billed traffic is unavailable.

Machine created2026-10-17T19:34:08Z. Autostart disabled and machine stopped successfully by20:23:48Z (13:23:48 Pacific); app `rabbit-hole-cad-dev` then destroyed successfully by20:24:25Z. Lifetime was less than51minutes, below four aggregate machine-hours and the15:15 Pacific cutoff. No existing converter, renderer or production app was changed. Saved control-plane artifacts remain accessible; new executor jobs are unavailable until separately authorized infrastructure is configured.

Conservative infrastructure estimate: one223.554-second Depot build approximately$0.19; less than0.85 machine-hours at approximately$0.0353/hour is under$0.031; at most1GiB NA egress approximately$0.02; transient rootfs storage is negligible at this duration. Combined estimate under$0.25, excluding unknown taxes or provider rounding. This is not verified billing: no invoice or account-level actual-cost evidence was available. Registry/build content transfer is separately bounded above. The$5 budget was not presented as a provider-enforced billing cap.

Root reports all four approved model scenarios passed on`2ff803e8`, eight provider requests and$0.117674 settled; that is separate model evidence owned by the integration lane. The original first-attempt publication failure remains historically unexplained; successful recovery is not retrospective proof of its cause.
