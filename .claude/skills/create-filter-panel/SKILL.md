<!-- META
type: skill
skillConfig: {"name":"create-filter-panel"}
-->

# Создать панель фильтров товаров

Создаёт фильтр-панель с ценой, цветом и наличием. Использует FilterContext как буфер между UI и URL — фильтры применяются только по кнопке "Применить", страница не перерендеривается на каждом движении слайдера.

> ⚠️ Предполагает что каталог товаров использует URL query params (паттерн из `/create-product-list`).

---

## Шаг 1: Проверь реальные маркеры атрибутов

```bash
/inspect-api products          # маркеры price, color и т.д.
/inspect-api product-statuses  # маркер статуса "в наличии"
```

Что смотреть:
- `items[0].attributeValues` — реальные маркеры (возможно `price`, `sale_price`, `colour`)
- `ProductStatuses[].identifier` — реальный маркер статуса (возможно `in_stock`, `available`)

**НЕ угадывай маркеры!**

---

## Шаг 2: Создай FilterContext

Файл: `app/store/providers/FilterContext.tsx`

```tsx
'use client';

import { createContext, useState } from 'react';
import type { Dispatch, ReactNode } from 'react';

// Адаптируй под реальные фильтры проекта (добавь/убери поля)
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

## Шаг 3: Создай компонент ценового фильтра

Файл: `components/filter/PriceFilter.tsx`

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

  // Синхронизируем с контекстом — НЕ с URL напрямую
  useEffect(() => {
    setCtxFrom(priceFrom !== min ? priceFrom : null);
    setCtxTo(priceTo !== max ? priceTo : null);
  }, [priceFrom, priceTo, min, max, setCtxFrom, setCtxTo]);

  return (
    <div>
      <p>Цена</p>
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

> Если нужен слайдер — установи `react-range` и используй компонент `<Range>`.

---

## Шаг 4: Создай фильтр цвета

Цвета берутся из атрибута товара через `AttributesSets.getSingleAttributeByMarkerSet`.

Файл: `components/filter/ColorFilter.tsx`

```tsx
'use client';

import { memo, useCallback, useContext, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FilterContext } from '@/app/store/providers/FilterContext';

// Цвета передаются как проп — загружаются в родительском Server Component
export const ColorFilter = memo(({
  colors,
}: {
  colors: Array<{ value: string; title: string }>; // из attribute.listTitles
}) => {
  const searchParams = useSearchParams();
  const { setColor: setCtxColor } = useContext(FilterContext);
  const [currentColor, setCurrentColor] = useState(searchParams.get('color') || '');

  useEffect(() => {
    setCtxColor(currentColor);
  }, [currentColor, setCtxColor]);

  const handleChange = useCallback((code: string) => {
    setCurrentColor((prev) => (prev === code ? '' : code)); // повторный клик = сброс
  }, []);

  return (
    <div>
      <p>Цвет</p>
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
              backgroundColor: color.value, // value = hex/css цвет
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

Загрузка цветов из API (в Server Component-родителе):

```ts
// app/actions/attributes.ts
'use server';
import { getApi, isError } from '@/lib/oneentry';

export async function getColorOptions(locale: string) {
  // setMarker — маркер набора атрибутов, attributeMarker — маркер атрибута color
  // Уточни маркеры через /inspect-api
  const attr = await getApi().AttributesSets.getSingleAttributeByMarkerSet(
    'product', 'color', locale,
  ) as any;
  if (isError(attr)) return [];
  return attr.listTitles ?? [];
}
```

---

## Шаг 5: Создай фильтр наличия

Файл: `components/filter/AvailabilityFilter.tsx`

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
      В наличии
    </label>
  );
});

AvailabilityFilter.displayName = 'AvailabilityFilter';
```

---

## Шаг 6: Кнопки Apply и Reset

Файл: `components/filter/FilterButtons.tsx`

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
    params.delete('page'); // сбрасываем пагинацию

    replace(`${pathname}?${params.toString()}`);
    onApply?.(); // закрыть модальное окно
  };

  return <button onClick={handleApply}>Применить</button>;
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

  return <button onClick={handleReset}>Сбросить</button>;
}
```

---

## Шаг 7: Собери FilterPanel

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
      <button onClick={() => setIsOpen(true)}>Фильтры</button>

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

Загрузка `prices` и `colors` в Server Component-родителе:

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

## Важные детали

```md
✅ Создан filter-panel. Ключевые правила:

1. FilterContext = буфер: UI меняет context, Apply пишет в URL
   → страница не ререндерится на каждое изменение слайдера
2. Каждый фильтр-компонент инициализирует state из URL (useSearchParams) при монтировании
3. colors и prices — Server Component загружает из API, передаёт как props
4. ApplyButton удаляет 'page' из URL — сбрасывает пагинацию при смене фильтров
5. Уточни маркеры price/color/in_stock через /inspect-api — они уникальны для каждого проекта
6. Если нужен слайдер цены — установи react-range
```
