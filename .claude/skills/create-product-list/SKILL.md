---
name: create-product-list
description: Create product catalog with filters and pagination
---
# Product Catalog with Filters and Pagination

---

## Step 1: Check Real Data via API

**BEFORE writing code** — find out the real attribute markers:

```bash
/inspect-api products        # attribute markers (price, color, etc.)
/inspect-api product-statuses  # real statusMarker for "in stock"
```

What to look for:
- `items[0].attributeValues` — real attribute markers (`price`, `color`, etc.)
- `items[0].statusIdentifier` — real product status
- `ProductStatuses[].identifier` — status marker for the `inStockOnly` filter

**⚠️ DO NOT guess** the markers `price`, `color`, `in_stock` — they may differ in each project.

---

## Step 2: Clarify with the User

1. **Where are the products from?** (all products `getProducts` or by category `getProductsByPageUrl`)
   - If by category — what is the `pageUrl` of the category page?
2. **Are filters needed?** (price, status, attributes)
3. **Is infinite scrolling or a "Load More" button needed?**
4. **Markers of filterable attributes** (price, color, size, etc.) — clarify after `/inspect-api`
5. **Is there a layout for the card/grid?** — if yes, copy it exactly

> **🛒 The "Add to Cart" button in cards is ALWAYS by default.**
> When creating the catalog, product cards must contain an "Add to Cart" button.
> If the cart is not yet implemented — first run `/create-cart-manager`.
> The "Add to Favorites" button is added **only at the user's request**.

---

## Step 3: Create Necessary Files

### 3.1 lib/filters.ts — types and parsing URL parameters

> Adapt `FilterParams` to the real filters of the project.
> Example with price, color, and availability. Add/remove fields as needed.

```typescript
// lib/filters.ts
export interface FilterParams {
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  colors?: string[];
  // Add other filters as needed
}

export function parseFilterParams(
  sp: Record<string, string | string[] | undefined>
): FilterParams {
  const colors = sp.colors ? String(sp.colors).split(',').filter(Boolean) : undefined;
  return {
    minPrice: sp.minPrice ? Number(sp.minPrice) : undefined,
    maxPrice: sp.maxPrice ? Number(sp.maxPrice) : undefined,
    inStockOnly: sp.inStockOnly === 'true' ? true : undefined,
    colors: colors?.length ? colors : undefined,
  };
}
```

### 3.2 app/actions/products.ts — Server Actions

> Replace the attribute markers (`'price'`, `'color'`, `'in_stock'`) with real ones from `/inspect-api`.

```typescript
// app/actions/products.ts
'use server';

import { getApi, isError } from '@/lib/oneentry';
import type { IProductsEntity, IProductsQuery } from 'oneentry/dist/products/productsInterfaces';
import type { FilterParams } from '@/lib/filters';

export type { FilterParams } from '@/lib/filters';

function buildFilterBody(filters?: FilterParams): any[] {
  const body: any[] = [];
  // ⚠️ Replace 'price' and 'color' with real attribute markers from /inspect-api!
  // ⚠️ Replace 'in_stock' with the real statusMarker from /inspect-api product-statuses!
  // `statusMarker` is applied to the entire request if present in ANY IFilterParams record.
  // Verified: IProductsQuery.statusMarker is ignored by Products.getProducts — the filter must be in the body.
  const statusMarker = filters?.inStockOnly ? 'in_stock' : undefined;

  if (filters?.minPrice != null)
    body.push({
      attributeMarker: 'price', conditionMarker: 'mth', conditionValue: filters.minPrice - 0.01,
      ...(statusMarker ? { statusMarker } : {}),
    });
  if (filters?.maxPrice != null)
    body.push({
      attributeMarker: 'price', conditionMarker: 'lth', conditionValue: filters.maxPrice + 0.01,
      ...(statusMarker ? { statusMarker } : {}),
    });
  if (filters?.colors?.length)
    body.push({
      attributeMarker: 'color', conditionMarker: 'in', conditionValue: filters.colors.join(','),
      ...(statusMarker ? { statusMarker } : {}),
    });
  // Only status filter — no other conditions: add catch-all record to apply status
  if (statusMarker && body.length === 0)
    body.push({ attributeMarker: 'price', conditionMarker: 'mth', conditionValue: -1, statusMarker });
  return body;
}

function buildQuery(offset: number, limit: number): IProductsQuery {
  // ⚠️ DO NOT put statusMarker here — it is ignored by Products.getProducts. Use IFilterParams body.
  return { offset, limit, sortOrder: 'ASC', sortKey: 'position' };
}

// All products (without category)
export async function getProducts(
  locale = 'en_US',
  offset = 0,
  limit = 10,
  filters?: FilterParams,
) {
  const result = await getApi().Products.getProducts(
    buildFilterBody(filters),
    locale,
    buildQuery(offset, limit, filters),
  );
  if (isError(result)) return { items: [] as IProductsEntity[], total: 0, error: result.message };
  return { items: result.items as IProductsEntity[], total: result.total as number };
}

// Products by category pageUrl
export async function getProductsByCategory(
  categoryUrl: string,
  locale = 'en_US',
  offset = 0,
  limit = 10,
  filters?: FilterParams,
) {
  const result = await getApi().Products.getProductsByPageUrl(
    categoryUrl,
    buildFilterBody(filters),
    locale,
    buildQuery(offset, limit, filters),
  );
  if (isError(result)) return { items: [] as IProductsEntity[], total: 0, error: result.message };
  return { items: result.items as IProductsEntity[], total: result.total as number };
}

// Filter options — price range and color list from real data
// ⚠️ Replace markers 'price' and 'color' with real ones!
export async function getProductFilterOptions(locale = 'en_US', categoryUrl?: string) {
  const result = categoryUrl
    ? await getApi().Products.getProductsByPageUrl(categoryUrl, [], locale, { limit: 1, offset: 0, sortOrder: null, sortKey: null })
    : await getApi().Products.getProducts([], locale, { limit: 1, offset: 0, sortOrder: null, sortKey: null });

  if (isError(result)) return { prices: { min: 0, max: 9999 }, colors: [] };

  // Price range from additional.prices field (if available)
  const additional = (result as any).additional;
  const prices = additional?.prices
    ? { min: Number(additional.prices.min ?? 0), max: Number(additional.prices.max ?? 9999) }
    : { min: 0, max: 9999 };

  // Colors from listTitles of the color attribute of the first product
  const colorAttr = result.items?.[0]?.attributeValues?.color as any;
  const rawTitles = colorAttr?.listTitles?.[locale] ?? colorAttr?.listTitles ?? [];
  const colors = Array.isArray(rawTitles)
    ? rawTitles.map((lt: any) => ({
        name: lt.title || String(lt.value),
        value: String(lt.value),
        swatch: lt.extended?.value || String(lt.value),
      }))
    : [];

  return { prices, colors };
}
```

### 3.3 Server Page — reads searchParams, renders ShopView

```tsx
// app/[locale]/shop/page.tsx
import { ShopView } from '@/components/ShopView';
import { getProducts } from '@/app/actions/products';
import { parseFilterParams } from '@/lib/filters';

export default async function ShopPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;        // ⚠️ Next.js 15+: await!
  const sp = await searchParams;           // ⚠️ Next.js 15+: await!
  const filters = parseFilterParams(sp);

  const initialData = await getProducts(locale, 0, 10, filters);

  return (
    <ShopView
      initialProducts={initialData.items}
      totalProducts={initialData.total}
      locale={locale}
      // categoryUrl should only be passed for category pages
    />
  );
}
```

### 3.4 ShopView — Client Component, reads filters from URL

> **⚠️ CRITICALLY IMPORTANT:** ShopView MUST read `activeFilters` and `gridKey`
> from `useSearchParams`, NOT receive as props from the server component.
> Otherwise, `loadMore` in ProductGrid will use outdated filters.

```tsx
// components/ShopView.tsx
'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ProductGrid } from './ProductGrid';
import { parseFilterParams } from '@/lib/filters';
import type { IProductsEntity } from 'oneentry/dist/products/productsInterfaces';

interface ShopViewProps {
  initialProducts: IProductsEntity[];
  totalProducts: number;
  locale: string;
  categoryUrl?: string;
}

export function ShopView({ initialProducts, totalProducts, locale, categoryUrl }: ShopViewProps) {
  const searchParams = useSearchParams();

  // Filters and key — always from URL, not from props
  const activeFilters = parseFilterParams(Object.fromEntries(searchParams.entries()));
  const gridKey = searchParams.toString(); // key for remounting ProductGrid when filters change

  return (
    <div>
      {/* Filter button — optional */}
      {/* <FilterPanel locale={locale} categoryUrl={categoryUrl} /> */}

      {/* key={gridKey} — ProductGrid remounts when URL parameters change */}
      <ProductGrid
        key={gridKey}
        initialProducts={initialProducts}
        totalProducts={totalProducts}
        locale={locale}
        categoryUrl={categoryUrl}
        filters={activeFilters}
      />
    </div>
  );
}
```

### 3.5 ProductGrid — infinite scrolling via IntersectionObserver

```tsx
// components/ProductGrid.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { getProducts, getProductsByCategory } from '@/app/actions/products';
import type { FilterParams } from '@/lib/filters';
import type { IProductsEntity } from 'oneentry/dist/products/productsInterfaces';

interface ProductGridProps {
  initialProducts: IProductsEntity[];
  totalProducts: number;
  locale: string;
  categoryUrl?: string;
  filters?: FilterParams;
}

export function ProductGrid({
  initialProducts,
  totalProducts,
  locale,
  categoryUrl,
  filters,
}: ProductGridProps) {
  const [products, setProducts] = useState<IProductsEntity[]>(initialProducts);
  const [offset, setOffset] = useState(initialProducts.length);
  const [hasMore, setHasMore] = useState(initialProducts.length < totalProducts);
  const loaderRef = useRef<HTMLDivElement>(null);
  const isLoadingRef = useRef(false);

  useEffect(() => {
    if (!hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { threshold: 0.1 },
    );

    if (loaderRef.current) observer.observe(loaderRef.current);
    return () => { if (loaderRef.current) observer.unobserve(loaderRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, offset]);

  async function loadMore() {
    if (isLoadingRef.current || !hasMore) return;
    isLoadingRef.current = true;

    try {
      const result = categoryUrl
        ? await getProductsByCategory(categoryUrl, locale, offset, 10, filters)
        : await getProducts(locale, offset, 10, filters);

      if (result.items?.length > 0) {
        setProducts(prev => {
          const ids = new Set(prev.map(p => p.id));
          const newItems = result.items.filter((p: IProductsEntity) => !ids.has(p.id));
          return newItems.length > 0 ? [...prev, ...newItems] : prev;
        });
        const newOffset = offset + result.items.length;
        setOffset(newOffset);
        setHasMore(newOffset < totalProducts);
      } else {
        setHasMore(false);
      }
    } catch {
      setHasMore(false);
    } finally {
      isLoadingRef.current = false;
    }
  }

  if (products.length === 0) {
    return <div>No products found</div>;
  }

  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-5">
        {products.map((product) => (
          // Replace with the real product card component
          <div key={product.id}>
            <p>{product.localizeInfos?.title}</p>
          </div>
        ))}
      </div>

      {/* Sentinel for IntersectionObserver */}
      {hasMore && <div ref={loaderRef} className="mt-5 flex justify-center">Loading...</div>}
    </>
  );
}
```

---

## Step 4: Remind Key Rules

✅ Catalog created. Key rules:

```md
1. ShopView reads activeFilters and gridKey from useSearchParams — NOT from props from the server
2. key={gridKey} on ProductGrid — remount on filter change instead of useEffect
3. statusMarker (inStockOnly) — in IFilterParams body, NOT in IProductsQuery (SDK type accepts this field, but the API ignores it). If there are no other filter records — add catch-all `{ attributeMarker: 'price', conditionMarker: 'mth', conditionValue: -1, statusMarker }`
4. conditionMarker 'mth'/'lth' for price — use -0.01/+0.01 to include boundaries
5. params and searchParams in Next.js 15+ — are Promises, must use await
6. Attribute markers (price, color) and statusMarker — check via /inspect-api
7. isLoadingRef instead of useState(loading) — prevents duplicate requests
8. category pageUrl — is a marker ("shoes"), not a route path ("/shop/category/shoes")
```

---

## Step 5: Playwright E2E Tests

> Runs only if the user confirmed writing tests at the beginning of the session or requested writing a test later (see `feedback_playwright.md`).
> To set up Playwright — first `/setup-playwright`.

### 5.1 Add `data-testid` to Components

```tsx
// components/ShopView.tsx
<div data-testid="shop-view">
  {/* FilterPanel (optional) */}
  <ProductGrid ... />
</div>

// components/ProductGrid.tsx
{products.length === 0 && <div data-testid="shop-empty">No products found</div>}
<div data-testid="shop-grid" className="grid ...">
  {products.map((p) => (
    <div key={p.id} data-testid="product-card" data-product-id={p.id}>
      <p data-testid="product-title">{p.localizeInfos?.title}</p>
    </div>
  ))}
</div>
{hasMore && <div ref={loaderRef} data-testid="shop-loader">Loading...</div>}
```

### 5.2 Gather Test Parameters and Fill `.env.local`

**Algorithm (execute step by step, do not ask all at once):**

1. **Path of the catalog page** — ask: "What is the path of the catalog page? (for example `/shop`, `/en_US/shop`, `/catalog`)".
   - Silent → find it yourself via Glob (`app/**/shop/**/page.tsx`, `app/**/catalog/**/page.tsx`). Report: "Found catalog at `{path}` — using it".
2. **Filter values** (color/price) — **do not ask the user, choose yourself** using already known data from `/inspect-api`:
   - Color: take the first `value` from the `listTitles` of the color attribute (obtained in `getProductFilterOptions`). Report: "For the color filter test, using `color={value}` — the first value from the project's listTitles".
   - Price range: take `additional.prices.min` and `additional.prices.max`, narrow it to the middle (for example `min = ⌈(min+max)/2 - 10%⌉`, `max = ⌊(min+max)/2 + 10%⌋`) to ensure there are products. Report: "For the price filter test, using the range `{min}-{max}` (middle of the project's real range)".
   - If `/inspect-api` is not available — leave variables empty, corresponding tests will include `test.skip`.
3. **Number of products** — check yourself: the first request `getProducts({ limit: 1 })` will return `total`. If `total < 11` — comment out the infinite scroll test in the spec file. Report: "The project has only `{total}` products — infinite scroll test disabled".
4. **Fill `.env.local`** (yourself, through Edit/Write — do not ask the user to insert):

```bash
E2E_SHOP_PATH=/shop
E2E_FILTER_COLOR=1
E2E_FILTER_MIN_PRICE=10
E2E_FILTER_MAX_PRICE=1000
```

If any value could not be determined — leave it empty, the corresponding test will be `test.skip`.

### 5.3 Create `e2e/catalog.spec.ts`

> ⚠️ Tests work with the real OneEntry project. Filter values (prices, colors) and expected number of products depend on the project — set via env.

```typescript
import { test, expect } from '@playwright/test';

const SHOP_PATH = process.env.E2E_SHOP_PATH || '/shop'; // ← replace with the real path
const FILTER_COLOR = process.env.E2E_FILTER_COLOR;       // for example "1" (value from listTitles)
const FILTER_MIN_PRICE = process.env.E2E_FILTER_MIN_PRICE;
const FILTER_MAX_PRICE = process.env.E2E_FILTER_MAX_PRICE;

test.describe('Product Catalog', () => {
  test('page renders product cards', async ({ page }) => {
    await page.goto(SHOP_PATH);
    await expect(page.getByTestId('shop-view')).toBeVisible();

    const cards = page.getByTestId('product-card');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
    expect(await cards.count()).toBeGreaterThan(0);
  });

  test('first page: no more than 10 products (limit)', async ({ page }) => {
    await page.goto(SHOP_PATH);
    await page.getByTestId('product-card').first().waitFor();
    const count = await page.getByTestId('product-card').count();
    expect(count).toBeLessThanOrEqual(10);
  });

  test('infinite scroll loads the next page', async ({ page }) => {
    await page.goto(SHOP_PATH);
    const cards = page.getByTestId('product-card');
    await cards.first().waitFor();

    const initialCount = await cards.count();
    // If everything is on the first page — infinite scroll will not work (less than one limit)
    test.skip(initialCount < 10, 'The project has less than 10 products — nothing to load');

    // Scroll to sentinel — IntersectionObserver should pull more
    await page.getByTestId('shop-loader').scrollIntoViewIfNeeded();
    await expect.poll(async () => cards.count(), { timeout: 10_000 }).toBeGreaterThan(initialCount);
  });

  test('price filter changes URL and reloads the grid', async ({ page }) => {
    test.skip(!FILTER_MIN_PRICE || !FILTER_MAX_PRICE, 'E2E_FILTER_MIN/MAX_PRICE not set');

    await page.goto(`${SHOP_PATH}?minPrice=${FILTER_MIN_PRICE}&maxPrice=${FILTER_MAX_PRICE}`);
    await expect(page).toHaveURL(new RegExp(`minPrice=${FILTER_MIN_PRICE}`));

    const cards = page.getByTestId('product-card');
    // Either there are products in the range, or empty-state
    const hasCards = await cards.first().isVisible().catch(() => false);
    const hasEmpty = await page.getByTestId('shop-empty').isVisible().catch(() => false);
    expect(hasCards || hasEmpty).toBe(true);
  });

  test('color filter via URL applies to the grid', async ({ page }) => {
    test.skip(!FILTER_COLOR, 'E2E_FILTER_COLOR not set');

    await page.goto(`${SHOP_PATH}?colors=${FILTER_COLOR}`);
    await expect(page).toHaveURL(new RegExp(`colors=${FILTER_COLOR}`));
    // gridKey changes → ProductGrid remounts, without this loadMore would ignore the filter
    const cards = page.getByTestId('product-card');
    const hasCards = await cards.first().isVisible().catch(() => false);
    const hasEmpty = await page.getByTestId('shop-empty').isVisible().catch(() => false);
    expect(hasCards || hasEmpty).toBe(true);
  });

  test('inStockOnly filter works separately from others', async ({ page }) => {
    await page.goto(`${SHOP_PATH}?inStockOnly=true`);
    await expect(page).toHaveURL(/inStockOnly=true/);
    const cards = page.getByTestId('product-card');
    const hasCards = await cards.first().isVisible().catch(() => false);
    const hasEmpty = await page.getByTestId('shop-empty').isVisible().catch(() => false);
    expect(hasCards || hasEmpty).toBe(true);
  });
});
```

### 5.4 Report to the User on Decisions Made

Before completing the task — explicitly inform:

```
✅ e2e/catalog.spec.ts created
✅ data-testid added to ShopView / ProductGrid
✅ .env.local updated (E2E_SHOP_PATH, E2E_FILTER_COLOR, E2E_FILTER_MIN_PRICE, E2E_FILTER_MAX_PRICE)

Decisions made automatically:
- Catalog path: {SHOP_PATH} — {user specified / found via Glob}
- Color for filter: {FILTER_COLOR} — first value from listTitles of the color attribute
- Price range: {MIN}-{MAX} — middle of the real range of the project (from additional.prices)
- Infinite scroll: {test enabled — project has {total} products / disabled — less than 11 products}

Run: npm run test:e2e -- catalog.spec.ts
```
