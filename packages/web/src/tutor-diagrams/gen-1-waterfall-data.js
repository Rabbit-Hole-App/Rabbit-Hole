function reconcile(opening, activities) {
  const changes = activities.map(([label, count, amountEach]) => ({
    label,
    amount: count * amountEach,
  }));
  const balances = [opening];
  for (const { amount } of changes) balances.push(balances.at(-1) + amount);
  return { opening, changes, balances, closing: balances.at(-1) };
}

// Worked quantities for synthetic cases. Each activity gives a count and its signed amount per item.
export const exhibitTankVolume = reconcile(4 * 20, [
  ['Refill', 4, 12],
  ['Drain', 3, -8],
]);

const trivia = reconcile(6 * 5, [
  ['Correct', 3, 4],
  ['Bonus', 1, 2],
  ['Penalty', 4, -5],
]);
const [correct, bonus, penalty] = trivia.changes;
export const triviaTeamScore = {
  ...trivia,
  groupedChanges: [{ label: 'Points earned', amount: correct.amount + bonus.amount }, penalty],
};

export const apronFabricStock = reconcile(2 * 6, [
  ['New roll', 1, 6],
  ['Cut aprons', 9, -2],
]);
