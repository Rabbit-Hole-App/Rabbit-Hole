// How browser checks drive the canvas menubar after the 2026-10-22 menu redesign (owner brief, src/CanvasMenubar.jsx, canvas-menus.js):
// Insert, Edit, Arrange and View, with real submenus (Workspace and Show / hide under View, Align, Distribute and Layer order under
// Arrange, Section under Insert). A submenu is a role="menu" opened by a menuitem with aria-haspopup; its rows are menuitem,
// menuitemradio or menuitemcheckbox. Opening a menu or a submenu makes no request.
export const menubar = page => page.locator('[role="menubar"][aria-label="Canvas menu"]');
export const topMenu = (page, title) => menubar(page).getByRole('menuitem', { name: title, exact: true });

// Opens a top-level menu unless it is open, then (optionally) a submenu of it; returns the locator holding that menu's rows.
export async function openMenu(page, title, submenu = null) {
  const top = topMenu(page, title);
  if ((await top.getAttribute('aria-expanded')) !== 'true') await top.click();
  const panel = menubar(page).getByRole('menu', { name: title, exact: true });
  await panel.waitFor({ timeout: 5000 });
  if (!submenu) return panel;
  const parent = panel.getByRole('menuitem', { name: submenu, exact: true });
  if ((await parent.getAttribute('aria-expanded')) !== 'true') await parent.click();
  const inner = panel.getByRole('menu', { name: submenu, exact: true });
  await inner.waitFor({ timeout: 5000 });
  return inner;
}

// Escape closes a submenu first and then the menu, returning focus to its button.
export async function closeMenus(page) {
  for (let step = 0; step < 3 && (await menubar(page).getByRole('menu').count()); step++) await page.keyboard.press('Escape');
  await menubar(page).getByRole('menu').first().waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
}

// View > Workspace: 'Canvas' or 'Editor' (the canvas's document, docs/features/blocknote-canvas.md). Closes the menu.
export async function chooseWorkspace(page, label) {
  const inner = await openMenu(page, 'View', 'Workspace');
  await inner.getByRole('menuitemradio', { name: label, exact: true }).click();
}
export async function workspaceValue(page) {
  const inner = await openMenu(page, 'View', 'Workspace');
  const value = await inner.getByRole('menuitemradio').evaluateAll(rows => rows.find(row => row.getAttribute('aria-checked') === 'true')?.textContent.trim() ?? null);
  await closeMenus(page);
  return value;
}

// View > Show / hide: the labelled checked rows (Toolbar, Right panel, Minimap, Rabbit Hole Map, Comment pins, Learning suggestions).
export const showHideRow = (page, name) => menubar(page).getByRole('menu', { name: 'Show / hide', exact: true }).getByRole('menuitemcheckbox', { name, exact: true });
export async function openShowHide(page) { return openMenu(page, 'View', 'Show / hide'); }
export async function setShown(page, name, on) {
  await openShowHide(page);
  const row = showHideRow(page, name);
  if ((await row.getAttribute('aria-checked')) !== String(on)) await row.click();
  await page.waitForFunction(([label, value]) => [...document.querySelectorAll('[role="menubar"] [role="menuitemcheckbox"]')].find(node => node.textContent.trim() === label)?.getAttribute('aria-checked') === value, [name, String(on)], { timeout: 5000 });
}

// The slash commands sheet is opened from the chat composer's slash palette (the existing help surface): type /, press its help button.
export async function openSlashHelp(page) {
  await page.locator('[data-chat-pane] [data-chat-composer] textarea').first().fill('/');
  await page.getByRole('button', { name: 'Open Slash commands' }).first().click();
}
