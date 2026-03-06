<!-- META
type: skill
skillConfig: {"name":"create-product-list"}
-->

# Каталог товаров с фильтрами и пагинацией

---

## Шаг 1: Проверь реальные данные через API

**ПЕРЕД написанием кода** — узнай реальные маркеры атрибутов:

```bash
/inspect-api products        # маркеры атрибутов (price, color и т.д.)
/inspect-api product-statuses  # реальный statusMarker для "в наличии"
```

Что смотреть:
- `items[0].attributeValues` — реальные маркеры атрибутов (`price`, `color` и т.д.)
- `items[0].statusIdentifier` — реальный статус товара
- `ProductStatuses[].identifier` — маркер статуса для фильтра `inStockOnly`

**⚠️ НЕ угадывай** маркеры `price`, `color`, `in_stock` — они могут отличаться в каждом проекте.

---

## Шаг 2: Уточни у пользователя

1. **Откуда товары?** (все товары `getProducts` или по категории `getProductsByPageUrl`)
   - Если по категории — какой `pageUrl` у страницы категории?
2. **Нужны ли фильтры?** (цена, статус, атрибуты)
3. **Нужна ли бесконечная прокрутка или кнопка "Загрузить ещё"?**
4. **Маркеры фильтруемых атрибутов** (цена, цвет, размер и т.д.) — уточни после `/inspect-api`
5. **Есть ли верстка карточки/сетки?** — если да, копируй точно

---

## Шаг 3: Создай необходимые файлы

### 3.1 lib/filters.ts — типы и парсинг URL-параметров

> Адаптируй `FilterParams` под реальные фильтры проекта.
> Пример с ценой, цветом и наличием. Добавь/убери поля по необходимости.

```typescript
// lib/filters.ts
export interface FilterParams {
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  colors?: string[];
  // Добавь другие фильтры по необходимости
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

> Замени маркеры атрибутов (`'price'`, `'color'`, `'in_stock'`) на реальные из `/inspect-api`.

```typescript
// app/actions/products.ts
'use server';

import { getApi, isError } from '@/lib/oneentry';
import type { IProductsEntity, IProductsQuery } from 'oneentry/dist/products/productsInterfaces';
import type { FilterParams } from '@/lib/filters';

export type { FilterParams } from '@/lib/filters';

function buildFilterBody(filters?: FilterParams): any[] {
  const body: any[] = [];
  // ⚠️ Замени 'price' и 'color' на реальные маркеры атрибутов из /inspect-api!
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
  // ⚠️ Замени 'in_stock' на реальный statusMarker из /inspect-api product-statuses!
  if (filters?.inStockOnly) query.statusMarker = 'in_stock';
  return query;
}

// Все товары (без категории)
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

// Товары по pageUrl категории
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

// Опции фильтра — диапазон цен и список цветов из реальных данных
// ⚠️ Замени маркеры 'price' и 'color' на реальные!
export async function getProductFilterOptions(locale = 'en_US', categoryUrl?: string) {
  const result = categoryUrl
    ? await getApi().Products.getProductsByPageUrl(categoryUrl, [], locale, { limit: 1, offset: 0, sortOrder: null, sortKey: null })
    : await getApi().Products.getProducts([], locale, { limit: 1, offset: 0, sortOrder: null, sortKey: null });

  if (isError(result)) return { prices: { min: 0, max: 9999 }, colors: [] };

  // Диапазон цен из поля additional.prices (если доступно)
  const additional = (result as any).additional;
  const prices = additional?.prices
    ? { min: Number(additional.prices.min ?? 0), max: Number(additional.prices.max ?? 9999) }
    : { min: 0, max: 9999 };

  // Цвета из listTitles атрибута цвета первого товара
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

### 3.3 Server Page — читает searchParams, рендерит ShopView

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
      // categoryUrl передавай только для страниц категорий
    />
  );
}
```

### 3.4 ShopView — Client Component, читает фильтры из URL

> **⚠️ КРИТИЧЕСКИ ВАЖНО:** ShopView ОБЯЗАН читать `activeFilters` и `gridKey`
> из `useSearchParams`, а НЕ получать как props от серверного компонента.
> Иначе `loadMore` в ProductGrid будет использовать устаревшие фильтры.

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

  // Фильтры и ключ — всегда из URL, не из props
  const activeFilters = parseFilterParams(Object.fromEntries(searchParams.entries()));
  const gridKey = searchParams.toString(); // key для ремаунта ProductGrid при смене фильтров

  return (
    <div>
      {/* Кнопка фильтров — опционально */}
      {/* <FilterPanel locale={locale} categoryUrl={categoryUrl} /> */}

      {/* key={gridKey} — ProductGrid ремаунтится при изменении URL-параметров */}
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

### 3.5 ProductGrid — бесконечная прокрутка через IntersectionObserver

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
          // Замени на реальный компонент карточки товара
          <div key={product.id}>
            <p>{product.localizeInfos?.title}</p>
          </div>
        ))}
      </div>

      {/* Sentinel для IntersectionObserver */}
      {hasMore && <div ref={loaderRef} className="mt-5 flex justify-center">Loading...</div>}
    </>
  );
}
```

---

## Шаг 4: Напомни ключевые правила

✅ Каталог создан. Ключевые правила:

```md
1. ShopView читает activeFilters и gridKey из useSearchParams — НЕ из props от сервера
2. key={gridKey} на ProductGrid — ремаунт при смене фильтров вместо useEffect
3. statusMarker (inStockOnly) — в query, НЕ в body фильтров
4. conditionMarker 'mth'/'lth' для цены — используй -0.01/+0.01 для включения границ
5. params и searchParams в Next.js 15+ — это Promise, обязателен await
6. Маркеры атрибутов (price, color) и statusMarker — проверить через /inspect-api
7. isLoadingRef вместо useState(loading) — предотвращает дублирование запросов
8. pageUrl категории — это маркер ("shoes"), не путь роута ("/shop/category/shoes")
```
