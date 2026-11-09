> Current review corrections and exact resize limits: [REVIEW-UPDATES.md](REVIEW-UPDATES.md). These supersede conflicting archived decisions below.

# Verification

## Scope

This change organizes documentation/reference assets and applies the owner's explicit balanced palette in the new previews. It does not change app runtime files. Production/deployed acceptance is outside this task.

## Checks

Run from the repository root:

```sh
python docs/ui/scripts/build.py
python docs/ui/scripts/export_clean.py
python docs/ui/scripts/export_library.py
python docs/ui/scripts/check.py
```

The checker verifies the registry, component dependencies, unique HTML IDs, local preview asset links and SVG symbols, known shared template dependencies, JavaScript syntax with Node, palette metadata, source aliases and mapping path existence when a repository-tree receipt is present. It also checks that the documented critical source fixtures are retained.

Source checks passed on 2026-11-08: 61 catalog entries, 38 shared JavaScript files and 10 self-contained previews. The exports pass embedded-asset, duplicate-ID, accessibility ID-reference and combined JavaScript syntax checks. See [machine-readable receipt](verification/structural-check.json).

Four warnings concern `accept`, `cancel`, `cancelnext` and `nextcard` in the historical lifecycle flow. These IDs are created by its render strings; the static scanner cannot see the generated DOM. They are retained as warnings, not hidden or counted as browser verification.

## Still unverified

Browser rendering, computed styles, visual balance, long-label overflow, native focus behavior, actual pointer/keyboard resize, playback timing and application integration. The repository's browser-verification rule reserves browser automation for its approved workflow; no browser run is claimed. Source-level and parser checks are not substitutes for visual acceptance.

## Start dialog addition — 2026-11-08

The rebuild contains 66 component entries, 41 JavaScript files and 15 standalone previews. Structural checks pass with zero errors. The shared source widget script checks for its optional demo roots; its absent-root warnings are expected in the isolated tabs, upload, row and complete-dialog specimens. The four historical lifecycle warnings above remain. These are parser checks only, not visual or browser interaction evidence.

The one-repository constraint remains in local draft behavior, but its persistent helper sentence is removed as requested. Start and the blank-canvas action keep their established placement. Button labels cannot break and buttons cannot shrink; inputs receive the remaining width. Browser confirmation of computed layout remains pending.

## Canvas Chat composer and commands

The approved composer, detail and slash picker exports match the reviewed HTML byte for byte. Offline fixtures cover draft growth, the selected detail controls, slash search and insertion, and the registered example prompts. The structural check covers 59 standalone previews. Browser layout remains pending.
