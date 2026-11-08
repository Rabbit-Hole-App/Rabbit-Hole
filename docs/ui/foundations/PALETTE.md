# Blue and Claude-red balance

The owner's latest instruction returns to the balance in [the original ca0affe kit](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/ca0affecfb39caf6790f4b2636f1ed3c2dd90800/docs/features/explain-on-canvas/handoff/ui/templates/rabbit-hole-card-component-kit.html). The attached copy matches that file apart from trailing whitespace. This supersedes the later rule making every experiment control blue. It does not revert typography, rectangular Accept, composer scrolling or resizing.

Most surfaces stay warm neutral. Use blue for working with the app, warm red for changing the lesson's experiment, and color pairs inside teaching visuals when the data needs comparison. These roles avoid both an all-blue interface and red on every button.

| Purpose | Treatment | Examples |
| --- | --- | --- |
| Primary app action | Solid blue | Send, Accept, Generate, Continue |
| Shared selection and navigation | Soft blue | Selected tools, filters, thumbs, source highlight, context chips |
| Reading identity | Soft blue | Explanation, Markdown, PDF, non-Interactive Tutor/Create pills |
| Playback | Soft blue at rest; blue scrubber/time | Play, Pause, Replay; watching/scrubbing does not change experiment parameters |
| Interactive identity | Soft Claude red | Text-only Interactive pill |
| Experiment parameter | Warm range fill; soft-red selected choice | Height, cutoff, applicant, split criterion and experiment multi-select |
| Toggle / switch | Green on-state, neutral off-state | App settings and experiment toggles, per the owner's explicit correction |
| Experiment action | Soft Claude red | Draw again, sample again; updates the modeled result |
| Secondary/reversal/navigation | Neutral outlined | Cancel, Reset, Previous/Next, Edit; do not compete with the main action |
| Keyboard focus | Blue ring everywhere | Including red experiment controls |
| Completion and valid result | Green, with text | Completed step, positive status; preserve existing green Why/readout examples while reviewing semantic meaning per lesson |
| Destructive/error | Separate danger red | Trash, error, invalid field; never use Claude-red experiment styling for danger |
| Search command identity | Filled neutral | Photo, YouTube, arXiv, Wikipedia search |
| Teaching data | Blue + warm red, labelled | Class A/B, competing splits, curves, vote groups; color is never the only distinction |

## Exact state values

| Role | Rest/selected | Hover | Pressed |
| --- | --- | --- | --- |
| Solid blue fill/border, white ink | #375D92 | #2B4B78 | #203858 |
| Soft blue surface; #375D92 ink, #ADC4E5 border | #EAF1FB | #DDE9F8 | #D0E0F4 |
| Soft experiment surface; #934723 ink, #E2AD8F border | #F8ECE3 | #F5E0D2 | #EAC6AD |
| Experiment range fill | #B86232 | Retain native interaction | Retain native interaction |
| Toggle on fill/border, white knob | #267657 | #1D6247 | #174F39 |

The original kit supplies experiment rest/selected and hover colors. The pressed experiment surface above is an explicit extension using the existing palette's #EAC6AD; it is not a claim that ca0affe defined this state. Focus stays #426DB2, 2 px. Disabled opacity remains 45%. Corners stay 8 px through every control state. Unselected choices remain neutral.

## Where this is applied

`palette.css` is an explicit overlay on extracted source CSS. `component.json.paletteRole` selects `shared`, `experiment`, `balanced-card` or `historical`. Balanced cards scope the red treatment to `.card-controls`, leaving their `.card-timeline`, metric tiles and app actions blue. The catalog's generic app input specimen stays blue; an experiment slider specimen uses red. Readouts are a separate role, not controls.

The [four composed cards](../MAPPING.md) and [original kit](../components/patterns/original-component-kit/preview.html) give reviewable examples. This is the reference-asset palette decision; application CSS and the old monolithic sources have not been changed. Browser visual acceptance is still pending.
