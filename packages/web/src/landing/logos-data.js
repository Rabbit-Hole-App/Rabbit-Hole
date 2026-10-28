// Organisations in the owner's order (brief 2026-10-28, section 3). The owner supplied this list as genuine user
// affiliations (affiliation: 'owner-supplied'); they are NOT independently verified. The wording is about people's
// affiliations, never organisational purchases or endorsements.
// file: an official logo in /landing/logos (sources: public/landing/logos/SOURCES.md). file: null = no official file yet,
// so the entry is not published (no redraw, no text stand-in). w/h = intrinsic aspect; h = optical height in px.
export const logoHeading = 'Used by engineers and students at';
export const logos = [
  { name: 'Google', file: 'google.svg', w: 74, h: 24, height: 30, affiliation: 'owner-supplied' },
  { name: 'Shopify', file: 'shopify.svg', w: 500, h: 142.8, height: 34, affiliation: 'owner-supplied' },
  { name: 'Amazon', file: null, affiliation: 'owner-supplied' }, // ponytail: NEEDS-OFFICIAL-SOURCE, Amazon logo use needs approval
  { name: 'Facebook', file: 'facebook.png', w: 2084, h: 2084, height: 32, affiliation: 'owner-supplied' },
  { name: 'Apple', file: null, affiliation: 'owner-supplied' }, // ponytail: NEEDS-OFFICIAL-SOURCE, Apple logo needs written consent
  { name: 'University of Rochester', file: null, affiliation: 'owner-supplied' }, // ponytail: NEEDS-OFFICIAL-SOURCE, only a white knockout SVG found
  { name: 'University of Washington', file: null, affiliation: 'owner-supplied' }, // ponytail: NEEDS-OFFICIAL-SOURCE, EPS only
  { name: 'Stanford University', file: null, affiliation: 'owner-supplied' }, // ponytail: NEEDS-OFFICIAL-SOURCE, behind Stanford sign-in
  { name: 'Harvard University', file: null, affiliation: 'owner-supplied' }, // ponytail: NEEDS-OFFICIAL-SOURCE, brand site unreachable
  { name: 'University of California, Berkeley', file: null, affiliation: 'owner-supplied' }, // ponytail: NEEDS-OFFICIAL-SOURCE, brand site 403
];
