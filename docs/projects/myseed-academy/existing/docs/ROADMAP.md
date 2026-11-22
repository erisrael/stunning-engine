# MySeed Academy: what to improve, what to add, and how to grow it into a site builder

October 2026. This document covers three things. It lists what to fix before launch, the features worth adding next, and a step-by-step path from the current homepage builder to a full site builder.

## Where things stand

The platform today is a bilingual website plus an admin console. Staff can already:

- Edit content in English and Amharic with a rich text editor, and preview drafts.
- Arrange the homepage visually: reorder sections, archive them, and hide them per device, with versions, tests, and rollback.
- Manage media in folders, connect providers on the Integrations page, and watch finance, API usage, uptime, and SEO.
- Control access with custom roles.

The main limit is that only the homepage is built from sections. Every other page is fixed in code, and the text inside sections lives in translation files, not in the admin. Removing those two limits is most of the work of turning this into a site builder (see Part 3).

## Part 1: Fix before launch

These are risks or gaps that matter more than any new feature.

| Area | Problem | What to do |
| --- | --- | --- |
| Content | The site still shows placeholder content (300 schools, offline solar labs, a 2019 robotics club). That contradicts the real MySeed story: a mobile learning app, Teacher Dani, and 399 ETB per month sponsorships. | Follow [content/myseed-com-et.md](content/myseed-com-et.md). Replace the homepage and About copy, add the real FAQs and the article, and archive the sections with no real content behind them. |
| Real credentials | Payment, email, translation, and AI keys in `.env` are placeholders, so donations run through a test checkout and emails are only logged. | Add the real Chapa, Resend, and Claude or Google keys on the Integrations page. Then run each integration's tests, including a test checkout and a test email. |
| Next.js version | The dev overlay reports Next.js 14.2 as outdated. Next.js 14 no longer gets new fixes. | Upgrade to Next.js 15 and React 19 in a separate branch. The main changes are async `cookies()`, `headers()`, and `params`, and new caching defaults. Run the end-to-end suite after the upgrade. |
| Running more than one server | Rate limits, the role cache, the integration cache, and uptime checks live in each API process's memory. With two or more API instances, limits multiply and caches go stale for up to 15 seconds. | Before scaling out, move rate limits and caches to Redis, and run uptime checks in one worker. |
| Monitoring the monitor | Uptime checks run inside the API, so nothing alerts you when the API itself is down. | Add one external monitor (UptimeRobot, Better Stack, or a cloud provider's health check) on `/healthz`. |
| Staff account security | Accounts use passwords only, with no second factor and no list of active sessions. | Add two-factor sign-in for anyone who can see donors, secrets, or roles. Add a sessions list on My profile with "sign out other devices". |
| Backups | There is no tested restore. | Turn on daily PostgreSQL backups with point-in-time recovery. Copy media to a second bucket. Practice a restore every quarter. |
| Media storage | Uploads go to the API server's disk unless S3 storage is connected. They disappear when the server is replaced. | Connect S3, Cloudflare R2, or another bucket before deploying. Move existing files with a one-time script. |
| Automated tests | End-to-end tests are strong, but there are almost no unit tests for the API services (roles, sanitizer, webhooks, finance). | Add a small Vitest suite for those services and run it in CI on every pull request. |
| Accessibility of the admin | The public site was audited to WCAG 2.2 AA. The new admin screens (page builder, media manager, permission matrix) were not. | Run axe on the admin pages. Check keyboard-only use of drag and drop: the up and down buttons work, but announce moves to screen readers. |

## Part 2: Features to add

Ranked by value to MySeed's goals: more sponsored students, more schools, and less staff effort.

### For visitors

1. **Bank transfer sponsorship with receipt upload.** The current site supports it. The new site sends these donors to the contact form, which loses them. Add the bank accounts, a receipt upload, and a "verify payment" queue in the admin.
2. **Real recurring sponsorship.** Today "monthly" is only a label. Use Chapa or Stripe subscriptions, and add a donor page to pause, change, or cancel.
3. **App download paths.** Add App Store and Google Play buttons to the hero, footer, and a dedicated "Get the app" page, with QR codes for desktop visitors.
4. **Gallery and video.** Add a gallery page for app screenshots, and Teacher Dani video lessons embedded from YouTube or TikTok. These are the current site's strongest content.
5. **Event registration on the site.** Collect sign-ups with capacity limits and reminders, instead of linking to outside forms.
6. **Sponsor impact updates.** Send each sponsor a monthly email with what their students used (lessons watched, progress), drawn from the app if it can share aggregate data.
7. **Newsletter double opt-in and preferences.** Confirm new sign-ups by email, and let readers choose topics (news, events, fundraising).
8. **Faster mobile pages.** Serve uploaded images through `next/image` in modern formats, and lazy-load the heavier homepage sections. Set a budget for mobile Largest Contentful Paint of 2.5 s on 3G.

### For staff

1. **Publishing workflow.** Draft, then In review, then Scheduled or Published, with an approver role. This applies to articles, FAQs, events, and page versions.
2. **Scheduled publishing.** Set a date and time for articles and page versions to go live. This reuses the existing publish action.
3. **Revision history for articles.** Page layouts already keep versions; articles should too, with compare and restore.
4. **Notifications.** Send staff email or Telegram messages for new inquiries, failed payments, downtime, and items waiting for review.
5. **Content import.** Upload a Markdown or Word file to create an article. This turns the content inventory into posts in minutes.
6. **Form builder.** Let staff create forms (volunteer sign-up, school survey) without code. Submissions land in the Inquiries inbox.
7. **A/B testing of layouts.** Versions already exist. Serve two versions to a share of visitors and compare donation clicks in Analytics.
8. **Admin in Amharic.** The console is English-only. Staff who prefer Amharic would benefit from a translated interface, which the existing translation system can produce.

## Part 3: Turning this into a site builder

### The goal

Staff can create any page, choose its sections from a library, edit each section's text, images, and style in place, preview it on every device and language, and publish it with versions and rollback. No developer is involved.

### What already exists

| Capability | Status |
| --- | --- |
| Sections rendered from a layout, in order | Done for the homepage |
| Drag and drop, archive, remove, add back | Done, in list and visual modes |
| Hide per device (phone, tablet, desktop) | Done |
| Versions, preview, automated render test, apply, restore | Done |
| Roles for editing versus publishing (`pages:write`, `pages:publish`) | Done |
| Translations for nine languages and a media library with folders | Done |
| Section content editable in the admin | Not yet: text comes from translation files |
| More than one copy of a section type, or section settings | Not yet |
| Pages other than the homepage | Not yet |
| Navigation and footer editing | Not yet |

### Step 1: Sections become blocks with their own content (about 3 to 4 weeks)

This is the most important change.

- **Turn each section into a block type with a schema.** Each type declares its fields: title, text, image, buttons, items, and style options.
  - Write the schemas with zod so the API and the admin validate the same way.
  - Example: a Hero block has `eyebrow`, `title`, `rotatingWords[]`, `subtitle`, `primaryButton {label, link}`, `secondaryButton`, `image`.
- **Store content on the block, not in translation files.** English and Amharic are required for each text field. The other seven languages use the existing `ContentTranslation` table, keyed by block ID and field.
- **Allow many blocks of the same type on a page,** for example two CTA banners. A layout becomes `[{ id, type, props, hideOn, archived }]` instead of `[{ key }]`.
- **Add a small set of generic block types next to the MySeed-specific ones:** Rich text, Image and text, Card grid, Logo strip, Stats, FAQ list (from the FAQs collection), Article list (from Articles), Video, Gallery, Quote, Call to action, Spacer, and Embed (allowlisted providers only).
- **Add style settings per block,** chosen from design tokens rather than free values so pages stay on brand and accessible: background (default, muted, brand, dark), vertical spacing (small, medium, large), width (narrow, normal, wide, full), and alignment.
- **Migrate the 16 current homepage sections** into blocks with their current text as defaults, so the site looks the same on day one.

### Step 2: Edit in place (about 2 to 3 weeks)

- **Inspector panel** next to the visual editor. Clicking a block shows its fields as a form, with the rich text editor for long text and the media library picker for images.
- **Inline text editing:** click a heading on the page and type. Changes update the draft through the same message channel the visual editor uses now.
- **Undo and redo, and autosave** of drafts every few seconds.
- **Language switch inside the editor** to fill in Amharic side by side, with "missing translation" markers.
- **Edit locking:** show who else is editing a draft, so two people do not overwrite each other.

### Step 3: Pages, navigation, and footer as data (about 2 to 3 weeks)

- **A `Page` model** with slug, title, SEO fields (reusing the SEO metadata already built), status, and a versioned block layout.
  - A catch-all route `app/[locale]/[...slug]` renders any page.
  - Fixed routes (donate, contact, search) stay in code and can be wrapped with editable blocks above and below.
- **Menus editor** for the header mega menu and footer columns, with nesting, per-language labels, and links to pages or URLs.
- **Page templates:** "Landing page", "Campaign", and "Program", each a preset list of blocks.
- **Redirects created automatically** when a page's slug changes, using the redirects system already built.

### Step 4: Theme editor (about 1 to 2 weeks)

- Edit design tokens in the admin: brand colors, fonts from an approved list, corner radius, and button style.
- Validate contrast in both light and dark themes before saving. The tokens are already CSS variables, so the site picks them up without a rebuild.
- Keep a "reset to MySeed defaults" option.

### Step 5: Publishing at scale (about 1 to 2 weeks)

- Scheduled publish and unpublish for page versions.
- Cache tags per page, so publishing one page refreshes only that page, not the whole site.
- Shareable preview links that expire, for partners who review a campaign page before launch.
- A/B tests between two versions, with results in Analytics.

### Step 6 (optional): Many sites from one platform

Only if MySeed wants to offer this to other schools or organizations:

- Add a `Site` model and scope every record to it.
- Map custom domains per site, and give each site its own roles and theme.
- Add usage limits and billing.

This is a large change that touches every query. Do it only with a clear customer.

### Data model sketch

```text
Site            id, name, domain, theme (tokens JSON), defaultLocale
Page            id, siteId, slug, status, seo (JSON), currentVersionId
PageVersion     id, pageId, version, status, blocks (JSON), createdBy, publishedAt, scheduledFor
Block (in JSON) { id, type, props, hideOn[], archived, style { background, spacing, width } }
BlockType       code-defined registry: type, label, icon, zod schema, defaults, renderer, editor form
Menu            id, siteId, location ('header' | 'footer'), items (JSON tree)
ContentTranslation  existing table, extended with entityType 'block' and fieldName = prop path
```

### Build it yourself or adopt an editor?

| Option | Pros | Cons |
| --- | --- | --- |
| Continue in-house (recommended) | The foundation is already here: layouts, versions, previews, visual drag and drop, roles, translations, and media. Full control over Amharic and RTL support and over permissions. | You maintain the editor. |
| Puck (open-source React visual editor) | Mature drag-and-drop editor that stores JSON. Fast to add an inspector and nested blocks. | Its data model would replace the current one, and permissions, translations, and versions still need connecting. |
| Payload CMS 3 (Next.js native) | Full CMS with a blocks field, versions, drafts, and access control. | A second admin to learn. Moving the existing CMS, roles, and integrations would be a large migration. |
| Hosted builders (Builder.io, Plasmic) | Polished editors with no editor code to maintain. | Monthly cost, content stored outside your database, and limited Amharic and RTL control. |

Recommendation: build Steps 1 to 3 in-house. Borrow ideas from Puck's inspector and nested-block patterns if helpful. Reconsider only if requirements grow toward many sites (Step 6).

### Suggested order and effort

| Order | Work | Approximate effort |
| --- | --- | --- |
| 1 | Part 1 fixes, especially content, credentials, backups, and media storage | 1 to 2 weeks |
| 2 | Bank transfer sponsorships and real recurring giving | 1 to 2 weeks |
| 3 | Step 1: blocks with their own content | 3 to 4 weeks |
| 4 | Step 2: edit in place | 2 to 3 weeks |
| 5 | Step 3: pages, menus, templates | 2 to 3 weeks |
| 6 | Publishing workflow, scheduling, article revisions | 2 weeks |
| 7 | Steps 4 and 5: theme editor, publishing at scale | 2 to 4 weeks |

Estimates assume one experienced full-stack developer. Each step ships on its own, so the site keeps improving between steps.
