// The numbers the blueprint checker and Build use (Brief 38, spec section 11): named, in one file, each with one line saying why it has that value. None was tuned to an example.
export const SAMPLE_POSITIONS = 9; // a number control is tried at 9 evenly spaced positions from its minimum to its maximum: ends, middle and the quarter points in between
export const SAMPLE_TIMES = 9; // the checks look at 9 evenly spaced times from 0 to the end of the run, the same count as the positions
export const WINDOW_TIMES = 200; // the window of a parts picture is found over 200 times, fine enough that no turning point of a motion is missed by more than half a percent of the run
export const GRAPH_SAMPLES = 96; // a graph line is sampled at 96 evenly spaced x positions, about four per kept sample, so a turning point is found within a quarter of a kept step
export const KEPT_SAMPLES = 25; // the coordinate-plot kind draws at most 25 samples per line (/explain's limit, read from the parser by checks: see TURN_LIMIT)
export const TURN_LIMIT = 11; // both ends, one sample per turning point and a midpoint between neighbours: 2 + 11 + 12 = 25 samples, so a line may turn at most 11 times
export const MIN_MOVE_PX = 24; // a part that moves less than 24 px (the size of a small dot) cannot be seen to move
export const DOT_MIN_PX = 12; // the smallest dot: the marker dots of the graph are this size too
export const DOT_MAX_PX = 36; // the largest dot a size output draws; 3 times the smallest so the ratio can be read
export const DOT_NAMED_PX = Object.freeze({ small: 12, medium: 24, large: 36 }); // the three named sizes: the two ends and the middle of the dot range
export const STAGE_MIN_HEIGHT = 200; // the least height of a parts picture: room for a scene at a readable scale (the layout rows give 260 to 299)
export const WINDOW_PAD_PX = 34; // room round the parts inside the picture: a largest dot's radius (18), a label's gap and room for its text, and 8 px so no part touches the edge
export const LABEL_GAP_PX = 12; // a label's text box stands this far from the part it is near, on the side the program picks: frame-overlap.js keeps a label 8 px clear of a line or an arrow shaft, and 4 px more is room for the estimate
export const TRACE_POINTS = 32; // a trace is drawn through at most 32 points, one call of the math function each
export const CALLS_PER_FRAME = 160; // one frame may call the math function 160 times: 1 + 96 graph + 32 trace, with room
export const FRAME_MS = 50; // the card's own limit for one call into the engine (explain-program/limits.js interruptMs)
export const REL_TOLERANCE = 1e-6; // two numbers are equal when they differ by at most this share of the larger (spec section 5, check 8)
export const Y_MARGIN = 0.1; // the graph's y range is the sampled range widened by a tenth on each side, then rounded outward
export const BATCH_TIMES = 50; // the checker asks the engine for 50 times at once, so a cheap function is fast and a dear one still fits the 50 ms of one call
export const MAX_PROBLEMS = 12; // at most 12 problems go back to the model
export const DEFAULT_DECIMALS = 2; // a value with no decimals declared shows two
export const THING_ROLES = Object.freeze(['input', 'warning', 'output', 'observed']); // the card's roles in the order of the renderer's series fills (blue, coral, teal, olive), so a line and its dot agree
export const SELECT_ROW_PX = 560; // the width a row of choice buttons may take: the card's 640 px less 24 px of padding each side and the reset button's share
export const SELECT_BUTTON_PAD_PX = 28; // the horizontal padding and border of one choice button (an estimate, not measured in the browser)
export const SELECT_GAP_PX = 8; // the gap between two choice buttons
