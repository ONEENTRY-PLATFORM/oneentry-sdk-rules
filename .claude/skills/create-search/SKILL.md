---
name: create-search
description: Create site search
---
# /create-search — Site Search

Argument: what to search for — `products` (products), `pages` (pages), `all` (everything).

---

## Step 1: Clarify with the user

1. **What to search for?**
   - `products` — `searchProduct(query, locale)`
   - `pages` — `searchPage(name, url)`
   - `blocks` — `searchBlock(name)`
   - multiple at once — parallel requests via `Promise.all`

2. **Where to display?**
   - Dropdown directly in the search bar — the most common case
   - Separate results page

3. **Is there a layout?** — if yes, copy exactly

---

## Step 2: Create Server Action

> If `app/actions/products.ts` / `app/actions/pages.ts` already exists — read and supplement, do not duplicate.

```typescript
// app/actions/search.ts
'use server';

import { getApi, isError } from '@/lib/oneentry';
import type { IProductsEntity } from 'oneentry/dist/products/productsInterfaces';
import type { IPagesEntity } from 'oneentry/dist/pages/pagesInterfaces';

// Search for products by name
export async function searchProducts(
  query: string,
  locale: string = 'en_US',
): Promise<IProductsEntity[]> {
  const result = await getApi().Products.searchProduct(query, locale);
  if (isError(result)) return [];
  return result as IProductsEntity[];
}

// Search for pages by name (optional)
export async function searchPages(
  query: string,
  locale: string = 'en_US',
): Promise<IPagesEntity[]> {
  const result = await getApi().Pages.searchPage(query, locale);
  if (isError(result)) return [];
  return result as IPagesEntity[];
}

// Search everything at once
export async function searchAll(query: string, locale: string = 'en_US') {
  const [products, pages] = await Promise.all([
    searchProducts(query, locale),
    searchPages(query, locale),
  ]);
  return { products, pages };
}
```

---

## Step 3: Create component

### Key principles

- `'use client'` — the search is interactive
- **Debounce 300ms** via `setTimeout` in `useEffect` — do not call Server Action on every character
- **Dropdown** closes on click outside the component (mousedown listener)
- **Escape** closes the dropdown
- On empty query — do not make a request, clear results
- Result of `searchProduct` — array `IProductsEntity[]`, access to title: `product.localizeInfos?.title`
- Result of `searchPage` — array `IPagesEntity[]`, access to title: `page.localizeInfos?.title || page.localizeInfos?.menuTitle`

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

  // Debounce 300ms — do not call Action on every character
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

  // Close on click outside the component
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

### If a separate results page is needed

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

      {/* Products */}
      <section>
        <h2>Products ({(products as any[]).length})</h2>
        {(products as any[]).map((p: any) => (
          <Link key={p.id} href={`/${locale}/shop/product/${p.id}`}>
            {p.localizeInfos?.title}
          </Link>
        ))}
      </section>

      {/* Pages */}
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

## Step 4: Remind key rules

✅ Search created. Key rules:

```md
1. searchProduct/searchPage search by NAME, not by attributes
2. Debounce 300ms — DO NOT call Action on every character
3. On empty query — clear results, do not make a request
4. Dropdown closes on mousedown outside the component and on Escape
5. For products: product.localizeInfos?.title
6. For pages: page.localizeInfos?.title || page.localizeInfos?.menuTitle
7. Server Action returns [] on error — does not crash
```
