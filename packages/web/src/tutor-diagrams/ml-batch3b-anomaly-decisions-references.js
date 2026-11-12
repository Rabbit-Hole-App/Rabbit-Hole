const failedLogins = [2, 5, 4, 2, 5, 3, 5, 5, 5, 5, 5, 5];

export const references = [
  {
    id: 'ml-collective-anomaly-run', lessons: ['16'],
    prompts: ['How can several normal readings in a row be a collective anomaly?'],
    keywords: ['collective anomaly', 'normal readings in a row', 'long run of ordinary readings', 'consecutive normal readings'],
    useWhen: 'Use failed-login counts that are ordinary in isolation. Highlight the consecutive high counts and mark the minute when the run rule first flags them.',
    spec: {
      version: 1,
      diagram: {
        kind: 'coordinate-plot', title: 'A collective anomaly in failed logins',
        x: { label: 'Minute', min: 1, max: 12 },
        y: { label: 'Failed logins per minute', min: 0, max: 6 },
        series: [{
          label: 'Failed logins', kind: 'line',
          points: failedLogins.map((count, i) => ({ x: i + 1, y: count })),
        }],
        annotations: [
          { kind: 'band', axis: 'x', from: 7, to: 12, label: 'Six consecutive high minutes' },
          { kind: 'point', x: 12, y: 5, label: 'Flag at minute 12' },
        ],
        caption: 'Here, counts from 0 to 5 are normal in isolation. Flag at minute 12 after 6 consecutive minutes with 5 failures each.',
      },
    },
  },
  {
    id: 'ml-ranked-anomaly-scores', lessons: ['16'],
    prompts: ['How do I rank anomaly scores and decide which cases to review?'],
    keywords: ['rank anomaly scores', 'ranking anomaly scores', 'anomaly score cutoff', 'anomaly score threshold', 'anomaly review cutoff'],
    useWhen: 'Rank illustrative scores from most to least unusual. Show how a higher review cutoff narrows the queue while scores and their order stay fixed.',
    spec: {
      version: 1,
      diagram: {
        kind: 'bar-chart', title: 'Ranked anomaly scores for review',
        bars: [
          { label: 'Case A', value: 0.92 },
          { label: 'Case B', value: 0.81 },
          { label: 'Case C', value: 0.70 },
          { label: 'Case D', value: 0.44 },
          { label: 'Case E', value: 0.27 },
        ],
        caption: 'With a minimum score of 0.75, review A and B. With a minimum of 0.85, review A only. Higher scores mean more unusual.',
      },
    },
  },
];
