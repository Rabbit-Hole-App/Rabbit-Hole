# Verification

## Scope

This change organizes documentation/reference assets and applies the owner's explicit balanced palette in the new previews. It does not change app runtime files. Production/deployed acceptance is outside this task.

## Checks

Run from the repository root:

```sh
python docs/ui/scripts/build.py
python docs/ui/scripts/export_clean.py
python docs/ui/scripts/check.py
```

The checker verifies the registry, component dependencies, unique HTML IDs, local preview asset links and SVG symbols, known shared template dependencies, JavaScript syntax with Node, palette metadata, source aliases and mapping path existence when a repository-tree receipt is present. It also checks that the documented critical source fixtures are retained.

Source checks passed on 2026-11-08: 60 catalog entries, 37 shared JavaScript files and 10 self-contained previews. The exports pass embedded-asset, duplicate-ID, accessibility ID-reference and combined JavaScript syntax checks. See [machine-readable receipt](verification/structural-check.json).

Four warnings concern `accept`, `cancel`, `cancelnext` and `nextcard` in the historical lifecycle flow. These IDs are created by its render strings; the static scanner cannot see the generated DOM. They are retained as warnings, not hidden or counted as browser verification.

## Still unverified

Browser rendering, computed styles, visual balance, long-label overflow, native focus behavior, actual pointer/keyboard resize, playback timing and application integration. The repository's browser-verification rule reserves browser automation for its approved workflow; no browser run is claimed. Source-level and parser checks are not substitutes for visual acceptance.
