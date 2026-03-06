<!-- META
type: skill
skillConfig: {"name":"create-search"}
-->

# /create-search — Поиск по сайту

Аргумент: что искать — `products` (товары), `pages` (страницы), `all` (всё).

---

## Шаг 1: Уточни у пользователя

1. **По чему искать?**
   - `products` — `searchProduct(query, locale)`
   - `pages` — `searchPage(name, url)`
   - `blocks` — `searchBlock(name)`
   - несколько сразу — параллельные запросы через `Promise.all`

2. **Где отображается?**
   - Выпадающий список (dropdown) прямо в строке поиска — наиболее частый случай
   - Отдельная страница результатов

3. **Есть ли верстка?** — если да, копируй точно

---

## Шаг 2: Создай Server Action

> Если `app/actions/products.ts` / `app/actions/pages.ts` уже существует — прочитай и дополни, не дублируй.

```typescript
// app/actions/search.ts
'use server';

import { getApi, isError } from '@/lib/oneentry';
import type { IProductsEntity } from 'oneentry/dist/products/productsInterfaces';
import type { IPagesEntity } from 'oneentry/dist/pages/pagesInterfaces';

// Поиск товаров по названию
export async function searchProducts(
  query: string,
  locale: string = 'en_US',
): Promise<IProductsEntity[]> {
  const result = await getApi().Products.searchProduct(query, locale);
  if (isError(result)) return [];
  return result as IProductsEntity[];
}

// Поиск страниц по названию (опционально)
export async function searchPages(
  query: string,
  locale: string = 'en_US',
): Promise<IPagesEntity[]> {
  const result = await getApi().Pages.searchPage(query, locale);
  if (isError(result)) return [];
  return result as IPagesEntity[];
}

// Поиск всего сразу
export async function searchAll(query: string, locale: string = 'en_US') {
  const [products, pages] = await Promise.all([
    searchProducts(query, locale),
    searchPages(query, locale),
  ]);
  return { products, pages };
}
```

---

## Шаг 3: Создай компонент

### Ключевые принципы

- `'use client'` — поиск интерактивный
- **Дебаунс 300ms** через `setTimeout` в `useEffect` — не вызывать Server Action на каждый символ
- **Dropdown** закрывается по клику вне компонента (mousedown listener)
- **Escape** закрывает dropdown
- При пустом запросе — не делать запрос, очистить результаты
- Результат `searchProduct` — массив `IProductsEntity[]`, доступ к названию: `product.localizeInfos?.title`
- Результат `searchPage` — массив `IPagesEntity[]`, доступ к названию: `page.localizeInfos?.title || page.localizeInfos?.menuTitle`

### components/SearchBar.tsx

```tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { searchProducts } from '@/app/actions/search';
import type { IProductsEntity } from 'oneentry/dist/products/productsInterfaces';

interface SearchBarProps {
  locale: string;
}

export function SearchBar({ locale }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<IProductsEntity[]>([]);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Дебаунс 300ms — не вызываем Action на каждый символ
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!query.trim()) {
        setResults([]);
        setOpen(false);
        return;
      }
      const items = await searchProducts(query.trim(), locale);
      setResults(items);
      setOpen(items.length > 0);
    }, query.trim() ? 300 : 0);

    return () => clearTimeout(timer);
  }, [query, locale]);

  // Закрыть по клику вне компонента
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <form role="search" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="search-input" className="sr-only">Search</label>
        <input
          id="search-input"
          type="search"
          placeholder="Search..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          aria-controls="search-results"
          aria-autocomplete="list"
        />
      </form>

      {open && (
        <div
          id="search-results"
          role="region"
          aria-live="polite"
          style={{ position: 'absolute', top: '100%', left: 0, zIndex: 30, width: '100%' }}
        >
          {results.map((product) => (
            <Link
              key={product.id}
              href={`/${locale}/shop/product/${product.id}`}
              onClick={() => { setOpen(false); setQuery(''); }}
            >
              {product.localizeInfos?.title || 'Product'}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

### Если нужна отдельная страница результатов

```tsx
// app/[locale]/search/page.tsx
export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  const { q = '' } = await searchParams;

  if (!q.trim()) return <div>Enter a search query</div>;

  const [products, pages] = await Promise.all([
    getApi().Products.searchProduct(q, locale),
    getApi().Pages.searchPage(q, locale),
  ]);

  return (
    <div>
      <h1>Results for: {q}</h1>

      {/* Товары */}
      <section>
        <h2>Products ({(products as any[]).length})</h2>
        {(products as any[]).map((p: any) => (
          <Link key={p.id} href={`/${locale}/shop/product/${p.id}`}>
            {p.localizeInfos?.title}
          </Link>
        ))}
      </section>

      {/* Страницы */}
      <section>
        <h2>Pages ({(pages as any[]).length})</h2>
        {(pages as any[]).map((p: any) => (
          <Link key={p.id} href={`/${locale}/${p.pageUrl}`}>
            {p.localizeInfos?.title || p.localizeInfos?.menuTitle}
          </Link>
        ))}
      </section>
    </div>
  );
}
```

---

## Шаг 4: Напомни ключевые правила

✅ Поиск создан. Ключевые правила:

```md
1. searchProduct/searchPage ищут по НАЗВАНИЮ, не по атрибутам
2. Дебаунс 300ms — НЕ вызывать Action на каждый символ
3. При пустом запросе — очистить результаты, не делать запрос
4. Dropdown закрывается по mousedown вне компонента и по Escape
5. Для продуктов: product.localizeInfos?.title
6. Для страниц: page.localizeInfos?.title || page.localizeInfos?.menuTitle
7. Server Action возвращает [] при ошибке — не крашится
```
