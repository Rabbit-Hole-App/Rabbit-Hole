// A code block that types itself in. Monospace, ink on the white board;
// the rough frame around it is a plain rect stroke in the script.
import React from 'react';

export const Code = ({ s, p }) => {
  const n = Math.floor(p * s.text.length);
  return (
    <pre
      style={{
        position: 'absolute',
        left: s.x,
        top: s.y,
        margin: 0,
        fontFamily: "'Cascadia Code', Consolas, 'Courier New', monospace",
        fontSize: s.size,
        lineHeight: 1.5,
        color: s.color,
      }}
    >
      {s.text.slice(0, n)}
      {p < 1 ? <span style={{ color: '#2383E2' }}>▍</span> : null}
    </pre>
  );
};
