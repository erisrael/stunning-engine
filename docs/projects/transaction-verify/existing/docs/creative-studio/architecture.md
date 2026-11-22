# Creative Studio architecture

## Shape of the system

The studio is a browser application. The server stores designs, keeps AI keys sealed, calls the AI providers, and serves the script sandbox. Everything else runs on the user's device: drawing, 3D rendering, sound synthesis, mixing, video encoding and script execution.

```
 Browser (React 19, three.js 0.186, Web Audio, MediaRecorder)
 +---------------------------------------------------------------------------------+
 | design-builder.tsx  (one page component; owns the document state)               |
 |   2D canvas (DOM)  <- motion.ts sampleElement(t)                                 |
 |   3D viewport (WebGL) <- materials.ts, models.ts, render.ts pipeline, blender.ts |
 |   Timeline (timeline.tsx) <- audio.ts playMix, peaks                              |
 |   Side panels (panels.tsx): Properties, History, AI, Script                      |
 |   Export: studio-library.ts (PNG/SVG/PDF), video.ts (WebM/MP4), audio.ts (WAV)   |
 |   Script: script.ts -> hidden iframe /studio-sandbox -> ops -> applyOps          |
 +----------------------------|-------------------------|--------------------------+
                              | /console/api            | /studio-sandbox
 Server (Fastify)             v                         v
   /creative/projects (designs, versions)     sandbox page (own CSP, no data)
   /creative/brand-kits
   /creative/ai (keys sealed with SecretBox, run log, rate limits)
   /creative/ai/generate -> Anthropic SDK | OpenAI | Gemini
   /creative/script-api (the reference text)
```

The Creative Studio is its own JavaScript chunk, loaded only when the studio is opened. The rest of the console, and the cashier phones, never download three.js or the sound engine. The main bundle went from about 1.5 MB to 1 MB when the studio was split out.

## State

`DesignBuilderPage` owns the whole document in React state.

| State | What it is |
|---|---|
| `elements`, `canvasBg`, `canvasGradient` | The open page |
| `pages`, `pageIndex` | All pages. The open page's layers live in `elements` while it is open |
| `canvasWidth`, `canvasHeight`, `preset` | Page size (shared by all pages) |
| `motionSettings`, `motionTime`, `motionPlaying`, `autoKey` | 2D timeline length and frame rate, the playhead, playback |
| `audioDoc` | Sound tracks and clips |
| `sceneObjects`, light intensities, `fps`, `loopRange` | The 3D scene and its timeline |
| `renderSettings`, `renderQuality`, `realistic` | 3D render settings |
| `scriptCode` | The design's script |

Refs hold the three.js objects (scene, cameras, renderer, controls, meshes by object id, the post-processing pipeline). They also hold a few values that the render loop and event listeners read without being recreated (`shadingRef`, `cameraModeRef`, `selected3DRef`). A long-lived listener must read these refs, never state captured when it was created.

### Drawing at the playhead

When the timeline is open, playing or recording, the 2D canvas draws `displayElements`. That is every layer sampled at the playhead by `sampleElement(el, t)`. The layer being dragged or typed into is drawn unsampled, so it follows the mouse. Dragging starts from the sampled position, so nothing jumps. When auto-key is on, a drag or an inspector change writes keyframes at the playhead for the properties it changed.

## Undo, redo and History

`useSnapshotHistory` (builder-kit) keeps up to 100 JSON snapshots of `HistoryValue`: layers, page background and gradient, size, 3D objects, pages, sound and timeline length. A snapshot is taken when the value has stopped changing for 350 ms, so a drag is one step. Snapshots pause while dragging and while a video is recording.

Each snapshot carries a label from `describeChange(before, after)`. It compares the two documents and names the step: "Add Coin stack", "Move "Title"", "Keyframes Price", "Material Phone", "Edit sound", "Resize to 1080 x 1920", "Reorder layers". The History panel lists these labels with times. `goTo(i)` restores any step. Steps after the current one stay greyed until a new change replaces them.

Render settings, the script text and the camera are not in History. They are view and tool state, as in Photoshop and Blender. They are saved with the design.

## Rendering

**2D on screen.** DOM elements: text and shapes as styled divs, QR codes and paths as SVG. Effects map to CSS `filter`, and reveal maps to `clip-path`.

**2D export.** `drawDesignTo(ctx, doc, scale, transparent, images)` draws to a canvas. One drawing routine serves PNG, JPEG, WebP, PDF pages and every video frame, so an export matches the canvas.

**3D.** One `WebGLRenderer` with alpha, so a PNG can have a transparent background. Wireframe, Solid and Material views draw directly. The Rendered view draws through the `EffectComposer` chain in `render.ts`. A `ResizeObserver` keeps the renderer and the pipeline the size of the viewport as panels open and close.

**Shading without changing materials.** Each mesh remembers its own material in `userData.orig`. Solid view swaps in one shared clay material, and Wireframe swaps in one shared wire material. Switching views never edits a material, so a library material comes back exactly.

**Memory.** On every scene rebuild, each object's own material is disposed, along with its geometry. Shared library materials, cached text geometry (`userData.shared`) and imported glTF models (cached per file) are kept.

## Performance budgets

| Item | Budget |
|---|---|
| Studio chunk | Loaded on demand. three.js plus the studio is about 1.5 MB minified |
| Procedural textures | 512 px, made once per texture kind and cached |
| Environment maps | Made once per environment per renderer with PMREM, then cached |
| Model build | Synchronous, under 20 ms for the heaviest model on a mid laptop |
| Rendered view | GTAO, bloom and SMAA at the render quality's pixel ratio. Draft turns shadows down; pick Draft on slow machines |
| Timeline playback | requestAnimationFrame; one React render per frame. Fine to about 150 layers. See the roadmap for moving playback off React state |
| Script | 4 s timeout, at most 5000 operations |

## Saving

Autosave sends the whole document (version 4) to `PUT /creative/projects/:id` 3 seconds after the last change, when the design has been saved once. The request limit is 16 MB. Audio uploads are stored inside the document as data URLs (up to 8 MB a file), so a design with a few long uploads can hit the limit; see the roadmap (asset storage). The server keeps a version at most every ten minutes, and the last 30.

## Security

- The web app's CSP is `default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'`. The studio loads no external scripts, fonts, models or textures. Everything is generated in code or uploaded by the user.
- `data:` URLs cannot be fetched under this CSP, so uploaded audio is decoded directly from its data URL (`dataUrlBytes`).
- Scripts never run in the page. They run in `/studio-sandbox`, a sandboxed frame without same-origin. See [Scripts and AI](scripts-and-ai.md).
- AI keys are sealed with the organization's `SecretBox` and listed in `SEALED_VALUES`, so key rotation re-seals them. Only the last four characters are ever returned.
