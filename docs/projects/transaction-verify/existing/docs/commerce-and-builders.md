# Storefront, QR stands, branches and the builders

What organizations use to sell and to design, and how it fits the verification pipeline. Migrations 049 to 052.

## Branches and purposes (migration 049)

A **branch** has a kind (shop, restaurant, office, warehouse, campus, clinic, kiosk, online), phone and email, a place (city, area, landmark, map point), a manager, opening hours per weekday, the receiving accounts it is paid into, and whether it takes storefront orders. Its detail view shows the people limited to it, its cashier terminals, its QR stands and the last 14 days of accepted payments. With exactly one receiving account, the branch's cashier bills and orders go to it.

A **purpose** adds a description, the branches it applies to (empty: all), a validity window, installments (a fixed amount paid in up to 24 equal parts; the last part takes the remainder santim), VAT (none, included, added, with its rate), a reference prefix, and the payer details the counter and pay stands ask for. The cashier refuses a purpose outside its window (`purpose_closed`) or at another branch (`purpose_not_here`), and accepts the full amount or one installment.

## QR stands (migration 050)

A stand is a printed QR whose code opens `/q/<code>` on this deployment. What it opens is decided at scan time, so a stand is printed once:

| Opens | When scanned |
|---|---|
| Menu | The storefront, with the stand's branch and table filled in |
| The bill | The bill a cashier last put on it (Cashier, bill, "Show on `<stand>`"), for 30 minutes while it is open; otherwise the payer is asked to wait and the page checks again by itself |
| A purpose | The payer gives the amount (or it is fixed, or one installment) and their details, and the payment page opens |

Stands are drawn as SVG at their real size in millimetres (eight formats from an 80 mm sticker to A4), downloaded as SVG or PNG at 150, 300 or 600 dpi, and printed on A4 sheets with cut lines, one or many at a time. Table stands can be made in bulk. Scans are counted per day (30-day chart). A pay stand is limited to 20 payments per phone per 10 minutes.

## Storefront commerce (migration 051)

The storefront belongs to organizations on the Storefront & Menu Ordering package (and Enterprise); the platform can switch it on for others with an override of `flag.storefront`. Without it, the public store answers 404 and writes are refused with `feature_unavailable`.

- **Prices are the server's.** Variants and modifiers are priced from the catalog; what the browser sends as a price is ignored. Quantities are whole, or up to three decimals for items sold by weight or measure.
- **Stock** is held per item, variant and branch, with every movement kept (received, sold, returned, counted, wasted, moved). Ordering checks availability; a paid order takes its stock once (`settleStoreOrders`, run by the worker each minute and on reading orders); cancelling or refunding a paid order returns it.
- **Delivery zones** have a fee, free-above amount, minimum order and time. **Promotion codes** give a percent, an amount or free delivery, with a minimum, a use limit and dates; a code's use is counted in the order's transaction.
- **Orders** move pending, paid, confirmed, preparing, ready, out for delivery, delivered or completed, or cancelled or refunded; only forward. Each step is on the order's timeline. Staff may mark a pending order paid for cash, which is recorded as not verified. The payer follows the order at `/track/<token>`, which offers the payment page while unpaid, shows the rider when out for delivery and digital downloads once paid.
- **Customers** are kept by phone with their paid orders and spending.
- **Industry modules** (restaurant, school, pharmacy, supermarket, services, digital) switch on what each kind of business needs: table ordering, student IDs, prescriptions, weight pricing, appointments, downloads.

The payment request of an order uses the purpose `restaurant_bill`, `course_fee` or `order` by industry, and the catalog's purpose (or the branch) decides the receiving account.

### Look and feel

The builder's **Look and feel** starts from one of eight themes (Addis Night, Habesha, Coffee House, Fresh Market, Boutique, Tech Store, Midnight Gold, Clean Minimal), then any part can be changed: brand, accent, background and text colors (text follows the background by default), typography (sans, rounded, serif, display, mono), layout (grid, list, or a menu grouped by category), columns on a computer, corners, cards (flat, outlined, raised), buttons (solid, outline, pill), photo shape (square, tall, wide), spacing, and a logo.

For shoppers: a search box, category buttons, sorting (featured, price, name), badges (a sale percentage from the compare-at price, New and Popular from the item's tags, few left and sold out from stock), a share button, and a **Find us** bar with the address, phone, the store's Telegram bot, a Telegram channel, WhatsApp, Instagram, TikTok, Facebook and a website. Each can be switched off.

The server keeps only these fields, checked (`apps/api/src/console/storefront-theme.ts`): colors `#rrggbb`, pictures `https` only, short texts without angle brackets, known choices. The public store reads the theme the same way, so an older saved theme is cleaned too. The store page has its own security policy: Telegram's Mini App script, `https` pictures, and framing by Telegram Web.

### Telegram (migration 058)

**Storefront, Business & Telegram settings, Telegram** connects the store's own bot in one step:

1. Make a bot with @BotFather (`/newbot`) and copy its token.
2. Paste the token and Connect. The server checks it with Telegram (`getMe`), refuses a bot already connected to another store, points the bot's webhook at `/telegram/webhook/<organization id>` with a random secret, and sets the bot's menu button (default *Open store*) to open the store as a Telegram Mini App, its commands (`/start`, `/orders`) and descriptions. The token is sealed (`storefront_telegram.token_enc`, re-sealed by key rotation) and never shown again.
3. Open the owner link (`t.me/<bot>?start=owner_<code>`) on the phone that should get orders. That chat gets a message for each new order (items, total, pickup or delivery, the customer) and another when it is paid. *Send a test* checks it; `/orders` in that chat gives today's orders; `/stop` stops them.

A customer who opens the store from the bot is identified by the Mini App's signed init data, checked on the server with the bot's token (Telegram's Web App data check, at most a day old); a user id the browser sends is ignored. That customer hears in Telegram when the order is paid and when its status changes, with a *Track the order* button. Each can be switched off.

Messages go through `storefront_telegram_outbox`, written in the same transaction as the order event (placed, paid by verification or by staff, status change) and sent at once by the API and every minute by the worker, each once; a blocked chat is not retried. Disconnect removes the webhook and the menu button and deletes the token.

| Method and path | Permission | Purpose |
|---|---|---|
| `GET /console/api/storefront/telegram` | any staff | The bot, the owner chat, the links, settings, messages waiting |
| `POST /console/api/storefront/telegram` | settings.manage | `{ token, menuText?, welcome? }`: connect |
| `PUT /console/api/storefront/telegram` | settings.manage | `{ menuText?, welcome?, notifyOrders?, notifyCustomers? }` |
| `POST /console/api/storefront/telegram/test` | settings.manage | A test message to the owner chat |
| `DELETE /console/api/storefront/telegram` | settings.manage | Disconnect |
| `POST /telegram/webhook/:organizationId` | Telegram's secret header | Telegram's updates for this store's bot |

### Shoppers, the MySeed Shop app, landing pages, vouchers, memberships and auctions

See [storefront-marketplace.md](storefront-marketplace.md) (migration 059).

## Builders

The **builder kit** (`apps/web/src/components/builder-kit.tsx`) is shared by the Creative Studio and the landing-page builder: undo and redo by snapshots of the builder's whole document (a drag is one step), focus mode (full screen, Esc to leave), keyboard shortcuts (press ? for the list), autosave with a warning before leaving unsaved work, layers with drag to reorder, zoom, an export dialog and color palettes.

The **Creative Studio** saves designs on the server (Open, Save, autosave, version history: one version at most every ten minutes, the last 30, migration 052). The 2D editor draws real QR codes, gradients, stars and ribbons, pictures from the device, alignment, opacity, rotation and element animations; it exports PNG, JPEG and WebP at 1x to 4x (transparent where the format allows), SVG, PDF and the project file, from one renderer so the export matches the canvas. The template marketplace has 38 complete layouts in 17 sizes (print, social, web, brand), and the platform can publish a design as a template. The 3D studio adds 16 models, glTF and GLB import, physical materials, render quality (draft to ultra), realistic reflections, an animation library (spin, float, bounce, pulse, pop, slide, swing, flip, orbit, wobble, rise) and exports PNG, JPEG, WebM or MP4 video of the timeline, GLB and glTF.

Since migration 054 the studio also has an After Effects-style timeline (keyframes, easing, 18 motion presets, effects), a music and sound-effect editor, WebM and MP4 video with sound, 57 realistic models, 59 physical materials, a Rendered view with environment lighting and post-processing, Blender keyboard and mouse controls, a History panel, a script editor with 14 samples, and an AI assistant that uses the organization's own Claude, ChatGPT or Gemini key. It opens full screen in its own tab at `/app/studio`. The full specification is in [Creative Studio](creative-studio/README.md).

**Pages, pen tool and brand kits (migration 053).** A 2D design can have up to 40 pages of the same size: the page strip under the canvas opens, adds, duplicates, reorders, renames (double-click) and deletes pages, undo covers page changes, and PDF export prints every page into one file (the image and SVG exports take the open page). The document keeps `pages`, and still keeps the first page in `canvas` and `elements` for older readers. The pen tool (P, or Shapes, Pen tool) draws a path: click to add points, click the first point to close it into a filled shape, Enter or double-click to finish, Backspace to remove the last point, Esc to cancel. A path has fill, stroke color and width, open or closed, and straight or smooth curves (the curve passes through every point); double-click a path or use Edit points to drag points, add one or double-click one to remove it. Paths export to PNG, JPEG, WebP, SVG and PDF like every other layer. Brand kits (Brand tab) keep an organization's colors (up to 16), fonts (up to 6, the first for headings, the second for body text) and a logo (PNG, JPEG, WebP or SVG, at most 1 MB); a kit can be made from the open design, its colors and fonts apply to the selected layer, the logo goes on the page in one click, and Apply to this page recolors the page (its colors, most used first, become the kit's colors in order) and sets the kit's fonts. An organization keeps up to 20 kits (`/console/api/creative/brand-kits`).

The **landing-page builder** is for the platform's own website only.

## API documentation

`/docs/api` (public) and Developers, API documentation in the console are drawn from `/v1/openapi.json`: guides (quickstart, keys and tokens, the payment lifecycle, webhooks with signature checking, errors and idempotency, the sandbox references), every endpoint with resolved fields and examples in curl, Node and Python, the webhooks, the schemas and the reason codes with the payer's message.
