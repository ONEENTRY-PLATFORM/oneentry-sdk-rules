<!-- META
type: skill
skillConfig: {"name":"create-product-list"}
-->

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
4. **Markers for filterable attributes** (price, color, size, etc.) — clarify after `/inspect-api`
5. **Is there a layout for the card/grid?** — if yes, copy it exactly

---

## Step 3: Create Necessary Files

### 3.1 lib/filters.ts — Types and Parsing URL Parameters

> Adapt `FilterParams` to the real filters of the project.
> Example with price, color, and availability. Add/remove fields as necessary.

```typescript
// lib/filters.ts
export interface FilterParams {
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  colors?: string[];
  // Add other filters as necessary
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

> Replace attribute markers (`'price'`, `'color'`, `'in_stock'`) with real ones from `/inspect-api`.

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
  if (filters?.minPrice != null)
    body.push({ attributeMarker: 'price', conditionMarker: 'mth', conditionValue: filters.minPrice - 0.01 });
  if (filters?.maxPrice != null)
    body.push({ attributeMarker: 'price', conditionMarker: 'lth', conditionValue: filters.maxPrice + 0.01 });
  if (filters?.colors?.length)
    body.push({ attributeMarker: 'color', conditionMarker: 'in', conditionValue: filters.colors.join(',') });
  return body;
}

function buildQuery(offset: number, limit: number, filters?: FilterParams): IProductsQuery {
  const query: IProductsQuery = { offset, limit, sortOrder: 'ASC', sortKey: 'position' };
  // ⚠️ Replace 'in_stock' with real statusMarker from /inspect-api product-statuses!
  if (filters?.inStockOnly) query.statusMarker = 'in_stock';
  return query;
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

### 3.3 Server Page — Reads searchParams, Renders ShopView

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

### 3.4 ShopView — Client Component, Reads Filters from URL

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

### 3.5 ProductGrid — Infinite Scrolling via IntersectionObserver

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
3. statusMarker (inStockOnly) — in query, NOT in filter body
4. conditionMarker 'mth'/'lth' for price — use -0.01/+0.01 to include boundaries
5. params and searchParams in Next.js 15+ — are Promises, must use await
6. Attribute markers (price, color) and statusMarker — check via /inspect-api
7. isLoadingRef instead of useState(loading) — prevents duplicate requests
8. category pageUrl — is a marker ("shoes"), not the route path ("/shop/category/shoes")
```
