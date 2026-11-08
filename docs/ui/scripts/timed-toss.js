  const toss = card({ type: 'interactive', mode: 'Timed', title: 'A ball near its highest point',
    concept: 'The ball is highest at time zero. Gravity makes it lower on either side of that instant.', instruction: 'Play or scrub the timeline, then change the peak height and compare the motion.' });
  let height = 2.2;
  let time = 0;
  const renderToss = () => toss.draw(drawToss(height, time).svg);
  toss.timeline(transport({ min: -.5, max: .5, initial: time, step: .01, signed: true }, value => { time = value; renderToss(); }));
  toss.controls(slider({ label: 'Peak height', min: 1.6, max: 3, step: .1, value: height, format: value => `${value.toFixed(1)} m` }, value => { height = value; renderToss(); }));

