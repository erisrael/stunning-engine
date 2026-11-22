# Creative Studio

The Creative Studio is the design tool inside the console. A business uses it to make flyers, social posts, menus, QR stands, short animated ads with music, and realistic 3D product shots. Everything it makes can be printed, posted or recorded as a video.

This folder is the full specification. It covers what the studio does, how each part is built, the saved document format, the security rules, and a plan for growing it into a larger product. Someone with this folder and the code should be able to extend the studio, or rebuild it on a bigger stack, without asking anyone.

| Document | What it covers |
|---|---|
| [Architecture](architecture.md) | Modules and files, data flow, state, undo and History, rendering, performance budgets, what runs where |
| [Document format](document-format.md) | The saved design (version 4): pages, layers, motion, sound, 3D scene, render settings, script; compatibility rules |
| [Motion, sound and video](motion-and-sound.md) | The After Effects-style timeline, keyframes and easing, presets, effects, the sound engine, music and SFX libraries, video and WAV export |
| [3D studio](3d-studio.md) | Shading modes, the render pipeline, the 59 materials, 8 environments and HDR, the 57 models, Blender keyboard and mouse controls |
| [Scripts and AI](scripts-and-ai.md) | The script API, the sandbox and its security, sample scripts, the AI assistant (Claude, ChatGPT, Gemini), keys, prompts, limits |
| [Roadmap for a larger studio](roadmap.md) | What to build next and how: WebGPU, server rendering, collaboration, asset storage, plugins, a marketplace |

## What it does today

**Opening it.** Creative Studio is in the console sidebar (`/app/creative-studio`). It uses the whole content area: the console's padding and width limit are removed on that page. The new-tab button in the studio header opens the same saved design at `/app/studio`. That page has no console frame and fills the browser window. Focus mode (F) also hides the browser chrome. Any studio URL with `?project=<id>` opens that design.

**2D design.** Pages (up to 40), text, shapes, badges, real QR codes, pictures, pen-tool paths, gradients, 38 templates in 17 sizes, brand kits, alignment, layers, and smart resize. Export: PNG, JPEG, WebP, SVG, multi-page PDF, the project file, WebM or MP4 video, and WAV sound.

**Motion (After Effects-style).** A timeline under the page: one lane per layer with in and out points, and keyframes per property (position, size, rotation, opacity, scale, blur, reveal, color, fill). There are 8 easings and 18 motion presets. Auto-key records keyframes as you drag or edit. Per-layer effects: blur, brightness, contrast, saturation, hue, glow and soft shadow.

**Sound.** Music and sound-effect tracks with clips you drag, trim, fade and set the volume of; a 33-sound effect library and 8 music beds made in the browser (no files to license); your own audio uploads. The mix plays with the timeline and goes into the video.

**3D.** 57 realistic models (phones, coins, a jebena, a mesob, an injera platter, furniture, 3D text and more) and 59 physical materials with procedural textures: wood grain, marble, brushed metal, leather, fabric, carbon fibre and others. The Rendered view uses image-based lighting from 8 studio environments or your own HDR panorama, with ambient occlusion, bloom, depth of field and film tone mapping (AgX, ACES). There are Blender keyboard and mouse controls, keyframe animation, and exports to PNG, JPEG, WebM or MP4 (with the sound mix), GLB and glTF.

**History.** A History tab lists every step by name ("Move "Pay with any bank"", "Material Coin stack", "Add sound"), like Photoshop's History panel. Click any step to go back to it. Making a change from an earlier step replaces the steps after it. Undo and redo (Ctrl Z, Ctrl Shift Z) walk the same list. Saved versions on the server (the clock button) are separate. They are full copies kept every ten minutes, so you can restore one after closing the tab.

**Scripts.** A script editor runs JavaScript that builds or changes the design: layers, keyframes, sounds, pages and 3D objects. It comes with 14 sample scripts (ads, menus, kinetic type, a 3-page event poster, 3D hero shots) that you can edit and run. Scripts run in a locked sandbox and each run is one undo step.

**AI.** An admin connects Claude, ChatGPT or Gemini with the organization's own API key. Anyone in the studio can then ask for a design, an animation, a 3D scene, a script, copy, or advice. The AI answers with a script, and you read it, then run it or edit it first.

**Search.** F3 opens a search over every command: about 120 entries, including every model, motion preset and sample script.

## Phones and tablets

The studio adapts below 1024 px wide (tablets) and below 640 px (phones):

- The tool panel opens over the canvas from the tool strip, and a tap on the canvas closes it.
- The inspector (Properties, History, AI, Script) floats over the right side on a tablet and is a bottom sheet on a phone. On both, the **Properties** button in the top bar opens it for the selected layer.
- On a phone the File, Edit, Add, Transform, View and Render menus are hidden; the command search (the magnifier, or F3) runs every one of them. The top bar's buttons scroll sideways.
- Both panels start closed and the page is fitted to the screen when the studio opens or the page size changes.
- Touch: tap a layer to select it and drag to move it; one finger on the empty canvas scrolls; two fingers pinch to zoom the page (a pinch never moves a layer). The resize and rotate handles take a finger-sized touch around them. In 3D, one finger orbits, two fingers zoom and pan.

## Where the code is

| Path | Role |
|---|---|
| `apps/web/src/pages/design-builder.tsx` | The studio page: state, the 2D canvas, the 3D viewport, panels, menus, export |
| `apps/web/src/pages/studio-library.ts` | Templates, sizes, the 2D renderer (`drawDesignTo`), SVG and PDF export, extra 3D shapes, 3D animation presets |
| `apps/web/src/studio/motion.ts` | Keyframes, easing, sampling a layer at a time, motion presets, effects to CSS filters |
| `apps/web/src/studio/timeline.tsx` | The timeline panel: layers, keyframes, sound tracks, clip editing, the inspector |
| `apps/web/src/studio/audio.ts` | The sound engine: synthesized SFX and music, decoding uploads, playback, mixdown, WAV, peaks |
| `apps/web/src/studio/video.ts` | Recording the 2D animation with its sound to WebM or MP4 |
| `apps/web/src/studio/materials.ts` | The material library, procedural textures, environments, HDR loading |
| `apps/web/src/studio/models.ts` | The model library: procedural models, drawn screen and label textures, 3D text |
| `apps/web/src/studio/render.ts` | Render settings and the post-processing pipeline |
| `apps/web/src/studio/blender.ts` | Modal grab, rotate and scale; numpad views; the Blender keymap list |
| `apps/web/src/studio/script.ts` | Running scripts in the sandbox, checking and applying their operations, the sample scripts |
| `apps/web/src/studio/panels.tsx` | History, command search, Shift A add menu, material library, render panel, script editor, AI assistant |
| `apps/web/src/components/builder-kit.tsx` | Shared builder pieces: snapshot history with named steps, autosave, focus mode, shortcuts, export dialog |
| `apps/api/src/console/creative-ai.ts`, `apps/api/src/console/ai/` | AI provider settings and generation (Anthropic SDK, OpenAI and Gemini over HTTPS) |
| `apps/api/src/console/ai/script-api.ts` | The script API reference, shared by the AI prompt and the script editor |
| `apps/api/src/studio-sandbox.ts` | The sandbox page that runs scripts |
| `database/052_*.sql`, `database/054_creative_ai.sql` | Saved designs and versions; AI providers and the AI run log |
| `tests/e2e/creative-ai.test.mjs` | AI keys, generation with each provider, run logging, sandbox headers |
