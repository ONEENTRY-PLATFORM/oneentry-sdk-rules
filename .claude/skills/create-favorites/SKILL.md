---
name: create-favorites
description: Create favorites list with Redux and persistence
---
# Create a favorites list (Redux + persist)

Creates a Redux slice for storing the IDs of favorite products with persistence in localStorage.

> ⚠️ Requires a Redux store. If the store has not been created yet, first run `/create-cart-manager` (or create the store manually).

---

## Step 1: Create the favorites slice

File: `app/store/reducers/FavoritesSlice.ts`

```typescript
'use client';

import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction, WritableDraft } from '@reduxjs/toolkit';

type FavoritesState = {
  products: number[];  // only product IDs
  version: number;     // for tracking changes
};

const initialState: FavoritesState = {
  products: [],
  version: 0,
};

export const favoritesSlice = createSlice({
  name: 'favorites-slice',
  initialState,
  reducers: {
    addFavorites(state: WritableDraft<FavoritesState>, action: PayloadAction<number>) {
      if (!state.products.includes(action.payload)) {
        state.products.push(action.payload);
      }
    },

    removeFavorites(state: WritableDraft<FavoritesState>, action: PayloadAction<number>) {
      state.products = state.products.filter((id) => id !== action.payload);
    },

    toggleFavorite(state: WritableDraft<FavoritesState>, action: PayloadAction<number>) {
      const index = state.products.indexOf(action.payload);
      if (index === -1) {
        state.products.push(action.payload);
      } else {
        state.products.splice(index, 1);
      }
    },

    removeAllFavorites(state: WritableDraft<FavoritesState>) {
      state.products = [];
    },

    setFavoritesVersion(
      state: WritableDraft<FavoritesState>,
      action: PayloadAction<number>,
    ) {
      state.version = action.payload;
    },
  },
});

// Selectors
export const selectFavoritesItems = (state: {
  favoritesReducer: FavoritesState;
}): number[] => state.favoritesReducer.products;

export const selectIsFavorite = (
  state: { favoritesReducer: FavoritesState },
  productId: number,
): boolean => state.favoritesReducer.products.includes(productId);

export const selectFavoritesVersion = (state: {
  favoritesReducer: FavoritesState;
}): number => state.favoritesReducer.version;

export const {
  addFavorites,
  removeFavorites,
  toggleFavorite,
  removeAllFavorites,
  setFavoritesVersion,
} = favoritesSlice.actions;

export default favoritesSlice.reducer;
```

---

## Step 2: Add to the store

In `app/store/store.ts`, add favorites with persistence:

```typescript
import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { persistReducer } from 'redux-persist';
import createWebStorage from 'redux-persist/lib/storage/createWebStorage';
import favoritesSlice from './reducers/FavoritesSlice';
// + other imports

const storage = typeof window !== 'undefined'
  ? createWebStorage('local')
  : { getItem: () => Promise.resolve(null), setItem: (_: string, v: unknown) => Promise.resolve(v), removeItem: () => Promise.resolve() };

const favoritesReducer = persistReducer(
  {
    key: 'favorites-slice',
    storage,
    version: 1,
    whitelist: ['products'],  // version NOT persisted
  },
  favoritesSlice,
);

const rootReducer = combineReducers({
  // cartReducer,  ← if already exists
  favoritesReducer,
});

export const setupStore = () =>
  configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

export type RootState = ReturnType<typeof rootReducer>;
export type AppStore = ReturnType<typeof setupStore>;
export type AppDispatch = AppStore['dispatch'];
```

---

## Step 3: Add to favorites button

```tsx
'use client';

import { useDispatch, useSelector } from 'react-redux';
import { toggleFavorite, selectIsFavorite } from '@/app/store/reducers/FavoritesSlice';
import type { AppDispatch, RootState } from '@/app/store/store';

export function FavoriteButton({ productId }: { productId: number }) {
  const dispatch = useDispatch<AppDispatch>();
  const isFavorite = useSelector((state: RootState) =>
    selectIsFavorite(state, productId),
  );

  return (
    <button
      onClick={() => dispatch(toggleFavorite(productId))}
      aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
    >
      {isFavorite ? '♥' : '♡'}
    </button>
  );
}
```

---

## Step 4: Favorites page

The slice only stores IDs — load the full product data from the API when opening the page:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { selectFavoritesItems } from '@/app/store/reducers/FavoritesSlice';
import type { RootState } from '@/app/store/store';
import { getProductsByIds } from '@/app/actions/products'; // Server Action

export function FavoritesPage() {
  const favoriteIds = useSelector((state: RootState) => selectFavoritesItems(state));
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    if (!favoriteIds.length) { setProducts([]); return; }
    getProductsByIds(favoriteIds).then(setProducts);
  }, [favoriteIds]);

  if (!favoriteIds.length) return <p>The favorites list is empty</p>;

  return (
    <ul>
      {products.map((p) => (
        <li key={p.id}>{p.localizeInfos?.title}</li>
      ))}
    </ul>
  );
}
```

Server Action for loading:

```typescript
// app/actions/products.ts
'use server';
import { getApi, isError } from '@/lib/oneentry';

export async function getProductsByIds(ids: number[]) {
  const result = await getApi().Products.getProductsByIds(ids.join(',')) as any;
  if (isError(result)) return [];
  return result;
}
```

---

## Important details

```md
✅ Favorites created. Key rules:

1. The slice only stores number[] (IDs) — compact and quickly persisted
2. Full product data is loaded from the API when opening the favorites page
3. toggleFavorite — more convenient than separate add/remove for buttons
4. version — increment when synchronizing with the server (user.state.favorites)
5. If the user is authenticated — synchronize favorites with user.state via Users.updateUser
```

---

## Step 5: Playwright E2E tests

> Runs only if the user confirmed writing tests at the beginning of the session or requested writing a test later (see `feedback_playwright.md`).
> To set up Playwright — first `/setup-playwright`.

### 5.1 Add `data-testid` to components

For selector stability — add `data-testid` when generating favorite components:

```tsx
// FavoriteButton (on product card)
<button
  data-testid="favorite-button"
  data-product-id={productId}
  aria-pressed={isFavorite}
  onClick={() => dispatch(toggleFavorite(productId))}
>
  {isFavorite ? '♥' : '♡'}
</button>

// FavoritesPage
<div data-testid="favorites-root">
  {!favoriteIds.length ? (
    <p data-testid="favorites-empty">The favorites list is empty</p>
  ) : (
    <ul data-testid="favorites-list">
      {products.map((p) => (
        <li key={p.id} data-testid="favorite-item" data-product-id={p.id}>
          <span data-testid="favorite-item-title">{p.localizeInfos?.title}</span>
        </li>
      ))}
    </ul>
  )}
</div>

// Counter in the header (if any)
<span data-testid="favorites-badge">{favoriteIds.length}</span>
```

### 5.2 Gather test parameters and fill in `.env.local`

**Algorithm (execute step by step, do not ask in one list):**

1. **Path to the catalog** (where product cards with the FavoriteButton are displayed) — ask: "On which page are the product cards rendered with the favorite button? (e.g., `/shop`, `/catalog`)".
   - Silence → Glob (`app/**/shop/**/page.tsx`, `app/**/catalog/**/page.tsx`) + Grep for `FavoriteButton`/`data-testid="favorite-button"`. Inform: "Found the page with cards at `{path}`".
2. **Path to the favorites page** — ask: "Where is the favorites page? (e.g., `/favorites`, `/wishlist`)".
   - Silence → Glob (`app/**/favorites/**/page.tsx`, `app/**/wishlist/**/page.tsx`). If nothing is found — comment out the test "favorites page shows product", inform: "Favorites page not found — test disabled, working only with the toggle button".
3. **Fill in `.env.local`** (yourself, through Edit/Write):

```bash
# e2e favorites
E2E_SHOP_PATH=/shop
E2E_FAVORITES_PATH=/favorites
```

If the favorites page is not found — leave `E2E_FAVORITES_PATH` empty, the separate page test will be skipped.

### 5.3 Create `e2e/favorites.spec.ts`

> ⚠️ Tests check Redux + redux-persist through interaction with the UI and the state of `localStorage['persist:favorites-slice']`.

```typescript
import { test, expect } from '@playwright/test';

const SHOP_PATH = process.env.E2E_SHOP_PATH || '/shop';
const FAVORITES_PATH = process.env.E2E_FAVORITES_PATH || '';

test.describe('Favorites (Redux + persist)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(SHOP_PATH);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByTestId('favorite-button').first().waitFor({ timeout: 10_000 });
  });

  test('clicking the button adds the product to favorites (aria-pressed)', async ({ page }) => {
    const btn = page.getByTestId('favorite-button').first();
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
  });

  test('re-clicking removes the product from favorites (toggle)', async ({ page }) => {
    const btn = page.getByTestId('favorite-button').first();
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
  });

  test('persistence: after reload, favorites are saved', async ({ page }) => {
    const btn = page.getByTestId('favorite-button').first();
    const productId = await btn.getAttribute('data-product-id');
    await btn.click();

    await page.reload();
    const afterReload = page.locator(`[data-testid="favorite-button"][data-product-id="${productId}"]`);
    await expect(afterReload).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });

    // localStorage contains persist:favorites-slice
    const persisted = await page.evaluate(() => localStorage.getItem('persist:favorites-slice'));
    expect(persisted).toBeTruthy();
    expect(persisted).toContain('products');
  });

  test('favorites page shows added product', async ({ page }) => {
    test.skip(!FAVORITES_PATH, 'E2E_FAVORITES_PATH not set (favorites page not found)');

    const btn = page.getByTestId('favorite-button').first();
    const productId = await btn.getAttribute('data-product-id');
    await btn.click();

    await page.goto(FAVORITES_PATH);
    await expect(page.getByTestId('favorites-root')).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator(`[data-testid="favorite-item"][data-product-id="${productId}"]`),
    ).toBeVisible();
  });

  test('empty favorites shows empty-state', async ({ page }) => {
    test.skip(!FAVORITES_PATH, 'E2E_FAVORITES_PATH not set');

    // Nothing added — localStorage already cleared in beforeEach
    await page.goto(FAVORITES_PATH);
    await expect(page.getByTestId('favorites-empty')).toBeVisible();
  });
});
```

### 5.4 Report to the user about the decisions made

Before completing the task — explicitly inform:

```
✅ e2e/favorites.spec.ts created
✅ data-testid added to FavoriteButton and FavoritesPage
✅ .env.local updated (E2E_SHOP_PATH, E2E_FAVORITES_PATH)

Decisions made automatically:
- Path with cards: {SHOP_PATH} — {specified / found via Glob+Grep for FavoriteButton}
- Path to the favorites page: {FAVORITES_PATH / empty} — {specified / found / not found in the project}
- Test for the separate favorites page: {included / test.skip — page not found, working only with the toggle button}

Run: npm run test:e2e -- favorites.spec.ts
```
