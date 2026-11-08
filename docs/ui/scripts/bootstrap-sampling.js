  const bootstrap = card({ type: 'interactive', mode: 'Untimed', title: 'Bootstrap sampling',
    concept: 'Drawing with replacement lets a row appear more than once in the sample.', instruction: 'Draw again and check how many distinct rows you got.' });
  const draws = ['B · D · D · A · H · B · D · F', 'A · C · E · B · E · H · G · C', 'F · B · B · D · F · C · G · E'];
  const bootstrapVisual = document.createElement('div');
  bootstrap.visual(bootstrapVisual);
  bootstrap.controls(createActionExample(index => {
    const unique = new Set(draws[index].split(' · ')).size;
    bootstrapVisual.replaceChildren(readout('Rows drawn', draws[index]), createStats([['Distinct rows', `${unique} of 8`], ['Out of bag', String(8 - unique)]]));
  }));

