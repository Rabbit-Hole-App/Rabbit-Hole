    const tree = getTemplate('svg-example');
    const interactive = createCard({
      type: 'interactive',
      title: 'Loan Decision Tracer',
      concept: 'A decision tree asks one yes-or-no question at a time until it reaches a decision.',
      instruction: 'Choose an applicant and follow the highlighted path to see why the tree approves or denies the loan.',
      visual: tree,
    });
    showExample('/interactive · SVG scene', interactive);
    const applicants = {
      a: { age: 25, income: 60000, credit: 650 },
      b: { age: 28, income: 40000, credit: 740 },
      c: { age: 42, income: 45000, credit: 740 },
    };
    const formatIncome = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
    const control = getTemplate('applicant-control');
    const routes = [...tree.querySelectorAll('[data-route]')];
    function showApplicant(key) {
      const applicant = applicants[key];
      const young = applicant.age < 30;
      const branch = young ? 'young' : 'older';
      const approved = young ? applicant.income > 50000 : applicant.credit > 700;
      const decision = approved ? 'approve' : 'deny';
      const active = new Set(['root', branch, `${branch}-${decision}`]);
      for (const element of routes) element.classList.toggle('is-active', active.has(element.dataset.route));
      const compared = approved ? 'exceeds' : 'is at or below';
      const detail = young
        ? `income of ${formatIncome.format(applicant.income)} ${compared} $50,000`
        : `credit score ${applicant.credit} ${compared} 700`;
      interactive.showReason(`Age ${applicant.age} is ${young ? 'below 30' : 'at least 30'} and ${detail}, so the tree ${approved ? 'approves' : 'denies'} the loan.`, decision);
    }
    control.addEventListener('change', event => showApplicant(event.target.value));
    interactive.controls.append(control);
    showApplicant(control.querySelector(':checked').value);
  