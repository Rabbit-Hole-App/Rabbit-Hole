// /explain's interactive examples in View > Slash commands (L10, owner 2026-10-21): stored copies of real /explain answers,
// each checked control by control (C:/s/spec/ui-changes/L10-report.md). The window draws them with the canvas's own card, so
// opening it generates nothing. origin says where an example came from: 'generated' is a real model answer stored as it came
// back (the server's checked block, 2026-10-21; the pendulum one through the Tutor's create_material explain); 'fixture'
// would be one authored by hand.
import binarySearch from './explain-examples/binary-search.json' with { type: 'json' };
import compoundInterest from './explain-examples/compound-interest.json' with { type: 'json' };
import launchAngle from './explain-examples/launch-angle.json' with { type: 'json' };
import meanMedian from './explain-examples/mean-median.json' with { type: 'json' };
import ohmsLaw from './explain-examples/ohms-law.json' with { type: 'json' };
import pendulum from './explain-examples/pendulum.json' with { type: 'json' };

export const ORIGIN_NOTES = {
  generated: 'Made by /explain: a real answer, stored as it came back, from',
  fixture: 'An authored fixture, not a generated answer, for',
};

export const EXPLAIN_EXAMPLES = [binarySearch, compoundInterest, launchAngle, meanMedian, ohmsLaw, pendulum];
