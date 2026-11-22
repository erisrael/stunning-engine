# Shoppers, the MySeed Shop app, store landing pages, vouchers, memberships and auctions

Migration 059. Server: `apps/api/src/console/shop.ts` (shoppers, the app, bids, vouchers, memberships, closing auctions) and `commerce.ts` (checkout, the owner's settings). Web: `pages/shop-app.tsx` (the app), `shop-auth.tsx` (sign-in), `store-landing.tsx` (a store's landing page and auctions), `storefront-marketplace.tsx` (the owner's side). Tests: `tests/e2e/shop.test.mjs`.

## Who owns what

- A **shopper** has one MySeed account for every store and the app.
- Each **store** keeps its own customer book (`storefront_customers.shopper_id` links an account to it) and sees only its own orders, members and bids.
- A store appears in the **MySeed Shop app** only when the owner lists it.

## Shopper accounts

| Sign in with | How | Notes |
|---|---|---|
| Phone or email and a password | `POST /console/api/shop/auth/register`, `/shop/auth/login` | Passwords hashed like staff passwords; 8 wrong tries lock the account for 15 minutes |
| Google | `/shop/auth/google/start?return=<path>` (a page load), Google calls back to `/shop/auth/google/callback` | Off until `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set; a verified Google email joins the account that already uses it |
| Telegram | `POST /shop/auth/telegram { orgId, initData }` inside a store's Mini App | The init data is checked with that store's bot token |

**A verified phone is needed** for bids, vouchers that belong to a shopper, and memberships. Two ways to verify:

- **By SMS code:** `POST /shop/me/phone/send` and `/shop/me/phone/verify`. A 6-digit code, kept only as a digest, valid 10 minutes, 5 tries. It is sent through the message outbox as `shopper_code`, under the platform organization. This needs `SMS_PROVIDER`.
- **By Telegram, free:** `POST /shop/me/phone/telegram`. Inside a store's Mini App the shopper taps *Share my phone*. Telegram signs the contact, and only the shopper's own number counts.

A number verified by one account cannot be verified by another.

**The session** is the `tv_shop` cookie (HttpOnly, SameSite=Lax, 60 days); only its digest is stored. Signing out revokes it.

**Guest checkout** still works: name and phone, no account.

**What the account holds** (`/shop/account` in the app):

- orders at every store, with tracking;
- bids (leading, outbid, won, with a pay-now link);
- a wallet of claimed vouchers and memberships;
- saved items and saved addresses;
- the profile and a password change.

## The MySeed Shop app (`/shop`)

**Home:**

- category chips: food, groceries, shopping, fashion, electronics, pharmacy, beauty, home, services, auctions;
- deals (a compare-at price above the price, or a deal end time);
- auctions ending soon;
- best sellers (paid quantities in the last 30 days);
- new arrivals;
- the listed stores.

Signed in, it also shows **Recently viewed**, **Buy again** (items from paid orders still sold), **From stores you follow** and **Top rated stores** (migration 061).

**Stores** (`/shop/stores`) lists every listed store by category or city, with filters for delivers, pickup, 4 stars and up and followed, sorted by rating, followers, items or name.

**Search** looks across every listed store; every word must match the name, description, category or a tag. It can sort by price, discount or auctions ending soonest, and loads 40 results at a time. The search box suggests recent searches, deals, auctions and categories. An item opens on its store's page (`/store/<id>#item:<item id>`).

**Phones** get a bottom tab bar: Home, Stores, Search, Orders, Account.

**Installing:** the app has its own manifest (`shop.webmanifest`), so it installs as MySeed Shop, and an Android app wraps it (`apps/shop-android`).

What each feature is modeled on, and what is not built yet: [storefront-benchmark.md](storefront-benchmark.md).

**Which stores are listed:** the owner switches it on under **Storefront, Landing page & marketplace**, with a category and a city. The store must also have the storefront package and be taking orders.

## A store's landing page

**Templates** set recommended sections; the owner changes them:

| Template | Opens on |
|---|---|
| Classic store | A banner, then the items |
| Marketplace | Offers, category tiles, deals with a countdown, best sellers, new arrivals (no big hero) |
| Food menu | Today's specials, then the menu by category |
| Auction house | Live auctions first, then buy-now items |
| Boutique | Collections, new arrivals, best sellers |
| Grocery | Category tiles, deals, best sellers (no big hero) |
| Services | Featured services and memberships |

**Sections**, in any order:

- ad banners;
- category tiles;
- deals with a countdown (the soonest deal end time; the heading is editable);
- best sellers (paid quantities in the last 60 days);
- live auctions;
- our picks (featured items);
- new arrivals;
- vouchers to claim;
- membership plans;
- collections (a titled row of items sharing a category or tag);
- everything.

A section with nothing in it stays hidden.

**Ad banners** (up to 8) turn every 5 seconds. Each has:

- a picture (an https link), or a background color;
- a title and a line under it;
- a button;
- an end time, which shows a countdown;
- a link: an item (`#item:<id>`), a category (`#category:<name>`) or an https page.

The server keeps only these fields, checked (`cleanLanding` in `storefront-theme.ts`).

## Vouchers

Promotion codes gain:

- a title;
- *show on the store to claim*;
- *members only*;
- *uses per shopper*;
- the option to be made for one shopper.

A claimed voucher waits in the shopper's wallet (`storefront_promo_claims`). At checkout, a members-only or per-shopper voucher needs a signed-in shopper, and each use is counted per shopper in the order's transaction. Plain codes work as before.

## Memberships

A plan has:

- a name, a price and a length in days;
- a discount on every order (0 to 50%) and/or free delivery;
- optional perks text.

Joining (`POST /public/store/:orgId/memberships/:planId`) makes a payment request (purpose `subscription`), paid and checked like any order. Once the payment is accepted, the membership starts. If one is already running, the new one starts when it ends. Memberships are settled on reads of the store, the wallet and the owner's page.

At checkout, a member's discount is taken after vouchers (`membership_discount_minor` on the order), and free delivery sets the delivery fee to zero. The owner sees each plan's members and a member list under **Storefront, Memberships**.

## Auctions

An item can be sold by auction. It has:

- a starting bid and a smallest raise;
- an optional reserve (the lowest price the owner sells at);
- an end time, between 5 minutes and 60 days away.

**Bidding:** `POST /public/store/:orgId/items/:itemId/bids { amountMinor }`, by a shopper with a verified phone.

- A bid must be at least the current top bid plus the raise, or the starting bid when there are no bids.
- The leader cannot outbid themselves.
- A bid in the last two minutes extends the end to two minutes from then, so nobody wins by sniping.
- Bidders are shown by their first letter only.

An auction item cannot be put in a cart.

**At the end**, checked every minute by the API, and whenever the store, the app or a wallet is read, the highest bid at or above the reserve (or the start) becomes a pending order for the winner. That order has a payment link valid 48 hours, appears in the winner's orders and bids, and goes to the owner's Telegram like any new order. Without such a bid, the item is marked unsold. Either way it leaves the store.

## Setting up Google sign-in

1. In Google Cloud Console, create an OAuth client of type *Web application*.
2. Add the redirect URI `https://<your domain>/shop/auth/google/callback`.
3. Add these two lines to the server's `.env` (`/opt/transactionverify/.env` on the VPS), then restart the API:

```
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
```

The Continue with Google button appears as soon as both are set (`GET /console/api/shop/auth/options`).

## Pay with Chapa (migration 060)

The payment page (`/pay`, used by bills, store orders, memberships, auction wins and QR stands) offers **Pay with Chapa** first when:

- the organization has a Chapa receiving account and its own Chapa secret key (Receiving accounts, Chapa); and
- the request has a fixed amount.

How it works (`apps/api/src/chapa-checkout.ts`):

1. `POST /pay/chapa/start { token }` takes the page's own submission token. It starts Chapa's checkout (`transaction/initialize`) with the organization's key and a reference of our own (`TV` + 16), and returns Chapa's checkout address. A second tap within 20 minutes reuses the same checkout.
2. The payer pays on Chapa: card, telebirr, CBE Birr, M-Pesa or a bank. Chapa sends them back to `/pay/#t=...&chapa=<reference>`, and the page submits that reference.
3. Chapa also calls `GET|POST /pay/chapa/callback?trx_ref=<reference>`. The server submits the reference itself, once, so the payment is checked even when the payer never comes back.

Nothing is accepted on Chapa's word. The submission goes through the usual pipeline: the Chapa connector checks the reference with the organization's key (`transaction/verify`), along with the amount and the receiving account.

**The platform's own payments.** The platform team's organization adds its Chapa key, CBE account and telebirr under **Platform, Platform payment accounts** (the Receiving accounts page). Its invoices are paid the same way. CBE and telebirr transfers work as before: transfer, then send the receipt or scan its QR.

## Ratings and reviews

**Who can review.** Only buyers:

- an item: a shopper with a verified phone and a paid order containing it;
- the store: a shopper with any paid order there.

Each person has one review per item or store, 1 to 5 stars with an optional title and text. They can change it later; changed reviews say "edited".

**What shoppers see.** The average, a breakdown by stars (tap a row to filter), sorting by newest, highest or lowest, and the author as first name plus initial ("Abebe K.", verified buyer).

**Where stars show:** on the store's cards and header, inside each item's sheet, in the app's item and store cards, and in search (*4 stars and up*, sort *Best rated*).

**The owner** (Storefront, Reviews) filters by stars or by answered and unanswered, replies in public, and hides a review that breaks the rules. Hidden reviews are not counted.

## Filters and search

| Where | Filters | Sorting |
|---|---|---|
| A store | Every word of the search; categories (several, with counts); price, with quick ranges from the store's own prices; rating; in stock; on sale; new; branch; the details items share (size, color, brand: from specifications and option groups). Chosen filters show as chips and stay in the address. | Featured, best selling (paid in 60 days), newest, best rated, biggest discount, price, name |
| The app's search | Every word across every listed store, deals or auctions, item category (with counts), price range, rating, kind of store, delivers, city or area (matches the store's city and any branch's city or area) | Best match, best rated, newest, biggest discount, price, ending soonest |
| The app's stores | Category, city or area, delivers, pickup, 4 stars and up, followed | Recently updated, best rated, most followed, most items, name |

## Theme settings, the item page, the cart and following (migration 061)

**Theme settings** (Storefront, Look and feel), in folding groups:

- **Theme and colors:** 12 themes, and a sale badge color.
- **Header and banner:** the name left or centered; the banner's text left or centered, and its height.
- **Items and cards:** columns on a phone (1 or 2); quick add, description, stars, badges and SKU on or off.
- **Shopping features:** filters, recently viewed, *You may also like*, free delivery progress and the phone cart bar on or off; what shows first.
- **About, policies and questions:** About, Delivery, Returns, Privacy, up to 12 questions, and a footer line.

The server keeps only these fields, checked: plain text without markup, `#rrggbb` colors and known choices (`cleanTheme`).

**The item page** opens for every item. It has:

- a photo gallery (the main picture and up to 8 more, from **More photos** in the item form);
- the saving and the stock;
- how many sold recently;
- options, add-ons and a quantity;
- **Add to cart** and **Buy now**, share and save;
- Description, Details, Allergens, Delivery and Returns;
- reviews, and *You may also like*.

**The cart** of a signed-in shopper is kept on the account (`/shop/me/carts/<store>`), on any device. The store reprices it from the catalog when it comes back, and drops lines that are no longer sold. A guest's cart lasts while the page is open, and goes to the account on signing in. The web app keeps nothing in browser storage. The checkout is filled from the account: name, phone, email and saved addresses.

**Recently viewed** items of a signed-in shopper are kept on the account (`/shop/me/views`, the last 100). The store and the app show the last 30 that are still sold.

**Following:** a shopper follows a store from its page or from the app (`PUT` and `DELETE /shop/me/follows/<store>`). The store shows its follower count. The app shows new items from followed stores and has a Following tab.

| Method and path | Who | Purpose |
|---|---|---|
| `GET /console/api/shop/me/follows` | shopper | Followed stores still listed, and their ids |
| `PUT`, `DELETE /console/api/shop/me/follows/:orgId` | shopper | Follow or unfollow; returns the follower count |
| `GET`, `PUT /console/api/shop/me/carts/:orgId` | shopper | The cart at a store (at most 100 lines); an empty cart is removed |
| `GET`, `POST`, `DELETE /console/api/shop/me/views` | shopper | Recently viewed items (`?orgId=` for one store) |
| `GET /console/api/shop/me/buy-again` | shopper | Items from paid orders still sold, most recent first |
| `GET /console/api/shop/stores` | anyone | Listed stores; `category`, `city`, `rating`, `delivery=1`, `pickup=1`, `sort` |

## Branches and employees

**Branches.** A store with several branches shows a branch filter. It shows the items sold at that branch (an item with no branches is sold at all of them), and checkout uses the branch's stock. In the app, store cards show the branch count and areas, and city search finds a store by any of its branches.

**The orders board** filters by branch and by *My orders* or *Not given to anyone*. In an order's sheet, **Handled by** gives it to an employee who packs, cooks or delivers it: only employees of that order's branch, each shown with their open orders. Each change goes on the order's timeline.

Employees themselves are managed under **People**: their role, their branches, sign-in rules. An employee limited to branches sees and handles only those branches' orders.

| Method and path | Who | Purpose |
|---|---|---|
| `GET /console/api/storefront/staff` | staff | Employees who can take orders, with their branches and open orders |
| `POST /console/api/storefront/orders/:id/assign` | cashier | `{ staffId }` or `{ staffId: null }` |
| `GET /console/api/storefront/reviews` | staff | All reviews, with `rating` and `replied` filters |
| `PUT /console/api/storefront/reviews/:id` | settings.manage | `{ reply?, hidden? }` |
| `GET /console/api/public/store/:orgId/reviews` | anyone | `itemId`, `sort`, `rating`; summary, reviews, the shopper's own, whether they may review |
| `POST /console/api/public/store/:orgId/reviews` | a buyer | `{ itemId?, rating, title?, body? }` |

## Design studio, motion and effects (migration 066)

**Motion and effects** are theme settings, all done with CSS on the store page. A phone set to reduce motion gets a still store, and nothing is hidden unless the reveal observer is running.

| Setting | What it does |
|---|---|
| Motion | None, subtle or lively: how far and how slowly things move in |
| Reveal on scroll | Sections and item cards rise in as they come into view |
| Cards lift, photos zoom | On hover |
| Banner style | Photo, gradient, moving gradient (aurora), split (text beside a photo or gradient panel), minimal (large type) |
| Glass header | See-through and blurred over the page |
| Moving announcement | The announcement bar scrolls like a ticker |
| Headings | Their own font, optionally in capitals |
| The add button says | Add, Order, Book, Add to bag, Enroll |

There are 24 themes. Each is tagged with the businesses it suits, so the editor shows **Recommended for your business** first, from the store's industry.

**The design studio**, above the theme settings, has two modes:

- **AI builder.** Describe the store, or tap an idea suggested for the business. The organization's connected AI (Creative Studio, AI: Claude, ChatGPT or Gemini) answers with a design as data: a template, a theme and a landing page. The server checks it field by field, like a design made by hand (`cleanTheme`, `cleanLanding`), so markup, unknown fields and bad values are dropped. The theme lands in the preview, and Save keeps it. **Use its landing page too** saves the sections and banners. The task is `store` on `POST /console/api/creative/ai/generate`; the reply comes back as `design`.
- **Script.** The whole design as editable JSON (`template`, `theme`, `landing`). It loads from the current design or from the AI's, and the same checks apply when it is applied.
