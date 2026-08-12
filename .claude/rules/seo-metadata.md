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

Skill recipe: **`/create-seo`** — creates `sitemap.ts`, `robots.ts`, `JsonLd` component, and `generateMetadata` using real project data.

Main principle: **everything is taken from OneEntry, nothing is hardcoded**. Titles are from `localizeInfos`, images are from `attributeValues`, the list of URLs is from `Products`/`Pages`, languages are from `Locales.getLocales()`. Hardcoding here means that when the content changes, the metadata silently diverges from the page content.

The mechanics of `generateMetadata` (why it cannot be streamed and why React `cache()`) — `.claude/rules/performance-streaming.md`. Here — what exactly to put inside.

---

## 1. `generateMetadata` with entity data

```tsx
// src/app/product/[id]/page.tsx
export async function generateMetadata({ params }): Promise<Metadata> {
  const { id } = await params                   // params — Promise in Next 15+/16
  const product = await getProduct(Number(id))  // the same cache()-wrapped loader as in page
  if (isError(product)) return { title: 'Not found' }

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
  }
}
```

- `getImageUrl` — a common helper from `src/lib/oneentry.ts`, not `value[0]` in place: a single file comes as an object (`.claude/rules/attribute-values.md`).
- In `description` — `plainContent`/`plainValue`, not `htmlContent`: tags in the search engine snippet look like garbage.
- Metadata reads **the same ISR-cached loaders**. `export const dynamic = 'force-dynamic'` is never needed for SEO.

---

## 2. `sitemap.ts` — from live data, with aggregation of variants

```typescript
// src/app/sitemap.ts
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date().toISOString()

  const staticPages = [
    { url: SITE_URL, lastModified: now, changeFrequency: 'daily' as const, priority: 1.0 },
  ]

  // limit is deliberately higher than the number of SKUs in the project — the default limit will silently truncate the map
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

1. **Default `limit`.** SDK methods return the first page (usually 30). A sitemap of 30 products when there are 2000 in the catalog is the most common and unnoticed mistake: there is no error, just half the site is not indexed. Always pass an explicit high `limit` or paginate.
2. **Product variants.** If color/size are separate entities with the same page URL, duplicates will appear in the map. Build the map from an **aggregated** list (merging variants), not from the raw response.

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

Three groups of user-agents differ in meaning, and this should be communicated to the user: **search** (`OAI-SearchBot`, `PerplexityBot`) brings traffic, **link browsing** (`ChatGPT-User`) is a request from a live user, **training** (`GPTBot`, `Applebot-Extended`, `Bytespider`) indexes content into the model. A store usually needs all three, a media project — often only the first two.

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

About `rating`: aggregate rating is a **field of the entity**, not an attribute; why this is so — `.claude/rules/attribute-values.md`, section "Final Rating".

### ⚠️ JSON-LD in `<script>` must be escaped

The HTML parser looks for the literal `</script` **before** the JSON is parsed. A product name with `</script><img onerror=…>` will close the block prematurely and inject markup — that is, JSON-LD becomes a second channel for CMS content injection, besides `dangerouslySetInnerHTML` (see `.claude/rules/security.md`).

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
const locales = await getApi().Locales.getLocales()   // do not hardcode ['en','ru']
const languages = Object.fromEntries(
  (isError(locales) ? [] : locales).map((l) => [l.shortCode, `${SITE_URL}/${l.shortCode}${path}`]),
)

return { alternates: { canonical: `${SITE_URL}${path}`, languages } }
```

A hardcoded list of languages diverges from the admin panel when a locale is added — and hreflang starts pointing to 404.

---

## 6. `llms.txt` — project map for AI assistants

`/llms.txt` ([llmstxt.org](https://llmstxt.org)) provides the assistant with the structure of the showcase and its key facts in markdown instead of parsing HTML. It is done **together with other SEO routes, by default** — this is one ISR route on live data.

Format according to the specification, generation from OneEntry, route caching, synchronization of facts (delivery, return, currency) with JSON-LD and traps — **`.claude/rules/llms-txt.md`**.

It is important to understand the order of contribution: visibility in AI search is provided by sections 3 (access for AI crawlers), 4 (JSON-LD), and server-side rendering of content, while `llms.txt` is a cheap addition to them, not a replacement.

---

## Checklist

1. `generateMetadata` takes data from `localizeInfos`/`attributeValues`, the fetch is wrapped in React `cache()`.
2. OG image — through the common `getImageUrl`, not `value[0]`.
3. `sitemap.ts` is built with an explicit high `limit` and from an aggregated list without duplicate URLs.
4. `robots.ts` disallows cart/favorites/account/checkout/api.
5. JSON-LD is serialized with escaping of `<`, `>`, `&`, U+2028/29.
6. `AggregateRating` is taken from top-level `rating`, not from attributes.
7. canonical + hreflang are built from `Locales.getLocales()`.
8. No SEO route required `force-dynamic`.
9. `llms.txt` created (by default, not on request) — and after robots for AI crawlers, JSON-LD, and server-side rendering of content, not instead of them.

> Related rules: `.claude/rules/llms-txt.md` (full `llms.txt`), `.claude/rules/performance-streaming.md` (`generateMetadata` and `cache()`), `.claude/rules/localization.md` (locales and `langCode`), `.claude/rules/security.md` (escaping CMS content), `.claude/rules/isr-config.md` (TTL of loaders that read metadata).
