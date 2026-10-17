# CAD approved model verification

Final recovery ran at `2ff803e878b58de9d5db1071da769f69cbc76ddf`: **4 passed / 0 failed / 0 skipped / 0 blocked scenarios / 0 interrupted**,114.484seconds. [Scenario receipt](final-model-recovery.json) preserves per-scenario evidence and blocked assertions; scenario success does not mean every specification assertion passed. [Settled usage ledger](usage-ledger.json) independently accounts for **8 provider requests / $0.117674**, including earlier attempts and the superseded featured revision, with zero unknown operations. No additional model calls were used for this independent inspection.

The simple plate was generated earlier and reused; the featured part's stored artifacts were reviewed explicitly without rebuilding, then the approved edit and clarification ran. Existing artifact evidence retains its original attribution in [first-generated-plate.md](first-generated-plate.md) and [reconstructed-featured-failure.json](reconstructed-featured-failure.json).

Independent artifact inspection confirms the featured and edited GLBs both load with60x5x40mm world bounds under Y-up mapping. Mesh vertex heights before editing are0mm(396vertices),3mm(12),5mm(408); afterward0mm(396),2mm(12),5mm(408). Trusted reported volume decreases from11348.67258771281 to11148.672587712812mm3, consistent with deepening a20x10mm pocket by1mm. Both thumbnails show four openings and the central rectangular pocket. These are mesh/visual corroboration, not independent STEP-kernel certification of hole centers, hole pattern preservation or pocket depth. Those required assertions remain explicitly limited.

The clarification asks for interface dimensions and units, hole diameters/count/center spacing and datum, bracket outline/thickness, slot/boss/counterbore details and mating/fastener dimensions. This addresses the missing interface rather than inventing it; the scenario created no guessed geometry and no follow-on answer was submitted.

Historical failures remain separate:

- `bec995e1`:0passed/1failed/0skipped/3interrupted; publicationHTTP500, despite five valid plate artifact checks.
- `0d7234d5`:0passed/1failed/0skipped/3interrupted; harness incorrectly requested board-scoped artifacts before the UI had saved source references. Owner-direct reads were200.
- `9e24ea7b`: ready-resume receipt was truncated to zero bytes byENOSPC. Reconstructed1passed/1failed/2interrupted scenario accounting is labelled reconstructed, not an original assertion receipt. The featured build artifacts passed validation, but its review response was invalid. Raw provider output was not retained, so its exact malformed-response cause remains unexplained.
- Initial actual-model browser:2passed/1failed/2interrupted due to checking scoped permissions before autosave. Corrected wait for persisted accepted references then passed5/5; see [first-real-browser.md](first-real-browser.md).

Final stored-model browser verification on `049f284549596f10f7aa904710340edc030ea827` passed **5/5**, covering both real completed cards, actual GLBs, persistence, permissions and reload after model credentials/executor removal; see [final-stored-browser.md](final-stored-browser.md). No fixture or artifact result substitutes for that check. Deferred-feature and production boundaries remain unchanged.
