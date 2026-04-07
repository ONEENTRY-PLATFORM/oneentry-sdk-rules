---
name: create-favorites
description: Create favorites list with Redux and persistence
---
# Create Favorites List (Redux + persist)

Creates a Redux slice to store the IDs of favorite products with persistence in localStorage.

> ⚠️ Requires a Redux store. If the store has not been created yet, first run `/create-cart-manager` (or create the store manually).

---

## Step 1: Create favorites slice

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

## Step 2: Add to store

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

## Important Details

```md
✅ Favorites created. Key rules:

1. The slice stores only number[] (IDs) — compact and quickly persisted
2. Full product data is loaded from the API when opening the favorites page
3. toggleFavorite — more convenient than separate add/remove for buttons
4. version — increment when synchronizing with the server (user.state.favorites)
5. If the user is authenticated — synchronize favorites with user.state via Users.updateUser
```
