-- Weekly Top 5 (docs/features/explore-weekly-top.md): two indexes so a week's stars and forks are range scans. Additive,
-- re-runnable, LEARN_DB only; no table, column or data changes. 0027 is Credits, 0028 is Stars.
-- canvas_star_events: the first 'added' event of a person on a canvas is their weekly star; the partial index covers the week scan.
CREATE INDEX IF NOT EXISTS canvas_star_events_added_at ON canvas_star_events (at, org, canvas, user_id) WHERE kind = 'added';
-- canvas_forks: forked_at is a JavaScript ISO string written by the fork route; covers the week scan.
CREATE INDEX IF NOT EXISTS canvas_forks_at ON canvas_forks (forked_at, forked_from_org, forked_from_canvas_id, owner_email);
