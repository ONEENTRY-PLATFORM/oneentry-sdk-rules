<!-- META
type: skill
skillConfig: {"name":"create-filter-panel"}
-->

# Create a Product Filter Panel

Creates a filter panel with price, color, and availability. Uses FilterContext as a buffer between the UI and the URL — filters are applied only when the "Apply" button is clicked, and the page is not re-rendered on each slider movement.

> ⚠️ Assumes that the product catalog uses URL query params (pattern from `/create-product-list`).

---

## Step 1: Check Real Attribute Markers

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

## Step 3: Create Price Filter Component

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

  // Synchronize with context — NOT with URL directly
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

## Step 4: Create Color Filter

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

Loading colors from the API (in the parent Server Component):

```ts
// app/actions/attributes.ts
'use server';
import { getApi, isError } from '@/lib/oneentry';

export async function getColorOptions(locale: string) {
  // setMarker — marker of the attribute set, attributeMarker — marker of the color attribute
  // Clarify markers via /inspect-api
  const attr = await getApi().AttributesSets.getSingleAttributeByMarkerSet(
    'product', 'color', locale,
  ) as any;
  if (isError(attr)) return [];
  return attr.listTitles ?? [];
}
```

---

## Step 5: Create Availability Filter

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
      In Stock
    </label>
  );
});

AvailabilityFilter.displayName = 'AvailabilityFilter';
```

---

## Step 6: Apply and Reset Buttons

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

## Important Details

```md
✅ Filter panel created. Key rules:

1. FilterContext = buffer: UI changes context, Apply writes to URL
   → the page does not re-render on each slider change
2. Each filter component initializes state from URL (useSearchParams) on mount
3. colors and prices — Server Component loads from API, passes as props
4. ApplyButton removes 'page' from URL — resets pagination when filters change
5. Clarify markers price/color/in_stock via /inspect-api — they are unique for each project
6. If you need a price slider — install react-range
```
