import { createElement } from 'react';

// A menu row's decorative icon (owner icon spec 2026-10-22): 16px, about 1.75 stroke, muted, aria-hidden, in a fixed-width column;
// the colour comes from the row, so hover, active and disabled states carry through. The label always stays beside it.
export const MENU_ICON_SIZE = 16;
export const MENU_ICON_STROKE = 1.75;
export const menuIcon = Icon => createElement(Icon, { size: MENU_ICON_SIZE, strokeWidth: MENU_ICON_STROKE, 'aria-hidden': 'true', focusable: 'false', className: 'shrink-0' });
