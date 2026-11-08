  const explanation = card({ type: 'explain', mode: 'Reading', title: 'Two ways to measure impurity',
    concept: 'A mixed node is harder to label with one class. For six cats and four dogs, Gini and entropy measure that mixture on different scales.' });
  explanation.visual(createStats([['Gini impurity', '0.48'], ['Entropy', '0.971 bits']]));

