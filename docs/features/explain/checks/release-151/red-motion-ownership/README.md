# red-motion-ownership (pin, stale mutation target)

Test: packages/web/src/motion-ownership.test.mjs, 'mutation proof: reintroducing the prior heat-keyed style/animate split fails the invariant'.
(The path in the brief said src/explain-program/; the file is at src/motion-ownership.test.mjs.)

What failed: 'the mutation target text was not found' - source.replace() matched nothing.
Why: the grid/strip cell in AnimatedScene.jsx changed from square `height={cell}` to `height={cellH}` (strip cells 32 x 28) and the
ring got `initial={false}`. Moving commit (git log -S"height={cellH}" -- src/AnimatedScene.jsx): 3e564b028 "scene renderer, composed theme: ... 32 x 28 strip cells ...".
Fix kind: PIN of the mutation target only (test file). Source is correct; the invariant test itself (test 1) was green throughout.
The mutated replacement keeps the same defect (style={heat ? {fill} : undefined} + animate={heat ? ring : {fill, ...ring}} on one motion.rect), now with cellH / initial={false}.

Proof the mutation can still fail:
- test 2 asserts the mutated current source yields exactly 1 violation (motion.rect, keys ['fill']) - passes (after.txt).
- additionally applied the same mutation to the real AnimatedScene.jsx on disk and ran the file: the invariant test (test 1) FAILS (mutated-source-on-disk.txt; test 2 also fails there only because its target text is then absent). AnimatedScene.jsx restored with git checkout.

Files: before.txt (red), after.txt (green), mutated-source-on-disk.txt, hunk.diff.
