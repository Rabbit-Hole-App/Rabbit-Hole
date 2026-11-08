    const explanation = createCard({
      type: 'explain',
      title: 'How a Tree Chooses Its First Split',
      concept: 'A tree compares candidate questions and picks the one with the biggest drop in impurity. It repeats that search within each resulting branch.',
      visual: getTemplate('image-example'),
    });
    showExample('/explain · Raster image', explanation);

