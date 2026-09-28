# Blog: ideas, unfolded

The user selected “Falling through an endless archive” after rejecting the
paper tunnel. Loose sheets drift downward along a winding path at different
depths. More arrive as scrolling advances, creating the feeling of descending
through knowledge. Reverse scroll retraces their flight. Keep the pink
background, fine paper outlines and pixelated stipple. Preserve the existing
article list, introduction, navigation and the other marketing pages.

Palette: constant pink `#f3dce8`, plum ink `#482953`, paper
`#faf2f9`, shaded paper `#b08eb7`. Distant sheets blend slightly toward pink.
Keep the existing Space Grotesk display and Inter body type.
The headline is left aligned; the existing introduction
sits beside it on desktop and underneath on mobile.
The Blog label and top spacing use combined content-page/blog-page selectors
so the shared stylesheet cannot override them when the build reorders CSS.

    Blog
    Ideas, unfolded.          Existing introduction
    [     loose falling pages / scroll-controlled depth     ]
    Existing dated article list
    Shared static footer (Blog / Features / Pricing)

Five sheets are present at the start. Scroll introduces additional sheets up
to forty-two; thirty-seven remain within the desktop viewport at the end,
while earlier sheets have passed below. Each sheet follows a persistent path
with its own depth, tilt, roll and curl. The shared path winds gently down
the page. Large nearby sheets cross the foreground, while small distant sheets
remain behind them. Their rectangular proportions stay recognizable through
the flutter. Pages overlap as whole sheets, preserving clean silhouettes.
Plum boundaries, sparse material contours and stationary screen-space stipple
maintain the ink character. All geometry follows scroll progress directly;
there is no clock, timed loop or continuing motion after scrolling stops.
The caption remains “Scroll deeper.”

Native Canvas 2D in `src/landing/blog-art.js`; scoped styling in `blog-art.css`.
No new dependencies. Depth controls apparent scale and draw order. Each page
uses a shallow curved mesh; offscreen sheets are culled. Rendering is scheduled
only by scroll, resize or a motion-preference change; the canvas is stationary
when the visitor stops scrolling. The scroll stage remains 168svh on desktop
and 148svh on phones. Reduced motion shows a fixed 55% archive composition,
removes sticky scrolling and hides the scroll cue. Navigation and articles
remain ordinary HTML. No playback controls, bitmap generation or backend work.

This supersedes the rejected paper tunnel. Its preceding source is retained
in `tmp/blog-archive/before.*`; browser checks and screenshots are in the same
directory. The landing clouds, observatory, footer, Features stairs and Pricing
are unchanged.
