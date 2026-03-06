<!-- META
type: skill
skillConfig: {"name":"create-favorites"}
-->

# Создать список избранного (Redux + persist)

Создаёт Redux slice для хранения ID избранных товаров с персистентностью в localStorage.

> ⚠️ Требует Redux store. Если store ещё не создан — сначала выполни `/create-cart-manager` (или создай store вручную).

---

## Шаг 1: Создай favorites slice

Файл: `app/store/reducers/FavoritesSlice.ts`

```typescript
'use client';

import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction, WritableDraft } from '@reduxjs/toolkit';

type FavoritesState = {
  products: number[];  // только ID товаров
  version: number;     // для отслеживания изменений
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

## Шаг 2: Добавь в store

В `app/store/store.ts` добавь favorites с персистентностью:

```typescript
import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { persistReducer } from 'redux-persist';
import createWebStorage from 'redux-persist/lib/storage/createWebStorage';
import favoritesSlice from './reducers/FavoritesSlice';
// + остальные импорты

const storage = typeof window !== 'undefined'
  ? createWebStorage('local')
  : { getItem: () => Promise.resolve(null), setItem: (_: string, v: unknown) => Promise.resolve(v), removeItem: () => Promise.resolve() };

const favoritesReducer = persistReducer(
  {
    key: 'favorites-slice',
    storage,
    version: 1,
    whitelist: ['products'],  // version НЕ персистируем
  },
  favoritesSlice,
);

const rootReducer = combineReducers({
  // cartReducer,  ← если уже есть
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

## Шаг 3: Кнопка добавления в избранное

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
      aria-label={isFavorite ? 'Убрать из избранного' : 'В избранное'}
    >
      {isFavorite ? '♥' : '♡'}
    </button>
  );
}
```

---

## Шаг 4: Страница избранного

Slice хранит только ID — полные данные товаров загружай из API при открытии страницы:

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

  if (!favoriteIds.length) return <p>Список избранного пуст</p>;

  return (
    <ul>
      {products.map((p) => (
        <li key={p.id}>{p.localizeInfos?.title}</li>
      ))}
    </ul>
  );
}
```

Server Action для загрузки:

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

## Важные детали

```md
✅ Создан favorites. Ключевые правила:

1. Slice хранит только number[] (ID) — компактно и быстро персистируется
2. Полные данные товаров загружаются из API при открытии страницы избранного
3. toggleFavorite — удобнее чем отдельные add/remove для кнопок
4. version — инкрементируй при синхронизации с сервером (user.state.favorites)
5. Если пользователь авторизован — синхронизируй favorites с user.state через Users.updateUser
```
