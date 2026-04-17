---
name: create-cart-manager
description: Create cart manager with Redux and persistence
---
# Create Cart Manager (Redux + persist)

Creates a Redux slice for the cart with persistence, store, and types. The cart stores a list of products with quantities and survives page reloads.

---

## Step 1: Install dependencies

```bash
npm install @reduxjs/toolkit react-redux redux-persist next-redux-wrapper
```

---

## Step 2: Create product type in the cart

File: `app/types/cart.ts`

```typescript
export interface ICartProduct {
  id: number;
  quantity: number;
  selected: boolean;
}
```

---

## Step 3: Create cart slice

File: `app/store/reducers/CartSlice.ts`

```typescript
'use client';

import { createSelector, createSlice } from '@reduxjs/toolkit';
import type { PayloadAction, WritableDraft } from '@reduxjs/toolkit';
import type { IProductsEntity } from 'oneentry/dist/products/productsInterfaces';
import type { ICartProduct } from '@/app/types/cart';

type CartState = {
  products: IProductsEntity[];       // full product data (loaded from API)
  productsData: ICartProduct[];      // id + quantity + selected (persisted)
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

// Total is calculated based on attributes — clarify price/sale markers with the user!
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

## Step 4: Create Redux store with persistence

File: `app/store/store.ts`

```typescript
import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { createWrapper } from 'next-redux-wrapper';
import { persistReducer } from 'redux-persist';
import createWebStorage from 'redux-persist/lib/storage/createWebStorage';
import cartSlice from './reducers/CartSlice';

// SSR-compatible storage (noop on the server)
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
    whitelist: ['productsData', 'total'], // products are NOT persisted — loaded from API
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

## Step 5: Wrap the application in Provider

File: `app/store/providers/StoreProvider.tsx`

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

In `app/layout.tsx`:

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

## Step 6: Usage in components

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
      In Cart ({qty})
    </button>
  ) : (
    <button onClick={() => dispatch(addProductToCart({ id: product.id, quantity: 1 }))}>
      Add to Cart
    </button>
  );
}
```

---

## Important Details

```md
✅ Cart manager created. Key rules:

1. productsData (id + qty) is persisted — products (full data) are NOT persisted
2. Load products from API when mounting CartPage by id from productsData
3. selectCartTotal — clarify attribute markers price/sale with the user!
4. On the server, storage = noop (no localStorage) — PersistGate handles hydration
5. serializableCheck: false — needed for redux-persist
6. If favorites are needed — add FavoritesSlice similarly (whitelist: ['products'])
```

---

## Step 7: Playwright E2E tests

> Runs only if the user confirmed writing tests at the beginning of the session or requested writing a test later (see `feedback_playwright.md`).
> For setting up Playwright — first `/setup-playwright`.

### 7.1 Add `data-testid` to components

For selector stability — add `data-testid` when generating cart components:

```tsx
// AddToCartButton (or similar button on product card)
<button
  data-testid="add-to-cart"
  data-product-id={product.id}
  onClick={() => dispatch(addProductToCart({ id: product.id, quantity: 1 }))}>
  Add to Cart
</button>

// When the product is already in the cart
<button data-testid="remove-from-cart" data-product-id={product.id}>
  In Cart ({qty})
</button>

// CartDrawer / CartPage (cart page)
<div data-testid="cart-root">
  {items.length === 0 ? (
    <p data-testid="cart-empty">Cart is empty</p>
  ) : (
    <ul data-testid="cart-items">
      {items.map((item) => (
        <li key={item.id} data-testid="cart-item" data-product-id={item.id}>
          <span data-testid="cart-item-title">{item.title}</span>
          <span data-testid="cart-item-qty">{item.quantity}</span>
          <button data-testid="cart-qty-decrease" aria-label="Decrease">−</button>
          <button data-testid="cart-qty-increase" aria-label="Increase">+</button>
          <button data-testid="cart-item-remove" aria-label="Remove">×</button>
        </li>
      ))}
    </ul>
  )}
  <div data-testid="cart-total">{total}</div>
</div>

// Product count in the header (if any)
<span data-testid="cart-badge">{itemsCount}</span>
```

### 7.2 Gather test parameters and fill in `.env.local`

**Algorithm (execute step by step, do not ask in one list):**

1. **Path to the catalog/product cards** (where to click "Add to Cart") — ask: "What is the path to the page with the product list where there is an 'Add to Cart' button? (for example `/shop`, `/catalog`, `/products`)".
   - No response → find it yourself through Glob (`app/**/shop/**/page.tsx`, `app/**/catalog/**/page.tsx`, `app/**/products/**/page.tsx`) and/or Grep for `AddToCartButton`/`data-testid="add-to-cart"`. Report: "Found products in `{path}` — using it".
2. **Path to the cart page** — ask: "Where is the cart page? (for example `/cart`, `/basket`, or does the cart open as a drawer from any page?)".
   - No response → Glob (`app/**/cart/**/page.tsx`, `app/**/basket/**/page.tsx`). If found — use the path; if not found — fallback to checking via `data-testid="cart-root"` on the same catalog page (drawer version).
3. **Number of products on the page** — check yourself via the previously launched `/inspect-api products`: if `total >= 2` → tests for multiple products are included; if `total < 2` → the test "add 2 different products" is commented out. Report: "There are `{total}` products in the project — multiple addition test {enabled/disabled}".
4. **Fill in `.env.local`** (yourself, through Edit/Write — do not ask the user to copy):

```bash
# e2e cart
E2E_SHOP_PATH=/shop
E2E_CART_PATH=/cart
```

If the cart page is not present (drawer version) — leave `E2E_CART_PATH` empty, the test will switch to checking the drawer on `E2E_SHOP_PATH`.

### 7.3 Create `e2e/cart.spec.ts`

> ⚠️ Tests work with the real OneEntry project — they click on the actual "Add to Cart" button and check persistence through `localStorage` and `page.reload()`.

```typescript
import { test, expect } from '@playwright/test';

const SHOP_PATH = process.env.E2E_SHOP_PATH || '/shop';
const CART_PATH = process.env.E2E_CART_PATH || '';

test.describe('Cart (Redux + persist)', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to start with an empty cart
    await page.goto(SHOP_PATH);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByTestId('add-to-cart').first().waitFor({ timeout: 10_000 });
  });

  test('click "Add to Cart" adds product and changes button', async ({ page }) => {
    const addBtn = page.getByTestId('add-to-cart').first();
    const productId = await addBtn.getAttribute('data-product-id');
    await addBtn.click();

    // The button on the same card switches to "in cart" state
    await expect(
      page.locator(`[data-testid="remove-from-cart"][data-product-id="${productId}"]`),
    ).toBeVisible();
  });

  test('persistence: after reload, product remains in cart', async ({ page }) => {
    const addBtn = page.getByTestId('add-to-cart').first();
    const productId = await addBtn.getAttribute('data-product-id');
    await addBtn.click();

    await page.reload();
    await expect(
      page.locator(`[data-testid="remove-from-cart"][data-product-id="${productId}"]`),
    ).toBeVisible({ timeout: 10_000 });

    // localStorage contains saved productsData (redux-persist key = 'persist:cart-slice')
    const persisted = await page.evaluate(() => localStorage.getItem('persist:cart-slice'));
    expect(persisted).toBeTruthy();
    expect(persisted).toContain('productsData');
  });

  test('cart page/drawer shows added product', async ({ page }) => {
    const addBtn = page.getByTestId('add-to-cart').first();
    const productId = await addBtn.getAttribute('data-product-id');
    await addBtn.click();

    if (CART_PATH) {
      await page.goto(CART_PATH);
    }
    // On the same page (drawer) or on a separate /cart — check that the product is visible
    const item = page.locator(`[data-testid="cart-item"][data-product-id="${productId}"]`);
    await expect(item).toBeVisible({ timeout: 10_000 });
  });

  test('quantity change: + increases, − decreases', async ({ page }) => {
    const addBtn = page.getByTestId('add-to-cart').first();
    const productId = await addBtn.getAttribute('data-product-id');
    await addBtn.click();
    if (CART_PATH) await page.goto(CART_PATH);

    const item = page.locator(`[data-testid="cart-item"][data-product-id="${productId}"]`);
    await expect(item).toBeVisible();
    const qty = item.getByTestId('cart-item-qty');
    await expect(qty).toHaveText('1');

    await item.getByTestId('cart-qty-increase').click();
    await expect(qty).toHaveText('2');

    await item.getByTestId('cart-qty-decrease').click();
    await expect(qty).toHaveText('1');
  });

  test('removing product clears the cart', async ({ page }) => {
    const addBtn = page.getByTestId('add-to-cart').first();
    const productId = await addBtn.getAttribute('data-product-id');
    await addBtn.click();
    if (CART_PATH) await page.goto(CART_PATH);

    const item = page.locator(`[data-testid="cart-item"][data-product-id="${productId}"]`);
    await expect(item).toBeVisible();
    await item.getByTestId('cart-item-remove').click();

    await expect(item).toHaveCount(0);
    await expect(page.getByTestId('cart-empty')).toBeVisible();
  });

  // ⚠️ Uncomment if there are >= 2 products in the project
  // test('adding two different products — two items in the cart', async ({ page }) => {
  //   const buttons = page.getByTestId('add-to-cart');
  //   await buttons.nth(0).click();
  //   await buttons.nth(1).click();
  //   if (CART_PATH) await page.goto(CART_PATH);
  //   await expect(page.getByTestId('cart-item')).toHaveCount(2);
  // });
});
```

### 7.4 Report to the user about the decisions made

Before completing the task — explicitly inform:

```
✅ e2e/cart.spec.ts created
✅ data-testid added to AddToCartButton and CartDrawer/CartPage
✅ .env.local updated (E2E_SHOP_PATH, E2E_CART_PATH)

Decisions made automatically (if applicable):
- Catalog path: {SHOP_PATH} — {user specified / found via Glob search}
- Cart path: {CART_PATH / empty — drawer version} — {user specified / found / not found}
- Multiple addition test: {enabled — {total} products in the project / commented out — less than 2 products}

Run: npm run test:e2e -- cart.spec.ts
```

If the cart page is not found — tests work with the drawer version on the same catalog page (the check is done via `data-testid="cart-item"` regardless of the URL).
