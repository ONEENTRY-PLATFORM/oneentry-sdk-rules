---
name: create-seo
description: Set up SEO for a OneEntry storefront — generateMetadata, sitemap.ts, robots.ts, JSON-LD, canonical/hreflang
---
# Configure SEO for OneEntry Data

Creates `generateMetadata`, `src/app/sitemap.ts`, `src/app/robots.ts`, `JsonLd` component, and (optionally) `src/app/llms.txt/route.ts` — all based on real project data.

> Rule: `.claude/rules/seo-metadata.md`. Escaping CMS content — `.claude/rules/security.md`.

---

## Step 1: Gather Real Project Data

Do not hardcode anything. Four things are needed:

1. **Base URL of the site** — ask the user (`SITE_URL`); in env it's `NEXT_PUBLIC_SITE_URL`. Without it, canonical and sitemap cannot be generated.
2. **Locales** — `getApi().Locales.getLocales()` → `shortCode` of each. Do not invent `['en','ru']`.
3. **Markers for image attributes and description** — via `/inspect-api products`. Usually `pic`/`image` and `description`, but check for sure.
4. **Catalog volume** — `Products.getProducts([], locale, { offset: 0, limit: 1 })` → `total`. Needed to set the sitemap `limit` higher than necessary.

If something is missing in the admin panel — create an entry in `MISMATCH-LOG.md` (`.claude/rules/mismatch-log.md`).

---

## Step 2: Clarify with the User

1. **Product variants** — are color/size established as separate entities? If yes, the sitemap is built from the aggregated list; otherwise, there will be duplicate URLs.
2. **Which sections to block from indexing** beyond the default (`/cart`, `/favorites`, `/account`, `/checkout`, `/api`).
3. **Should the site be open to AI crawlers** (GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot) — usually yes for a store, it's a traffic channel.

Do not ask about `llms.txt` (step 8) — it is created by default along with the other routes. Only skip it if the user explicitly refuses.

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

  // limit is deliberately higher than total from step 1 — default 30 will silently truncate the map
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

If the catalog is large (>5000), paginate in a loop by `offset`, rather than raising `limit` indefinitely.

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

## Step 8: `llms.txt` — always created

> Full rule: `.claude/rules/llms-txt.md` (format, caching, fact synchronization, pitfalls).

Format — **markdown according to llmstxt.org specification**, not arbitrary text: `# Title` → blockquote with one sentence → sections `## …` with lists `- [Title](absolute URL): description`. Deviating from the structure deprives the file of meaning.

```typescript
// src/app/llms.txt/route.ts — segment with a dot in the name, serves exactly /llms.txt
import { getApiSafe, isError } from '@/lib/oneentry'

export const revalidate = 3600   // literal, not import or computation

export async function GET() {
  const lines = [`# ${SITE_NAME}`, '', `> ${SITE_DESCRIPTION}`, '']

  const api = getApiSafe()          // not getApi(): OneEntry is unavailable → provide minimum, not 500
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
    // catalog volume: only total, limit: 1 — do not unload all SKUs for the number
    const probe = await api.Products.getProducts([], DEFAULT_LOCALE, { offset: 0, limit: 1 })
    if (!isError(probe)) lines.push(`Total products in the catalog: ${probe.total}`, '')
  }
  lines.push('## Information', '', `- [Sitemap](${SITE_URL}/sitemap.xml): complete list of products`)

  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
```

Add sections with facts that are not in the sitemap: delivery and return, physical locations, policies, social networks. Numbers (threshold for free shipping, return period, currency) should be taken **from the same source as JSON-LD `Offer`** — discrepancies here give the buyer an incorrect response from the assistant, not a broken snippet.

What NOT to include: the entire catalog (there is a sitemap for that — enough sections and key pages), cart/profile/checkout, sections that do not exist on the site.

⚠️ `export const dynamic = 'force-static'` **without** `revalidate` will freeze the file until the next deployment — the internal TTL of loaders does not save it.

---

## Step 9: Remind Key Rules

```md
1. No SEO route requires force-dynamic — metadata is read by the same ISR loaders
2. sitemap: explicit limit (default 30 will silently truncate the catalog) + aggregation of variants, otherwise duplicate URLs
3. OG image — via common getImageUrl, NOT value[0] (1 file comes as an object)
4. description — from plainContent/plainValue, not htmlContent (tags in the snippet)
5. JSON-LD is escaped: </script in product name = markup injection
6. AggregateRating — from top-level rating of the entity, not from attributeValues
7. hreflang and canonical — from Locales.getLocales(), not hardcoded
8. Private sections (cart/favorites/account/checkout/api) — in disallow
9. llms.txt — an addition to robots/JSON-LD/server rendering, not a reason for visibility in AI search
```

---

## Step 10: Verification

1. `/sitemap.xml` opens, the number of URLs is comparable to `total` from step 1.
2. `/robots.txt` contains a link to the sitemap and disallows private paths.
3. Product page: in the HTML source there is `<script type="application/ld+json">` with valid JSON (check via Rich Results Test).
4. `<title>`, `<meta name="description">`, `og:image` are populated from CMS, not from defaults.
5. A product with an apostrophe/angle bracket in the name does not break JSON-LD.
6. `/llms.txt` opens as text (not downloaded), contains one H1 and blockquote immediately after it, links are absolute; the threshold for delivery and return period in it matches what is on the pages and in JSON-LD.
