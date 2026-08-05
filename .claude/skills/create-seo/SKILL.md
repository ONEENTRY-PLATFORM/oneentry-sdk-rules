---
name: create-seo
description: Set up SEO for a OneEntry storefront — generateMetadata, sitemap.ts, robots.ts, JSON-LD, canonical/hreflang
---
# Set Up SEO for OneEntry Data

Creates `generateMetadata`, `app/sitemap.ts`, `app/robots.ts`, `JsonLd` component, and (optionally) `app/llms.txt/route.ts` — all based on real project data.

> Rule: `.claude/rules/seo-metadata.md`. Escaping CMS content — `.claude/rules/security.md`.

---

## Step 1: Gather Real Project Data

Do not hardcode anything. Four things are needed:

1. **Base URL of the site** — ask the user (`SITE_URL`); in env it is `NEXT_PUBLIC_SITE_URL`. Without it, canonical and sitemap cannot be generated.
2. **Locales** — `getApi().Locales.getLocales()` → `shortCode` of each. Do not invent `['en','ru']`.
3. **Markers for image attributes and description** — through `/inspect-api products`. Usually `pic`/`image` and `description`, but check it carefully.
4. **Catalog size** — `Products.getProducts([], locale, { offset: 0, limit: 1 })` → `total`. Needed to set the sitemap `limit` higher than necessary.

If something is missing in the admin panel — create an entry in `MISMATCH-LOG.md` (`.claude/rules/mismatch-log.md`).

---

## Step 2: Clarify with the User

1. **Product variants** — are color/size set as separate entities? If yes, the sitemap is built from the aggregated list; otherwise, there will be duplicate URLs.
2. **Which sections to block from indexing** beyond the default (`/cart`, `/favorites`, `/account`, `/checkout`, `/api`).
3. **Should the site be open to AI crawlers** (GPTBot, ClaudeBot, PerplexityBot) — usually yes for a store, it's a traffic channel.
4. **Is `llms.txt` needed?**

---

## Step 3: `generateMetadata` in Entity Routes

For each route that renders a OneEntry entity (product, CMS page, category):

```tsx
export async function generateMetadata({ params }): Promise<Metadata> {
  const { id } = await params
  const entity = await getProduct(Number(id))   // the same cache()-wrapped loader as in page
  if (isError(entity)) return { title: 'Not found' }

  const title = entity.localizeInfos?.title ?? ''
  const description = entity.localizeInfos?.plainContent?.slice(0, 160) ?? ''   // declared with v1.0.158
  const image = getImageUrl(entity.attributeValues?.pic)

  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/product/${id}` },
    openGraph: { title, description, images: image ? [image] : [] },
    twitter: { card: 'summary_large_image', title, description, images: image ? [image] : [] },
  }
}
```

**Check:** the fetcher is wrapped in React `cache()` — otherwise, `generateMetadata` and `page.tsx` will make two identical requests (`.claude/rules/performance-streaming.md`).

---

## Step 4: `app/sitemap.ts`

```typescript
import type { MetadataRoute } from 'next'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date().toISOString()

  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: 'daily', priority: 1.0 },
  ]

  // limit is deliberately higher than total from step 1 — the default 30 will silently truncate the map
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

If the catalog is large (>5000), paginate in a loop by `offset`, rather than raising `limit` to infinity.

---

## Step 5: `app/robots.ts`

```typescript
const PRIVATE_PATHS = ['/cart', '/favorites', '/account', '/checkout/', '/api/']

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: PRIVATE_PATHS },
      { userAgent: ['GPTBot', 'ChatGPT-User', 'ClaudeBot', 'anthropic-ai', 'PerplexityBot'],
        allow: ['/', '/product/'], disallow: PRIVATE_PATHS },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
```

---

## Step 6: `JsonLd` Component — with Escaping

```tsx
// components/JsonLd.tsx — Server Component
function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')       // ← mandatory: </script in the product name will close the block
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />
}
```

Schemas by routes: `Product` + `Offer` (+ `AggregateRating` from **top-level** `entity.rating.value`) on the product page, `ItemList` on categories, `BreadcrumbList` on nested ones, `WebSite` + `SearchAction` in layout.

---

## Step 7: canonical and hreflang

```tsx
const locales = await getApi().Locales.getLocales()
const languages = Object.fromEntries(
  (isError(locales) ? [] : locales).map((l) => [l.shortCode, `${SITE_URL}/${l.shortCode}${path}`]),
)
return { alternates: { canonical: `${SITE_URL}${path}`, languages } }
```

---

## Step 8: Remind Key Rules

```md
1. No SEO route requires force-dynamic — metadata is read by the same ISR loaders
2. sitemap: explicit limit (default 30 will silently truncate the catalog) + aggregation of variants, otherwise duplicate URLs
3. OG image — through a common getImageUrl, NOT value[0] (1 file comes as an object)
4. description — from plainContent/plainValue, not htmlContent (tags in the snippet)
5. JSON-LD is escaped: </script in the product name = markup injection
6. AggregateRating — from top-level rating of the entity, not from attributeValues
7. hreflang and canonical — from Locales.getLocales(), not hardcoded
8. Private sections (cart/favorites/account/checkout/api) — in disallow
```

---

## Step 9: Verification

1. `/sitemap.xml` opens, the number of URLs is comparable to `total` from step 1.
2. `/robots.txt` contains a link to the sitemap and disallows private paths.
3. Product page: the HTML source contains `<script type="application/ld+json">` with valid JSON (check via Rich Results Test).
4. `<title>`, `<meta name="description">`, `og:image` are populated from CMS, not from defaults.
5. A product with an apostrophe/angle bracket in the name does not break JSON-LD.
