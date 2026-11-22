# UI guidelines

These rules apply to the hosted submission page, the cashier app, the staff, partner and developer consoles, and the default UI that ships with the SDKs. They extend the visual direction in [product-ui.md](product-ui.md). Tokens and components live in `packages/ui`. Message texts live in `packages/messages`.

## Principles

| Principle | Rule |
|---|---|
| Amount and purpose first | Every payment screen opens with amount, currency, purpose, receiving account label and the integration's reference. |
| Say what happened, then what to do | Every non-success state shows a specific reason and one primary action. |
| One primary action | One filled brand button per view. Other actions are secondary or ghost. |
| Words carry meaning | A status is always a word. Color and line icons support it. No emoji. |
| Calm by default | Neutral surfaces, thin borders, one accent. Red only for a real failure. |
| Same reason, same words | The reason catalog drives the SDK, hosted page, cashier and console. |

## Color tokens

Brand tokens are set per tenant (see [Tenant theme](#tenant-theme-from-a-logo)). Status tokens never change, so a status looks the same for every organization.

| Token | Use | Light | Dark | Set by |
|---|---|---|---|---|
| `--bg` | Page background | `#F6F7F7` | `#0B0D0D` | Fixed |
| `--surface` | Cards, panels, inputs | `#FFFFFF` | `#141817` | Fixed |
| `--soft` | Table heads, hovers, chips | `#EFF2F1` | `#1B201F` | Fixed |
| `--ink` | Primary text | `#15191A` | `#EEF2F1` | Fixed |
| `--muted` | Secondary text | `#626B6A` | `#98A3A1` | Fixed |
| `--line` | Borders and dividers | `#E0E5E3` | `#262D2B` | Fixed |
| `--brand` | Primary button, selected tab, focus ring | `#05C78C` | `#2FD9A2` | Tenant |
| `--brand-ink` | Links, selected labels | `#04855E` | `#48E0AE` | Tenant |
| `--brand-soft` | Selected rows, highlights | `#E3F8F0` | `#0F2E24` | Tenant |
| `--on-brand` | Text on brand fill | `#05261B` | `#05261B` | Tenant |
| `--ok` | Accepted, completed | `#11845B` | `#4FD69E` | Fixed |
| `--warn` | Pending retry, needs review | `#A35A06` | `#F2A65E` | Fixed |
| `--bad` | Rejected, mismatch, already used | `#C2362B` | `#F08478` | Fixed |
| `--info` | Queued, processing | `#2F5FD0` | `#8EADF5` | Fixed |

The default brand is the Myseed green. Every surface supports light and dark, following the system setting with a manual override.

## Type

Font stack: Geist for Latin text, Noto Sans Ethiopic for Amharic in the same stack, Geist Mono for references and keys. Amounts use tabular figures.

| Role | Size / weight | Use |
|---|---|---|
| Display | 32 / 700 | Page title, one per screen |
| Title | 21 / 650 | Section titles |
| Heading | 15 / 600 | Card and dialog titles |
| Body | 14.5 / 400 | Running text, table cells |
| Small | 12.5 / 400 | Help text, metadata |
| Label | 11 mono / 500, uppercase | Table heads, eyebrows |
| Amount | Tabular, 600 | Money in every view |

## Space, shape and touch

- Spacing scale 4, 8, 12, 16, 24, 32, 48 px. Page gutter at least 16 px.
- Radius 8 small, 12 card, 999 pill. Tenants can choose Round, Soft or Sharp.
- Touch targets at least 44 px, 48 px on the cashier app.
- Running text 65 to 75 characters wide.
- Breakpoints: 640 px stacks rows, 900 px moves the side rail to a top bar, 1120 px maximum content width.

## Status language

| Word | Tone | Contract status |
|---|---|---|
| Queued, Checking | info | `queued`, `processing` |
| Pending retry | warn | `pending_retry` |
| Needs review | warn | `needs_review` |
| Rejected, Already used | bad | `rejected` |
| Accepted, Receipt issued | ok | `accepted` |
| Expired, Cancelled | neutral | request `expired`, `cancelled` |

## Components

| Component | Spec | Rule |
|---|---|---|
| Button | Primary (brand fill), secondary (outline), ghost, danger. Labels are verbs. | One primary per view. A disabled button explains why next to it. |
| Status pill | Word plus dot | Never color alone. Same word as the reason catalog. |
| Amount | `ETB 1,250.00`, tabular figures | Never round. Read minor units from decimal strings. |
| Reference | Mono text with a copy button | Copy shows "Copied" for 2 seconds. |
| Masked account | Bank name and "ending 4821" | Full numbers only for authorized staff on demand, audited. |
| Evidence input | Tabs: Upload receipt, Scan QR, Paste link | Keeps context while switching. Camera denial opens Upload. |
| Progress | Queued, Checking, Result, announced in a live region | Poll with backoff. The resume link stays visible. |
| Comparison | Submitted receipt beside provider evidence | Side by side when wide, stacked on phones. Unknown values say "Unconfirmed". |
| Table | Filters for status, date, branch, provider, purpose, reference | Exports follow the same permissions as the view. |
| Alert and toast | Alerts for states that need action, toasts for confirmations | A toast never holds the only copy of an error. |
| Empty state | What will appear and how to add the first item | No illustrations, mascots or emoji. |

## Writing

- Sentence case: "Verify payment".
- Active voice: "The provider confirmed ETB 1,000.00."
- No blame and no exclamation marks: "We could not read the reference."
- Name things the way users know them: "Receiving account", not "recipient policy".
- An error says how to fix it: "Upload a clearer receipt, scan the QR, or paste the official link."
- Messages come from the reason catalog in English and Amharic. See the feedback table in [product-ui.md](product-ui.md).

## Formats

| Item | Format |
|---|---|
| Money | `ETB 1,250.00` |
| Date and time | `5 November 2026, 2:34 PM EAT` |
| Short date | `5 Nov 2026` |
| Time zone | `Africa/Addis_Ababa` for staff; stored as `timestamptz` |
| Provider time and acceptance time | Two separate labeled rows |
| Account | `Bank of Abyssinia ending 4821` |

## Accessibility

Target WCAG 2.2 AA.

- Contrast 4.5:1 for text, 3:1 for large text, input borders and focus rings.
- Visible focus on every control. Submit, review and cashier flows work by keyboard alone.
- Status changes use `aria-live="polite"`. Errors are linked to their fields.
- Works at 200% zoom and 320 px width without horizontal scrolling.
- Respects reduced motion. Nothing flashes.
- Every camera feature has an upload alternative.

## Layout by surface

- **Hosted page:** single column, at most 480 px, summary block above the form.
- **Cashier:** large amount and bill number, one input at a time, the result fills the screen.
- **Console:** left rail, filters above the table, detail beside the table on wide screens.
- **Review:** evidence and checks side by side when wide, in reading order on phones.
- **Developer console:** a Sandbox or Live label next to every key, endpoint and payment.

## No-emoji rule

No emoji anywhere the product speaks: navigation, buttons, statuses, notifications, push, SMS, email, empty states, receipts, SDK defaults, documentation and screenshots. Emoji render differently on every device, read poorly in screen readers, and look out of place next to money.

| Instead of | Use |
|---|---|
| A check mark or party emoji for success | "Payment confirmed." with a check line icon and an ok pill |
| A warning sign emoji | "Needs review" with a warn pill |
| A cross mark emoji for failure | "Rejected" with the reason text |
| An hourglass emoji for waiting | "Checking payment with the provider." |
| A bell emoji in a push title | "3 payments need review" |

Icons come from one line set (Lucide, 1.5 px stroke, 16 or 20 px). An icon always sits next to a visible label, except standard controls with an accessible name (close, menu, copy, search). Decorative icons are `aria-hidden`.

Text entered by a tenant, such as an organization name, is displayed as typed, but system text around it never adds emoji, and onboarding warns when a name contains one.

Enforcement:

```ts
// packages/messages/scripts/check-no-emoji.ts (runs in CI and when catalogs load in development and test)
const EMOJI = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u{FE0F}\u{20E3}]/u;
for (const [key, text] of Object.entries(catalog)) {
  if (EMOJI.test(text)) throw new Error(`Emoji in message ${key}. Use words and a line icon.`);
}
```

CI runs the same pattern over source, message catalogs, email and SMS templates, and SDK defaults. The design review checklist includes this rule for every new screen and template.

## Tenant theme from a logo

Organization admins brand their console, cashier app, hosted page and installed PWA from their logo in **Organization > Branding**. Changes need an approver and are versioned.

1. The admin uploads a PNG, JPEG, SVG or WebP logo up to 2 MB. It is stored privately with the organization's other assets.
2. The logo is downsampled. Transparent, grey, near-white and near-black pixels are ignored, and the remaining pixels are grouped by hue and weighted by saturation. The strongest groups become suggested colors.
3. The admin picks a brand color or enters one. Tokens are derived:
   - `--brand` is the chosen color. In dark mode it is lightened to 50 to 62% lightness.
   - `--brand-ink` is the same hue darkened until it reaches 4.5:1 on white (light), or lightened to 4.5:1 on the dark surface (dark).
   - `--brand-soft` is a pale tint (94% lightness in light mode, 13% in dark mode).
   - `--on-brand` is white or a near-black of the same hue, whichever reads better on the brand fill.
4. Contrast checks run on every pair. A button label below 4.5:1 blocks approval.
5. A logo without a strong color keeps the Myseed green, and the screen says why.
6. Approval writes the theme record (logo key, brand color, generated tokens, contrast results, version, approver) and generates the PWA icons (192, 512 and maskable 512 with the logo inside the 80% safe zone) and the manifest `theme_color`.

Status tokens are never derived from the logo.

## Product themes: Myseed Verify and Kalon Transaction Verify

The UI guidelines, the Myseed theme and the no-emoji rule were approved on 10 November 2026 (decision log, item 16), with one change: the commercial product gets its own look.

| | Myseed Verify (internal, Myseed Academy) | Kalon Transaction Verify (commercial) |
|---|---|---|
| Brand | Myseed green `#05C78C`, hand-tuned tokens | Kalon violet `#6A4CE0` (dark mode `#755AE2`), white labels |
| Neutrals | Fixed neutrals above | Cooler blue-grey neutrals: background `#F7F7FB`, lines `#E5E4EF`, muted text `#62617A` (dark: `#0F0E15`, `#2D2C3A`, `#A3A2B8`) |
| Corners | Round (12 and 8 px) | Soft (8 and 6 px) |
| Density | Comfortable: 48 px controls, 18 px card padding | Compact: 40 px controls, 14 px card padding (touch targets stay at least 24 px) |
| Feel | Calm and roomy | In the style of modern work-management tools: a strong left sidebar with a filled active item, dense tables, colored status chips, quick actions in a top bar, command search |

Both use the same status colors, type, writing rules, accessibility rules and no-emoji rule. The tokens live in `packages/ui` (`PRODUCTS`, `productCss`) and are contrast-checked in its tests. The hosted page serves the product theme of its deployment: Kalon when `DEPLOYMENT=commercial`, Myseed otherwise, and `PRODUCT_THEME` overrides it. A tenant's logo theme replaces only the brand tokens inside the product theme. The Kalon look is a style direction; it uses no other company's name, logo or artwork.
