# The 3D studio

## Viewport shading

Like Blender, the top bar of the viewport has four views. Z cycles through them, and Shift + Z toggles wireframe.

| View | What you see |
|---|---|
| Wireframe | Every mesh as wires, in one shared wire material |
| Solid | Grey clay with the lamp rig, for judging shape |
| Material | The real materials with the lamp rig. "Reflections in Material view" adds the environment's reflections |
| Rendered | The final look: environment lighting, background, film tone mapping and the post-processing chain |

Each mesh keeps its own material, and the views swap materials per mesh. Switching never changes a material.

## The render pipeline (`studio/render.ts`)

Rendered view and final renders go through an `EffectComposer` on a half-float, 4x multisampled target:

1. `RenderPass`: the scene, lit by a prefiltered environment map (image-based lighting) and the shadow-casting key light.
2. `GTAOPass`: ground-truth ambient occlusion, which darkens creases and contact points (radius adjustable).
3. `BokehPass`: depth of field (focus distance and aperture), off by default.
4. `UnrealBloomPass`: glow on bright parts such as neon, screens and highlights (strength and threshold).
5. `OutputPass`: tone mapping (AgX, ACES filmic, Neutral or none) and conversion to sRGB.
6. `SMAAPass`: edge anti-aliasing.

Render quality sets the pixel ratio (Draft 0.75x to Ultra 2x or more) and the shadow map size (512 to 4096). Shadows are soft (PCF with a radius of 5) or sharp, or off.

F12 renders the current view at 2x through the pipeline and saves a PNG. The gizmo and grid are hidden for the render. Ctrl + F12 opens the export dialog for video. The PNG background can be transparent (Background: Transparent).

## Environments

| Id | Light |
|---|---|
| `studio` | Neutral photo studio |
| `softbox` | Large overhead softbox, for products |
| `sunset` | Warm low sun and purple sky |
| `golden` | Golden hour |
| `overcast` | Soft and even |
| `city` | City at night: cool ambient with warm points |
| `neon` | Pink and green neon |
| `addis` | Addis morning: blue sky and warm ground |

Each environment is a small three.js scene of emissive panels, prefiltered once with `PMREMGenerator` and cached per renderer. Any Radiance `.hdr` panorama up to 30 MB can also be the light and background (Lighting > Use an HDR panorama). Uploaded HDRs last until the tab closes and are not saved in the design.

## Materials (59)

Every material is a `MeshPhysicalMaterial` definition. The physical extras (clearcoat, transmission and IOR for glass and liquids, sheen for fabric, iridescence for foil, anisotropy for brushed metal, attenuation color for tinted glass) are set where they matter. Textured materials get procedural maps (color, normal and roughness) drawn from noise at 512 px and cached. No image files are downloaded.

| Group | Materials |
|---|---|
| Metal | Polished gold, Rose gold, Silver, Chrome, Brushed steel, Copper, Aged bronze, Hammered copper, Black anodized, Titanium, Birr coin brass |
| Paint and plastic | Car paint (green, red, blue), Pearl white, Glossy plastic, Matte plastic, Soft-touch plastic, Rubber |
| Glass and liquid | Clear glass, Frosted glass, Green bottle glass, Water, Honey (amber), Ice |
| Food | Coffee, Chocolate, Baked bread, Injera, Pink icing |
| Stone and ceramic | Glazed ceramic, Clay (jebena), White marble, Black marble, Granite, Terrazzo, Concrete, Brick, White tiles |
| Wood | Oak, Walnut, Bamboo, Cardboard, Paper |
| Fabric and leather | Leather, Black leather, Woven fabric, Velvet, Habesha cotton (tibeb) |
| Gem | Diamond, Emerald, Jade, Amber |
| Special | Holographic foil, Carbon fibre, Neon green, Neon pink, Phone screen (on), Matte clay (render check) |

Procedural texture kinds: wood, marble, brushed, carbon, leather, concrete, brick, tiles, fabric, hammered, granite, terrazzo, paper, bamboo, noise.

To use a material, pick it in the Materials tab (M), choose it from the inspector's Library material list, or set `material:` in a script. The object's color, metalness and roughness sliders then adjust that material. Choosing Custom returns to the plain sliders.

**Adding a material:** add an entry to `MATERIALS` in `studio/materials.ts` with a unique `id`, a category and the physical values. If it needs a new texture kind, add the kind to `TextureKind` and a height-field case in `heightField`. Then add the id to the script API reference (`apps/api/src/console/ai/script-api.ts`), so scripts and the AI can use it.

## Models (57)

Models are built in code from three.js primitives (rounded boxes, lathes, extrusions, tubes), so they scale cleanly and need no files. Screens, labels, banknotes and the globe get textures drawn on a canvas once and cached. Each model's main body takes the object's material. Fixed parts such as glass, screens and rubber feet use shared library materials. Each model has a default material in `DEFAULT_MATERIAL`.

| Group | Models |
|---|---|
| Tech | Smartphone, Laptop, Tablet, Smartwatch, Headphones, Card terminal (POS), Monitor, Smart speaker, Camera |
| Money | Coin stack, Birr note stack, Wallet, Piggy bank, Safe, Payment card, Gold bars, ATM, Calculator |
| Food and drink | Coffee cup and saucer, Jebena, Sini cups on a tray, Mesob basket, Injera platter, Donut, Burger, Bottle, Glass, Pizza, Ice cream cone, Cake, Teapot |
| Home and shop | Chair, Table, Sofa, Potted plant, Desk lamp, Gift box, Shopping cart, Shop kiosk, Delivery box, Delivery scooter, House, Tree |
| Decor and shapes | Rounded cube, Balloon, Rocket, Light bulb, Globe, Medal, Crown, Chess king, Chess pawn, Vase, Candle, Cloud, Mountains |
| Text | 3D text: any words, traced from the font on a canvas and extruded with a bevel |

There are also the earlier shapes and objects (bank card, birr coin, shield, podium, trophy, cube, sphere, cylinder, torus, cone, capsule, pyramid, gem, icosphere, torus knot, ring, plane, star, heart, arrow, map pin and others), and any glTF or GLB file up to 8 MB.

**Adding a model:** add `{ type, name, category }` to `MODEL_LIBRARY` and a `case` in `buildModel` in `studio/models.ts`. Build it about 2 units tall, standing on y = 0 of its group, and use the `body` material for the main surface. Set a default material in `DEFAULT_MATERIAL`, and add the type to the script API reference.

## Blender controls

The Blender mouse switch is on by default. Turn it off for the usual web controls (left drag orbits, right drag pans). "Emulate numpad" makes the number row work as the numpad, for laptops.

| Action | Keys |
|---|---|
| Orbit, pan, zoom | Middle drag, Shift + middle drag, wheel. Alt + left drag orbits without a middle button |
| Select | Left click |
| Grab, rotate, scale | G, R, S, then move the mouse. X, Y or Z locks to an axis; Shift + axis locks to the other two. Type a number for an exact amount (G X 2 moves 2 units along X). Click or Enter confirms; right click or Esc cancels |
| Views | Numpad 1, 3, 7: front, right, top. Ctrl + those: back, left, bottom. Numpad 5: perspective or orthographic. Numpad 0: reset the view. Numpad `.`: frame the selection. Home: frame everything |
| Add, duplicate, delete | Shift + A (searchable add menu at the mouse), Shift + D (duplicate and grab), X or Delete |
| Hide | H hides the selection; Alt + H shows everything; Shift + H hides everything else |
| Clear | Alt + G, Alt + R, Alt + S reset location, rotation or scale |
| Panels | N toggles the properties panel; T toggles the tool panel; Ctrl + Space toggles focus mode |
| Modes | Tab toggles sculpt mode; M opens the material library; Z and Shift + Z change the shading |
| Animation | Space plays; I inserts a keyframe; Alt + I deletes the keyframe on this frame; Left and Right step a frame; Shift + Left and Shift + Right jump to start and end; Up and Down jump to the next or previous keyframe |
| Render and files | F12 renders an image; Ctrl + F12 opens video export; F3 searches every command; Ctrl + Z and Ctrl + Shift + Z undo and redo; Ctrl + S saves; Ctrl + E exports |

The full list is in the shortcuts dialog (?), generated from `BLENDER_KEYMAP` in `studio/blender.ts`. The gizmo (the move, rotate and scale arrows) still works with the left mouse button.

**How modal transforms work:** `ModalTransform` stores the object's start transform and the mouse position. Every mouse move recomputes from the start position, so cancelling restores it exactly. A move along an axis projects the axis onto the screen and uses the mouse's travel along it. Rotation uses the angle around the object's screen position. Scale uses the ratio of distances from it. The status line is written straight to the overlay on every mouse move, without re-rendering React.
