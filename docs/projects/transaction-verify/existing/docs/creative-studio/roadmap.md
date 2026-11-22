# Roadmap for a larger Creative Studio

The studio works well for one person making a flyer, a short ad or a product shot. This page is the plan for growing it into a full design and motion product. Each phase lists what to build, how to build it, and how to know it is done. The phases are in a sensible order, but each one stands on its own.

## Phase 1: split the page and harden what exists

`design-builder.tsx` is about 5,700 lines in one component. Before adding much more:

1. **A document store.** Move the document into a store (Zustand, or `useSyncExternalStore` over a plain object) with actions such as `addLayer`, `setKey` and `applyScript`. Undo then records actions with their inverse instead of whole snapshots. That makes History cheap for large designs and lets History name steps exactly instead of by comparison.
2. **Split by module:** `Canvas2D`, `Viewport3D`, `Inspector2D`, `Inspector3D`, `Sidebar2D`, `Sidebar3D` and `Header`, each reading only the store slices it needs.
3. **Playback off React.** Drive the playhead from a ref and repaint only the canvas, not React, on every frame. This is needed for more than about 150 layers.
4. **Tests.** Unit tests for `motion.ts` (sampling, presets), `script.ts` (`applyOps` validation), `blender.ts` (modal maths), and `describeChange`. Add a browser test (Playwright) that opens `/app/studio`, runs each sample script and checks for page errors. The test script used during development (headless Chrome over the DevTools protocol) is a starting point.

Done when: no component is over 800 lines, every sample runs in a browser test, and a 500-layer design plays at 60 fps.

## Phase 2: assets in storage, not in the document

Pictures, audio uploads, glTF models and HDR panoramas are stored inside the document as data URLs today. That makes saves large and capped at 16 MB.

1. Add `creative_assets` (organization, kind, content type, size, sha256, storage key) and upload through the existing storage package, which stores files on local disk or on S3-compatible storage.
2. Documents keep `asset:<id>` references. The studio resolves them to signed URLs, and the CSP adds the storage origin to `img-src`, `media-src` and `connect-src`.
3. Deduplicate by sha256. Count asset bytes against the package's storage quota.
4. Save HDR environments as assets, so they survive a reload.

Done when: a design with ten 8 MB uploads saves in under a second and reopens with every asset.

## Phase 3: frame-exact video and a render farm

Real-time `MediaRecorder` capture is simple, but it depends on the tab staying in front and cannot go faster than real time.

1. **In the browser:** WebCodecs `VideoEncoder` (H.264 or VP9) plus `AudioEncoder`, muxed into MP4 with a small muxer such as mp4-muxer. Draw frame N, encode it with timestamp N/fps, repeat. This is frame exact and runs faster than real time where the GPU allows.
2. **On a server** (a worker queue, like the existing outbox): render 2D frames with the same `drawDesignTo` code on node-canvas or skia-canvas, and 3D frames with headless Chrome (WebGL through SwiftShader or a GPU node). Encode with ffmpeg and upload the result to storage. A job's status appears in the studio, with a notification when it is done.
3. Add presets for 9:16, 1:1 and 16:9 at 1080p and 4K, plus GIF and animated WebP.

Done when: a 60-second 4K video renders on the server while the browser is closed, and matches the browser preview frame for frame.

## Phase 4: deeper motion

- Bezier spatial paths for position, with handles drawn on the canvas.
- Graph editor: value and speed curves with Bezier handles per key.
- Parenting and null layers; precompositions (a group with its own timeline).
- Masks and track mattes (alpha and luma), shape layers with trim paths, and stroke animation.
- Text animators: per character, word or line, with offset, stagger and randomness.
- Expressions: a small, safe language evaluated per frame (wiggle, loopOut, time), run in the same sandbox model as scripts.
- Audio: beat detection for snapping keys to music, ducking under voice, recording a voice-over (needs `microphone=(self)` in the permissions policy), and royalty-free stock music through a licensed provider.

## Phase 5: 3D at production quality

- **WebGPU renderer** (three.js `WebGPURenderer` with the node material system), keeping WebGL as the fallback. This allows a real path tracer for final frames (three-gpu-pathtracer, or a TSL path tracer) with progressive refinement in the Rendered view.
- **Model sources:** import FBX, OBJ and USDZ (convert on the server to GLB with gltf-transform; compress with Draco or meshopt and KTX2 textures). A searchable library of licensed assets (Poly Haven for HDRIs and textures is CC0), stored as assets.
- **Materials:** image-based PBR texture sets (base color, normal, roughness, metalness, AO, height) with tiling and triplanar mapping, and a node editor for materials.
- **Lights and cameras:** area, spot and point lights; a camera object with focal length and aperture; camera paths along a curve.
- **Modeling:** edit mode with vertex, edge and face selection, extrude, bevel, loop cut, a modifier stack (subdivision, mirror, array, boolean), proper sculpt brushes with dynamic topology, and undo that covers sculpting.
- **Animation:** a graph editor shared with 2D, shape keys, bones for imported rigs, and baked physics (rigid body drops, cloth).

## Phase 6: collaboration and teams

- Real-time co-editing with a CRDT (Yjs) over WebSocket, with presence cursors and per-layer locks. History becomes per-person undo on a shared document.
- Comments pinned to a layer or a time on the timeline, with mentions, using the existing notifications.
- Brand control: locked brand kits, approved templates, and an approval step before a design is published or printed.
- Roles: designer, reviewer, viewer; share links with an expiry.

## Phase 7: AI as a co-designer

- Use tool calls instead of whole scripts. Give the model tools such as `add_layer`, `set_keyframes`, `add_object` and `render_preview`, run them as a short agent loop with the Anthropic SDK's tool runner, and show each step in History as the AI's own named step.
- Vision feedback: send a rendered preview back to the model ("is the text readable?") and let it fix its own work.
- Image generation and background removal through a connected image provider, stored as assets.
- Prompt caching for the long script reference (it is the same on every request), to cut cost and time.
- Per-organization budgets and a usage report next to billing.

## Phase 8: a platform

- **Plugins:** third-party panels and commands that run in the same kind of sandbox as scripts and talk to the studio through a typed message API. They get capabilities only by permission, such as "read layers", "add layers" or "network to this origin".
- **Marketplace:** templates, scripts, materials and models from the platform and from partners, with review and revenue share through the existing billing.
- **Print and publishing:** CMYK PDF export with bleed and crop marks, a print-shop hand-off, and scheduled posting to social accounts.
- **Desktop app:** the same web app in Tauri or Electron for offline work and local GPU rendering.

## Principles to keep

1. **One renderer per output.** The canvas, exports and video share the same drawing code, so what you see is what you get.
2. **Scripts and plugins never run in the page.** They run in a sandbox, and every operation they return is checked.
3. **No external network from the page.** New origins are added to the CSP on purpose, one at a time.
4. **Everything is a named step in History.**
5. **Documents only grow.** Add fields, never repurpose them, and bump the version when readers must change.
