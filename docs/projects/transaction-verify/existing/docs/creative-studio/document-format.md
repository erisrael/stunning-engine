# Creative Studio document format (version 4)

A design is one JSON document, stored in `creative_projects.document` and in each saved version. The studio writes version 4. It reads versions 1 to 4: a field that is missing takes its default, so an old design opens unchanged.

```jsonc
{
  "version": 4,
  // The first page, also kept here so readers of version 1 still see it.
  "canvas": { "width": 1080, "height": 1080, "bg": "#0b1020", "gradient": { "from": "#06120b", "to": "#15803d", "angle": 135 } | null, "preset": "custom" },
  "elements": [ /* the first page's layers */ ],
  "pages": [ { "id": "page-1", "name": "Page 1", "bg": "#0b1020", "gradient": null, "elements": [ /* layers */ ] } ],
  "scene": {
    "objects": [ /* 3D objects */ ],
    "lightPreset": "studio", "keyLightIntensity": 2.2, "ambientIntensity": 0.8, "rimLightIntensity": 1.2,
    "fps": 30, "loopRange": { "start": 0, "end": 120 }, "renderQuality": "standard", "realistic": true
  },
  "motion": { "duration": 8, "fps": 30 },
  "audio": { "tracks": [ /* tracks */ ], "clips": [ /* clips */ ] },
  "render": { /* render settings */ },
  "script": "studio.size(1080, 1080); ..."
}
```

## Layer (`CanvasElement2D`)

| Field | Type | Notes |
|---|---|---|
| `id` | string | Unique in the page |
| `type` | `text`, `image`, `shape`, `qr`, `badge`, `path` | |
| `x`, `y`, `width`, `height` | number | Canvas pixels from the top left |
| `rotation` | number | Degrees |
| `opacity` | 0 to 1 | |
| `locked`, `visible` | boolean | |
| `name` | string | Shown in Layers, the timeline and History |
| `content`, `fontFamily`, `fontSize`, `fontWeight`, `color`, `align`, `letterSpacing`, `lineHeight`, `textShadow` | | Text and badges |
| `shapeType` | `rect`, `rounded-rect`, `circle`, `star`, `ribbon`, `divider` | Shapes |
| `fill`, `borderColor`, `borderWidth`, `borderRadius`, `boxShadow`, `gradient` | | Shapes, badges, paths |
| `src` | data URL | Pictures |
| `qrUrl`, `qrFgColor`, `qrBgColor`, `qrLabel` | | QR codes |
| `points`, `closed`, `smooth` | | Pen paths; points from 0 to 1 inside the box |
| `animation` | `none`, `fade`, `slide-up`, `zoom`, `pulse`, `float`, `spin` | Older CSS animation, shown when the timeline is closed |
| `motion` | `LayerMotion` | Keyframes, see below |
| `effects` | `Effects` | See below |

### `LayerMotion`

```jsonc
{
  "in": 0.5,              // optional: hidden before this time (seconds)
  "out": 6,               // optional: hidden after this time
  "tracks": {
    "x":       [ { "t": 0, "v": -400, "e": "out" }, { "t": 0.8, "v": 90 } ],
    "opacity": [ { "t": 0, "v": 0 }, { "t": 0.5, "v": 1, "e": "inOut" } ],
    "color":   [ { "t": 1, "v": "#ffffff" }, { "t": 2, "v": "#facc15" } ]
  }
}
```

- Properties: `x`, `y`, `width`, `height`, `rotation`, `opacity`, `scale` (around the center; scales the font too), `blur` (pixels), `reveal` (0 to 1: types text out letter by letter, and wipes other layers on from the left), `color`, `fill` (hex, blended in RGB).
- A key's `e` is the easing from that key to the next: `linear` (default), `in`, `out`, `inOut`, `back`, `elastic`, `bounce`, `step`.
- Before the first key the property holds the first key's value; after the last, the last key's value.
- A property without a track keeps the layer's own value.

### `Effects`

| Field | Unit | Default |
|---|---|---|
| `blur` | px | 0 |
| `brightness`, `contrast`, `saturate` | percent | 100 |
| `hue` | degrees | 0 |
| `glow`, `glowSize` | hex color, px | none, 16 |
| `shadow`, `shadowSize` | hex color (alpha allowed), px | none, 16 |

The same CSS filter string (`filterOf`) is used on screen and in canvas exports, so they match.

## Sound

```jsonc
{
  "tracks": [
    { "id": "music", "name": "Music", "volume": 0.8, "muted": false, "solo": false },
    { "id": "sfx", "name": "Sound effects", "volume": 1 },
    { "id": "voice", "name": "Voice and uploads", "volume": 1 }
  ],
  "clips": [
    {
      "id": "clip-...", "track": "music",
      "source": { "kind": "music", "id": "ethio-groove" } | { "kind": "sfx", "id": "whoosh" } | { "kind": "file", "dataUrl": "data:audio/mpeg;base64,..." },
      "name": "Ethio groove",
      "start": 0, "offset": 0, "duration": 8,   // seconds: where it starts, where in the source, how long
      "volume": 0.7, "fadeIn": 0, "fadeOut": 1
    }
  ]
}
```

Music clips loop to fill their duration. Uploads are limited to 8 MB a file.

## 3D object (`SceneObject3D`)

| Field | Notes |
|---|---|
| `id`, `name`, `type` | `type` is a model id (see [3D studio](3d-studio.md)), a simple shape, `text3d` or `model` |
| `src` | glTF or GLB as a data URL, for `type: "model"` |
| `position`, `rotation`, `scale` | `[x, y, z]`; rotation in radians. The floor is at y = -1.25 |
| `materialId` | A library material. When set, `color`, `metalness`, `roughness`, `emissive*` and `opacity` adjust it |
| `color`, `metalness`, `roughness`, `clearcoat`, `transmission`, `emissive`, `emissiveIntensity`, `opacity`, `flatShading`, `wireframe` | The material's settings when there is no `materialId`, and adjustments when there is |
| `text` | The words of a `text3d` object |
| `visible`, `locked` | |
| `keyframes` | `[{ frame, position, rotation, scale, color }]`, linear between keys |

## Render settings

| Field | Values | Default |
|---|---|---|
| `environment` | `studio`, `softbox`, `sunset`, `golden`, `overcast`, `city`, `neon`, `addis` (an HDR upload is not saved; it falls back to `studio`) | `studio` |
| `background` | `environment`, `color`, `transparent` | `color` |
| `backgroundColor`, `backgroundBlur` | hex, 0 to 1 | `#111214`, 0.35 |
| `envIntensity`, `exposure`, `envRotation` | numbers; rotation in degrees | 1, 1, 0 |
| `toneMap` | `agx`, `aces`, `neutral`, `none` | `agx` |
| `ao`, `aoRadius` | ambient occlusion | on, 0.5 |
| `bloom`, `bloomThreshold` | strength, threshold | 0.35, 0.85 |
| `dof`, `focus`, `aperture` | depth of field | off, 5, 0.6 |
| `shadows` | `off`, `soft`, `sharp` | `soft` |

## Compatibility rules

1. Only add fields. Never rename or reuse a field with a new meaning; bump `version` when a reader must behave differently.
2. Every reader takes a missing field as its default. `applyDoc` in `design-builder.tsx` is the reference reader.
3. Keep `canvas` and `elements` (the first page) for version 1 readers, such as the template thumbnails.
4. Validate on the way in: `applyDoc` clamps the timeline (duration up to 300 s, fps from a fixed list). Scripts go through `applyOps`, which checks every value.
