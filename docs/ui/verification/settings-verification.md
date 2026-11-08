# Settings verification

## Executed

- JavaScript syntax, HTML unique IDs, SVG targets, ARIA references and self-contained export checks.
- Five API/state tests in `settings-state.test.mjs`: actual server-route handle claim/conflict against an isolated in-memory database; failed/invalid server responses; retry recovery for profile/save/avatar/preferences; distinct empty/exhausted/unavailable usage fixtures; request method, credentials and payload contract.
- No live account writes, external uploads, consent changes, model calls or purchases.

## Browser attempt — blocked, not passed

The local Chromium process could not launch because the environment disallowed its socket creation. The available controlled browser then rejected the local file URL under its URL policy. No alternative route was used to bypass that rejection.

Narrow-screen rendering, real keyboard focus behavior, native modal stacking and file-picker upload interactions remain unverified in a browser. The references implement responsive CSS and native dialogs; structural checks are not a substitute for the checks below.

## Remaining browser checklist

- [ ] At 1440, 768, 390 and 320 px widths, inspect every panel, large/larger text, horizontal navigation and content scroll; no overlap, clipped buttons or page-wide overflow.
- [ ] Open Settings with keyboard: focus reaches heading; Tab/Shift+Tab remain within it.
- [ ] Open Buy credits: Escape closes Buy only and restores Buy credits focus. A second Escape closes Settings and restores its trigger.
- [ ] Change a profile field; Save failure keeps draft; Retry succeeds without losing focus.
- [ ] Taken handle produces server conflict text; editing and saving a free handle succeeds. Network failure must not display availability.
- [ ] Valid avatar upload shows progress; failure keeps old picture; Retry works. Bad MIME/decode fails clearly. Check removal failure and retry.
- [ ] Preference save failure retains choice and exposes keyboard-operable Retry.
- [ ] Profile/usage unavailability shows Retry; no fake blank profile or zero balance.
- [ ] No-activity and exhausted-credit specimens remain distinct visually and accessibly.
- [ ] Confirm green toggle, blue focus/selection and shared pale scrollbar palette.

Runtime app integration is pending; these changes are UI references and a transport contract, not a production deployment.
