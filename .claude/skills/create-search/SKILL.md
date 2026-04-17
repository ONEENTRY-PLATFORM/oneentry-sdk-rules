---
name: create-search
description: Create site search
---
# /create-search — Site Search

Argument: what to search for — `products` (goods), `pages` (pages), `all` (everything).

---

## Step 1: Clarify with the user

1. **What to search for?**
   - `products` — `searchProduct(query, locale)`
   - `pages` — `searchPage(name, url)`
   - `blocks` — `searchBlock(name)`
   - several at once — parallel requests via `Promise.all`

2. **Where is it displayed?**
   - Dropdown directly in the search bar — the most common case
   - Separate results page

3. **Is there a layout?** — if yes, copy it exactly

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

---

## Step 5: Playwright E2E tests

> Runs only if the user confirmed writing tests at the beginning of the session or requested writing a test later (see `feedback_playwright.md`).
> To set up Playwright — first `/setup-playwright`.

### 5.1 Add `data-testid` to the component

```tsx
// components/SearchBar.tsx
<div ref={wrapperRef} data-testid="search-bar" style={{ position: 'relative' }}>
  <form role="search" onSubmit={(e) => e.preventDefault()}>
    <input
      data-testid="search-input"
      id="search-input"
      type="search"
      value={query}
      onChange={...}
      ...
    />
  </form>

  {open && (
    <div
      data-testid="search-dropdown"
      id="search-results"
      role="region"
      aria-live="polite"
    >
      {results.length === 0 && (
        <div data-testid="search-empty">No results</div>
      )}
      {results.map((product) => (
        <Link
          key={product.id}
          data-testid="search-result-item"
          data-product-id={product.id}
          href={...}
        >
          {product.localizeInfos?.title || 'Product'}
        </Link>
      ))}
    </div>
  )}
</div>
```

### 5.2 Gather test parameters and fill in `.env.local`

**Algorithm (execute step by step, do not ask in one list):**

1. **Path of the page where the SearchBar is displayed** — ask: "On which page is the search bar displayed? (usually in Navbar on all pages — `/` or main catalog will do)". If silent → use `/` by default and inform: "Using `/` — SearchBar is expected in Navbar, available everywhere."
2. **Test search query that will GUARANTEED find products** — choose yourself via `/inspect-api`:
   - Get products: `getApi().Products.getProducts({ limit: 1 })`. Take the first word from `items[0].localizeInfos?.title` (a fragment of 3+ characters). For example, `title="Cosmo Sneakers"` → `SEARCH_HIT_QUERY=Cosmo`.
   - Inform: "For the test 'there are results' I use the query `{query}` — a fragment of the title of the first product in the catalog."
   - If there are no products or the SDK is unavailable — leave it empty, test `test.skip`.
3. **Test empty query** (which has no results) — generate yourself: `zzzz-nonexistent-{rand}`. Do not save in `.env.local`, hardcode in the spec.
4. **Path of the separate results page** (if created) — ask: "Should I create a separate results page `/search?q=...`? If yes — what path?". If silent → check via Glob (`app/**/search/**/page.tsx`). If not found → corresponding tests `test.skip`.

**Example `.env.local`:**

```bash
E2E_SEARCH_PAGE=/
E2E_SEARCH_HIT_QUERY=Cosmo
E2E_SEARCH_RESULTS_PATH=/search
```

### 5.3 Create `e2e/search.spec.ts`

> ⚠️ Tests work with the real OneEntry project. `SEARCH_HIT_QUERY` is taken from a real product, `SEARCH_MISS_QUERY` — a deliberately non-existent query.

```typescript
import { test, expect } from '@playwright/test';

const SEARCH_PAGE = process.env.E2E_SEARCH_PAGE || '/';
const SEARCH_HIT_QUERY = process.env.E2E_SEARCH_HIT_QUERY || '';
const SEARCH_MISS_QUERY = 'zzzz-nonexistent-query-xyz';
const SEARCH_RESULTS_PATH = process.env.E2E_SEARCH_RESULTS_PATH || '';

test.describe('Site Search', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(SEARCH_PAGE);
    await expect(page.getByTestId('search-bar')).toBeVisible({ timeout: 10_000 });
  });

  test('dropdown is closed by default (empty query)', async ({ page }) => {
    await expect(page.getByTestId('search-dropdown')).not.toBeVisible();
  });

  test('input shows results after debounce', async ({ page }) => {
    test.skip(!SEARCH_HIT_QUERY, 'E2E_SEARCH_HIT_QUERY is not set');

    await page.getByTestId('search-input').fill(SEARCH_HIT_QUERY);
    // Debounce 300ms + network request — wait up to 5s
    await expect(page.getByTestId('search-dropdown')).toBeVisible({ timeout: 5_000 });
    const items = page.getByTestId('search-result-item');
    expect(await items.count()).toBeGreaterThan(0);
  });

  test('non-existent query — no results / empty-state', async ({ page }) => {
    await page.getByTestId('search-input').fill(SEARCH_MISS_QUERY);
    // Wait for debounce to complete
    await page.waitForTimeout(600);

    const dropdownVisible = await page.getByTestId('search-dropdown').isVisible().catch(() => false);
    if (dropdownVisible) {
      // If dropdown opened — there should be empty-state or 0 items
      const itemsCount = await page.getByTestId('search-result-item').count();
      expect(itemsCount).toBe(0);
    }
    // Otherwise (most often) — dropdown is not open, which is also valid
  });

  test('clearing input closes dropdown', async ({ page }) => {
    test.skip(!SEARCH_HIT_QUERY, 'E2E_SEARCH_HIT_QUERY is not set');

    const input = page.getByTestId('search-input');
    await input.fill(SEARCH_HIT_QUERY);
    await expect(page.getByTestId('search-dropdown')).toBeVisible({ timeout: 5_000 });

    await input.fill('');
    await expect(page.getByTestId('search-dropdown')).not.toBeVisible({ timeout: 3_000 });
  });

  test('Escape closes dropdown', async ({ page }) => {
    test.skip(!SEARCH_HIT_QUERY, 'E2E_SEARCH_HIT_QUERY is not set');

    await page.getByTestId('search-input').fill(SEARCH_HIT_QUERY);
    await expect(page.getByTestId('search-dropdown')).toBeVisible({ timeout: 5_000 });

    await page.getByTestId('search-input').press('Escape');
    await expect(page.getByTestId('search-dropdown')).not.toBeVisible();
  });

  test('clicking on a result closes dropdown and clears input', async ({ page }) => {
    test.skip(!SEARCH_HIT_QUERY, 'E2E_SEARCH_HIT_QUERY is not set');

    await page.getByTestId('search-input').fill(SEARCH_HIT_QUERY);
    await expect(page.getByTestId('search-dropdown')).toBeVisible({ timeout: 5_000 });

    await page.getByTestId('search-result-item').first().click();
    // After navigation, dropdown should not be visible
    await expect(page.getByTestId('search-dropdown')).not.toBeVisible();
  });
});

// If a separate results page `/search?q=...` is created
test.describe('Search results page', () => {
  test.skip(!SEARCH_RESULTS_PATH || !SEARCH_HIT_QUERY, 'E2E_SEARCH_RESULTS_PATH or E2E_SEARCH_HIT_QUERY is not set');

  test('page shows results for the query from URL', async ({ page }) => {
    await page.goto(`${SEARCH_RESULTS_PATH}?q=${encodeURIComponent(SEARCH_HIT_QUERY)}`);
    await expect(page.locator('h1')).toContainText(SEARCH_HIT_QUERY);
  });
});
```

### 5.4 Report to the user about the decisions made

Before completing the task — explicitly inform:

```
✅ e2e/search.spec.ts created
✅ data-testid added to SearchBar
✅ .env.local updated (E2E_SEARCH_PAGE, E2E_SEARCH_HIT_QUERY, E2E_SEARCH_RESULTS_PATH)

Decisions made automatically:
- Search page: {SEARCH_PAGE} — {specified by user / using `/` since SearchBar is usually in Navbar}
- Query with results: {SEARCH_HIT_QUERY} — fragment of the title of the first product ("{title}") from getProducts
- Query without results: zzzz-nonexistent-query-xyz — hardcoded in the spec
- Results page: {PATH → test included / not found — test test.skip}

Run: npm run test:e2e -- search.spec.ts
```
