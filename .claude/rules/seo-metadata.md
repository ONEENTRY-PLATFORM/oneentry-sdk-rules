<!-- META
type: rules
fileName: seo-metadata.md
rulePaths: ["app/**/page.tsx","app/**/layout.tsx","app/sitemap.ts","app/robots.ts","app/manifest.ts"]
paths:
  - "app/**/page.tsx"
  - "app/**/layout.tsx"
  - "app/sitemap.ts"
  - "app/robots.ts"
  - "app/manifest.ts"
-->

# SEO and Metadata from OneEntry Data

Skill recipe: **`/create-seo`** — creates `sitemap.ts`, `robots.ts`, `JsonLd` component, and `generateMetadata` based on real project data.

Main principle: **everything is taken from OneEntry, nothing is hardcoded**. Titles are from `localizeInfos`, images are from `attributeValues`, the list of URLs is from `Products`/`Pages`, languages are from `Locales.getLocales()`. Hardcoding here means that when the content changes, the metadata silently diverges from the page content.

The mechanics of `generateMetadata` (why it can't be streamed and why React `cache()`) — `.claude/rules/performance-streaming.md`. Here — what exactly to put inside.

---

## 1. `generateMetadata` from entity data

```tsx
// app/product/[id]/page.tsx
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

- `getImageUrl` — a common helper from `lib/oneentry.ts`, not `value[0]` in place: a single file comes as an object (`.claude/rules/attribute-values.md`).
- In `description` — `plainContent`/`plainValue`, not `htmlContent`: tags in the search engine snippet look like garbage.
- Metadata reads **the same ISR-cached loaders**. `export const dynamic = 'force-dynamic'` is never needed for SEO.

---

## 2. `sitemap.ts` — from live data, with aggregation of variants

```typescript
// app/sitemap.ts
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
2. **Product variants.** If color/size are registered as separate entities with the same page URL, duplicates will appear in the map. Build the map from an **aggregated** list (merging variants), not from the raw response.

---

## 3. `robots.ts` — private sections and AI crawlers

```typescript
const PRIVATE_PATHS = ['/cart', '/favorites', '/account', '/checkout/', '/api/']

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: PRIVATE_PATHS },
      // AI assistants: product pages are intentionally open to them — this is a traffic channel
      { userAgent: ['GPTBot', 'ChatGPT-User', 'ClaudeBot', 'anthropic-ai', 'PerplexityBot'],
        allow: ['/', '/product/'], disallow: PRIVATE_PATHS },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
```

Cart, favorites, profile, checkout — always in `disallow`: these are user/guest-scoped pages, there is nothing to index there.

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

About `rating`: aggregate rating is **a field of the entity**, not an attribute; why this is so — `.claude/rules/attribute-values.md`, section "Final Rating".

### ⚠️ JSON-LD in `<script>` must be escaped

The HTML parser looks for the literal `</script` **before** the JSON is parsed. A product name with `</script><img onerror=…>` will close the block prematurely and inject markup — that is, JSON-LD becomes a second channel for injecting CMS content, besides `dangerouslySetInnerHTML` (see `.claude/rules/security.md`).

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

## 5. canonical and hreflang — from the project's locales

```tsx
const locales = await getApi().Locales.getLocales()   // do not hardcode ['en','ru']
const languages = Object.fromEntries(
  (isError(locales) ? [] : locales).map((l) => [l.shortCode, `${SITE_URL}/${l.shortCode}${path}`]),
)

return { alternates: { canonical: `${SITE_URL}${path}`, languages } }
```

A hardcoded list of languages diverges from the admin panel when adding a locale — and hreflang starts pointing to 404.

---

## 6. `llms.txt` — project map for LLM assistants

`/llms.txt` (specification — [llmstxt.org](https://llmstxt.org)) gives the assistant the structure of the project instead of parsing the HTML showcase.

> ⚠️ **Sober about the status.** This is a proposed standard, not an accepted one: there is no confirmed support from major AI crawlers (OpenAI, Anthropic, Google), and Google representatives have expressed skepticism about it. In reality, it is read by assistants that have been given a link to the site, and some documentation tools.
>
> **Visibility in AI search (AI Overviews, ChatGPT Search, Perplexity) is provided not by it, but by three things from the sections above:** access for AI crawlers in `robots.ts`, JSON-LD markup, and content in server-side HTML, not just after hydration. `llms.txt` is a cheap addition to them (half an hour of work, one ISR route), not a replacement. If time is short — first do the first three.

### The format is markdown, not arbitrary text

The specification strictly defines the structure, and deviation from it deprives the file of meaning: parsers look for exactly these elements.

```markdown
# Store Name

> One sentence about what this project is. A blockquote must immediately follow H1.

Arbitrary paragraphs with context: what you sell, delivery regions, languages.

## Catalog

- [Women's Clothing](https://shop.example/catalog/women): dresses, tops, shoes
- [Men's Clothing](https://shop.example/catalog/men): shirts, pants

## Information

- [Delivery and Payment](https://shop.example/delivery): terms, regions, methods
- [Sitemap](https://shop.example/sitemap.xml): complete list of products

## Optional

- [Blog](https://shop.example/blog): articles about materials and care
```

The `## Optional` section is what the assistant may skip if there is not enough context. Everything else is considered important, so do not dump the entire catalog there.

### Generation from live data

```typescript
// app/llms.txt/route.ts
import { getApiSafe, isError } from '@/lib/oneentry'

export const revalidate = 3600   // literal: segment config cannot be computed (.claude/rules/isr-config.md)

export async function GET() {
  const lines = [`# ${SITE_NAME}`, '', `> ${SITE_DESCRIPTION}`, '']

  const api = getApiSafe()
  if (api) {
    // Catalog sections — the same root pages as in navigation
    const pages = await api.Pages.getRootPages(DEFAULT_LOCALE)
    if (!isError(pages)) {
      lines.push('## Catalog', '')
      for (const p of pages) {
        const title = p.localizeInfos?.title ?? p.pageUrl
        const desc = p.localizeInfos?.plainContent?.slice(0, 100) ?? ''
        lines.push(`- [${title}](${SITE_URL}/${p.pageUrl})${desc ? `: ${desc}` : ''}`)
      }
      lines.push('')
    }
  }

  lines.push('## Information', '', `- [Sitemap](${SITE_URL}/sitemap.xml): complete list of products`, '')

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
```

### Four content rules

1. **Do not list the entire catalog.** Two thousand products in `llms.txt` is not a map, but a dump; for a complete list, there is `sitemap.xml`, refer to it. In the file — sections and up to several dozen key pages.
2. **Nothing user-scoped.** Cart, favorites, profile, checkout — do not get included, just like in `robots.ts`: there is nothing to index and nothing to show the assistant.
3. **Degradation instead of 500.** If OneEntry is unavailable — return a static minimum (title, description, link to sitemap), not an error: a broken `llms.txt` is worse than a short one. Hence `getApiSafe()` instead of `getApi()` (see `.claude/rules/sdk-init.md`).
4. **Nothing that is not on the site.** The file is read by an assistant that then responds to the customer; an invented section turns into an invented response.

### Route traps

- The segment name — with a dot: `app/llms.txt/route.ts`. This is a valid Next route that returns exactly `/llms.txt`.
- `Content-Type` — `text/plain; charset=utf-8`. `text/markdown` causes some crawlers to download it as a file instead of reading it.
- **Do not set `force-dynamic`.** The content changes with the CMS, not with every request; ISR is sufficient here, and dynamics increases latency unnecessarily.
- Multilingual project: `llms.txt` — one, in the default language, and language versions should be listed as links. Separate `/en/llms.txt` is not provided for in the specification.
- `llms-full.txt` (full text content) should only be created if the content is genuinely textual — for the showcase, this is usually unnecessary.

---

## Checklist

1. `generateMetadata` takes data from `localizeInfos`/`attributeValues`, the fetch is wrapped in React `cache()`.
2. OG image — through the common `getImageUrl`, not `value[0]`.
3. `sitemap.ts` is built with an explicit high `limit` and from an aggregated list without duplicate URLs.
4. `robots.ts` blocks cart/favorites/account/checkout/api.
5. JSON-LD is serialized with escaping of `<`, `>`, `&`, U+2028/29.
6. `AggregateRating` is taken from top-level `rating`, not from attributes.
7. canonical + hreflang are built from `Locales.getLocales()`.
8. No SEO route required `force-dynamic`.
9. If you make `llms.txt` — first create robots for AI crawlers, JSON-LD, and server-side rendered content: they affect visibility in AI search, and `llms.txt` is an addition.

> Related rules: `.claude/rules/performance-streaming.md` (`generateMetadata` and `cache()`), `.claude/rules/localization.md` (locales and `langCode`), `.claude/rules/security.md` (escaping CMS content), `.claude/rules/isr-config.md` (TTL of loaders that read metadata).
