# What the big shops do, and where MySeed stands

A store on MySeed is compared feature by feature with the shops people already use, so it feels familiar. The reference sites are:

- **Shopify**: a store's theme editor, collection pages and policies;
- **Amazon**: filters, the product page, buy again and recently viewed;
- **Jumia**: a marketplace app with categories, flash deals and followed sellers;
- **Etsy**: a shop's About, its policies and favorite shops;
- **Temu and AliExpress**: deals, coupons and the free-shipping bar;
- **Glovo and Uber Eats**: delivery areas, menus and reorder.

Status:

- **Built**: added in migration 061 and this release.
- **Had**: already in MySeed before.
- **Later**: not built yet.

Code: the store page is `store-customer.tsx`, `store-browse.tsx` and `store-product.tsx`. The theme editor is `storefront-theme.tsx`. The app is `shop-app.tsx`. The server is `shop.ts`, `commerce.ts` and `storefront-theme.ts`. Tests: `tests/e2e/store-browse.test.mjs`.

## Theme settings (Shopify's theme editor)

| Feature | Seen at | Status |
|---|---|---|
| Ready-made themes | Shopify | **Had**, 8 themes; **Built**, 4 more (Marketplace, Pharmacy, Restaurant Red, Lavender) |
| Colors, type, corners, buttons, spacing | Shopify | Had |
| A sale badge color | Shopify, Temu | Built |
| The store name left or centered | Shopify | Built |
| The banner's text placement and height | Shopify | Built |
| Columns on a computer; **columns on a phone (1 or 2)** | Shopify | Had; phone **Built** |
| Card parts on or off: quick add, description, stars, badges, SKU | Shopify | Built |
| Shopping features on or off: filters, sorting, recently viewed, related items, free-delivery bar, phone cart bar, the verified-payments note | Shopify | Built |
| What shows first: featured, best selling, newest, best rated, biggest discount, price, name | Shopify, Amazon | 4 sorts **Had**; 4 **Built** |
| About the store, Delivery, Returns and Privacy, Questions (up to 12), a footer line | Shopify, Etsy | Built |
| Settings in folding groups | Shopify | Built |
| Live preview beside the editor | Shopify | Had (the storefront builder) |
| Custom code (CSS, HTML) | Shopify | **Not offered on purpose.** The server keeps only checked fields, so a theme can never carry code to shoppers. |

## Finding things in a store (Amazon and Jumia filters)

| Feature | Seen at | Status |
|---|---|---|
| Search by every word, in any order: name, description, SKU, category, tags | Amazon | Built (before: one phrase) |
| Category chips | Jumia | Had |
| Several categories at once, with counts | Amazon | Built |
| Price: quick ranges from the store's own prices, and from/to | Amazon | Ranges **Built**; from/to Had |
| Customer rating, 4 and up or 3 and up, with counts | Amazon | Had; counts **Built** |
| In stock, on sale, new arrivals | Amazon, Jumia | In stock Had; the others **Built** |
| Branch | Glovo | Had |
| Details the items share: size, color with swatches, brand, material | Amazon, Shopify | Built (from each item's specifications and option groups) |
| A count beside each choice; choices that would show nothing are greyed | Amazon | Built |
| Chosen filters as chips, removed one by one, and Clear all | Amazon, Jumia | Built |
| Number of results | Amazon | Built |
| Filters kept in the address, so a filtered page can be shared | Amazon, Shopify | Built |
| Filters in a sidebar on a computer, a sheet on a phone | Amazon, Jumia | Built |
| Help when nothing matches | Amazon | Built |

## The item page (Amazon's and Shopify's product page)

| Feature | Seen at | Status |
|---|---|---|
| Its own page for every item, not only items with options | Amazon | Built |
| A photo gallery: swipe, arrows, thumbnails, "3 photos" on the card | Amazon, Shopify | Built (up to 8 more photos per item, https links) |
| Price, the old price, "Save ETB X" | Amazon, Jumia | Built |
| Stock: in stock, only N left, sold out | Amazon | Had; on the page **Built** |
| Number sold recently | Temu, Jumia | Built (5 or more in 60 days) |
| Options, add-ons and quantity | Amazon | Options and add-ons Had; quantity **Built** |
| Add to cart and Buy now | Amazon | Built |
| Share the item, save it for later | Amazon, Etsy | Save Had; share **Built** |
| Description, Details, Allergens, Delivery, Returns sections | Amazon, Shopify | Built |
| Reviews with stars and photos | Amazon | Had (no photos yet; photos are **Later**) |
| You may also like | Amazon | Built (same category, tags, similar names) |
| A shared item link opens the item | Shopify | Had (`#item:<id>`) |

## Cart and checkout (Shopify, Temu)

| Feature | Seen at | Status |
|---|---|---|
| The cart is kept on the shopper's account, on any device, and repriced when it comes back | Amazon, Shopify | Built (as a guest, it lasts while the page is open: the web app keeps nothing in browser storage) |
| A guest's cart goes to the account on signing in | Amazon | Built |
| Item photos in the cart, and a tap opens the item | Shopify | Built |
| A stock limit and a per-order limit on + | Amazon | Built |
| Free delivery progress: "Add ETB X for free delivery" | Temu, Shopify | Built (from the delivery areas, or free with a membership) |
| A cart bar fixed to the bottom on phones | Jumia, Glovo | Built |
| Name, phone and email from the account; saved addresses to choose from | Amazon | Built |
| Vouchers, memberships, delivery areas, pickup branch, table orders | Temu, Glovo | Had |
| Pay by bank or wallet, checked with the bank; Pay with Chapa | (local) | Had |

## The store's own page (Etsy and Shopify)

| Feature | Seen at | Status |
|---|---|---|
| Follow the store, with a follower count | Etsy, Jumia | Built |
| About the store, policies, questions and answers | Etsy, Shopify | Built |
| Branches with their areas | Glovo | Built |
| Recently viewed at this store | Amazon | Built |
| Landing sections: banners, deals with a countdown, best sellers, auctions, collections, vouchers, memberships | Shopify, Jumia | Had |
| Reviews of the store, with replies from the owner | Etsy | Had |
| Telegram Mini App and a QR stand | (local) | Had |

## The customer app: MySeed Shop (Jumia and Glovo)

| Feature | Seen at | Status |
|---|---|---|
| Home: deals, auctions ending soon, best sellers, new, stores | Jumia | Had |
| Recently viewed, across stores | Amazon | Built |
| Buy again: items from paid orders that are still sold | Amazon, Glovo | Built (on the home page and under Orders) |
| From stores you follow | Etsy, Jumia | Built |
| Top rated stores | Glovo | Built |
| A stores page: by category or city, delivers, pickup, 4 stars and up, followed, sorted by rating, followers, items or name | Glovo, Jumia | Built |
| Search suggestions: recent searches, deals, auctions and categories | Amazon, Jumia | Built |
| Search filters: kind of store, delivers, item category chips with counts, biggest discount sort | Amazon | Built |
| Load more results | Amazon | Built (40 at a time) |
| Orders split into In progress and Past | Amazon, Glovo | Built |
| Make an address the default | Amazon | Built |
| Saved items show when they are no longer sold | Amazon | Built |
| A Following tab | Etsy | Built |
| Installable on a phone, with its own name, icon and shortcuts (Search, Deals, My orders, Saved) | Jumia | Built (`shop.webmanifest`, and an "Add to home screen" offer) |
| An Android app; store, shop and tracking links open in it | Jumia, Glovo | Built (`apps/shop-android`; see its README) |
| Push notifications for order status and price drops | Jumia, Amazon | Later |
| Live courier tracking on a map | Glovo | Later |
| Item questions and answers | Amazon | Later |
| Comparing items side by side | Amazon | Later |
| Amharic text in the shop | (local) | Later (the console has it; the shop pages are in English) |
