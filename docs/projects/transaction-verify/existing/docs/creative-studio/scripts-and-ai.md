# Scripts and the AI assistant

## Scripts

The Script tab holds the design's script, a plain JavaScript program that builds or changes the design. It is saved with the design. Run it with the Run button or Ctrl + Enter. A run is one undo step and shows a summary ("7 new layers, 8 keyframes, 5 sounds") and the script's `studio.log` output.

The full API is in `apps/api/src/console/ai/script-api.ts` (the API button in the editor shows it). In short:

| Object | Use |
|---|---|
| `studio.size`, `background`, `gradient`, `duration`, `fps`, `page` | The canvas, the timeline and new pages |
| `studio.brand`, `layers`, `selected`, `width`, `height` | Read the brand kit and the open page |
| `studio.text`, `shape`, `badge`, `qr`, `path`, `image`, `layer(id)` | Make or get layers. Each returns a handle |
| `layer.set`, `animate`, `preset`, `show`, `effects` | Change a layer, keyframe it, use a motion preset, set in and out points, add effects |
| `studio.sfx(id, time)`, `studio.music(id, {...})` | Add sound |
| `scene3d.environment`, `clear`, `add`, `object`, `camera` | Build the 3D scene |
| `object.set`, `key`, `preset` | Change, keyframe and animate 3D objects |
| `studio.random(seed)`, `studio.log` | Repeatable randomness and the console |

### Sample scripts (14)

Open them from the "Open a sample" list or with F3. Each one is ready to run and meant to be edited.

| Sample | What it makes |
|---|---|
| Pay with any bank (square ad) | Gradient, headline, bank badge, QR code, presets, music and effects |
| Flash sale (story) | 1080 x 1920 sale story with a countdown feel, shake and pulse |
| Coffee shop menu reveal | A menu that staggers in, with lo-fi music |
| Kinetic typography (wide) | Words that slam, slide and scale in time with drum hits |
| Logo reveal | Shapes that converge, a wipe and a chime |
| Celebration confetti | 120 seeded confetti pieces falling, with a pop and a celebration bed |
| Free delivery promo | A scooter path, a price pop and a cash-register sound |
| Event poster (3 pages) | Three pages from one script with `studio.page` |
| Lower third (video overlay) | A transparent-friendly name bar that slides in and out |
| Brand sheet from the brand kit | Swatches and type samples from `studio.brand` |
| Animate my layers (stagger) | Animates the layers already on the page, one after another |
| 3D: gold coin hero shot | Coin stack, gold bars and a medal on a podium, softbox light, a camera move |
| 3D: Ethiopian coffee ceremony | Jebena, sini cups, mesob and injera, golden hour |
| 3D: phone and card terminal (neon) | Phone, POS terminal and card in neon light, floating |

### The sandbox

A script never runs in the studio page. `runScript` creates a hidden `<iframe src="/studio-sandbox">` for each run, posts it `{ id, code, input }`, and waits for `{ id, ok, error, ops, logs }`. Then it removes the frame.

| Protection | How |
|---|---|
| No access to the console, cookies or storage | CSP `sandbox allow-scripts` (no `allow-same-origin`), so the frame has an opaque origin |
| No network | CSP `default-src 'none'`: no fetch, images, fonts or frames |
| Only the runner script | `script-src 'sha256-...' 'unsafe-eval'`: the runner's own hash, plus eval for the user's code. Nothing else can load |
| Only the studio can frame it | `frame-ancestors 'self'` and `X-Frame-Options: SAMEORIGIN` |
| Runaway scripts | The studio removes the frame after 4 seconds; at most 5000 operations |
| Bad output | The script cannot touch the design directly. It returns a list of operations, and `applyOps` in `studio/script.ts` checks each one: colors must be hex, images must be `data:image/...`, numbers are clamped, shapes, presets, sounds, models and materials must be known ids. Unknown operations are skipped |

The studio page itself keeps its strict CSP (`script-src 'self'`, no eval). Only the sandbox allows eval, and it has nothing worth stealing.

**Changing the API:** the API has three parts that must stay in step: the runner (`SANDBOX_RUNNER` in `apps/api/src/studio-sandbox.ts`), the checker (`applyOps` in `apps/web/src/studio/script.ts`) and the reference (`script-api.ts`). The CSP hash is computed from the runner when the server starts, so editing the runner needs no manual hash update.

## The AI assistant

The AI tab sends a request plus a summary of the design to the organization's connected provider, and shows the answer.

| Task | Answer |
|---|---|
| Design | A script that builds the design. Run it, or open it in the editor first |
| Animate | A script that animates the existing layers and adds sound |
| 3D scene | A script that builds a 3D scene |
| Script | A script for a specific job, written against the current script |
| Copy | Up to 12 headline or text options; each can be added to the page |
| Advice | Plain text |

### Connecting a provider

An admin (Settings: manage) opens **Settings > AI**, or **Connect AI** in the studio's AI tab (the same page in a large dialog). There is one card per provider:

1. **API key.** *Get a key* opens the provider's key page (Claude Console, OpenAI platform, Google AI Studio). The key box hides or shows the key, pastes from the clipboard, and checks the format as you type: the provider's prefix (`sk-ant-`, `sk-`, `AIza`), no spaces, and a Claude key pasted on the ChatGPT card (or the other way round). A saved key shows only as `····` and its last four characters.
2. **Model.** *Load my account's models* asks the provider which models this key can use (`POST .../models`) and lists them newest first, with the context window, a *Recommended* mark and a *Retiring* mark for deprecated models. Embedding, audio, image, realtime and retired models are left out. Until then the card shows suggestions. Any other model ID can be typed.
3. **Test.** *Test only* checks the typed key and model without saving anything; *Connect and test* (or *Save and test*) saves, then checks the saved connection. The check runs on the server in three steps and shows each one with its time:
   - **API key**: the provider's model list answers with this key. A rejected key stops the check here (Gemini answers a bad key with HTTP 400, which counts as rejected).
   - **Model**: the chosen model is on the account's list (a warning, not a failure, when it is not listed: it may be an alias; a warning too when it is being retired).
   - **Reply**: the model answers a short prompt ("Reply with exactly the word OK").

The last check of a saved provider is kept (migration 057), so the card says *Working · 2 min ago*, *Last check failed* (with the reason) or *Not checked yet*.

| Provider | How it is called | Suggested models (November 2026) | Model list |
|---|---|---|---|
| Anthropic (Claude) | The official `@anthropic-ai/sdk`, streaming (`messages.stream(...).finalMessage()`), so long scripts do not time out. On Opus 5.5, Opus 5, Sonnet 5.5 and the Fable models, server-side fallback and effort `medium` are on | `claude-opus-5-5` (recommended), `claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-fable-5-2`, `claude-opus-5`, `claude-sonnet-5` | `client.models.list()` (Models API): display name, context window, lifecycle |
| OpenAI (ChatGPT) | HTTPS `POST /v1/responses` (the Responses API serves every current model; some are not on Chat Completions), `store: false` | `gpt-6.2-sol` (recommended), `gpt-6.2-astra`, `gpt-6.1-terra`, `gpt-6-luna`, `gpt-6.1-sol`, `gpt-5.5` | `GET /v1/models`, text models only |
| Google (Gemini) | HTTPS `generateContent`, key in the `x-goog-api-key` header (never in the URL) | `gemini-4-carbon` (recommended), `gemini-4-argon`, `gemini-4-hydrogen`, `gemini-3.8-flash`, `gemini-3.5-flash-lite` | `GET /v1beta/models`, models with `generateContent` |

The suggestions come from the providers' model pages in November 2026 (OpenAI marks `gpt-5`, `gpt-5-mini`, `gpt-4.1` and `o3` deprecated; Google retired Gemini 2.5 Pro and Flash on 20 October 2026). They are in `apps/api/src/console/ai/{anthropic,openai,gemini}.ts`; the account's own list is always the authority.

### Keys and privacy

- Keys are sealed with the organization's `SecretBox` (AES-256-GCM) in `creative_ai_providers.key_enc`, and listed in `SEALED_VALUES`, so key rotation re-seals them. Only the last four characters are stored in clear and shown.
- Only the server calls the providers. The browser never sees a key.
- What is sent: the request text and a summary of the design. That means sizes, layers with their text and positions (pictures replaced by "(picture)"), 3D objects without model files, sound clip names, brand colors and fonts, and, for the Script task, the current script. Context is capped at 300 KB and the request text at 8000 characters.
- Every run is logged in `creative_ai_runs`: provider, model, task, person, sizes, time taken, success, and the error. The text itself is not logged. The last 25 runs show under Connect AI.

### Limits

| Limit | Value |
|---|---|
| Per person | 30 requests in 10 minutes |
| Per organization | 500 requests a day |
| Key checks and model lists | 30 in 10 minutes per organization |
| Output | 32000 tokens for scripts, 8000 for copy and advice |

### Errors people see

| Situation | Message |
|---|---|
| No provider connected | "No AI provider is connected. An admin connects Claude, ChatGPT or Gemini under AI in the Creative Studio." |
| Key rejected | "{Provider} did not accept the API key. An admin can paste a new one under AI." |
| Unknown model | "{Provider} does not know this model." |
| Provider out of credit or rate limited | "{Provider} says the account is over its limit or out of credit." |
| Refused | "{Provider} declined this request. Rephrase it and try again." |

### API

| Method and path | Permission | Purpose |
|---|---|---|
| `GET /console/api/creative/ai` | any staff | Providers (with key hints and the last check), the catalog (suggested models, key page, key prefix), the last 25 runs |
| `PUT /console/api/creative/ai/:provider` | settings.manage | Connect or change: `{ model, apiKey?, enabled }` |
| `DELETE /console/api/creative/ai/:provider` | settings.manage | Disconnect and delete the key |
| `POST /console/api/creative/ai/:provider/models` | settings.manage | `{ apiKey? }`: the models this key (typed, or the saved one) can use: `{ models: [{ id, label, context, output, created, deprecated }], ms }` |
| `POST /console/api/creative/ai/:provider/test` | settings.manage | `{ apiKey?, model? }`: the three-step check; `{ ok, model, ms, steps: [{ id: key, model or reply, status: ok, warn, fail or skip, detail, ms }], models? }`. A check of the saved key and model is kept on the provider |
| `POST /console/api/creative/ai/generate` | any staff | `{ provider?, task, prompt, context }` gives `{ provider, model, ms, text, code? , options? }` |
| `GET /console/api/creative/script-api` | any staff | The script API reference text |
| `GET /studio-sandbox` | none | The sandbox page |
