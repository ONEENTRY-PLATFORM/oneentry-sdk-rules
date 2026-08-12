# Filters, Pagination, and Duplicate URLs in the Catalog

The filter panel (`/create-filter-panel`) and product list (`/create-product-list`) generate URLs like `?color=red&size=M&sort=price`. Each combination is a separate page for the crawler, and their number grows as the product of facet values: 5 colors × 6 sizes × 3 sorts — already 90 URLs for one category with almost identical content.

The price of the error is not cosmetic: the crawling budget is spent on combinations, product pages are crawled less frequently, and the category itself competes in the search results with its own variants. This is the most expensive SEO mistake of the storefront — and the least noticeable, because nothing breaks.

Basic metadata, `sitemap.ts`, `robots.ts`, and JSON-LD — `.claude/rules/seo-metadata.md`. Here’s what to do with URL parameters.

---

## 1. Three Classes of Catalog URLs

| Class | Example | canonical | `robots` |
| --- | --- | --- | --- |
| Category without parameters | `/catalog/shoes` | itself | `index, follow` |
| Pagination | `/catalog/shoes?page=3` | **itself** | `index, follow` |
| Filters, sorting, view | `/catalog/shoes?color=red&sort=price` | to the clean category | `noindex, follow` |

The exception in the third row is a **consciously promoted facet** (“women's sneakers”, “polka dot dresses”): it gets its own route (`/catalog/shoes/women`), not a query parameter, and is indexed like a regular category. The query string never goes into the index.

---

## 2. Implementation in `generateMetadata`

```tsx
// src/app/catalog/[slug]/page.tsx
type SearchParams = Promise<Record<string, string | string[] | undefined>>

// Parameters that are NOT considered a filter: pagination page remains indexable
const PAGINATION_KEYS = new Set(['page'])

export async function generateMetadata(
  { params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams },
): Promise<Metadata> {
  const { slug } = await params
  const sp = await searchParams                    // searchParams — Promise in Next 15+/16
  const page = await getPageByUrl(slug)            // the same cache()-wrapped loader as in page.tsx
  if (isError(page)) return { title: 'Not found', robots: { index: false, follow: false } }

  const hasFilters = Object.keys(sp).some((k) => !PAGINATION_KEYS.has(k))
  const pageNum = Number(Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1

  // canonical of pagination — ITSELF, not to the first page
  const canonical = hasFilters
    ? `${SITE_URL}/catalog/${slug}`
    : `${SITE_URL}/catalog/${slug}${pageNum > 1 ? `?page=${pageNum}` : ''}`

  const title = page.localizeInfos?.title ?? slug
  return {
    title: pageNum > 1 ? `${title} — page ${pageNum}` : title,
    description: page.localizeInfos?.plainContent?.slice(0, 160) ?? '',
    alternates: { canonical },
    robots: hasFilters ? { index: false, follow: true } : { index: true, follow: true },
  }
}
```

Two common mistakes:

- **`follow` remains `true` even with `noindex`.** Otherwise, a crawler that visits the filter page will not follow the links to products — and many internal links lead to combinations of facets.
- **The title of the pagination page differs from the first.** Identical `<title>` tags for `?page=1..20` are collapsed by Google as duplicates regardless of canonical.

---

## 3. `?page=N` — self-canonical, not canonical to the first

Canonicalizing the second page to the first is a common mistake: Google interprets such a canonical as erroneous and ignores it, and in the worst case, it removes from crawling products that are only visible on deep pages.

- `?page=2` is canonical to itself, `index, follow`.
- `rel="next"`/`rel="prev"` has not been used by Google since 2019 — no harm, no benefit.
- Infinite scroll without changing the URL for the crawler means “only the first 24 products in the category.” Either real pagination with links `<a href="?page=2">` is needed, or a “show all” link to a page without pagination.
- The page `?page=999` outside the catalog should not return an empty list with status 200, but `notFound()`: otherwise, it results in a soft-404 (see `.claude/rules/seo-metadata.md`).

---

## 4. Do not block filters in `robots.txt`

The temptation seems logical: `Disallow: /*?color=` — and the problem is solved. In reality, this breaks the solution: **a crawler that is forbidden to crawl URLs cannot read `noindex` on it.** Already indexed combinations will remain in the index (without a snippet, “blocked by robots.txt”), and the weight from internal links through them will stop being passed.

The correct combination:

1. `noindex, follow` in the metadata of the filter page — this is the exclusion mechanism.
2. `robots.ts` only blocks what should not be crawled at all: `/cart`, `/account`, `/checkout`, `/api`.
3. If after indexing you need to speed up removal — parameters remain open until Google re-crawls them and sees `noindex`.

---

## 5. Empty filter output — not 200

The combination “red + size 44 + in stock”, for which there are no products, should not return a page with the text “nothing found” and status 200: for the search engine, this is a soft-404, and such pages degrade the quality rating of the entire section.

```tsx
const products = await loadProducts({ pageUrl: slug, filters })
// An empty list with specified filters — valid UX, but not an indexable page
if (products.items.length === 0 && hasFilters) {
  return { robots: { index: false, follow: false } }   // UI renders normally
}
```

An empty **category** (there are no products in the CMS at all) is a different case: this is a temporary content state, `notFound()` would be harmful here. Just `noindex` until products appear.

---

## 6. Which facets to open

The decision is made based on project data, not taste:

- A facet deserves its own indexable route if there is search demand **and** it consistently has more than a few dozen products.
- Facet values are taken from the project's `attributeSets` (`.claude/rules/attribute-values.md`), not hardcoded: the set of colors and sizes changes in the admin panel, and a hardcoded “white list” silently breaks.
- Sorting and display mode (`sort`, `view`, `perPage`) are never indexed — they do not change the composition of products, only the order.

If there is no separate page (`pageUrl`) for the promoted facet in the admin panel, this is a point in `MISMATCH-LOG.md` (`.claude/rules/mismatch-log.md`), not a homemade route on top of query parameters.

---

## 7. ISR and Pre-generation

- `generateStaticParams` — only for categories, never for combinations of filters: pre-generating the Cartesian product of facets bloats the build and almost all goes to waste.
- Filter pages live on the same ISR loader as the category; `force-dynamic` for “freshness of filters” is not needed (`.claude/rules/isr-config.md`).
- Filtering is performed **by querying OneEntry** with parameters, not by fetching from the full catalog on the client: the second option breaks both pagination and server-side HTML, which crawlers and AI assistants read.

---

## Checklist

1. A page with any filtering parameter — `noindex, follow` + canonical to the clean category.
2. `?page=N` — `index, follow` + self-canonical; canonical to the first page is not set.
3. `<title>` of pagination pages differs by number.
4. `sort`, `view`, `perPage` are not indexed.
5. Filters **are not** blocked in `robots.txt` — otherwise, `noindex` will not be read.
6. Empty filter output — `noindex`, not 200 with “nothing found”; `?page` outside the catalog — `notFound()`.
7. Pagination — real links `<a href>`, not just infinite scroll.
8. `generateStaticParams` does not expand combinations of facets.
9. The promoted facet is moved to a separate route with its own page in the CMS, not left as a query parameter.

> Related rules: `.claude/rules/seo-metadata.md` (metadata, sitemap, JSON-LD), `.claude/rules/attribute-values.md` (facet values), `.claude/rules/isr-config.md` (TTL of catalog loaders), `.claude/rules/common-patterns.md` (pagination and filtering in SDK). Skills: `/create-filter-panel`, `/create-product-list`, `/create-seo`.
