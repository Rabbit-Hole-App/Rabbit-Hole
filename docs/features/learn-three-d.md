# Interactive 3D lesson objects

Regular dev Learn supports one reusable `three-d-viewer` tldraw shape. The lesson agent emits validated `interactive_3d` JSON containing `id`, `concept`, `modelUrl`, optional description, camera, auto-rotation and animation settings. It cannot supply executable Three.js code. Use an actual asset URL from the learner or lesson context; missing assets require a URL, not an invented link.

## Interface and lifecycle

- Single-click selects the whiteboard shape; drag its header and resize its frame.
- Double-click the model or click **Interact** to orbit, zoom and pan. **Done**, Escape or clicking outside returns to whiteboard interaction.
- Animation clips are discovered from the asset. Play/pause and clip selection use the loaded names. No animation controls appear for a static model.
- Camera, animation selection/play state/time, size and placement live in serialized shape props. Semantic metadata and `getThreeDContext(editor, shapeId)` expose the live state for lesson questions.
- The existing personal graph store now also saves 3D viewers, scoped to browser/account/workspace/app. Reload restores them. This is browser-local persistence, not cross-device course publishing. Notes use the same shape utility.
- Three.js and its loader/controls are loaded only when a viewer mounts. Static scenes render on demand; animation/auto-rotation uses one frame scheduler, suspended when offscreen or the tab is hidden. Resize updates the renderer and camera aspect ratio. Unmount aborts downloads, cancels frames, disconnects observers, releases controls/mixer/GPU resources and closes texture image bitmaps.

## Assets and boundaries

The MVP accepts self-contained binary glTF 2.0 (`.glb`), up to 20 MB, hosted at a public HTTPS URL with browser CORS access. Downloads omit credentials and referrer. Headers and streamed bytes enforce the cap; inspection rejects external buffer/image dependencies and excessive declared scene complexity. Loader dependencies are restricted to embedded blob resources. Missing/invalid/unsupported models show a retry action without removing lesson content.

Blender can export a self-contained GLB and host it in asset storage, then pass its URL as `modelUrl`. The [scene-generation pipeline](learn-scene-generation.md) now supplies this path on regular dev, using a validated scene compiler and authenticated asset storage. Separate `.gltf` resources, compressed models requiring extra decoders, OBJ/FBX/STL and arbitrary scene scripts are outside this MVP.

## Verification

- [x] Schema validation, invalid URLs/cameras/code, GLB size/dependency/complexity limits.
- [x] Live context and shared-resource disposal tests.
- [x] Real GLB browser rendering and detected animation clips.
- [x] Orbit, zoom, right-drag pan, frame isolation, move and resize.
- [x] Animation play/pause, Escape, outside-click and state restoration.
- [x] Double-click and deletion/reload verification.
- [x] Real lesson-agent JSON generation.

56 focused tests passed. Browser checks use the freely available [Khronos Fox sample](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/Fox), with Survey/Walk/Run discovered from the file, not hardcoded into the product. Evidence: `.small/learn-three-d-check.json` and `.small/learn-three-d.png`. No video/model asset generation is needed for these tests.

Deployed and browser-verified on regular dev as `2b48ec7c-174b-41c7-8e00-f7e562ed979f` (2026-09-17). The full interaction test passed with no page errors, including double-click entry and deletion surviving reload. Testing caught tldraw's double-click fallback creating a text shape: the shape utility now returns a handled shape change so the viewer retains selection. Controls were placed clear of the existing whiteboard toolbars.

One real Claude explanation produced `interactive_3d` JSON and passed review on its first pass. The model rendered with autoplay enabled. The test initially expected a Play button, but the correct label was Pause; its expectation was corrected and the saved plan reused without another model call. Evidence: `.small/learn-three-d-real.json` and `.small/learn-three-d-real.png`.

Sources: [GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html), [OrbitControls](https://threejs.org/docs/pages/OrbitControls.html).
