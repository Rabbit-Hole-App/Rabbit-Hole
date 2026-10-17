# First generated CAD artifact inspection

Original implementation SHA: `bec995e1dcc0968ccee1a86ff58903200ba8d22a`. The first real-model pass on 2026-10-17 recorded **0 passed / 1 failed / 0 skipped / 3 interrupted** scenarios after 108.661 seconds: publication returned HTTP 500 before the simple-plate scenario completed. The original receipt remains unchanged. Later retry/fix results must be recorded separately.

Inspected the existing staged artifacts without additional model or executor requests. The five passing artifact checks below are distinct from the failed integrated scenario and must not be added to its scenario pass count.

- Trusted runtime validation receipt: baselinePassed=true; 5 passed semantic checks, zero failed. STEP bounds 40 x 20 x 5 mm, one solid, volume 3999.999999999999 mm3 (expected4000). This lane read the trusted result; it did not independently rerun a CAD kernel.
- Independent Three GLTFLoader parse of the actual 1840-byte GLB succeeded: 1 mesh, 24 vertices. World bounds span approximately 0.040 x 0.005 x 0.020 metres, consistent with the requested dimensions under the GLB Y-up axis mapping.
- STEP text declares AP214, millimetres and a MANIFOLD_SOLID_BREP. Text inspection alone is not topology validation.
- Thumbnail visually shows the expected plain rectangular plate without visible added features. Dimensions are established by validation/GLB bounds, not the image.
- Saved interactive-card restoration, artifact delivery authorization and publication remain pending; the runtime browser script was not run because completion prerequisites were unmet.

SHA256 artifact identities:

| Artifact | SHA256 |
| --- | --- |
| staged-model.step | B187B9033130BB75E55877F9C5D4BBEC8F3DE31B9CF008B5C3CD52D13322D48F |
| staged-model.glb | 2F28B5C4D6BECC8887C8BA79C10A279D6990CD9C0501C24E4FC2254F6CB395FD |
| staged-thumbnail.png | B2BB14D51A839F7DB971292F726F54F55846932205A5D91B54F7D715AE984B2C |
| staged-validation.json | 147CDFB04BA9D13CE3EA26188E5136B2074A440F8AA0AA52CEE8228559648F9B |

Original staged files remain in the coordinator's cad-dev-evidence directory. Link exact generation/job/runtime identities from the coordinator receipt; do not attribute these artifacts to the fixture runs or an unchanged released SHA.
