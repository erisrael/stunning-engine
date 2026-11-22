# Motion, sound and video

## The timeline

Open it with the film button in the studio header (2D design). It docks under the page.

| Area | What it does |
|---|---|
| Toolbar | Play and pause (Space), go to start, the time readout, length (1 to 120 s), frame rate (24, 25, 30, 50, 60), auto-key, motion presets for the selected layer, the SFX and music libraries, audio upload, zoom, Export video, close |
| Layer lanes | One lane per layer, top layer first. The bar is the layer's in and out points: drag the ends to trim, drag the middle to move the layer in time (its keys move too). Diamonds are keyframes |
| Property tracks | Expand a layer to see a track per animated property. Drag a diamond to retime it; click it to select it and change its value or easing, or delete it, in the inspector |
| Sound tracks | Music, Sound effects, and Voice and uploads. Clips show their waveform. Drag to move, drag the ends to trim, set volume and fades in the inspector. Tracks can be muted or soloed |
| Inspector | For a selected key: its value and easing. For a selected clip: volume, fade in, fade out, start, length, delete |

Click or drag on the ruler to move the playhead. While the timeline is open, the page shows the design at the playhead.

### Keyframing

- **Auto-key** (toggle in the toolbar): moving, resizing or rotating a layer, or changing its opacity or colors in the inspector, writes keyframes at the playhead for what changed.
- **Keyframe here** (Properties > Motion, or I in the timeline): keys position, size, rotation and opacity at the playhead. Alt + I removes the keys at the playhead.
- **Presets**: Properties > Motion, the timeline toolbar, or F3. A preset writes keys starting at the playhead and replaces that layer's keys for the same properties.
- **Keys:** Space plays, `,` and `.` step one frame, Home and End jump to the start and end.

### Motion presets (18)

| Kind | Presets |
|---|---|
| In | Fade in, Rise in, Drop in, Slide in from the left, Slide in from the right, Pop, Zoom in, Spin in, Bounce in, Focus in (blur to sharp), Wipe on |
| Text | Typewriter |
| Out | Fade out, Shrink away |
| Loop | Float, Pulse, Shake, Spin forever |

Easing: linear, ease in, ease out, ease in and out, back (overshoot), elastic, bounce, step (hold).

### Effects

Per layer, under Properties > Motion > Effects: blur, brightness, contrast, saturation, hue shift, glow (color and size) and soft shadow (color and size). Blur can also be animated (`blur` track), as Focus in does.

## The sound engine (`studio/audio.ts`)

All library sounds are synthesized with the Web Audio API in an `OfflineAudioContext`. There are no sound files to download or license. Each sound is rendered once and cached as an `AudioBuffer`.

**Sound effects (33)**

| Group | Sounds |
|---|---|
| Transitions | Whoosh, Swoosh up, Swoosh down, Riser, Down sweep |
| UI | Pop, Bubble, Click, Tap, Notification, Success, Error, Toggle |
| Money | Coin, Cash register, Payment confirmed, Coins pouring |
| Hits | Impact, Thud, Kick drum, Snare, Hi-hat, Clap |
| Musical | Ding, Chime, Krar pluck |
| Fun | Sparkle, Magic, Laser, Glitch, Typing, Camera shutter, Heartbeat |

**Music beds (8)**, generated as bars of drums, bass, chords and a lead from a seeded pattern, then looped:

| Id | Mood |
|---|---|
| `bright-pop` | Happy, for promotions |
| `corporate` | Confident, for banks and services |
| `ethio-groove` | Tizita scale in a 6/8 shuffle |
| `calm-ambient` | Soft pads, for menus and slow reveals |
| `lofi` | Warm and relaxed, for coffee shops |
| `tech-house` | Four on the floor, for tech and launches |
| `cinematic` | Big drums and drones, for reveals |
| `celebration` | Fast and festive, for holidays and sales |

**Uploads.** MP3, WAV, OGG, M4A and WebM up to 8 MB, decoded in the browser with `decodeAudioData`. The page's CSP blocks `fetch` of `data:` URLs, so `dataUrlBytes` decodes the base64 directly.

**Playback.** `playMix(doc, from)` schedules every clip on the shared `AudioContext` from a start time. Each clip gets its own gain stage (volume and fades), then the track's gain. It returns a stop function. Solo and mute follow the usual rule: when any track is soloed, only soloed tracks play.

**Mixdown.** `mixdown(doc, seconds)` renders the same graph in an `OfflineAudioContext` at 48 kHz stereo. That gives the exact mix for WAV export and the video's sound track.

## Video export (`studio/video.ts`)

Export > WebM video or MP4 video (MP4 where the browser can record it: Chrome and Edge, recent Safari).

1. The page is drawn with `drawDesignTo` onto an offscreen canvas at the chosen scale, rounded to even pixel sizes for the encoder.
2. `canvas.captureStream(fps)` plus the mixdown's audio track (played through a `MediaStreamAudioDestinationNode`) go to `MediaRecorder`.
3. Frames are drawn in real time with requestAnimationFrame, so recording takes as long as the animation. The header shows progress and a Stop button. The tab must stay in front, because background tabs slow their timers.
4. The bitrate scales with the frame size and frame rate, capped at 40 Mbit/s.

The 3D studio records its own viewport the same way (Export > WebM or MP4 in 3D), stepping the 3D timeline frame by frame, with the same sound mix.

WAV export writes the mixdown as 16-bit PCM.

## Limits and known gaps

- Recording is real time, not faster than real time. Frame-exact encoding with WebCodecs, or on a server with ffmpeg, is in the [roadmap](roadmap.md).
- Text reveal works by characters (typewriter). Word-by-word and per-line animators are not built yet.
- Motion paths are straight between keys (x and y are separate tracks). Bezier spatial paths are not built yet.
- There is no parenting (one layer following another) and no masks or track mattes yet.
