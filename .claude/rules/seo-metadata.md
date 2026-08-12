---
paths:
  - "app/**/page.tsx"
  - "src/app/**/page.tsx"
  - "app/**/layout.tsx"
  - "src/app/**/layout.tsx"
  - "app/sitemap.ts"
  - "src/app/sitemap.ts"
  - "app/robots.ts"
  - "src/app/robots.ts"
  - "app/manifest.ts"
  - "src/app/manifest.ts"
---
# SEO and Metadata from OneEntry Data

Skill recipe: **`/create-seo`** — creates `sitemap.ts`, `robots.ts`, `JsonLd` component, and `generateMetadata` based on real project data.

Main principle: **everything is taken from OneEntry, nothing is hardcoded**. Titles come from `localizeInfos`, images from `attributeValues`, the list of URLs from `Products`/`Pages`, languages from `Locales.getLocales()`. Hardcoding here means that when content changes, metadata silently diverges from the page content.

The mechanics of `generateMetadata` (why it can't be streamed and why React `cache()` is needed) — `.claude/rules/performance-streaming.md`. Here — what exactly to put inside.

---

## 1. `generateMetadata` with entity data

```tsx
// src/app/product/[id]/page.tsx
export async function generateMetadata({ params }): Promise<Metadata> {
  const { id } = await params                   // params — Promise in Next 15+/16
  const product = await getProduct(Number(id))  // the same cache()-wrapped loader as in page
  // Not found — must be noindex: a placeholder page with status 200 is indexed as soft-404
  if (isError(product)) return { title: 'Not found', robots: { index: false, follow: false } }

  const title = product.localizeInfos?.title ?? ''
  // plainContent for description: htmlContent will give tags in the snippet (field declared with v1.0.158)
  const description = product.localizeInfos?.plainContent?.slice(0, 160) ?? ''
  const image = getImageUrl(product.attributeValues?.pic)  // NOT value[0] — the form depends on the number of files

  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/product/${id}` },
    openGraph: { title, description, images: image ? [image] : [], type: 'website' },
    twitter: { card: 'summary_large_image', title, description, images: image ? [image] : [] },
    robots: { index: true, follow: true },
  }
}
```

- `getImageUrl` — a common helper from `src/lib/oneentry.ts`, not `value[0]` in place: a single file comes as an object (`.claude/rules/attribute-values.md`).
- In `description` — `plainContent`/`plainValue`, not `htmlContent`: tags in the search engine snippet look like garbage.
- Metadata reads **the same ISR-cached loaders**. `export const dynamic = 'force-dynamic'` is never needed for SEO.

### `metadataBase` in the root layout — one line, without which previews break

```tsx
// src/app/layout.tsx
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),        // from env, not a string in code
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  openGraph: { siteName: SITE_NAME, type: 'website' },
}
```

Without `metadataBase`, Next resolves relative image paths relative to `localhost:3000` (in dev mode — with a warning in the console, in prod — silently broken URL). The OG image from OneEntry comes as an absolute link, while static `/og.png`, icons, and `alternates` do not.

`title.template` also eliminates the need to append the store name in each `generateMetadata`: the page returns only its name.

### `robots` in metadata — not the same as `robots.ts`

`robots.ts` manages **crawling** at the site level, the `robots` field in `Metadata` — **indexing** of a specific page. The second is needed where the first is powerless: a not found entity, a page with filters, an empty result, a draft from the CMS.

```tsx
robots: { index: false, follow: true }   // do not index, but follow links further
```

Details about filters and pagination — `.claude/rules/seo-facets.md`.

### Soft-404 — most often this is `isError`, handled "softly"

If the loader returned an error, and the page rendered "product not found" with a regular 200 response — for the search engine, this is a full page with poor content. A couple of rules:

- In `page.tsx` on `isError` — `notFound()`, not your own JSX with error text.
- In `generateMetadata` of the same route — `robots: { index: false, follow: false }`.
- Note: `notFound()` in Server Component with `force-dynamic` renders not-found UI, but returns **status 200** (`.claude/rules/playwright-e2e.md`) — another reason not to include `force-dynamic` unnecessarily.

---

## 2. `sitemap.ts` — from live data, with aggregation of variants

```typescript
// src/app/sitemap.ts
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date().toISOString()

  const staticPages = [
    { url: SITE_URL, lastModified: now, changeFrequency: 'daily' as const, priority: 1.0 },
  ]

  // limit is deliberately greater than the number of SKUs in the project — the default limit will silently truncate the map
  const catalog = await loadProducts({ unique: true, limit: 5000 })
  const productPages = catalog.items.map((p) => ({
    url: `${SITE_URL}/product/${p.id}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }))

  return [...staticPages, ...productPages]
}
```

⚠️ **Two traps:**

1. **Default `limit`.** SDK methods return the first page (usually 30). A sitemap of 30 products when there are 2000 in the catalog — the most common and unnoticed error: there is no error, just half the site is not indexed. Pass an explicit high `limit` or paginate.
2. **Product variants.** If color/size are entered as separate entities with the same page URL, duplicates will appear in the map. Build the map from an **aggregated** list (merging variants), not from the raw response.

### Large catalog — sitemap index via `generateSitemaps`

The protocol limit is **50,000 URLs and 50 MB** per file. It is closer than it seems: 12,000 products × 4 locales — this is already 48,000 entries, and the next added locale will silently truncate the map.

```typescript
// src/app/sitemap.ts
const PER_SITEMAP = 10_000        // with a margin for hreflang alternatives

export async function generateSitemaps() {
  const { total } = await loadProducts({ unique: true, limit: 1 })   // just a counter
  return Array.from({ length: Math.ceil(total / PER_SITEMAP) }, (_, id) => ({ id }))
}

export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  const catalog = await loadProducts({ unique: true, limit: PER_SITEMAP, offset: id * PER_SITEMAP })
  return catalog.items.map((p) => ({ url: `${SITE_URL}/product/${p.id}`, lastModified: p.updatedDate }))
}
```

Routes are of the form `/sitemap/0.xml`, `/sitemap/1.xml`; in `robots.ts` the link remains one — to the index.

### `lastModified` and language versions

- `lastModified` is taken from **`updatedDate` of the entity**, not from `new Date()`. The date "now" for all URLs at once — signals that the freshness data cannot be trusted, and the crawler stops considering them.
- Multilingual project: each language version is a **separate entry** in the map, and each has a full set of translations in `alternates.languages`. Without entries, the translated page is crawled randomly; without `alternates`, versions look like duplicates, not translations of each other.

---

## 3. `robots.ts` — private sections and AI crawlers

```typescript
const PRIVATE_PATHS = ['/cart', '/favorites', '/account', '/checkout/', '/api/']

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: PRIVATE_PATHS },
      // AI assistants: product pages are intentionally open to them — this is a traffic channel
      { userAgent: [
          'GPTBot', 'ChatGPT-User', 'OAI-SearchBot',   // OpenAI: training, browsing, search
          'ClaudeBot', 'anthropic-ai',                 // Anthropic
          'PerplexityBot', 'YouBot',                   // AI search engines
          'Amazonbot', 'meta-externalagent', 'Applebot-Extended', 'cohere-ai',
        ],
        allow: ['/', '/product/'], disallow: PRIVATE_PATHS },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
```

Cart, favorites, profile, checkout — always in `disallow`: these are user/guest-scoped pages, there is nothing to index there.

Three groups of user-agents differ in meaning, and this should be communicated to the user: **search engines** (`OAI-SearchBot`, `PerplexityBot`) bring traffic, **link browsing** (`ChatGPT-User`) is a request from a live user, **training** (`GPTBot`, `Applebot-Extended`, `Bytespider`) index content into the model. The store usually needs all three, a media project — often only the first two.

---

## 4. JSON-LD — and mandatory escaping

Schemas that pay off on the OneEntry showcase:

| Schema | Where | Data source |
| --- | --- | --- |
| `Product` + `Offer` | product page | `localizeInfos`, `attributeValues.price/sale`, `statusIdentifier` |
| `AggregateRating` | product page | **top-level `entity.rating.value`**, not `attrs.rating` |
| `ItemList` | category, catalog | list of products on the page |
| `BreadcrumbList` | all nested | page tree (`Pages`) |
| `WebSite` + `SearchAction` | layout | project search URL |
| `LocalBusiness` | contacts, stores | CMS contacts page |

About `rating`: aggregate rating — **entity field**, not an attribute; why this is so — `.claude/rules/attribute-values.md`, section "Final Rating".

### `Offer` — four fields without which the card will not appear in product results

`price` + `priceCurrency` are not enough: Google Merchant and rich results require more, and silently lower the card if fields are missing.

```tsx
offers: {
  '@type': 'Offer',
  url: `${SITE_URL}/product/${id}`,
  priceCurrency: currency.code,                    // from settings, the same source as on the showcase
  price: product.salePrice ?? product.price,       // price seen by the buyer, with discount
  priceValidUntil: priceValidUntil(30),            // YYYY-MM-DD; without it — warning in Merchant
  availability: product.inStock
    ? 'https://schema.org/InStock'
    : 'https://schema.org/OutOfStock',             // from statusIdentifier (.claude/rules/product-statuses.md)
  itemCondition: 'https://schema.org/NewCondition',
  shippingDetails: { '@type': 'OfferShippingDetails', /* thresholds and terms from the same settings */ },
  hasMerchantReturnPolicy: { '@type': 'MerchantReturnPolicy', /* return window from there */ },
}
```

- **`availability` — from the product's `statusIdentifier`**, not from the presence of an image or a non-zero price. The correspondence of admin statuses to schema.org values is fixed once in the helper.
- **`priceValidUntil` — in a separate module, not inline in the component.** `Date.now()` in the render body — is an impure operation: the render must be safe for repetition, and the React linter catches this. If there is no expiration date for the price in OneEntry, declare a sliding window (30 days) — this is more honest than the absence of the field.
- **Delivery and return figures — from the same source**, as the delivery page and `llms.txt` (`.claude/rules/llms-txt.md`). Three places with three different thresholds for free shipping — a typical result of hardcoding.
- The price in JSON-LD is **the one seen by the buyer**. Markup with the old price during a discount on the showcase — is a reason for sanctions from Merchant Center, not a minor inaccuracy.

### Dynamic OG image

One banner for the entire site loses to the product image: in messengers and social networks, the preview is half the decision to click.

```tsx
// file opengraph-image.tsx in the product route folder (next to page.tsx)
import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const product = await getProduct(Number(id))     // the same cache()-wrapped loader
  return new ImageResponse(<div style={{ display: 'flex' /* … */ }}>{/* name + price */}</div>, size)
}
```

- `size`, `contentType`, `alt` — static exports: Next reads them without executing the request, `await` is not possible there.
- Inside `ImageResponse`, a subset of CSS works (flex — yes, grid — no), and each container needs an explicit `display`.
- The route is cached like a regular ISR page; it does not require a separate `force-dynamic`.
- A simple option — one `src/app/opengraph-image.tsx` for the entire site from brand settings; product-specific — is already an improvement on top of it.

### ⚠️ JSON-LD in `<script>` must be escaped

The HTML parser looks for the literal `</script` **before** the JSON is parsed. A product name with `</script><img onerror=…>` will close the block prematurely and inject markup — that is, JSON-LD becomes a second channel for injecting CMS content, in addition to `dangerouslySetInnerHTML` (see `.claude/rules/security.md`).

```tsx
function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')   // legal in JSON, but breaks the string in JS
    .replace(/\u2029/g, '\\u2029')
}

export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />
}
```

Escaped `<` — regular JSON for any consumer and inert for the parser.

---

## 5. canonical and hreflang — from project locales

```tsx
const locales = await getApi().Locales.getLocales()   // not hardcoded ['en','ru']
const languages = Object.fromEntries(
  (isError(locales) ? [] : locales).map((l) => [l.shortCode, `${SITE_URL}/${l.shortCode}${path}`]),
)
languages['x-default'] = `${SITE_URL}${path}`         // default language, without prefix

return { alternates: { canonical: `${SITE_URL}${path}`, languages } }
```

- A hardcoded list of languages diverges from the admin panel when adding a locale — and hreflang starts pointing to 404.
- **`x-default` is mandatory.** It tells the search engine what to show to a user whose language is not in the project set. Without it, an arbitrary version is chosen — usually not the right one.
- **The canonical of the translated page points to itself**, not to the default language version. Canonicalizing the translation to the original throws the translation out of the index entirely — a typical error when adding a locale to an already functioning project.
- The helper for building alternatives should be covered with a unit test (`.claude/rules/unit-testing.md`): an error here does not crash the build and is discovered months later by a drop in traffic in one language.

---

## 6. Removed products and catalog filters

A product that has been removed from the assortment is a URL that has already been indexed and is linked to. What to do with it depends on what happened in the admin panel:

| Situation | Response | Why |
| --- | --- | --- |
| Temporarily out of stock | 200, page lives, `availability: OutOfStock` | will return to sale; deletion will reset accumulated positions |
| Removed permanently, there is a replacement | 301 to an analog or category | transfers link weight to a live page |
| Removed permanently, no replacement | 410 (or 404) | clear signal "the page no longer exists", drops out of the index faster than 404 |
| Hidden/draft in CMS | 404 + `noindex` | no content for the public |

The decision is made based on the entity's `statusIdentifier` (`.claude/rules/product-statuses.md`), not based on the fact that "the loader returned null": an empty response can also occur due to a network failure — returning 410 due to a timeout is not allowed. And in any case, the removed product disappears from `sitemap.ts`: a sitemap full of URLs with a status of 404 devalues it for the crawler entirely.

Filters, sorting, and pagination of the catalog are a separate and more expensive topic, covered in **`.claude/rules/seo-facets.md`**.

---

## 7. `llms.txt` — project map for AI assistants

`/llms.txt` ([llmstxt.org](https://llmstxt.org)) provides the assistant with the structure of the showcase and its key facts in markdown instead of parsing HTML. This is done **along with other SEO routes, by default** — it is one ISR route on live data.

Format according to the specification, generation from OneEntry, route caching, synchronization of facts (delivery, return, currency) with JSON-LD and traps — **`.claude/rules/llms-txt.md`**.

It is important to understand the order of contribution: visibility in AI search is provided by sections 3 (access for AI crawlers), 4 (JSON-LD), and server-side rendering of content, while `llms.txt` is a cheap addition to them, not a replacement.

---

## Checklist

1. `generateMetadata` takes data from `localizeInfos`/`attributeValues`, the fetch is wrapped in React `cache()`.
2. `metadataBase` is set in the root layout; `title.template` frees pages from appending the site name.
3. OG image — through a common `getImageUrl`, not `value[0]`; `opengraph-image.tsx` exists at least at the site level.
4. The "not found" branch returns `notFound()` + `robots: { index: false }` — no soft-404 with status 200.
5. `sitemap.ts` is built with an explicit high `limit` and from an aggregated list without duplicate URLs; for catalogs larger than ~10,000 URLs — through `generateSitemaps`.
6. `lastModified` — from the entity's `updatedDate`, not `new Date()`; language versions in the map with `alternates.languages`.
7. `robots.ts` closes cart/favorites/account/checkout/api; catalog filters are **not** closed in it (`.claude/rules/seo-facets.md`).
8. JSON-LD is serialized with escaping `<`, `>`, `&`, U+2028/29.
9. `Offer` contains `availability` (from `statusIdentifier`), `priceValidUntil`, `itemCondition`, delivery and return from a common source; price — with discount, as seen on the showcase.
10. `AggregateRating` is taken from top-level `rating`, not from attributes.
11. canonical + hreflang are built from `Locales.getLocales()`, there is `x-default`, the translation is canonical to itself.
12. Removed products are processed by `statusIdentifier` (200 / 301 / 410) and disappear from the sitemap.
13. No SEO route required `force-dynamic`.
14. `llms.txt` created (by default, not on request) — and after robots for AI crawlers, JSON-LD, and server-side rendering of content, not instead of them.

> Related rules: `.claude/rules/seo-facets.md` (filters, pagination, URL duplicates), `.claude/rules/llms-txt.md` (entire `llms.txt`), `.claude/rules/product-statuses.md` (product statuses), `.claude/rules/performance-streaming.md` (`generateMetadata` and `cache()`), `.claude/rules/localization.md` (locales and `langCode`), `.claude/rules/security.md` (escaping CMS content), `.claude/rules/isr-config.md` (TTL of loaders that read metadata).
