const stations = ['Bikes', 'Textiles', 'Lamps'];
const ballotsByDay = {
  Saturday: [
    'Bikes', 'Textiles', 'Bikes', 'Lamps', 'Bikes',
    'Bikes', 'Bikes', 'Textiles', 'Lamps', 'Bikes',
    'Bikes', 'Lamps', 'Bikes', 'Textiles', 'Bikes',
  ],
  Sunday: [
    'Textiles', 'Lamps', 'Bikes', 'Textiles', 'Lamps',
    'Textiles', 'Bikes', 'Textiles', 'Lamps', 'Textiles',
    'Lamps', 'Textiles', 'Bikes', 'Textiles', 'Lamps',
    'Textiles', 'Bikes', 'Textiles', 'Lamps', 'Textiles',
  ],
};

const days = Object.keys(ballotsByDay);
const queries = days.map((day, index) => ({
  index, weights: stations.map(station => ballotsByDay[day].filter(choice => choice === station).length),
}));

const day = 'Sunday';
const sundayCounts = queries[days.indexOf(day)].weights;
const count = Math.max(...sundayCounts);
const total = ballotsByDay[day].length;
const leadingStation = { day, station: stations[sundayCounts.indexOf(count)], count, total, share: count / total };

export const repairCafeTally = { days, stations, ballotsByDay, queries, leadingStation };
export const derived = () => repairCafeTally;
