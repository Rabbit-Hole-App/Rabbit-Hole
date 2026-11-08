# Folder tiles and menus

Read [RABBIT-HOLE-NEW-UI.md](RABBIT-HOLE-NEW-UI.md) first. [Complete reference](clean/42-folders.html) · [Home assignment](HOME.md).

This is the Library folder component shown in the owner's screenshot. It is a separate specimen; do not add a Folders section to Home. Main's landmarks are `packages/web/src/LibraryFolders.jsx`, `library-folders.js` and `home/CardMenu.jsx`.

## Reuse map

| Element | Source |
| --- | --- |
| Tile composition | `templates/folders.html`, `styles/folders.css`; layout follows `FolderTiles` |
| Options, colour group and dialogs | `templates/folder-overlays.html`; existing `.menu`, `.menu-item`, `.dialog`, `.field`, `.control` and buttons |
| Local behavior and shared folder data | `scripts/folders.js`; used by Home's Move to folder rows too |
| Glyphs | `icons/home.svg`; exact Lucide names from app imports, `lucide-react@1.41.0`, ISC/Feather notice `icons/home-NOTICE.txt` |
| Colours | Six existing server-accepted IDs from `library-folders.js`; not an invented UI action palette |
| Focus, surfaces, typography | Existing `standards.css`, `review-corrections.css`, `foundations/palette.css` |

The tile shows its coloured edge, folder glyph, name, item count and separate options trigger. Zero items remains visible here: the owner's zero-count suppression applies to **stars**, not folder contents.

Menu order: Rename; Colour with current swatch and chevron; divider; Delete folder. The Colour row expands the existing six choices. Choices have labels, a selected state and keyboard navigation; colour alone never conveys selection. Rename/New folder enforce 1–60 characters after trimming/collapsing whitespace. New folder follows the current app's next-colour rule. **Every New folder action includes the existing Folder-plus icon**: both the Library folder header and the Home Move to folder menu. Keep the text label; the icon is decorative.

Delete folder asks for confirmation with Delete folder first, secondary Cancel second, initial focus on Cancel and no redundant X. Deleting a folder returns its contents to Library; it does not delete canvases. The empty-folder confirmation says only that the folder is empty.

Options appear on hover/focus and always on touch. Arrow keys, Home/End and Escape operate the menu; right arrow opens Colour, arrow keys move among swatches, Escape closes that group before closing the whole menu. Closing a modal returns focus. Tile-open navigation and backend persistence remain unconnected in this static reference.

Home Move to folder shows these same folder names/colours, current selection, New folder and Remove from folder. This draft models assignment locally; API requests, failure/retry states, drag/drop and account permissions are not claimed implemented.

## Current data swatches

Ink `#37352f` (render with the shared ink token), Blue `#2383e2`, Red `#b42318`, Green `#1a7f37`, Amber `#f59e0b`, Purple `#7c3aed`. Keep accepted data IDs; any future palette migration needs the corresponding server contract update. General controls continue to use the approved Rabbit Hole palette.

## Verification

Structural and JavaScript checks and non-browser DOM interaction tests cover the supplied flows. Browser focus visibility, native Tab order, menus near viewport edges, and touch/hover rendering remain pending. See [home-verification.md](verification/home-verification.md). Do not describe these offline checks as visual acceptance.
