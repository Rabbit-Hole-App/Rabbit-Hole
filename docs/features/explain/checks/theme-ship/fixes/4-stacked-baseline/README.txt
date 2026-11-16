Defect: a stacked bar chart drew one continuous zero baseline, which ran through the value-note lines between the groups.
Change: for the stacked variant the baseline is drawn per group, from the group's top to the end of its bar row (before its bars); grouped bars keep the one continuous baseline.
Tests: ml-plot.test.mjs 'stacked baselines stop before the value notes between categories' passes unrewritten (28 of 28 in the file).
