export const aisles = ['Entrance', 'Center', 'Exit'];

// Each cell combines nonoverlapping tally windows during that period.
export const spotTallies = [
  { label: 'Morning', tallies: [[6, 5], [12, 10], [4, 7]] },
  { label: 'Midday', tallies: [[8, 9], [17, 14], [7, 8]] },
  { label: 'Afternoon', tallies: [[5, 9], [9, 12], [4, 5]] },
];

export function derived() {
  const rows = spotTallies.map(({ label, tallies }) => ({
    label, cells: tallies.map(tally => tally.reduce((total, value) => total + value, 0)),
  }));
  const positions = rows.flatMap(({ cells }, row) => cells.map((value, column) => ({ row, column, value })));
  const lowest = positions.reduce((best, cell) => cell.value < best.value ? cell : best);
  const highest = positions.reduce((best, cell) => cell.value > best.value ? cell : best);
  return { rows, lowest, highest, spread: highest.value - lowest.value };
}
