export const trays = [
  { id: 'oat', label: 'Oatmeal' },
  { id: 'lemon', label: 'Lemon shortbread' },
  { id: 'ginger', label: 'Ginger snaps' },
  { id: 'cocoa', label: 'Cocoa crinkles' },
  { id: 'berry', label: 'Berry jam' },
];

// Put the slip back after each inspection so a tray can be drawn again.
export const drawnSlips = ['oat', 'lemon', 'oat', 'ginger', 'lemon'];

export function derived() {
  const inspected = new Set(drawnSlips);
  const omitted = trays.map(tray => tray.id).filter(id => !inspected.has(id));
  return { draws: drawnSlips.length, trayCount: trays.length, inspected: inspected.size, unpicked: omitted.length, omitted };
}
