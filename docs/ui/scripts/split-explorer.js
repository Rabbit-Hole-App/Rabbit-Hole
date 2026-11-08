  const split = card({ type: 'interactive', mode: 'Untimed', title: 'Tree Split Explorer',
    concept: 'A good cutoff puts similar points on each side of the split.', instruction: 'Move the cutoff, then switch the measure to compare what each one rewards.' });
  let cutoff = 5.5;
  let criterion = 'gini';
  function updateSplit() {
    const { svg, why } = drawSplit(cutoff, criterion);
    split.why(why);
    split.draw(svg);
  }
  split.controls(slider({ label: 'Cutoff', min: 1.5, max: 9.5, step: 1, value: cutoff }, value => { cutoff = value; updateSplit(); }),
    choices({ label: 'Measure', options: [['gini','Gini'],['entropy','Entropy']], selected: criterion }, value => { criterion = value; updateSplit(); }));
  updateSplit();

