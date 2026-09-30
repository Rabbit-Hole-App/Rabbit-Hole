# Living mascot MVP

**Retired on 2026-09-24.** The user rejected the result and requested removal from
the landing page. This directory records the previous prototype and its evidence.

The user authorized moving beyond run refinement on 2026-09-23. Pass 04 is the
temporary run; articulated 06/07 are preserved for later. No additional run strip
or in-between was generated.

The existing standing artwork supplies breathing, glances/turns, right-hand watch
check and crouch. Local pose functions use the existing WebGL mesh compositor.
The portal controller owns page position independently from visual pose. A and B
are reusable normalized page objects; either can be entrance or exit. Clipping
behind the foreground rim, depth movement and shadow create entry/exit. Hidden
transfer changes the destination root without showing the rabbit between holes.

The landing integration is `src/mascot/landing.js`, mounted in the existing
`design/rabbit-hole-hero.html` after the hero. Blog, Features and Pricing now have
their own pages. The user explicitly
requested landing-only placement; the prior app tabs and React mount are removed.
The source contract is
[rabbit-living-mascot.md](../../../../../docs/features/rabbit-living-mascot.md).

## Known art limits

Only right-facing locomotion has an authored run cycle. The scroll interaction
uses front presence and authored front/side/back three-quarter turns, without
mirroring the watch. Approach is a moving pose, not a new directional run.
Look-left turns use the retained
cardinal/three-quarter standing views. The crouch is a local procedural pose,
and unseen material under the lifted watch arm is filled from the existing coat
and trousers. These are review candidates, not newly approved character art.

No Character Bible freeze or final-run approval is inferred from MVP progress.
No model/API calls or new dependencies were added for the mascot.

## Review and evidence

[Landing page](https://small-cp-dev-smart-landing-page.zeroshothq.workers.dev/#warren).
Current scroll-portal evidence is in `qa/scroll-portals/`; it also checks separate
public pages, partial-scroll reversal, the pink-cloud band
and verifies the mascot is absent from both regular and repository app interfaces.
Functional checks are not user visual approval.

Deployed version `450b3b20-64e0-45df-8462-93bd4c095b9e`: seven controller tests
and [16 deployed browser scenarios](qa/scroll-portals/browser-verification.json)
passed, with zero page errors. Review [front presence](qa/scroll-portals/front-presence.png),
[rim occlusion](qa/scroll-portals/rim-occlusion.png),
[emergence](qa/scroll-portals/down-exit-late.png), and
[mobile entry](qa/scroll-portals/mobile-entry.png).

### Earlier app-placement evidence

The following captures are historical, from version
`339ab997-ea8e-477e-a401-52b0deea6cc5`, before the user's location correction.
Six controller tests and [11 deployed app checks](qa/browser-verification.json)
passed then; the app tabs shown here have now been removed.

- [App and existing navigation](qa/app-desktop.png)
- [Right-paw watch check](qa/idle_watch_check.png), [crouch](qa/crouch.png)
- [Partial entry](qa/enter-A-partial.png), [partial exit](qa/exit-A-partial.png)
- [Recovery after the reverse trip](qa/recovered-B.png)
- [Mobile / reduced motion](qa/mobile-reduced-motion.png)

The [browser recording](qa/mascot-deployed.webm) covers the actual user-facing sequence.
The earlier numeric `qa/*-0.6.png` etc. are deterministic local artwork probes;
the named action and portal screenshots above come from the deployed app.
