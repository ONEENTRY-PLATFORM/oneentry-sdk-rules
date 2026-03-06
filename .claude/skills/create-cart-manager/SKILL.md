<!-- META
type: skill
skillConfig: {"name":"create-cart-manager"}
-->

# Создать менеджер корзины (Redux + persist)

Создаёт Redux slice корзины с персистентностью, store и типами. Корзина хранит список товаров с количеством и переживает перезагрузку страницы.

---

## Шаг 1: Установи зависимости

```bash
npm install @reduxjs/toolkit react-redux redux-persist next-redux-wrapper
```

---

## Шаг 2: Создай тип продукта в корзине

Файл: `app/types/cart.ts`

```typescript
export interface ICartProduct {
  id: number;
  quantity: number;
  selected: boolean;
}
```

---

## Шаг 3: Создай cart slice

Файл: `app/store/reducers/CartSlice.ts`

```typescript
'use client';

import { createSelector, createSlice } from '@reduxjs/toolkit';
import type { PayloadAction, WritableDraft } from '@reduxjs/toolkit';
import type { IProductsEntity } from 'oneentry/dist/products/productsInterfaces';
import type { ICartProduct } from '@/app/types/cart';

type CartState = {
  products: IProductsEntity[];       // полные данные товаров (загружаются из API)
  productsData: ICartProduct[];      // id + quantity + selected (персистируется)
  total: number;
  version: number;
};

const initialState: CartState = {
  products: [],
  productsData: [],
  total: 0,
  version: 0,
};

export const cartSlice = createSlice({
  name: 'cart-slice',
  initialState,
  reducers: {
    addProductToCart(
      state: WritableDraft<CartState>,
      action: PayloadAction<{ id: number; quantity: number; selected?: boolean }>,
    ) {
      const index = state.productsData.findIndex((p) => p.id === action.payload.id);
      if (index === -1) {
        state.productsData.push({
          id: action.payload.id,
          quantity: Math.max(1, action.payload.quantity),
          selected: action.payload.selected ?? true,
        });
      } else {
        state.productsData[index]!.quantity = Math.max(
          1,
          state.productsData[index]!.quantity + action.payload.quantity,
        );
      }
    },

    increaseProductQty(
      state: WritableDraft<CartState>,
      action: PayloadAction<{ id: number; units: number }>,
    ) {
      const index = state.productsData.findIndex((p) => p.id === action.payload.id);
      if (index === -1) {
        state.productsData.push({ id: action.payload.id, quantity: 1, selected: true });
        return;
      }
      state.productsData[index]!.quantity = Math.min(
        state.productsData[index]!.quantity + 1,
        action.payload.units,
      );
    },

    decreaseProductQty(
      state: WritableDraft<CartState>,
      action: PayloadAction<{ id: number }>,
    ) {
      const index = state.productsData.findIndex((p) => p.id === action.payload.id);
      if (index === -1) return;
      if (state.productsData[index]!.quantity <= 1) {
        state.productsData = state.productsData.filter((p) => p.id !== action.payload.id);
      } else {
        state.productsData[index]!.quantity -= 1;
      }
    },

    setProductQty(
      state: WritableDraft<CartState>,
      action: PayloadAction<{ id: number; quantity: number; units: number }>,
    ) {
      if (action.payload.quantity <= 0) {
        state.productsData = state.productsData.filter((p) => p.id !== action.payload.id);
        return;
      }
      const qty = Math.min(action.payload.quantity, action.payload.units);
      const index = state.productsData.findIndex((p) => p.id === action.payload.id);
      if (index !== -1) {
        state.productsData[index]!.quantity = qty;
      } else {
        state.productsData.push({ id: action.payload.id, quantity: qty, selected: true });
      }
    },

    removeProduct(state: WritableDraft<CartState>, action: PayloadAction<number>) {
      state.productsData = state.productsData.filter((p) => p.id !== action.payload);
    },

    removeAllProducts(state: WritableDraft<CartState>) {
      state.productsData = [];
      state.products = [];
    },

    addProductsToCart(
      state: WritableDraft<CartState>,
      action: PayloadAction<IProductsEntity[]>,
    ) {
      state.products = action.payload;
    },

    deselectProduct(state: WritableDraft<CartState>, action: PayloadAction<number>) {
      const index = state.productsData.findIndex((p) => p.id === action.payload);
      if (index !== -1) {
        state.productsData[index]!.selected = !state.productsData[index]!.selected;
      }
    },

    setCartVersion(state: WritableDraft<CartState>, action: PayloadAction<number>) {
      state.version = action.payload;
    },
  },
});

// Selectors
export const selectCartData = (state: { cartReducer: CartState }) =>
  state.cartReducer.productsData;

export const selectCartItems = (state: { cartReducer: CartState }) =>
  state.cartReducer.products;

export const selectIsInCart = (
  state: { cartReducer: CartState },
  productId: number,
) => state.cartReducer.productsData.some((p) => p.id === productId);

export const selectCartItemQty = (
  state: { cartReducer: CartState },
  productId: number,
) => state.cartReducer.productsData.find((p) => p.id === productId)?.quantity ?? 0;

export const selectCartVersion = (state: { cartReducer: CartState }) =>
  state.cartReducer.version;

// Total считается по атрибутам — уточни маркеры price/sale у пользователя!
export const selectCartTotal = createSelector(
  (state: { cartReducer: CartState }) => state.cartReducer.productsData,
  (state: { cartReducer: CartState }) => state.cartReducer.products,
  (productsData, products) =>
    productsData.reduce((total, item) => {
      if (!item.selected) return total;
      const product = products.find((p) => p.id === item.id);
      if (!product) return total;
      const price =
        (product.attributeValues as any)?.sale?.value ||
        (product.attributeValues as any)?.price?.value ||
        product.price ||
        0;
      return total + Number(price) * item.quantity;
    }, 0),
);

export const {
  addProductToCart,
  addProductsToCart,
  increaseProductQty,
  decreaseProductQty,
  setProductQty,
  removeProduct,
  deselectProduct,
  removeAllProducts,
  setCartVersion,
} = cartSlice.actions;

export default cartSlice.reducer;
```

---

## Шаг 4: Создай Redux store с персистентностью

Файл: `app/store/store.ts`

```typescript
import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { createWrapper } from 'next-redux-wrapper';
import { persistReducer } from 'redux-persist';
import createWebStorage from 'redux-persist/lib/storage/createWebStorage';
import cartSlice from './reducers/CartSlice';

// SSR-совместимое хранилище (noop на сервере)
const createNoopStorage = () => ({
  getItem: () => Promise.resolve(null),
  setItem: (_key: string, value: unknown) => Promise.resolve(value),
  removeItem: () => Promise.resolve(),
});

const storage =
  typeof window !== 'undefined'
    ? createWebStorage('local')
    : createNoopStorage();

const cartReducer = persistReducer(
  {
    key: 'cart-slice',
    storage,
    version: 1,
    whitelist: ['productsData', 'total'], // products НЕ персистируем — загружаем из API
  },
  cartSlice,
);

const rootReducer = combineReducers({ cartReducer });

export const setupStore = () =>
  configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

export type RootState = ReturnType<typeof rootReducer>;
export type AppStore = ReturnType<typeof setupStore>;
export type AppDispatch = AppStore['dispatch'];

export const wrapper = createWrapper<AppStore>(setupStore, { debug: false });
```

---

## Шаг 5: Оберни приложение в Provider

Файл: `app/store/providers/StoreProvider.tsx`

```tsx
'use client';

import { useRef } from 'react';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { persistStore } from 'redux-persist';
import { setupStore } from '../store';

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const storeRef = useRef<ReturnType<typeof setupStore>>();
  if (!storeRef.current) {
    storeRef.current = setupStore();
  }
  const persistor = persistStore(storeRef.current);

  return (
    <Provider store={storeRef.current}>
      <PersistGate loading={null} persistor={persistor}>
        {children}
      </PersistGate>
    </Provider>
  );
}
```

В `app/layout.tsx`:

```tsx
import { StoreProvider } from '@/app/store/providers/StoreProvider';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
```

---

## Шаг 6: Использование в компонентах

```tsx
'use client';

import { useDispatch, useSelector } from 'react-redux';
import {
  addProductToCart,
  removeProduct,
  selectIsInCart,
  selectCartItemQty,
  selectCartTotal,
} from '@/app/store/reducers/CartSlice';
import type { AppDispatch, RootState } from '@/app/store/store';

export function AddToCartButton({ product }: { product: any }) {
  const dispatch = useDispatch<AppDispatch>();
  const isInCart = useSelector((state: RootState) =>
    selectIsInCart(state, product.id),
  );
  const qty = useSelector((state: RootState) =>
    selectCartItemQty(state, product.id),
  );

  return isInCart ? (
    <button onClick={() => dispatch(removeProduct(product.id))}>
      В корзине ({qty})
    </button>
  ) : (
    <button onClick={() => dispatch(addProductToCart({ id: product.id, quantity: 1 }))}>
      В корзину
    </button>
  );
}
```

---

## Важные детали

```md
✅ Создан cart-manager. Ключевые правила:

1. productsData (id + qty) персистируется — products (полные данные) НЕ персистируются
2. products загружай из API при монтировании CartPage по id из productsData
3. selectCartTotal — уточни маркеры атрибутов price/sale у пользователя!
4. На сервере storage = noop (без localStorage) — PersistGate решает гидратацию
5. serializableCheck: false — нужно для redux-persist
6. Если нужны favorites — добавь FavoritesSlice аналогично (whitelist: ['products'])
```
