# Settings implementation handoff

Start with [RABBIT-HOLE-NEW-UI.md](RABBIT-HOLE-NEW-UI.md). This reference uses the current shared palette and controls. Dark-theme tokens are explicitly deferred until the end. Do not invent a dark palette.

The panel inventory was read from `main` at `39d19f28cf33e3d5369f2f5e830213525c358562`: `RabbitHoleSettings.jsx`, `settings-model.js`, `UsageGauge.jsx`, `BuyCreditsDialog.jsx`, `session-display.js`, `account-usage.js`, `ui-prefs.js`, and the server `profile.js` / `handle.js`. Read the latest integrated versions before implementing.

## Panels and clean references

| Surface | Reference | Canonical fragment |
| --- | --- | --- |
| Settings / Profile | [21-settings.html](clean/21-settings.html) | `templates/settings.html`, `templates/settings-profile.html` |
| Appearance & input | [22-settings-appearance.html](clean/22-settings-appearance.html) | `templates/settings-appearance.html` |
| Learning & voice | [23-settings-learning.html](clean/23-settings-learning.html) | `templates/settings-learning.html` |
| AI usage | [24-settings-usage.html](clean/24-settings-usage.html) | `templates/settings-usage.html` |
| Privacy & security | [25-settings-privacy.html](clean/25-settings-privacy.html) | `templates/settings-privacy.html` |
| Buy credits | [26-settings-purchase.html](clean/26-settings-purchase.html) | `templates/settings-purchase.html` |

This pass adds the five requested state/verification areas. Earlier suggestions such as one combined profile Save, renaming Learning & voice, changing the Buy credits flow or adding account deletion were not approved by this request and are not silently introduced.

## State review links

These are separate specimens, with no testing controls or preview disclaimers added to the product UI. All consume the same templates and scripts. Failure fixtures fail the first attempt and allow Retry; `taken_name` always conflicts.

| State | Reference | How to inspect |
| --- | --- | --- |
| Loading | [27-settings-loading.html](clean/27-settings-loading.html) | Profile skeleton before data arrives |
| Profile unavailable | [28-settings-profile-unavailable.html](clean/28-settings-profile-unavailable.html) | Retry loads the profile; no fabricated empty profile |
| Save failure | [29-settings-save-failure.html](clean/29-settings-save-failure.html) | Edit a profile field; Save fails; draft remains; Retry succeeds |
| Handle taken | [30-settings-handle-taken.html](clean/30-settings-handle-taken.html) | Save the populated conflicting draft; edit it and save again |
| Avatar upload failure | [31-settings-avatar-failure.html](clean/31-settings-avatar-failure.html) | Choose a PNG/JPG/WebP; progress appears; failure retains the old avatar and offers Retry upload |
| No AI activity | [32-settings-usage-empty.html](clean/32-settings-usage-empty.html) | Zero usage, full remaining allowance and concise empty breakdown |
| Exhausted credits | [33-settings-usage-exhausted.html](clean/33-settings-usage-exhausted.html) | Zero remaining, explicit exhausted label and full used meter |
| Usage unavailable | [34-settings-usage-unavailable.html](clean/34-settings-usage-unavailable.html) | Unavailable state with Retry; no false zero balance |
| Preference save failure | [35-settings-preference-failure.html](clean/35-settings-preference-failure.html) | Change a choice/toggle; failed-save status and Retry preserve selection |

The complete HTML also accepts `?case=<state>&pane=<pane>` for these states. Additional existing privacy specimens use `email=confirm`, `analytics=blocked` and `analytics=outdated`. These query parameters are review mechanisms, not runtime app routes.

## Shared-component map

| Element | Existing library source | Settings binding |
| --- | --- | --- |
| Navigation | `components/navigation/navigation`; `.menu-item` | Five Settings sections, blue selected state |
| Profile fields | `components/controls/text-fields`; `.control`, `.field-error` | Name, handle, description; shared readable field typography |
| Save / Retry / Upload / Buy / Cancel | `components/controls/buttons` | `.button.secondary` / `.button.primary`; 35 px height, 8 px corners, no wrapping |
| Preference choices | Shared `.button` selected/pressed/disabled states | Compact labelled groups with `aria-pressed` |
| Toggles | `components/controls/range-switch-checkbox`; `.switch` | Green checked states from `foundations/palette.css` |
| Modal shell / nested Buy dialog | `components/feedback/menu-popover`; `.dialog` and backdrop | Native `<dialog>`; shared radii, borders and surface |
| Avatar | `.avatar` in `styles/review-corrections.css` | Larger profile slot; upload/remove states |
| Profile loading | Shared `.skeleton` / `.skeleton-line` in `styles/standards.css` | Three quiet placeholder lines, accessible loading status |
| Upload progress | Shared `progress` styles | Indeterminate progress; no fabricated percentage |
| Privacy disclosure | Existing disclosure pattern, native details/summary | Full current app analytics disclosure retained |
| Pale scrollbars | `styles/review-corrections.css` | Settings content, narrow navigation strip and textarea |
| Icons | `icons/standards.svg`, `icons/settings.svg` | Exact Lucide app glyphs; new sprite covers CircleUser, GraduationCap and Shield |
| Usage meter and breakdown | Existing app `UsageGauge.jsx` structure; shared panel/muted tokens | New reusable composition, no separate color system |

New compositions are the Settings shell, editable account rows, usage meter/breakdown and purchase dialog. These were not previously complete templates. The registry lists them under `navigation/settings*`; non-default state entries remain searchable by metadata but are hidden from the general visual catalog to avoid duplicate whole-screen specimens. They are linked above.

## Handle checks: authoritative server contract

`main` does not expose a read-only handle availability endpoint. Do not invent one, call PUT while typing, or display “Available” based on local syntax validation.

1. Locally validate syntax with the same `handle.js` rules (3–30 characters, letters/numbers/underscore, reserved names, lowercase canonical form).
2. On explicit Save, disable duplicate submission and show `Checking…`.
3. Call `PUT /api/profile` with `{handle}` through the existing authenticated profile-save path.
4. Success is the server accepting and saving the handle. Only then update the saved identity.
5. A `409` response with `taken:true` keeps the draft, shows the server's taken-handle message and marks the field invalid. The person can edit and retry.
6. Network/5xx/invalid responses are failed saves, never proof of availability. Keep the draft and offer Retry.

The server's unique-index constraint handles simultaneous claims. The adapter test runs the actual `profileFetch` route against an isolated in-memory database and confirms a duplicate claim does not overwrite the second person's profile.

## API and demonstration boundaries

- `scripts/settings-api.js` provides `createSettingsApi(request)` using same-origin credentials, `GET /api/profile`, `PUT /api/profile` and `GET /api/learn/usage`.
- Clean previews default to `createSettingsDemoApi`, which supplies deterministic asynchronous states. They never change an account, claim a real handle, upload to production, charge money or call a model.
- A host can inject `window.RH_SETTINGS_API` before `settings.js`. `RH_SETTINGS_USE_SERVER=true` explicitly selects the same-origin adapter; it must only be enabled in an authenticated app integration. There is no visible switch enabling it in the specimen.
- Production React integration should reuse `saveProfile`, session-display subscriptions, account usage store, analytics consent and device-preference helpers. The standalone DOM controller is a reference, not a replacement app architecture.
- The host must supply `savePreference` for device and analytics settings, or keep using the existing React handlers. A missing binding reports failure; it must not falsely announce success. Email saves use the existing `emailPreferences` schema and disclosure `v2`; resolve the current exported version when integrating.
- The live UI must retain account-specific session/email values and actual billing data. Values in clean previews are fixtures. Theme currently demonstrates selection states only; dark styling is deferred.
- Buy credits retains main's existing “Credit purchases are coming soon.” behavior. No payment backend or conversion rate is invented.

## Loading, error and retry contract

- Keep panel titles and navigation accessible during profile loading. The profile skeleton contains no explanatory marketing copy.
- Loading failure does not expose a fake blank profile or enable saves against unknown account data. Retry loads it again.
- Failed field saves retain the typed value. Retry uses the current draft. Successful saves update the canonical value and briefly show Saved.
- Preference changes apply immediately in the specimen; pending, failed and saved feedback remains next to the changed control. Failure preserves the chosen value with Retry and never masquerades as persistence.
- Avatar upload retains the existing picture until server acceptance. MIME/decode errors use an actionable message. Progress is indeterminate, since the current data-URL save API supplies no measured upload percentage. A failed submission retains the prepared upload for Retry. Removal has equivalent recovery.
- AI usage distinguishes loading, no activity, exhausted and unavailable. An unknown balance is never rendered as zero. Reserved and enforcement notes follow returned data, not hardcoded policy.

## Narrow-screen and keyboard contract

- Desktop: bounded Settings dialog, left navigation, independently scrolling content, fixed close button.
- At 700 px and below: horizontal, scrollable navigation; one-column rows; fixed readable type sizes; no page-wide overflow. At intermediate widths, row labels move above controls.
- Opening focuses the visible panel heading. Navigation changes focus to the new heading. Titles are programmatically focusable without an initial action-button focus ring.
- Native modal dialogs contain keyboard focus. Escape closes only the topmost dialog. Buy closing returns focus to Buy credits; Settings closing returns focus to its opener. Backdrop press follows the same close path.
- Retry controls return focus to an appropriate enabled control when the retry result removes the button. Hidden panels are excluded from focus.
- Browser verification was attempted but blocked by the environment. These are implemented contracts with static checks, not claimed browser passes. See [verification/settings-verification.md](verification/settings-verification.md) for exact evidence and the remaining checklist.

## Edit and regenerate

Canonical sources: `templates/settings*.html`, `styles/settings.css`, `scripts/settings.js`, `scripts/settings-api.js`, and `components/navigation/settings*/component.json`.

```sh
python3 docs/ui/scripts/build.py
python3 docs/ui/scripts/export_clean.py
python3 docs/ui/scripts/export_library.py
python3 docs/ui/scripts/check.py
node --test docs/ui/verification/settings-state.test.mjs
```

Do not independently edit generated clean files or previews. Keep this handoff linked from the master file. Keep the concise-copy rule: no sample-data labels, preview disclaimers, redundant helper footers or persistent success paragraphs in product UI.
