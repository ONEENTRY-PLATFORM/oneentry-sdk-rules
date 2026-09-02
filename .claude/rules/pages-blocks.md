# Content, Pages, and Blocks OneEntry

> To create a content page from the CMS, use the skill **`/create-page`**.
> Rules for `params`/`searchParams` (Next.js 15+) and working with `langCode`: `.claude/rules/nextjs-pages.md` (loaded when working with `page.tsx`/`layout.tsx`).

**⚠️ CRITICALLY IMPORTANT: pageUrl is a MARKER, not a full path!**

In OneEntry, the `pageUrl` field is a **page identifier/marker**, NOT the actual URL of the application route.

```typescript
// ❌ INCORRECT - passing the full route path
const categoryPage = await getApi().Pages.getPageByUrl('shop/category/ship_designer', locale)

// ✅ CORRECT - passing only the page marker
const categoryPage = await getApi().Pages.getPageByUrl('ship_designer', locale)

// Same for Products
const products = await getApi().Products.getProductsByPageUrl('ship_designer', [], locale)
// NOT 'shop/category/ship_designer'!
```

**Rule:** The route URL in Next.js (for example `/shop/category/ship_designer`) and `pageUrl` in OneEntry (`"ship_designer"`) are **different things**. When calling OneEntry SDK methods, always use only the marker from `pageUrl`.

## Multilingual Content

```typescript
// Page in Russian
const pageRU = await getApi().Pages.getPageByUrl('about', 'ru_RU')

// Menu in English
const menuEN = await getApi().Menus.getMenusByMarker('main', 'en_US')
```

## Navigation Menu with Hierarchy

To create a navigation menu with support for submenus and URL prefixes, use the skill **`/create-menu`** — it will correctly handle the hierarchy through `parentId`, normalize `pages`, and build the URL.

## Working with Blocks and Attributes

> Table of `attributeValues` types and access examples: `.claude/rules/attribute-values.md` (loaded when working with `*.tsx` components).

### What is a Block

**A block is a reusable entity.** The idea is that the same content is displayed in multiple places and edited in one: footer, promotional banner, contact block, promo strip. The binding is bidirectional, and both paths are equivalent: the block has a **Linked pages** tab (a tree of pages and categories with checkboxes where it is displayed), and the page has a **Blocks** tab with a **Block selection** field and a list of linked blocks, which is sorted immediately. It is more convenient to bind a cross-cutting element to a batch of pages from the block, and from the page — to assemble the page itself from blocks: its entire composition and order are visible in one place.

Hence the design choice rule: content belonging to one page (its title, cover, description) is **page attributes**; content that appears on multiple pages and should change at once is a **block**. A banner set up with attributes for each page will need to be edited as many times as there are pages.

Two ways to get a block on display:

- `Pages.getBlocksByPageUrl(pageUrl, locale)` — all blocks linked to the page, in `position` order;
- `Blocks.getBlockByMarker(marker, locale)` — a specific block by marker when it is cross-cutting and not linked to the page (footer, header, global banner).

> **An empty personal block is the norm, not an error.** Recommended blocks in the admin panel have an Audience Filter: rules "who to show" based on profile attributes (age, city, subscription), combined through AND. A visitor outside the segment will return an empty list from the block — the section should be hidden entirely, not rendered as an empty grid. The second reason for emptiness is the absence of tracking `UserActivity`: without it, "recently viewed," personal recommendations, and "buy again" do not populate.

### Working with Blocks

```typescript
// Getting a block by marker
const block = await getApi().Blocks.getBlockByMarker('hero_section', 'en_US')
if (isError(block)) return null

const attrs = block.attributeValues || {}

// Extracting attributes
const title = attrs.title?.value || block.localizeInfos?.title || ''
const description = attrs.description?.value || ''
// image: with SDK ≥ 1.0.157 a single file in blocks comes as an OBJECT (previously — as an array),
// multiple files — as an array. Handle both forms:
const rawBg = attrs.bg?.value
const bgImage = (Array.isArray(rawBg) ? rawBg[0] : rawBg)?.downloadLink || ''

// Filtering page blocks
const blocks = await getApi().Pages.getBlocksByPageUrl('home')
if (!isError(blocks)) {
  // Exclude certain blocks by identifier
  const filteredBlocks = blocks.filter(
    (block: any) => block.identifier !== 'home_badges'
  )

  // Sorting by position
  const sortedBlocks = [...blocks].sort(
    (a: any, b: any) => a.position - b.position
  )
}
```

### Products in Blocks (SDK ≥ 1.0.153)

`getBlocksByPageUrl` automatically loads products into blocks — separate requests to `Products` are not needed:

```typescript
const blocks = await getApi().Pages.getBlocksByPageUrl('home', locale)
if (!isError(blocks)) {
  for (const block of blocks) {
    if (block.type === 'product_block') {
      const products = block.products ?? []               // IProductsEntity[]
    }
    if (block.type === 'similar_products_block') {
      const similar = block.similarProducts?.items ?? []  // IProductsResponse { total, items }
    }
  }
}
```

Fields are only available for the corresponding `block.type` and are absent when `traficLimit: true` — always access via `?? []`.
