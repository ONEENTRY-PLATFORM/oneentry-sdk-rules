---
name: create-filter-panel
description: Create product filter panel
---
# Create product filter panel

Creates a filter panel with price, color, and availability. It uses FilterContext as a buffer between the UI and the URL — filters are applied only by clicking the "Apply" button, and the page is not re-rendered on every slider movement.

> ⚠️ Assumes that the product catalog uses URL query params (pattern from `/create-product-list`).

---

## Step 1: Check real attribute markers

```bash
/inspect-api products          # markers price, color, etc.
/inspect-api product-statuses  # marker for status "in stock"
```

What to look for:
- `items[0].attributeValues` — real markers (possibly `price`, `sale_price`, `colour`)
- `ProductStatuses[].identifier` — real status marker (possibly `in_stock`, `available`)

**DO NOT guess the markers!**

---

## Step 2: Create FilterContext

File: `app/store/providers/FilterContext.tsx`

```tsx
'use client';

import { createContext, useState } from 'react';
import type { Dispatch, ReactNode } from 'react';

// Adapt to the real filters of the project (add/remove fields)
type FilterContextType = {
  priceFrom: number | null;
  priceTo: number | null;
  color: string;
  inStock: boolean;
  setPriceFrom: Dispatch<number | null>;
  setPriceTo: Dispatch<number | null>;
  setColor: Dispatch<string>;
  setInStock: Dispatch<boolean>;
};

export const FilterContext = createContext<FilterContextType>({
  priceFrom: null,
  priceTo: null,
  color: '',
  inStock: false,
  setPriceFrom: () => {},
  setPriceTo: () => {},
  setColor: () => {},
  setInStock: () => {},
});

export function FilterProvider({ children }: { children: ReactNode }) {
  const [priceFrom, setPriceFrom] = useState<number | null>(null);
  const [priceTo, setPriceTo] = useState<number | null>(null);
  const [color, setColor] = useState('');
  const [inStock, setInStock] = useState(false);

  return (
    <FilterContext.Provider
      value={{ priceFrom, setPriceFrom, priceTo, setPriceTo, color, setColor, inStock, setInStock }}
    >
      {children}
    </FilterContext.Provider>
  );
}
```

---

## Step 3: Create price filter component

File: `components/filter/PriceFilter.tsx`

```tsx
'use client';

import { memo, useCallback, useContext, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FilterContext } from '@/app/store/providers/FilterContext';

export const PriceFilter = memo(({
  min,
  max,
}: {
  min: number;
  max: number;
}) => {
  const searchParams = useSearchParams();
  const { setPriceFrom: setCtxFrom, setPriceTo: setCtxTo } = useContext(FilterContext);

  const [priceFrom, setPriceFrom] = useState(
    searchParams.get('minPrice') ? Number(searchParams.get('minPrice')) : min,
  );
  const [priceTo, setPriceTo] = useState(
    searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : max,
  );

  // Synchronize with context — NOT directly with URL
  useEffect(() => {
    setCtxFrom(priceFrom !== min ? priceFrom : null);
    setCtxTo(priceTo !== max ? priceTo : null);
  }, [priceFrom, priceTo, min, max, setCtxFrom, setCtxTo]);

  return (
    <div>
      <p>Price</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="number"
          value={priceFrom}
          min={min}
          max={priceTo}
          onChange={(e) => setPriceFrom(Number(e.target.value))}
        />
        <span>—</span>
        <input
          type="number"
          value={priceTo}
          min={priceFrom}
          max={max}
          onChange={(e) => setPriceTo(Number(e.target.value))}
        />
      </div>
    </div>
  );
});

PriceFilter.displayName = 'PriceFilter';
```

> If you need a slider — install `react-range` and use the `<Range>` component.

---

## Step 4: Create color filter

Colors are taken from the product attribute via `AttributesSets.getSingleAttributeByMarkerSet`.

File: `components/filter/ColorFilter.tsx`

```tsx
'use client';

import { memo, useCallback, useContext, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FilterContext } from '@/app/store/providers/FilterContext';

// Colors are passed as a prop — loaded in the parent Server Component
export const ColorFilter = memo(({
  colors,
}: {
  colors: Array<{ value: string; title: string }>; // from attribute.listTitles
}) => {
  const searchParams = useSearchParams();
  const { setColor: setCtxColor } = useContext(FilterContext);
  const [currentColor, setCurrentColor] = useState(searchParams.get('color') || '');

  useEffect(() => {
    setCtxColor(currentColor);
  }, [currentColor, setCtxColor]);

  const handleChange = useCallback((code: string) => {
    setCurrentColor((prev) => (prev === code ? '' : code)); // repeat click = reset
  }, []);

  return (
    <div>
      <p>Color</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {colors.map((color) => (
          <button
            key={color.value}
            onClick={() => handleChange(color.value)}
            style={{
              outline: currentColor === color.value ? '2px solid #000' : 'none',
              borderRadius: '50%',
              width: 28,
              height: 28,
              backgroundColor: color.value, // value = hex/css color
              cursor: 'pointer',
            }}
            title={color.title}
          />
        ))}
      </div>
    </div>
  );
});

ColorFilter.displayName = 'ColorFilter';
```

Loading colors from API (in the parent Server Component):

```ts
// app/actions/attributes.ts
'use server';
import { getApi, isError } from '@/lib/oneentry';

export async function getColorOptions(locale: string) {
  // setMarker — marker for the attribute set, attributeMarker — marker for the color attribute
  // Clarify markers via /inspect-api
  const attr = await getApi().AttributesSets.getSingleAttributeByMarkerSet(
    'product', 'color', locale,
  ) as any;
  if (isError(attr)) return [];
  return attr.listTitles ?? [];
}
```

---

## Step 5: Create availability filter

File: `components/filter/AvailabilityFilter.tsx`

```tsx
'use client';

import { memo, useCallback, useContext, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FilterContext } from '@/app/store/providers/FilterContext';

export const AvailabilityFilter = memo(() => {
  const searchParams = useSearchParams();
  const { setInStock: setCtxInStock } = useContext(FilterContext);
  const [available, setAvailable] = useState(searchParams.get('in_stock') === 'true');

  useEffect(() => {
    setCtxInStock(available);
  }, [available, setCtxInStock]);

  return (
    <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={available}
        onChange={() => setAvailable((prev) => !prev)}
      />
      In stock
    </label>
  );
});

AvailabilityFilter.displayName = 'AvailabilityFilter';
```

---

## Step 6: Apply and Reset buttons

File: `components/filter/FilterButtons.tsx`

```tsx
'use client';

import { useContext } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FilterContext } from '@/app/store/providers/FilterContext';

export function ApplyButton({ onApply }: { onApply?: () => void }) {
  const { priceFrom, priceTo, color, inStock } = useContext(FilterContext);
  const pathname = usePathname();
  const { replace } = useRouter();
  const searchParams = useSearchParams();

  const handleApply = () => {
    const params = new URLSearchParams(searchParams.toString());

    priceFrom !== null ? params.set('minPrice', String(priceFrom)) : params.delete('minPrice');
    priceTo !== null   ? params.set('maxPrice', String(priceTo))   : params.delete('maxPrice');
    color              ? params.set('color', color)                : params.delete('color');
    inStock            ? params.set('in_stock', 'true')            : params.delete('in_stock');
    params.delete('page'); // reset pagination

    replace(`${pathname}?${params.toString()}`);
    onApply?.(); // close modal
  };

  return <button onClick={handleApply}>Apply</button>;
}

export function ResetButton() {
  const pathname = usePathname();
  const { replace } = useRouter();
  const searchParams = useSearchParams();

  const handleReset = () => {
    const params = new URLSearchParams(searchParams.toString());
    ['minPrice', 'maxPrice', 'color', 'in_stock', 'page'].forEach((k) => params.delete(k));
    replace(`${pathname}?${params.toString()}`);
  };

  return <button onClick={handleReset}>Reset</button>;
}
```

---

## Step 7: Assemble FilterPanel

```tsx
// components/filter/FilterPanel.tsx
'use client';

import { useState } from 'react';
import { FilterProvider } from '@/app/store/providers/FilterContext';
import { PriceFilter } from './PriceFilter';
import { ColorFilter } from './ColorFilter';
import { AvailabilityFilter } from './AvailabilityFilter';
import { ApplyButton, ResetButton } from './FilterButtons';

export function FilterPanel({
  prices,
  colors,
}: {
  prices: { min: number; max: number };
  colors: Array<{ value: string; title: string }>;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <FilterProvider>
      <button onClick={() => setIsOpen(true)}>Filters</button>

      {isOpen && (
        <div>
          <PriceFilter min={prices.min} max={prices.max} />
          <ColorFilter colors={colors} />
          <AvailabilityFilter />
          <ResetButton />
          <ApplyButton onApply={() => setIsOpen(false)} />
        </div>
      )}
    </FilterProvider>
  );
}
```

Loading `prices` and `colors` in the parent Server Component:

```tsx
// app/[locale]/shop/page.tsx (Server Component)
import { getProductFilterOptions } from '@/app/actions/products';
import { getColorOptions } from '@/app/actions/attributes';

export default async function ShopPage({ params, searchParams }) {
  const { locale } = await params;
  const [filterOptions, colors] = await Promise.all([
    getProductFilterOptions(locale),  // { prices: { min, max } }
    getColorOptions(locale),
  ]);

  return (
    <>
      <FilterPanel prices={filterOptions.prices} colors={colors} />
      {/* ProductGrid... */}
    </>
  );
}
```

---

## Important details

```md
✅ Filter panel created. Key rules:

1. FilterContext = buffer: UI changes context, Apply writes to URL
   → the page does not re-render on every slider change
2. Each filter component initializes state from URL (useSearchParams) on mount
3. colors and prices — Server Component loads from API, passes as props
4. ApplyButton removes 'page' from URL — resets pagination when changing filters
5. Clarify markers price/color/in_stock via /inspect-api — they are unique for each project
6. If you need a price slider — install react-range
```

---

## Step 8: Playwright E2E tests

> Runs only if the user confirmed writing tests at the beginning of the session or requested writing a test later (see `feedback_playwright.md`).
> To set up Playwright — first `/setup-playwright`.

### 8.1 Add `data-testid` to components

For selector stability — add `data-testid` when generating filter panel components:

```tsx
// FilterPanel
<div data-testid="filter-panel">
  <button data-testid="filter-panel-toggle" onClick={() => setIsOpen(true)}>Filters</button>
  {isOpen && (
    <div data-testid="filter-panel-body">
      <PriceFilter ... />
      <ColorFilter ... />
      <AvailabilityFilter />
      <ResetButton />
      <ApplyButton onApply={...} />
    </div>
  )}
</div>

// PriceFilter
<div data-testid="filter-price">
  <input data-testid="filter-price-from" type="number" ... />
  <input data-testid="filter-price-to" type="number" ... />
</div>

// ColorFilter
<div data-testid="filter-color">
  {colors.map((c) => (
    <button
      key={c.value}
      data-testid="filter-color-option"
      data-color-value={c.value}
      aria-pressed={currentColor === c.value}
      ...
    />
  ))}
</div>

// AvailabilityFilter
<label>
  <input data-testid="filter-instock" type="checkbox" ... />
  In stock
</label>

// FilterButtons
<button data-testid="filter-apply" onClick={handleApply}>Apply</button>
<button data-testid="filter-reset" onClick={handleReset}>Reset</button>
```

### 8.2 Gather test parameters and fill `.env.local`

**Algorithm (execute step by step, do not ask in one list):**

1. **Path to the page with the product list and filter panel** — ask: "Where is the FilterPanel located? (e.g., `/shop`, `/catalog`)". 
   - Silent → Glob (`app/**/shop/**/page.tsx`, `app/**/catalog/**/page.tsx`) + Grep for `<FilterPanel`. Inform: "Found FilterPanel in `{path}` — using it".
2. **Color value for the test** — **do not ask the user**: take the first `value` from the results of the already executed `/inspect-api` (listTitles of the color attribute) or from `getColorOptions`. Inform: "Using `color={value}` for the color filter test — the first value from the project's listTitles".
3. **Price range** — take `additional.prices.min/max` from `getProductFilterOptions`, narrow it down to the middle (e.g., `min = ⌈avg - 10%⌉`, `max = ⌊avg + 10%⌋`) to ensure products are guaranteed to fall within the range. Inform: "Using range `{min}-{max}` for the price filter test (middle of the project's real range)".
4. **Keys of query parameters** — check yourself via Grep on the implemented `ApplyButton` (which keys are written to the URL): `minPrice`/`maxPrice`/`color`/`in_stock`. If the project has different keys — replace them in the spec file. Inform: "URL filter keys: `{minPrice, maxPrice, color, in_stock}` — taken from ApplyButton".
5. **Fill `.env.local`** (yourself, through Edit/Write):

```bash
# e2e filter-panel
E2E_SHOP_PATH=/shop
E2E_FILTER_COLOR=1
E2E_FILTER_MIN_PRICE=10
E2E_FILTER_MAX_PRICE=1000
```

If any value could not be determined — leave it empty, the corresponding test will include `test.skip`.

### 8.3 Create `e2e/filter-panel.spec.ts`

> ⚠️ Tests check the "Context-buffer" pattern (Apply writes to URL), clearing filters, and applying values from the URL. Values depend on the real project — configured via env.

```typescript
import { test, expect } from '@playwright/test';

const SHOP_PATH = process.env.E2E_SHOP_PATH || '/shop';
const FILTER_COLOR = process.env.E2E_FILTER_COLOR || '';
const FILTER_MIN_PRICE = process.env.E2E_FILTER_MIN_PRICE || '';
const FILTER_MAX_PRICE = process.env.E2E_FILTER_MAX_PRICE || '';

async function openPanel(page: import('@playwright/test').Page) {
  await page.goto(SHOP_PATH);
  await expect(page.getByTestId('filter-panel')).toBeVisible();
  await page.getByTestId('filter-panel-toggle').click();
  await expect(page.getByTestId('filter-panel-body')).toBeVisible();
}

test.describe('Filter panel', () => {
  test('panel opens on click and shows all sections', async ({ page }) => {
    await openPanel(page);
    await expect(page.getByTestId('filter-price')).toBeVisible();
    await expect(page.getByTestId('filter-color')).toBeVisible();
    await expect(page.getByTestId('filter-instock')).toBeVisible();
    await expect(page.getByTestId('filter-apply')).toBeVisible();
    await expect(page.getByTestId('filter-reset')).toBeVisible();
  });

  test('Apply writes price filter to URL', async ({ page }) => {
    test.skip(!FILTER_MIN_PRICE || !FILTER_MAX_PRICE, 'E2E_FILTER_MIN/MAX_PRICE not set');
    await openPanel(page);

    await page.getByTestId('filter-price-from').fill(FILTER_MIN_PRICE);
    await page.getByTestId('filter-price-to').fill(FILTER_MAX_PRICE);
    await page.getByTestId('filter-apply').click();

    await expect(page).toHaveURL(new RegExp(`minPrice=${FILTER_MIN_PRICE}`));
    await expect(page).toHaveURL(new RegExp(`maxPrice=${FILTER_MAX_PRICE}`));
  });

  test('changes in input do NOT change URL before Apply (Context-buffer)', async ({ page }) => {
    test.skip(!FILTER_MIN_PRICE, 'E2E_FILTER_MIN_PRICE not set');
    await openPanel(page);

    const initialUrl = page.url();
    await page.getByTestId('filter-price-from').fill(FILTER_MIN_PRICE);
    // Wait for event loop tick — URL should not change
    await page.waitForTimeout(200);
    expect(page.url()).toBe(initialUrl);
  });

  test('selecting color and Apply writes color to URL', async ({ page }) => {
    test.skip(!FILTER_COLOR, 'E2E_FILTER_COLOR not set');
    await openPanel(page);

    const colorBtn = page.locator(`[data-testid="filter-color-option"][data-color-value="${FILTER_COLOR}"]`);
    await colorBtn.click();
    await expect(colorBtn).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('filter-apply').click();
    await expect(page).toHaveURL(new RegExp(`color=${FILTER_COLOR}`));
  });

  test('the "in stock" checkbox goes to URL after Apply', async ({ page }) => {
    await openPanel(page);
    await page.getByTestId('filter-instock').check();
    await page.getByTestId('filter-apply').click();
    await expect(page).toHaveURL(/in_stock=true/);
  });

  test('Reset clears all filters from URL', async ({ page }) => {
    // Arriving with filters in URL
    const qs = [
      FILTER_MIN_PRICE && `minPrice=${FILTER_MIN_PRICE}`,
      FILTER_MAX_PRICE && `maxPrice=${FILTER_MAX_PRICE}`,
      FILTER_COLOR && `color=${FILTER_COLOR}`,
      'in_stock=true',
    ].filter(Boolean).join('&');

    await page.goto(`${SHOP_PATH}${qs ? `?${qs}` : '?in_stock=true'}`);
    await page.getByTestId('filter-panel-toggle').click();
    await page.getByTestId('filter-reset').click();

    await expect(page).not.toHaveURL(/minPrice=/);
    await expect(page).not.toHaveURL(/maxPrice=/);
    await expect(page).not.toHaveURL(/color=/);
    await expect(page).not.toHaveURL(/in_stock=/);
  });

  test('Apply resets the page parameter (pagination)', async ({ page }) => {
    await page.goto(`${SHOP_PATH}?page=3`);
    await page.getByTestId('filter-panel-toggle').click();
    await page.getByTestId('filter-instock').check();
    await page.getByTestId('filter-apply').click();
    await expect(page).not.toHaveURL(/page=3/);
  });

  test('initialization from URL: checkbox is already checked', async ({ page }) => {
    await page.goto(`${SHOP_PATH}?in_stock=true`);
    await page.getByTestId('filter-panel-toggle').click();
    await expect(page.getByTestId('filter-instock')).toBeChecked();
  });
});
```

### 8.4 Report to the user about the decisions made

Before completing the task — explicitly inform:

```
✅ e2e/filter-panel.spec.ts created
✅ data-testid added to all filter components (panel, price, color, instock, apply, reset)
✅ .env.local updated (E2E_SHOP_PATH, E2E_FILTER_COLOR, E2E_FILTER_MIN_PRICE, E2E_FILTER_MAX_PRICE)

Decisions made automatically:
- Path to the page with the panel: {SHOP_PATH} — {user-specified / found via Glob+Grep for <FilterPanel}
- Color for the test: {FILTER_COLOR} — the first value from the listTitles of the color attribute (from getColorOptions)
- Price range: {MIN}-{MAX} — the middle of the real range of the project (from additional.prices)
- URL filter keys: minPrice/maxPrice/color/in_stock — taken from the implementation of ApplyButton (checked via Grep)

Run: npm run test:e2e -- filter-panel.spec.ts
```

If the project uses different query parameter keys (e.g., `price_min` instead of `minPrice`) — adjust the regex in `toHaveURL` to match the actual implementation of `ApplyButton`.
