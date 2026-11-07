// Synthetic 8 kHz signal. Two 0.5-amplitude tones at 440 Hz and 480 Hz start at 0.40 s.
// The fixture holds centered Hann DFT magnitudes in dB re 1, with a -60 dB floor.
// Rows are descending frequency and columns are increasing window-center time.
import spectrum from './spectrogram.json' with { type: 'json' };

export const spectrogramFixture = {
  manifest: {
    title: 'Which window shows two notes?',
    summary: 'A short window locates the onset. A long window separates two nearby frequencies.',
    description: 'A spectrogram with time in seconds, frequency in hertz and one dB scale for both windows. Both tones begin at 0.40 seconds.',
    assumptions: ['Synthetic 440 Hz and 480 Hz tones. Each column is centered on its analysis window.'],
    capabilities: ['select_inputs', 'heat_grid'],
    inputs: [{
      id: 'window', type: 'select', label: 'Window length', default: 'short',
      options: [{ value: 'short', label: '20 ms' }, { value: 'long', label: '120 ms' }],
    }],
    readouts: [],
  },
  source: `export function evaluate({ inputs }) {
    const domain = ${JSON.stringify(spectrum.domain)};
    const values = inputs.window === 'long' ? ${JSON.stringify(spectrum.long)} : ${JSON.stringify(spectrum.short)};
    const x = 88, y = 56, cell = 15, rows = ${spectrum.rows}, cols = ${spectrum.cols};
    const onset = x + (8 + 0.5) * cell;
    const objects = [
      sdk.heatGrid('spectrogram', { x, y, cell, rows, cols, values, domain }),
      sdk.text('onset-label', onset, 28, 'Onset 0.40 s', { align: 'middle' }),
      sdk.line('onset-tick', onset, 36, onset, y),
      sdk.text('freq-axis', 24, 48, 'Hz'),
      ...[[0, '520'], [4, '480'], [8, '440'], [12, '400']].map(([row, text]) =>
        sdk.text('freq-' + row, 44, y + (row + 0.5) * cell + 5, text)),
      ...[[0, '0.32'], [8, '0.40'], [18, '0.50']].map(([col, text]) =>
        sdk.text('time-' + col, x + (col + 0.5) * cell, y + rows * cell + 20, text, { align: 'middle' })),
      sdk.text('time-axis', 230, 292, 'Time (s)', { align: 'middle' }),
      sdk.heatGrid('scale', { x: 182, y: 307, cell: 14, rows: 1, cols: 5, values: [-60, -45, -30, -15, 0], domain }),
      sdk.text('scale-min', 122, 319, '−60 dB'),
      sdk.text('scale-max', 263, 319, '0 dB'),
    ];
    return { frame: { width: 430, height: 338, objects }, quantities: {} };
  }`,
};
