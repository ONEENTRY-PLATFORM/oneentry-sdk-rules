---
name: create-seo
description: Set up SEO for a OneEntry storefront — generateMetadata, sitemap.ts, robots.ts, JSON-LD, canonical/hreflang
---
# Set Up SEO for OneEntry Data

Creates `generateMetadata`, `src/app/sitemap.ts`, `src/app/robots.ts`, `JsonLd` component, and (optionally) `src/app/llms.txt/route.ts` — all based on real project data.

> Rule: `.claude/rules/seo-metadata.md`. Escaping CMS content — `.claude/rules/security.md`.

---

## Step 1: Gather Real Project Data

Do not hardcode anything. Four things are needed:

1. **Base URL of the site** — ask the user (`SITE_URL`); in env it is `NEXT_PUBLIC_SITE_URL`. Without it, canonical and sitemap cannot be generated.
2. **Locales** — `getApi().Locales.getLocales()` → `shortCode` of each. Do not invent `['en','ru']`.
3. **Markers for image attributes and description** — via `/inspect-api products`. Usually `pic`/`image` and `description`, but check definitely.
4. **Catalog size** — `Products.getProducts([], locale, { offset: 0, limit: 1 })` → `total`. Needed to set the sitemap `limit` higher than necessary.

If something is missing in the admin panel — create an entry in `MISMATCH-LOG.md` (`.claude/rules/mismatch-log.md`).

---

## Step 2: Clarify with the User

1. **Product variants** — are color/size established as separate entities? If yes, the sitemap is built from the aggregated list; otherwise, duplicate URLs will result.
2. **Which sections to block from indexing** beyond the default (`/cart`, `/favorites`, `/account`, `/checkout`, `/api`).
3. **Should the site be open to AI crawlers** (GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot) — for a store, usually yes, this is a traffic channel.

Do not ask about `llms.txt` (step 8) — it is created by default along with the other routes. Only skip it if the user explicitly refuses.

---

## Step 3: `generateMetadata` in Entity Routes

For each route that renders a OneEntry entity (product, CMS page, category):

```tsx
First — the root layout, one line, without which relative OG URLs resolve to `localhost`:

```tsx
// src/app/layout.tsx
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
}
```

Next — entity routes:

```tsx
export async function generateMetadata({ params }): Promise<Metadata> {
  const { id } = await params
  const entity = await getProduct(Number(id))   // the same cache()-wrapped loader as in page
  // noindex is mandatory: a placeholder page with status 200 is indexed as soft-404
  if (isError(entity)) return { title: 'Not found', robots: { index: false, follow: false } }

  const title = entity.localizeInfos?.title ?? ''
  const description = entity.localizeInfos?.plainContent?.slice(0, 160) ?? ''   // declared with v1.0.158
  const image = getImageUrl(entity.attributeValues?.pic)

  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/product/${id}` },
    openGraph: { title, description, images: image ? [image] : [] },
    twitter: { card: 'summary_large_image', title, description, images: image ? [image] : [] },
    robots: { index: true, follow: true },
  }
}
```

In `page.tsx` of the same route on `isError` — `notFound()`, not your own JSX "not found".

**Check:** the fetcher is wrapped in React `cache()` — otherwise `generateMetadata` and `page.tsx` will make two identical requests (`.claude/rules/performance-streaming.md`).

---

## Step 4: `src/app/sitemap.ts`

```typescript
import type { MetadataRoute } from 'next'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date().toISOString()

  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: 'daily', priority: 1.0 },
  ]

  // limit is deliberately greater than total from step 1 — default 30 will silently truncate the map
  const catalog = await loadProducts({ unique: true, limit: 5000 })
  const productPages: MetadataRoute.Sitemap = catalog.items.map((p) => ({
    url: `${SITE_URL}/product/${p.id}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  return [...staticPages, ...productPages]
}
```

Take `lastModified` from the entity's `updatedDate`: the same "now" date for all URLs signals that freshness cannot be trusted.

If the catalog is large (>5000), paginate in a loop by `offset`, rather than raising `limit` to infinity. As you approach 50,000 URLs (the protocol limit — considering language versions, this is closer than it seems), switch to `generateSitemaps` and sitemap index — `.claude/rules/seo-metadata.md`.

Multilingual project: each language version is a separate entry in the map with full `alternates.languages`.

---

## Step 5: `src/app/robots.ts`

```typescript
const PRIVATE_PATHS = ['/cart', '/favorites', '/account', '/checkout/', '/api/']

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: PRIVATE_PATHS },
      { userAgent: [
          'GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ClaudeBot', 'anthropic-ai',
          'PerplexityBot', 'YouBot', 'Amazonbot', 'meta-externalagent', 'Applebot-Extended',
        ],
        allow: ['/', '/product/'], disallow: PRIVATE_PATHS },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
```

---

## Step 6: `JsonLd` Component — with Escaping

```tsx
// src/components/JsonLd.tsx — Server Component
function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')       // ← mandatory: </script in product name will close the block
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />
}
```

Schemas by routes: `Product` + `Offer` (+ `AggregateRating` from **top-level** `entity.rating.value`) on the product page, `ItemList` on categories, `BreadcrumbList` on nested, `WebSite` + `SearchAction` in layout.

`Offer` — the minimum expected by Google (without these fields, the card will not appear in product listings):

```tsx
offers: {
  '@type': 'Offer',
  url, priceCurrency: currency.code,
  price: product.salePrice ?? product.price,      // discounted price — the one seen by the buyer
  priceValidUntil: priceValidUntil(30),           // YYYY-MM-DD, separate module: Date.now() in render is unclean
  availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',  // from statusIdentifier
  itemCondition: 'https://schema.org/NewCondition',
  shippingDetails: { '@type': 'OfferShippingDetails' /* threshold and terms */ },
  hasMerchantReturnPolicy: { '@type': 'MerchantReturnPolicy' /* return window */ },
}
```

Shipping threshold and return window — from the same source as `llms.txt` with the delivery page.

Also create `src/app/opengraph-image.tsx` (`ImageResponse` from `next/og`) — at least one banner on the site from brand settings; `size`/`contentType` there are static exports, `await` in them is impossible.

---

## Step 7: canonical and hreflang

```tsx
const locales = await getApi().Locales.getLocales()
const languages = Object.fromEntries(
  (isError(locales) ? [] : locales).map((l) => [l.shortCode, `${SITE_URL}/${l.shortCode}${path}`]),
)
languages['x-default'] = `${SITE_URL}${path}`   // mandatory: language for all not in the list
return { alternates: { canonical: `${SITE_URL}${path}`, languages } }
```

The canonical of the translated page points to itself, not to the default language version — otherwise the translation will drop out of the index.

---

## Step 8: Filters and Pagination in the Catalog

> Full rule: `.claude/rules/seo-facets.md`.

If the project has a catalog with filters (`/create-filter-panel`) — in `generateMetadata` for categories:

```tsx
const sp = await searchParams                        // Promise in Next 15+/16
const hasFilters = Object.keys(sp).some((k) => k !== 'page')

return {
  alternates: { canonical: hasFilters ? `${SITE_URL}/catalog/${slug}` : canonicalWithPage },
  robots: hasFilters ? { index: false, follow: true } : { index: true, follow: true },
}
```

Three things that are often done incorrectly:

1. `?page=2` is canonical **to itself**, not to the first page, and remains `index, follow`.
2. `follow` with `noindex` is preserved — otherwise the crawler will not reach products from filter pages.
3. Filters **are not** closed in `robots.txt`: disallowing crawling does not allow reading `noindex`, and already indexed combinations will remain in the output.

---

## Step 9: `llms.txt` — always created

> Full rule: `.claude/rules/llms-txt.md` (format, caching, fact synchronization, traps).

Format — **markdown according to the specification llmstxt.org**, not arbitrary text: `# Title` → blockquote with one sentence → sections `## …` with lists `- [Title](absolute URL): description`. Deviating from the structure deprives the file of meaning.

```typescript
// src/app/llms.txt/route.ts — segment with a dot in the name, returns exactly /llms.txt
import { getApiSafe, isError } from '@/lib/oneentry'

export const revalidate = 3600   // literal, not import and not computation

export async function GET() {
  const lines = [`# ${SITE_NAME}`, '', `> ${SITE_DESCRIPTION}`, '']

  const api = getApiSafe()          // not getApi(): OneEntry unavailable → return minimum, not 500
  if (api) {
    const pages = await api.Pages.getRootPages(DEFAULT_LOCALE)
    if (!isError(pages)) {
      lines.push('## Catalog', '')
      for (const p of pages) {
        const title = p.localizeInfos?.title ?? p.pageUrl
        lines.push(`- [${title}](${SITE_URL}/${p.pageUrl})`)
      }
      lines.push('')
    }
    // catalog size: only total, limit: 1 — do not unload all SKUs for the number
    const probe = await api.Products.getProducts([], DEFAULT_LOCALE, { offset: 0, limit: 1 })
    if (!isError(probe)) lines.push(`Total products in the catalog: ${probe.total}`, '')
  }
  lines.push('## Information', '', `- [Sitemap](${SITE_URL}/sitemap.xml): complete list of products`)

  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
```

Add sections with facts not in the sitemap: delivery and return, physical locations, policies, social networks. Numbers (threshold for free shipping, return period, currency) should be taken **from the same source as JSON-LD `Offer`** — discrepancies here give the buyer an incorrect response from the assistant, not a crooked snippet.

What NOT to include: the entire catalog (there is a sitemap for it — enough sections and key pages), cart/profile/checkout, sections that do not exist on the site.

⚠️ `export const dynamic = 'force-static'` **without** `revalidate` will freeze the file until the next deployment — the internal TTL of loaders does not save it.

---

## Step 10: Remind Key Rules

```md
1. No SEO route requires force-dynamic — metadata is read by the same ISR loaders
2. metadataBase in the root layout — otherwise relative OG URLs will go to localhost
3. sitemap: explicit limit (default 30 will silently truncate the catalog) + aggregation of variants, otherwise duplicate URLs
4. OG image — via common getImageUrl, NOT value[0] (1 file comes as an object)
5. description — from plainContent/plainValue, not htmlContent (tags in snippet)
6. JSON-LD is escaped: </script in product name = markup injection
7. Offer: availability from statusIdentifier + priceValidUntil + discounted price
8. AggregateRating — from top-level rating of the entity, not from attributeValues
9. hreflang and canonical — from Locales.getLocales() + x-default; translation is canonical to itself
10. Private sections (cart/favorites/account/checkout/api) — in disallow; filters — NOT in disallow, but noindex,follow
11. The "not found" branch — notFound() + robots.index: false, otherwise soft-404 with status 200
12. llms.txt — an addition to robots/JSON-LD/server rendering, not a reason for visibility in AI search
```

---

## Step 11: Verification

1. `/sitemap.xml` opens, the number of URLs is comparable to `total` from step 1.
2. `/robots.txt` contains a link to the sitemap and disallows private paths.
3. Product page: the HTML source contains `<script type="application/ld+json">` with valid JSON (check via Rich Results Test).
4. `<title>`, `<meta name="description">`, `og:image` are populated from CMS, not from defaults.
5. A product with an apostrophe/angle bracket in the name does not break JSON-LD.
6. `/llms.txt` opens as text (not downloaded), contains one H1 and blockquote immediately after it, links are absolute; the shipping threshold and return period in it match what is on the pages and in JSON-LD.
7. A category with a filter in the URL returns `<meta name="robots" content="noindex, follow">` and canonical to the clean category, while `?page=2` is canonical to itself.
8. A non-existent product ID: the page returns 404, not 200 with the text "not found".
