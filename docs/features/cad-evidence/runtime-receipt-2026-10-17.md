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
