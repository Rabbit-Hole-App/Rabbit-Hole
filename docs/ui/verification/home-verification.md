# Home and folder verification

Executed: canonical export structural checks, JavaScript syntax checks, and a LinkeDOM fixture using the actual exported markup and behavior scripts.

Passed scenarios include Continue/Recent deduplication, optional last topic, persisted size, the live preset readout, loading/error/empty surfaces, Retry recovery and focus return, Recent Open, card menu keyboard behavior, Move to folder, and folder Colour and Rename. The empty Home check also verifies that its message shares the header with Start, Card size is hidden, and the empty fixture has no Recent sidebar section.

DOM test invocation (test dependency only; no app package changes):

```sh
RH_UI_TEST_DOM=/tmp/rh-home-test/node_modules/linkedom node docs/ui/verification/home-interactions.cjs
```

`RH_UI_TEST_DOM` can instead point to another installed LinkeDOM module. Tested with 0.18.15. Focus/showModal/close are DOM-fixture shims; the test does not exercise a browser's native focus algorithm, native range-key behavior or rendering.

Browser verification is blocked in this environment: local browser launch failed, and the available browser surface rejected local file navigation. No workaround was used. **Pending:** native Tab/Shift+Tab sequence, visible focus rings, touch controls, hover visibility, narrow-screen overflow, menu positioning, real storage persistence in the delivery viewer and all backend interactions. Storage-disabled environments fall back to per-visit sizing.
