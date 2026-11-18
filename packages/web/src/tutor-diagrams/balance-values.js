const decimal = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function toMinor(amount) {
  return Math.round(amount * 100);
}

export function sumMinor(entries) {
  return entries.reduce((total, entry) => total + toMinor(entry.amount), 0);
}

export function formatMinor(minor) {
  return `${minor < 0 ? '−' : ''}${decimal.format(Math.abs(minor) / 100)}`;
}
