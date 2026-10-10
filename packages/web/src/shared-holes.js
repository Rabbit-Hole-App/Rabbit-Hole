// The read-only Rabbit Holes Map on a shared or published canvas (docs/features/dive-v1.md "Shared map"). The server
// (GET /api/learn/boards/shared/<token>/holes) already left out every hole this viewer may not open; this shapes its
// answer for DiveNavigator and the hole portals, every level a page of its own (its /b/ link). Pure, so it is tested.
// Nothing to show (no level above, no hole below): no map, as a canvas without holes reads today.
export function sharedTree(map) {
  if (!map?.path?.length || (map.path.length < 2 && !map.children?.length)) return null;
  const children = map.children || [];
  return {
    // kind 'view': a level is opened, never renamed or deleted from here (DiveNavigator renames kind 'canvas' only).
    // holes: every hole under the top level the viewer may open (the title's menu, dive.js holeRows), named by their links.
    tree: { path: map.path.map(level => ({ app: level.href, board: 'main', title: level.title, kind: 'view', href: level.href })), children: children.map(child => ({ name: child.href, title: child.title })),
      holes: (map.holes || []).map(hole => ({ name: hole.href, title: hole.title, parent: hole.parent })) },
    portals: Object.fromEntries(children.map(child => [child.origin_block_id, { name: child.href, title: child.title, pending: false }])),
  };
}
