# UI rules: no emoji, Watermelon-style design system

Instructions for building the interface of a web project. Copy this file into the new project (as `AGENTS.md`, `CLAUDE.md`, or `docs/ui-rules.md` linked from one of them) and follow it for every UI change.

Extracted from the MySeed Academy codebase (`packages/ui`), where these rules produced the current site. Brand colors below are MySeed's; replace them with the new project's brand and keep everything else.

---

## Rule 1: No emoji, anywhere

Never use emoji or decorative Unicode symbols in:

- UI copy, labels, buttons, toasts, empty states, placeholders
- Translations and content seed data
- Code comments, log messages, commit messages, PR descriptions, docs, and READMEs
- Generated emails (invoices, receipts, notifications)

This includes check marks, crosses, stars, arrows used as decoration, sparkles, fire, rockets, bullets made of symbols, and flag or face emoji.

**Why:** emoji make a product look auto-generated and cheap. The target is a restrained, premium interface.

**Instead:**

- Need an icon? Use [`lucide-react`](https://lucide.dev) (UI icons) or [`react-icons/si`](https://react-icons.github.io/react-icons/icons/si/) (brand logos only, such as Telegram or the App Store).
- Need status? Use a `Badge` with a semantic variant (`success`, `warning`, `destructive`) or a small colored dot.
- Need emphasis? Use type weight, color tokens, or layout, not symbols.
- Lists use real `<ul>`/`<ol>` markup, never symbol bullets.

Icons are decorative by default: add `aria-hidden="true"`, and give icon-only buttons an `aria-label`.

### Emoji check before finishing any UI work

Add this script as `scripts/check-emoji.mjs` and run `node scripts/check-emoji.mjs` before you report UI work as done. It scans git-tracked source and docs and exits non-zero on a hit.

```js
// scripts/check-emoji.mjs: fails when emoji or decorative symbols appear in tracked files.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const EXT = /\.(tsx?|jsx?|mjs|cjs|json|md|mdx|css|html|ya?ml)$/;
const BAD = /[\p{Extended_Pictographic}\u2713\u2714\u2717\u2718\u2605\u2606\u2728\u27A1\u2B50\uFE0F]/u;

const files = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter((f) => EXT.test(f) && !f.includes('node_modules'));
let hits = 0;
for (const file of files) {
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    if (BAD.test(line)) {
      hits++;
      console.log(`${file}:${i + 1}: ${line.trim().slice(0, 120)}`);
    }
  });
}
if (hits) {
  console.error(`\n${hits} line(s) contain emoji or decorative symbols. Replace them with lucide icons or text.`);
  process.exit(1);
}
console.log('No emoji found.');
```

`\p{Extended_Pictographic}` also matches the copyright and trademark signs. If legal text needs them, exclude that file explicitly rather than weakening the pattern.

---

## Rule 2: Watermelon-style design system

The look is modelled on [ui.watermelon.sh](https://ui.watermelon.sh): calm neutral surfaces, one confident brand color, hairline borders made from shadows, generous whitespace, tight display type, and short, eased motion. It is built on shadcn-style primitives (Radix UI + Tailwind CSS + class-variance-authority).

### Principles

1. **One source of truth.** All primitives live in one first-party package or folder (for example `packages/ui` or `src/components/ui`). Apps import from it and never restyle primitives ad hoc. Do not copy third-party templates directly; adapt their patterns into your own components with your tokens.
2. **Tokens, not hex codes.** Colors are HSL CSS variables, switched for dark mode with a `.dark` class. Components use semantic classes (`bg-card`, `text-muted-foreground`, `border-border`), never raw palette values, except the brand and accent scales for deliberate brand moments.
3. **Restraint.** Neutral backgrounds, one primary color, one warm accent used sparingly, no gradients on surfaces (a subtle text gradient on hero headlines is the exception), no heavy borders, and no drop shadows darker than the tokens below.
4. **Depth from hairlines.** Cards and inputs get definition from a 1px shadow ring (`shadow-hairline`), not from `border` plus a big shadow. Elevation steps: `hairline` (resting), `elevated` (hover, featured), `floating` (popovers, dialogs).
5. **Accessible by default.** WCAG 2.2 AA contrast in both themes, visible focus rings, a keyboard path for everything, reduced motion respected, and touch targets of at least 40px.
6. **RTL-safe.** Use logical utilities (`ps-`, `pe-`, `ms-`, `me-`, `start-`, `end-`, `text-start`) instead of `pl-`, `pr-`, `left-`, `right-`. Flip directional icons with `rtl:rotate-180`.

### Stack

| Purpose | Library |
| --- | --- |
| Styling | Tailwind CSS 3 with a shared preset, `tailwindcss-animate` |
| Primitives | `@radix-ui/react-*` (dialog, select, popover, tabs, tooltip, switch, checkbox, radio-group, accordion, dropdown-menu, toggle-group, slider, progress, avatar) |
| Variants | `class-variance-authority`, with `clsx` + `tailwind-merge` in a `cn()` helper |
| Icons | `lucide-react`; `react-icons/si` for brand logos only |
| Motion | `motion` (Framer Motion) |
| Theme | `next-themes` with `attribute="class"`, `defaultTheme="system"` |
| Toasts | `sonner` |
| Command palette | `cmdk` |
| Charts | `recharts`, colored from tokens |

```ts
// lib/utils.ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
```

### Color tokens (`styles/globals.css`)

Values are `H S% L%` with no `hsl()` wrapper, so Tailwind can apply opacity (`bg-primary/10`). Replace the brand hues (green primary, warm amber accent) with your own and re-check contrast. Keep the neutrals' faint tint toward the primary hue, which is what makes the greys feel designed rather than default.

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 60 9% 99%;
    --foreground: 150 18% 8%;
    --card: 0 0% 100%;
    --card-foreground: 150 18% 8%;
    --popover: 0 0% 100%;
    --popover-foreground: 150 18% 8%;
    --primary: 152 61% 24%;
    --primary-foreground: 0 0% 100%;
    --secondary: 140 12% 95%;
    --secondary-foreground: 150 18% 12%;
    --muted: 120 8% 95.5%;
    --muted-foreground: 150 6% 36%;
    --accent: 140 20% 93%;
    --accent-foreground: 152 61% 18%;
    --destructive: 0 72% 46%;
    --destructive-foreground: 0 0% 100%;
    --success: 152 61% 30%;
    --success-foreground: 0 0% 100%;
    --warning: 32 92% 40%;
    --warning-foreground: 0 0% 100%;
    --border: 120 8% 89%;
    --input: 120 8% 86%;
    --ring: 152 61% 30%;
    --radius: 0.75rem;
    --shadow-color: 150 30% 8%;
    --grid-line: 150 10% 50% / 0.08;
  }

  .dark {
    --background: 160 14% 4%;
    --foreground: 120 10% 95%;
    --card: 160 12% 6.5%;
    --card-foreground: 120 10% 95%;
    --popover: 160 12% 7%;
    --popover-foreground: 120 10% 95%;
    --primary: 148 52% 50%;
    --primary-foreground: 160 40% 6%;
    --secondary: 160 8% 12%;
    --secondary-foreground: 120 10% 92%;
    --muted: 160 8% 11%;
    --muted-foreground: 140 5% 66%;
    --accent: 155 20% 14%;
    --accent-foreground: 148 52% 72%;
    --destructive: 0 70% 58%;
    --destructive-foreground: 0 0% 100%;
    --success: 148 52% 50%;
    --success-foreground: 160 40% 6%;
    --warning: 36 90% 56%;
    --warning-foreground: 30 40% 8%;
    --border: 160 8% 15%;
    --input: 160 8% 18%;
    --ring: 148 52% 50%;
    --shadow-color: 0 0% 0%;
    --grid-line: 140 10% 70% / 0.06;
  }

  * { @apply border-border; }
  html { -webkit-text-size-adjust: 100%; text-rendering: optimizeLegibility; scroll-padding-top: 5rem; }
  body { @apply bg-background text-foreground font-sans antialiased; font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11'; }
  h1, h2, h3, h4 { @apply font-display tracking-tight text-balance; }
  p { text-wrap: pretty; }
  :focus-visible { @apply outline-none ring-2 ring-ring ring-offset-2 ring-offset-background; }
  ::selection { @apply bg-primary/20 text-foreground; }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
}

@layer components {
  /* Subtle backdrops for heroes; always fade them with a mask */
  .bg-grid {
    background-image: linear-gradient(to right, hsl(var(--grid-line)) 1px, transparent 1px),
      linear-gradient(to bottom, hsl(var(--grid-line)) 1px, transparent 1px);
    background-size: 48px 48px;
  }
  .bg-dots { background-image: radial-gradient(hsl(var(--grid-line)) 1px, transparent 1px); background-size: 20px 20px; }
  .mask-fade-b { mask-image: linear-gradient(to bottom, black 50%, transparent); }
  .mask-fade-x { mask-image: linear-gradient(to right, transparent, black 12%, black 88%, transparent); }
  .text-gradient {
    @apply bg-clip-text text-transparent;
    background-image: linear-gradient(180deg, hsl(var(--foreground)) 30%, hsl(var(--foreground) / 0.62));
  }
}
```

### Tailwind preset (`tailwind-preset.js`)

Share one preset between every app (`presets: [require('<path>/tailwind-preset')]`), and include the UI package in each app's `content` globs.

```js
const hsl = (name) => `hsl(var(--${name}) / <alpha-value>)`;

module.exports = {
  darkMode: ['class'],
  theme: {
    container: { center: true, padding: { DEFAULT: '1rem', sm: '1.5rem', lg: '2rem' }, screens: { '2xl': '1280px' } },
    extend: {
      colors: {
        border: hsl('border'), input: hsl('input'), ring: hsl('ring'),
        background: hsl('background'), foreground: hsl('foreground'),
        primary: { DEFAULT: hsl('primary'), foreground: hsl('primary-foreground') },
        secondary: { DEFAULT: hsl('secondary'), foreground: hsl('secondary-foreground') },
        destructive: { DEFAULT: hsl('destructive'), foreground: hsl('destructive-foreground') },
        success: { DEFAULT: hsl('success'), foreground: hsl('success-foreground') },
        warning: { DEFAULT: hsl('warning'), foreground: hsl('warning-foreground') },
        muted: { DEFAULT: hsl('muted'), foreground: hsl('muted-foreground') },
        accent: { DEFAULT: hsl('accent'), foreground: hsl('accent-foreground') },
        popover: { DEFAULT: hsl('popover'), foreground: hsl('popover-foreground') },
        card: { DEFAULT: hsl('card'), foreground: hsl('card-foreground') },
        // Brand scale (replace): deep green
        brand: { 50: '#effaf3', 100: '#d8f3e1', 200: '#b3e6c6', 300: '#80d2a4', 400: '#4cb77f', 500: '#289b63', 600: '#1a7d4f', 700: '#166442', 800: '#145037', 900: '#11422f', 950: '#08251a' },
        // Warm accent scale (replace): use sparingly for a single highlight per view
        seed: { 50: '#fdf8ed', 100: '#f8ecce', 200: '#f1d699', 300: '#e9bb63', 400: '#e3a23e', 500: '#d98427', 600: '#c0651f', 700: '#a0491d', 800: '#833b1e', 900: '#6c321c' },
      },
      borderRadius: {
        sm: 'calc(var(--radius) - 4px)', md: 'calc(var(--radius) - 2px)', lg: 'var(--radius)',
        xl: 'calc(var(--radius) + 4px)', '2xl': 'calc(var(--radius) + 8px)', '3xl': 'calc(var(--radius) + 16px)', '4xl': '2rem',
      },
      fontFamily: {
        // Every var() needs a fallback: one undefined variable invalidates the whole stack
        sans: ['var(--font-sans, ui-sans-serif)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-display, var(--font-sans, ui-sans-serif))', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        hairline: '0 0 0 1px hsl(var(--shadow-color) / 0.08), 0 1px 2px -1px hsl(var(--shadow-color) / 0.08), 0 2px 4px 0 hsl(var(--shadow-color) / 0.04)',
        elevated: '0 0 0 1px hsl(var(--shadow-color) / 0.06), 0 4px 8px -2px hsl(var(--shadow-color) / 0.08), 0 12px 24px -8px hsl(var(--shadow-color) / 0.12)',
        floating: '0 0 0 1px hsl(var(--shadow-color) / 0.06), 0 12px 32px -8px hsl(var(--shadow-color) / 0.2), 0 32px 64px -24px hsl(var(--shadow-color) / 0.24)',
        'inset-button': 'inset 0 1px 0 0 rgb(255 255 255 / 0.18), inset 0 -1px 0 0 rgb(0 0 0 / 0.12)',
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
        marquee: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(calc(-100% - var(--gap)))' } },
        shimmer: { from: { backgroundPosition: '200% 0' }, to: { backgroundPosition: '-200% 0' } },
        'fade-up': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        'accordion-up': 'accordion-up 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        marquee: 'marquee var(--duration, 40s) linear infinite',
        shimmer: 'shimmer 2.4s linear infinite',
        'fade-up': 'fade-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
      },
      transitionTimingFunction: { 'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)' },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
```

### Typography

- **Fonts:** Inter for body text (`--font-sans`) and Inter Tight for headings (`--font-display`), loaded with `next/font` (`display: 'swap'`) or self-hosted. Add a script-specific font per non-Latin language (for example Noto Sans Ethiopic or Noto Sans Arabic) to the font stack.
- **Headings are tight and large:** negative tracking that grows with size, and short line height.

| Role | Classes |
| --- | --- |
| Hero H1 | `text-[2.75rem] sm:text-6xl lg:text-[4.5rem] font-semibold leading-[1.02] tracking-[-0.028em]` |
| Page H1 | `text-4xl sm:text-5xl font-semibold tracking-tight` |
| Section H2 | `text-3xl sm:text-4xl lg:text-[2.75rem] font-semibold leading-[1.1] tracking-[-0.018em]` |
| Card title | `text-lg font-semibold leading-tight tracking-tight` |
| Eyebrow | `text-xs font-semibold uppercase tracking-[0.14em] text-primary` |
| Lead paragraph | `text-lg sm:text-xl leading-relaxed text-muted-foreground` |
| Body | `text-base leading-relaxed`; long copy `text-foreground/85` |
| Meta and captions | `text-sm text-muted-foreground`, or `text-xs` |
| Numbers | always `tabular-nums` |

- Sentence case everywhere, including buttons and headings. Uppercase is only for eyebrows.
- For scripts that need it (Ethiopic, Arabic), remove negative tracking and raise line height:
  `:lang(am) h1, :lang(am) h2 { letter-spacing: 0; line-height: 1.3 } :lang(am) body { line-height: 1.75 }`.

### Layout and spacing

- **Container:** centered, max width 1280px, padding `1rem` / `1.5rem` / `2rem`.
- **Section rhythm:** `py-20 sm:py-24 lg:py-28`. Alternate plain sections with `bg-muted/40` to separate them, rather than with dividers.
- **Section header:** eyebrow, then H2, then description in `max-w-2xl`, with `mb-12 md:mb-14` below. Put an optional action (such as "View all") aligned to the end on desktop.
- **Radii:** controls use `rounded-lg` (12px); cards and panels use `rounded-2xl`; feature panels and banners use `rounded-3xl` or `rounded-[2rem]`; pills and badges use `rounded-full`.
- **Grids:** `gap-4` to `gap-6` for cards, `gap-10` to `gap-16` between major columns. Prefer asymmetric splits for hero and detail pages (`lg:grid-cols-[1.05fr_1fr]`, `lg:grid-cols-[1.4fr_1fr]`).
- Mobile first. Every layout must work at 360px wide with no horizontal scroll.

### Component recipes

Build these once in the UI package with `cva` variants and `React.forwardRef`, and export them from a single index.

**Button**

```ts
export const buttonVariants = cva(
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-out-expo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-inset-button hover:bg-primary/90',
        contrast: 'bg-foreground text-background shadow-inset-button hover:bg-foreground/90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/70',
        outline: 'border border-input bg-background shadow-hairline hover:bg-muted',
        ghost: 'hover:bg-muted hover:text-foreground',
        link: 'h-auto px-0 text-primary underline-offset-4 hover:underline',
        destructive: 'bg-destructive text-destructive-foreground shadow-inset-button hover:bg-destructive/90',
        accent: 'bg-seed-400 text-seed-900 shadow-inset-button hover:bg-seed-300',
      },
      size: {
        sm: 'h-8 rounded-md px-3 text-xs',
        default: 'h-10 px-4',
        lg: 'h-12 rounded-xl px-6 text-[0.95rem]',
        xl: 'h-14 rounded-xl px-7 text-base',
        icon: 'size-10',
        'icon-sm': 'size-8 rounded-md',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);
```

- Support `asChild` (Radix `Slot`) so links can look like buttons.
- Support `loading`: overlay a spinner, hide the label with `invisible` so the width doesn't jump, and set `aria-busy`.
- One primary (`default` or `contrast`) button per view. Pair it with `outline` or `ghost`. The hero uses `contrast` (dark on light) at size `lg`.

**Card:** `rounded-2xl bg-card text-card-foreground shadow-hairline`. Interactive cards add `transition-[box-shadow,transform] duration-300 ease-out-expo hover:-translate-y-0.5 hover:shadow-elevated`. Padding is `p-6`, and content after a header uses `pt-0`.

**Inputs:** `h-10 rounded-lg border border-input bg-background px-3 text-sm shadow-hairline`, with focus `ring-2 ring-ring`. Wrap every control in a `Field` component that wires the label, hint, and error to the control with `aria-describedby` and `aria-invalid`. Errors appear under the field in `text-destructive text-sm`; never use only color to show an error.

**Badge:** `rounded-full` with these variants:

- `brand`: `border-primary/15 bg-primary/10 text-primary`
- `muted`: `bg-muted text-muted-foreground`
- `success`, `warning`, `destructive`: `bg-<tone>/10 text-<tone> border-<tone>/20`
- `outline`: plain border

An optional leading dot shows status.

**Radio cards** are used for choices such as plans or payment methods: a bordered card with title, description, and icon; the selected one gets `border-primary bg-primary/5`. Prefer them over plain radio buttons for any choice that needs explanation.

**Overlays:** dialogs and popovers use `bg-popover shadow-floating rounded-2xl`, with an overlay of `bg-background/60 backdrop-blur-sm`. Tooltips are small, `text-xs`, and contrast-inverted.

**Empty states:** a muted icon in a soft circle, a one-line title, one sentence of help, and at most one action. No illustrations of people and no emoji.

**Tables:** quiet headers (`text-xs font-medium text-muted-foreground`), row hover `bg-muted/50`, numbers right-aligned and `tabular-nums`, and actions as ghost `icon-sm` buttons with `aria-label`.

### Motion

- **One easing everywhere:** `cubic-bezier(0.16, 1, 0.3, 1)` (Tailwind `ease-out-expo`; `[0.16, 1, 0.3, 1]` in `motion`).
- **Durations:** hover and press 150 to 200ms, overlays 200 to 250ms, scroll reveals 500 to 700ms.
- **Scroll reveal:** fade in and rise 12 to 16px, once (`viewport: { once: true, margin: '0px 0px -10% 0px' }`). Stagger lists by 0.05 to 0.08s.
- **Press feedback:** `active:scale-[0.98]` on buttons. Hover lift on interactive cards is at most 2px.
- Always check `useReducedMotion()` and render the final state with no animation when it is set. The global CSS rule above covers CSS animations.
- Motion supports the content. No bouncing, spinning, or looping animation except marquees, loading spinners, and skeleton shimmer.

```tsx
const EASE = [0.16, 1, 0.3, 1] as const;

export function Reveal({ children, delay = 0, y = 16, className }: { children: React.ReactNode; delay?: number; y?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      transition={{ duration: 0.7, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}
```

### Page patterns

- **Hero:** a backdrop of `bg-grid mask-fade-b` plus one or two large blurred brand-tinted circles (`bg-primary/[0.12] blur-3xl`, behind `-z-10`). Then a small pill badge with the eyebrow, the H1 (optionally the lead line in `text-gradient`), the lead paragraph, and a primary `contrast` button with a secondary `outline` button. On the right goes a product visual in a device or browser frame, with one or two floating detail cards (`shadow-floating`).
- **Feature grid:** two or three columns of cards, each with a small icon in a tinted square (`bg-primary/10 text-primary rounded-xl size-10`), a title, and one sentence.
- **Stats:** large `tabular-nums` numbers that count up when scrolled into view, with a short muted label underneath. Only use real numbers.
- **Call-to-action banner:** a rounded `rounded-[2rem]` panel in dark brand (`bg-brand-950`) with white text, a white primary button (`bg-white text-brand-950`), and a ghost secondary button.
- **Footer:** brand and tagline, link groups, newsletter, then a bottom row with legal links, social icons (brand logos at `size-4` in `size-9` round hover targets), and the theme and language controls.

### Theming and providers

```tsx
<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
  <TooltipProvider delayDuration={200}>
    {children}
    <Toaster />
  </TooltipProvider>
</ThemeProvider>
```

Every new screen must be checked in light and dark mode. Never hard-code white or black surfaces; use `bg-background`, `bg-card`, and `text-foreground`.

---

## How to implement in a new project

1. Install the stack:
   `npm i tailwindcss@3 tailwindcss-animate class-variance-authority clsx tailwind-merge lucide-react motion next-themes sonner @radix-ui/react-slot @radix-ui/react-dialog @radix-ui/react-select @radix-ui/react-popover @radix-ui/react-tooltip @radix-ui/react-tabs @radix-ui/react-switch @radix-ui/react-checkbox @radix-ui/react-radio-group @radix-ui/react-accordion @radix-ui/react-dropdown-menu @radix-ui/react-label`
2. Create the UI home (`packages/ui` in a monorepo, otherwise `src/components/ui`) with `lib/utils.ts`, `styles/globals.css`, and `tailwind-preset.js` from above.
3. Replace the brand values: the `--primary`, `--ring`, `--success`, and `--accent*` hues in both themes, and the `brand` and `seed` scales. Keep primary text contrast at 4.5:1 or more against `--primary-foreground`, and body text at 4.5:1 or more in both themes.
4. Point each app's `tailwind.config.js` at the preset, and include the UI folder in `content`.
5. Load the fonts and expose `--font-sans` and `--font-display` on `<html>`.
6. Build the primitives in this order: Button, Badge, Card, Input, Textarea, Label and Field, Select, Checkbox, Switch, RadioCard, Dialog, Tooltip, Tabs, Accordion, Skeleton, EmptyState, Toaster. Then build the blocks: Section, SectionHeader, Eyebrow, Reveal, Stagger.
7. Add `scripts/check-emoji.mjs` and a `check:emoji` npm script, and run it in CI.
8. Build pages only from these components. If something is missing, add it to the UI package first, then use it.

## Done checklist for any UI change

- [ ] `node scripts/check-emoji.mjs` passes
- [ ] Only tokens and semantic classes are used; no new hex colors outside the preset
- [ ] Looks right in light and dark mode, at 360px, 768px, and 1280px or wider
- [ ] Keyboard reachable, focus visible, icon-only buttons have `aria-label`, and errors are announced
- [ ] Logical (RTL-safe) spacing and positioning utilities are used
- [ ] Motion uses the shared easing and respects reduced motion
- [ ] Copy is sentence case, plain, and specific, and every number shown is real
