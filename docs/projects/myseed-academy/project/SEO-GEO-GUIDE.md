# MySeed Academy SEO and GEO audit and guidelines

The audit of the live website at https://myseed.com.et on 23 November 2026, the fixes it calls for, and the rules for keeping the site easy to find in search engines (SEO) and in AI assistants and answer engines such as ChatGPT, Claude, Gemini and Perplexity (GEO, generative engine optimization). The fixes are tasks WEB-18 to WEB-24 in Dev team, project WEB.

## 1. How the audit was made

The audit read the live site from outside, as a search engine does: the redirects for `/`, `www` and `http`; `robots.txt`, `sitemap.xml`, `llms.txt` and the web manifest; and every English page in the sitemap plus three pages in each of five other languages (40 pages in all). For each page it checked the status code, response time, size, language and direction, title, description, canonical URL, robots tag, headings, structured data, images and word count. It did not read the website's code or its Search Console data.

## 2. What is already right

| Area | Finding |
| --- | --- |
| Status codes | Every sitemap page answers 200; an unknown address answers 404; `www` and `http` redirect permanently to `https://myseed.com.et` |
| Speed | Median response 240 ms, slowest 671 ms; pages around 130 KB of HTML |
| Canonical URLs | Every page names itself as canonical |
| Languages | `hreflang` for nine languages plus `x-default` on every page and in the sitemap; Arabic pages are right to left |
| Headings | Exactly one H1 on every page |
| Social cards | Open Graph and Twitter tags with a generated image per language (`/en/opengraph-image`, 200, PNG) |
| Structured data | On every page: EducationalOrganization (legal name, founders, address, area served, `sameAs`), WebSite with SearchAction, FAQPage on the homepage |
| Images | No image without an `alt` attribute |
| Crawling | `robots.txt` allows search engines and the AI crawlers (GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended and others) and keeps them out of the API, search, thank-you and application pages |
| AI fact sheet | `llms.txt` gives the legal name, founders, subjects, numbers with dates, prices, app links and the main pages |

## 3. What to fix

| Fix | Problem found | Change | Where | Task |
| --- | --- | --- | --- | --- |
| S1 | Seven languages are untranslated copies. The `es`, `fr`, `ar`, `zh`, `hi`, `pt` and `ru` pages show the English titles and text, yet they are in the sitemap and in `hreflang` (175 duplicate URLs). Search engines treat them as duplicates and may pick the wrong one. `llms.txt` itself says the site's languages are English and Amharic | Until a language's Tier 2 text is reviewed: send `noindex` on its pages, and leave it out of `hreflang` and the sitemap. Bring each language back when its text is reviewed | `apps/web/lib/seo.ts` (`alternates()`), `apps/web/app/sitemap.ts`, the locale layout | WEB-18 |
| S2 | The homepage H1 holds every rotating phrase run together: "A good teacheron every phone., for every grade., for every exam., ..." | One H1 sentence, for example "A good teacher on every phone"; the rotating words outside the H1 or marked `aria-hidden` | The homepage hero component | WEB-19 |
| S3 | Titles are generic ("Team", "Articles", "Resources") and the homepage title is 73 characters (cut off in results) | Unique titles of 30 to 60 characters that name what the page offers, for example "Grade 9 and 10 lessons, notes and exams in Amharic \| MySeed" | Per-page metadata; Admin, SEO overrides | WEB-20 |
| S4 | Descriptions are too long on the homepage (262), About (209) and Team (241), and too short on Events (23), Resources (48) and Talk to us (50) | 120 to 160 characters each, with the page's main search phrase and a reason to click | Per-page metadata | WEB-20 |
| S5 | All 216 English and translated entries in the sitemap carry the build time as `lastmod`, so it says nothing about what changed | `lastmod` from each page's content update time (articles from their update date, static pages from their last edit) | `apps/web/app/sitemap.ts` | WEB-21 |
| S6 | HTML is sent with `Cache-Control: private, no-cache, no-store`, so every visit and every crawl renders the page again | Revalidated pages (ISR) for public pages, refreshed by the existing `/api/revalidate` on publish, with a public cache header | Page segment config; Caddy | WEB-21 |
| S7 | The organization logo is an SVG (`/icon.svg`) and there is no telephone or contact point | Add a PNG logo of at least 112 by 112 pixels, `telephone`, and a `contactPoint` for support and for schools | `apps/web/lib/seo.ts` | WEB-22 |
| S8 | No Search Console or Bing verification tag (it may be verified by DNS instead; check) | Verify the domain in Google Search Console and Bing Webmaster Tools, submit the sitemap, and watch the indexing reports | DNS or a meta tag | WEB-22 |
| S9 | Thin pages: Partners (181 words), Events (162), Articles (199), Resources (228), Careers (228), FAQ (240); one article published | Fill them with real content in English and Amharic (section 6) | Admin console content | WEB-23, WEB-24 |
| S10 | `/` answers 307 (temporary) to `/en` | Keep the language choice, but answer 308 when the choice is the default and nothing personal decided it; or serve the `x-default` page at `/` | `apps/web/middleware.ts` | Optional, with WEB-18 |

## 4. SEO guidelines

### 4.1 Every page

- [ ] A unique title of 30 to 60 characters, starting with what the page offers; the brand at the end ("| MySeed")
- [ ] A description of 120 to 160 characters with the main search phrase and a reason to click
- [ ] One H1 that says the same thing as the title in plain words; H2 and H3 in order beneath it
- [ ] At least 300 words of useful text on pages meant to rank (thin pages either grow or are left out of the sitemap)
- [ ] A short address in lowercase words with hyphens (`/en/learning/grade-9-10`); never change a published address without a redirect in Admin, SEO
- [ ] Descriptive `alt` text on every meaningful image; empty `alt=""` only on decoration
- [ ] Two or more links to related pages inside the text (grade pages to their subjects, articles to the app and to sponsorship)
- [ ] The structured data that fits: Article for articles, Event for events, JobPosting for jobs, FAQPage for questions, BreadcrumbList below the top level

### 4.2 Languages

- Index a language only when its text is written or reviewed by a person. Machine translation alone does not go into the sitemap or `hreflang` (S1).
- English and Amharic are the priority. Amharic searches have little competition: Amharic pages with real content are the easiest wins on the site.
- Keep each language's title, description and headings in that language, not English.
- `hreflang` lists only the indexed languages, each page pointing to its own versions and `x-default` to English.

### 4.3 Speed and Core Web Vitals

- Keep Largest Contentful Paint under 2.5 seconds, Interaction to Next Paint under 200 ms and Cumulative Layout Shift under 0.1 on a mid-range Android phone over 4G (Admin, SEO, PageSpeed reports).
- Hero images in WebP or AVIF, sized for phones, with width and height set; motion effects must not move the layout.
- Public pages cached and revalidated on publish (S6).

### 4.4 Indexing

- Submit the sitemap in Google Search Console and Bing Webmaster Tools; check Coverage and Pages monthly for excluded or duplicate pages.
- Ping IndexNow (already built in Admin, SEO) when an article or page is published.
- Every new page type gets a check in the site audit (Admin, SEO) before release.

### 4.5 Local and geographic search

- A Google Business Profile for the Addis Ababa office with the same name, address, phone and opening hours as the website's structured data and contact page.
- The same name, address and phone everywhere: website, app stores, social profiles, Ethiopian directories and press.
- Pages and articles that name where MySeed serves (Ethiopia, its regions and cities) and what students there search for: grade numbers, subjects, the national exam (ESSLCE), Amharic lesson terms.
- `areaServed` stays Ethiopia; add region pages only when there is something local to say (schools, partners, events).

## 5. GEO guidelines (AI assistants and answer engines)

AI assistants answer from what they can read and trust. They favour sources that state facts plainly, consistently and with dates, and that other sites repeat.

1. **Keep the AI crawlers allowed** in `robots.txt` (already done) and keep `llms.txt` current: when a number changes (lessons published, installs, prices), update `llms.txt`, the About page and the structured data together, with the month.
2. **One set of facts everywhere.** The name (MySeed Academy, My Seed EdTech PLC), founders, what the product is, grades, subjects, price and contact are written the same way on the website, `llms.txt`, app store pages, social profiles and press releases.
3. **Answer first.** Each FAQ answer and each article opens with a one or two sentence answer to its question, then the detail. Use the questions students and parents actually ask ("How much does MySeed cost?", "Does MySeed follow the Ethiopian curriculum?", "Is there a MySeed app for Grade 12 national exam preparation?").
4. **Numbers with dates and sources.** "421 video lessons published (November 2026)" is quoted; "hundreds of lessons" is not.
5. **People and expertise.** A page for Teacher Dani and each teacher with their background, subjects and links to their channels, marked up as Person; articles carry an author with a bio.
6. **Be cited elsewhere.** Press coverage, partner pages, school pages and education directories that link to and describe MySeed are what AI assistants rely on. A Wikidata entry for My Seed EdTech PLC with the official website, founders and founding date helps assistants recognise the organization; add it to `sameAs` once it exists.
7. **Amharic content.** Few sources answer education questions in Amharic, so clear Amharic pages are likely to be the ones assistants use.
8. **Check what the assistants say.** Each month, ask ChatGPT, Claude, Gemini and Perplexity ten fixed questions about MySeed and Ethiopian online tutoring, record the answers and whether MySeed is named and described correctly, and fix the site wherever an answer is wrong.

## 6. Content to fill

| Page | What it needs | Language |
| --- | --- | --- |
| Articles | Two a month: study guides per grade and subject, national exam preparation, parent guides, stories from students and schools | English and Amharic |
| FAQ | From 5 to at least 20 answers: price and plans, payment methods, devices and offline use, curriculum match, parent accounts, schools, sponsorship | English and Amharic |
| Events | Real past and coming events (school visits, launches, live sessions) with dates and places, marked up as Event | English and Amharic |
| Partners | Each partner with a logo (with `alt`), one paragraph on what they do with MySeed and a link | English and Amharic |
| Team | Every person with a photo, role and two sentences; teachers with their subjects | English and Amharic |
| Careers | Open roles as JobPosting, or a paragraph on how to apply when there are none | English |
| Grade pages | Subjects and units covered, lesson counts, a sample lesson, the exam preparation offered | English and Amharic |

## 7. Measuring

| Measure | Where | How often |
| --- | --- | --- |
| Pages indexed and excluded | Google Search Console, Bing Webmaster Tools | Monthly |
| Search clicks and impressions by page and query | Google Search Console | Monthly |
| Core Web Vitals | Admin, SEO (PageSpeed); Search Console | Monthly |
| Site audit score and issues | Admin, SEO | Before each release |
| AI answers about MySeed | The ten fixed questions (section 5) | Monthly |
| App installs from the website | Google Play console referrers | Monthly |
