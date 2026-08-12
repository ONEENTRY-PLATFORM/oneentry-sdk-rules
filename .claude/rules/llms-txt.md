---
paths:
  - "app/llms.txt/route.ts"
  - "src/app/llms.txt/route.ts"
  - "app/llms-full.txt/route.ts"
  - "src/app/llms-full.txt/route.ts"
  - "app/robots.ts"
  - "src/app/robots.ts"
---
# `llms.txt` — project map for AI assistants

The file `/llms.txt` ([llmstxt.org](https://llmstxt.org)) provides the assistant with the structure of the showcase and its key facts in markdown — instead of parsing HTML with scripts, popups, and a cart.

General SEO routes (`sitemap.ts`, `robots.ts`, JSON-LD, canonical/hreflang) — `.claude/rules/seo-metadata.md`. Here is only `llms.txt`. The skill recipe is **`/create-seo`**, which creates this route as part of the SEO wrapper.

---

## 1. Do — always, but do not confuse with the reason for visibility

**Default rule: `llms.txt` is created along with other SEO routes, without a separate question to the user.** This is one ISR route on live data; it makes sense to abandon it only if the user explicitly said "no."

> ⚠️ **Soberly about the status (mid-2026).** This is a proposed standard, not an accepted one. Google has publicly stated that it does not support it and does not plan to; OpenAI documents `robots.txt`, not `llms.txt`; Anthropic has the file on its website, but there is no confirmation that Claude reads other people's `llms.txt` when searching. Traffic measurements of AI bots show single requests to `/llms.txt` for hundreds of millions of visits. In reality, the file is read by assistants who have **been given a link to the site** (chat with URL, "explore this store"), and documentation tools.

**Visibility in AI search (AI Overviews, ChatGPT Search, Perplexity) is influenced by other factors — in this order:**

1. **Access for AI crawlers in `robots.ts`** — if `GPTBot`/`OAI-SearchBot`/`ClaudeBot`/`PerplexityBot` are closed, the rest does not matter.
2. **Content in server-side HTML.** Assistants do not wait for hydration: price and description, redrawn on the client after `useEffect`, do not exist for them. See `.claude/rules/performance-streaming.md`.
3. **JSON-LD** (`Product`, `Offer`, `AggregateRating`, `BreadcrumbList`) — machine-readable facts that do not need to be extracted from the layout.
4. **`llms.txt`** — a cheap addition to the first three, not a replacement. If you only do this — you did it wrong.

Do not promise the user an increase in traffic from ChatGPT after `llms.txt`. The honest wording is: "an assistant who has been given a link to the site will understand the structure and will not invent sections."

---

## 2. Format — markdown by specification, not free text

The specification sets a strict structure, and deviation from it deprives the file of meaning: the parser looks for exactly these elements.

```markdown
# Store Name

> One sentence about what this project is. Blockquote is mandatory and goes immediately after H1.

Context paragraphs: what you sell, delivery regions, currency, languages.

## Catalog

- [Women's Clothing](https://shop.example/women): dresses, tops, shoes
- [Men's Clothing](https://shop.example/men): shirts, pants

## Delivery and Returns

- Free delivery from 5,000 RUB
- Delivery time: 2–5 business days
- Returns within 14 days

## Information

- [Payment and Delivery](https://shop.example/info/delivery)
- [Sitemap](https://shop.example/sitemap.xml): full list of products

## Optional

- [Blog](https://shop.example/blog): articles about materials and care
```

- `# H1` — exactly one, the name of the project.
- `> blockquote` — exactly one sentence immediately after H1. This is what the assistant will quote first.
- Lists — `- [Name](absolute URL): brief description`. Relative URLs are useless here: the file is read outside the context of the domain.
- `## Optional` — what the assistant can skip if there is not enough context. Do not dump the catalog and policies there.

---

## 3. Route and caching

```typescript
// src/app/llms.txt/route.ts — segment with a dot in the name, serves exactly /llms.txt
import { getApiSafe, isError } from '@/lib/oneentry'

export const revalidate = 3600   // literal: segment config cannot be computed (.claude/rules/isr-config.md)

export async function GET() {
  // …string assembly…
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
```

⚠️ **Three traps of the route:**

1. **`export const dynamic = 'force-static'` without `revalidate` freezes the file until the next deployment.** The Route Handler is cached at build time entirely, and the internal TTL of loaders (`unstable_cache`, ISR) no longer changes anything: the number of products, the list of stores and sections will remain as they were at the time of assembly. If you set `force-static` — be sure to include `revalidate`; it’s easier to just set `revalidate`.
2. **Do not set `force-dynamic`.** The content changes with the CMS, not with each request; dynamics hit latency unnecessarily.
3. **Do not write `Cache-Control` manually if you do not understand what you are doing.** `max-age=86400` in public cache keeps an outdated file for a day — ISR revalidation will not reach the client. If the header is still needed, the order is: `public, max-age=0, s-maxage=3600, stale-while-revalidate=86400` — the `stale-while-revalidate` window **is greater** than the main TTL, not less.

`Content-Type` — `text/plain; charset=utf-8`. With `text/markdown`, some crawlers download the file instead of reading it.

---

## 4. Content — from OneEntry, not from the head

The same principle as in all SEO: headings — from `localizeInfos`, sections — from `Pages`, the number of products — from `total`, locales — from `Locales.getLocales()`.

```typescript
const api = getApiSafe()          // not getApi(): OneEntry is unavailable → give the minimum, not 500
const lines = [`# ${SITE_NAME}`, '', `> ${SITE_DESCRIPTION}`, '']

if (api) {
  const pages = await api.Pages.getRootPages(DEFAULT_LOCALE)
  if (!isError(pages)) {
    lines.push('## Catalog', '')
    for (const p of pages) {
      const title = p.localizeInfos?.title ?? p.pageUrl
      const desc = p.localizeInfos?.plainContent?.slice(0, 100) ?? ''   // not htmlContent: tags in text
      lines.push(`- [${title}](${SITE_URL}/${p.pageUrl})${desc ? `: ${desc}` : ''}`)
    }
    lines.push('')
  }

  // Catalog volume: only total is needed — limit: 1, not exporting all SKUs
  const probe = await api.Products.getProducts([], DEFAULT_LOCALE, { offset: 0, limit: 1 })
  if (!isError(probe)) lines.push(`Total products in the catalog: ${probe.total}`, '')
}

lines.push('## Information', '', `- [Sitemap](${SITE_URL}/sitemap.xml): full list of products`)
```

**Four content rules:**

1. **Do not list the entire catalog.** Two thousand products — this is not a map, but a dump; for a complete list, there is `sitemap.xml`, refer to it. In the file — sections and up to several dozen key pages.
2. **Nothing user-scoped.** Cart, favorites, profile, checkout — do not get included, just like in `robots.ts`.
3. **Degradation instead of 500.** OneEntry is unavailable — give a static minimum (H1, blockquote, link to sitemap). A broken `llms.txt` is worse than a short one. Hence `getApiSafe()` (`.claude/rules/sdk-init.md`).
4. **Nothing that is not on the site.** The file is read by an assistant who then responds to the buyer: an invented section turns into an invented answer.

⚠️ **Do not export the catalog for a single number.** `loadProducts({ unique: true, limit: 5000 })` just to print "there are N products in the catalog" — this is several megabytes of response for each revalidation. `limit: 1` + `total` gives the same number. The exception is when the counter must be by "families" of products (color/size variants are merged): then reuse the already cached aggregated catalog that `sitemap.ts` lives on, rather than making a second request.

---

## 5. Facts in `llms.txt` and on the site — from one source

`llms.txt` is useful precisely because it contains facts that the assistant would otherwise have to extract from the layout: the threshold for free shipping, return period, currency, store cities, social networks. And for this reason, it is more dangerous than any other SEO route: **discrepancies here turn into incorrect answers to the buyer**, not into a crooked snippet.

The delivery threshold, return period, and currency code must be taken **from the same source** as the JSON-LD `Offer` on the product page and the text on the delivery page. A hardcoded number in the `llms.txt` template lives its own life and diverges from the site after the first edit in the admin panel.

⚠️ **Currency symbol — from the same place as its code.** A template like `All prices in ${currency.code}. Free shipping from $${threshold}` when changing currency in the admin panel outputs "All prices in GBP … from $50". Either both the symbol and the code are taken from one setting, or write the amount with the code: `from 50 GBP`.

⚠️ **Do not mix counters of different entities in one phrase.** `${stores.length} stores in cities: ${uniqueCities}` with 5 stores in 4 cities reads as "stores in five cities" — the assistant will respond that way. Count what you list: `${cities.length}`.

---

## 6. File texts — editable in the admin panel

Working pattern: constant formulations (brand positioning, AI crawling policy, section headings) are stored **in OneEntry** — for example, in a settings set with the prefix marker `llms_txt_*`, — and in the code, there remains a fallback object with the same keys. Read the dictionary, overlay it on the fallback, take the missing from the code. The editor edits the text without deployment, and the assembly does not fail due to an empty marker.

Substituting numbers into such texts — only through placeholders (`%threshold%`, `%count%`), because **the value from the CMS cannot be a template string**: the function is not stored there. The same technique as in other dictionaries of the project (`.claude/rules/localization.md`).

⚠️ The price of this convenience — the editor can write a fact in `llms.txt` that is not on the site. In the CMS, only the **formulation** is extracted, numbers and lists are always substituted from the data. If the formulation requires a fact that is not in the admin panel (for example, "stores in 5 countries"), — this is an item in `MISMATCH-LOG.md` (`.claude/rules/mismatch-log.md`), not text in the file.

---

## 7. Multilingualism

`llms.txt` — **one**, in the default language: separate `/en/llms.txt` is not provided for by the specification, and the Route Handler is still outside the `[locale]` segment, meaning the locale is passed explicitly, not read from params.

List language versions of the showcase as links within the file (`## Optional` or a separate section) — this is enough for the assistant to find the required language.

---

## 8. Useful sections for the showcase

In addition to the catalog and policies, the assistant is really helped by facts that are not in `sitemap.xml` or in the JSON-LD of a single page:

| Section | What we include | Source |
| --- | --- | --- |
| Delivery and Returns | threshold for free shipping, timelines, return window, methods | settings/CMS delivery page |
| Physical Locations | addresses, cities, links to maps | store entities in OneEntry |
| Information and Policies | offer, privacy, FAQ, warranty | CMS pages `info/*` |
| Social Networks | links to profiles | brand settings |
| AI Crawling Policy | what can be indexed, reference to `robots.txt` | text in CMS |

The section about AI crawling is a polite copy of what is already written in `robots.ts`, not a second source of truth: private sections do not need to be listed there, just a link to `/robots.txt` is sufficient.

---

## 9. `llms-full.txt`

Only create if the project's content is truly text-based (documentation, knowledge base, large blog). For the showcase, this is usually unnecessary: a full dump of product cards is the same as "the entire catalog," which is saved by `sitemap.xml`.

---

## Checklist

1. First, robots for AI crawlers, server-side rendering of content, and JSON-LD are done — `llms.txt` comes after them, not instead.
2. Route — `src/app/llms.txt/route.ts`, `Content-Type: text/plain; charset=utf-8`.
3. `revalidate` — literal; `force-static` without `revalidate` is not left; `force-dynamic` is absent.
4. Manual `Cache-Control` is either absent or `stale-while-revalidate` is greater than the main TTL.
5. Structure by specification: one H1, blockquote immediately after it, sections `##`, absolute links.
6. OneEntry is unavailable → give the minimum, not 500 (`getApiSafe`).
7. The number of products is obtained through `limit: 1` + `total` or from an already cached catalog, not by exporting all SKUs.
8. Delivery threshold, return period, currency match JSON-LD and pages — because they are taken from one source.
9. Currency symbol is not hardcoded next to the dynamic currency code.
10. The file does not contain cart, favorites, profile, checkout, and sections that are not on the site.
11. The file is opened at `/llms.txt` and read as markdown, not downloaded.

> Related rules: `.claude/rules/seo-metadata.md` (robots, sitemap, JSON-LD, hreflang), `.claude/rules/isr-config.md` (`revalidate` as a literal), `.claude/rules/sdk-init.md` (`getApiSafe` and degradation), `.claude/rules/localization.md` (dictionaries and locales), `.claude/rules/mismatch-log.md` (fact not in admin panel).
