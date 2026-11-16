# PLT-2(B) amendment (ml-plot-layouts.js)

Rule built: a point annotation's label is a callout (pill and leader); a reference line's label is plain text (12 px, muted, ground halo, no pill, no leader) at the top end of its line, on the side that is free (the other side when the first is taken, else stacked below); a band's label is plain text inside the band along its top edge (under the curve for a single line series); every other shape's label is plain text in the first free cell beside it. Point callouts are placed last, and avoid every series path, marker, stem, other label, and (first choice) a leader that crosses another label. Text wraps to the room the plot leaves and never leaves the plot.

Files: bell (the PLT-2 spec) at 408 and 720, after; hunk.diff.

Known limit, seen in bell-after-408: the plot is about 180 px wide, the spec carries eight annotations, and one of the two identical "Standard deviation" callouts finds no cell that touches no other label, so it is not drawn (its ring stays). The "One standard deviation above" text stands low inside the band when neither side of its line is free at the top.
