---
name: create-cart-manager
description: Create cart manager on the native server cart API (Users.getCart/addCartItem/...) — guest + user, cross-device sync, React Context with optimistic updates
---
# Create Cart Manager (Server Cart API)

Creates a cart manager on the **native server API** OneEntry (`Users.getCart/setCart/addCartItem/removeCartItem`). The cart is stored on the server and synchronized between devices — for authorized users and for guests (by `guestId`). It does not require Redux/redux-persist.

> ℹ️ **Server Cart vs Redux+localStorage.** The server API is cross-device, survives device changes, and is immediately ready for checkout. If you need a purely client-side offline cart without a network — that is a different pattern (Redux+persist), but by default, we use the server API.

> ⚠️ Cart methods work for **user OR guest**. In the browser, the guest id is created and stored automatically (`localStorage` key `oneentry_guest_id`) — no setup is needed. Therefore, we manage the cart from the **Client Component** through `getApi()` (like orders/profile in this project). Detailed information about guest mode — `03-sdk-init.md`.

---

## Step 1: Data Type and Structure

Cart from the server: `ICartResponse = { items: ICartItem[], total }`, where `ICartItem = { productId, qty, addedAt? }`. Only `productId` + `qty` are stored — full product data is loaded separately.

```typescript
// app/types/cart.ts
import type { ICartItem } from 'oneentry/dist/users/usersInterfaces';
export type { ICartItem };
```

---

## Step 2: CartContext — Provider with Optimistic Updates

File: `app/context/CartContext.tsx`

Each mutating server method (`addCartItem`/`removeCartItem`/`setCart`) **returns the updated cart** — we use it as the source of truth. `addCartItem` is an **upsert**: `{ productId, qty }` sets the quantity (not increment).

```tsx
'use client';

import {
  createContext, useContext, useEffect, useState, useCallback, useMemo,
} from 'react';
import { getApi, isError } from '@/lib/oneentry';
import type { ICartItem } from '@/app/types/cart';

type CartContextValue = {
  items: ICartItem[];
  count: number;                                   // total number of items
  loading: boolean;
  isInCart: (productId: number) => boolean;
  qtyOf: (productId: number) => number;
  add: (productId: number, qty?: number) => Promise<void>;
  setQty: (productId: number, qty: number) => Promise<void>;
  remove: (productId: number) => Promise<void>;
  clear: () => Promise<void>;
  reload: () => Promise<void>;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ICartItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Apply the server response (ICartResponse) as new state
  const apply = useCallback((res: unknown) => {
    const r = res as { items?: ICartItem[] };
    if (!isError(res) && Array.isArray(r?.items)) setItems(r.items);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await getApi().Users.getCart();
    apply(res);
    setLoading(false);
  }, [apply]);

  useEffect(() => { reload(); }, [reload]);

  const qtyOf = useCallback(
    (productId: number) => items.find((i) => i.productId === productId)?.qty ?? 0,
    [items],
  );
  const isInCart = useCallback((productId: number) => qtyOf(productId) > 0, [qtyOf]);

  // add: upsert qty (by default +1 to current)
  const add = useCallback(async (productId: number, qty = 1) => {
    const next = (qtyOf(productId) || 0) + qty;
    const prev = items;
    setItems((cur) => {                                  // optimistic
      const idx = cur.findIndex((i) => i.productId === productId);
      if (idx === -1) return [...cur, { productId, qty: next }];
      const copy = [...cur]; copy[idx] = { ...copy[idx], qty: next }; return copy;
    });
    const res = await getApi().Users.addCartItem({ productId, qty: next });
    if (isError(res)) setItems(prev); else apply(res);   // rollback on error
  }, [items, qtyOf, apply]);

  // setQty: <=0 → remove
  const setQty = useCallback(async (productId: number, qty: number) => {
    if (qty <= 0) {
      const prev = items;
      setItems((cur) => cur.filter((i) => i.productId !== productId));
      const res = await getApi().Users.removeCartItem(productId);
      if (isError(res)) setItems(prev); else apply(res);
      return;
    }
    const prev = items;
    setItems((cur) => cur.map((i) => (i.productId === productId ? { ...i, qty } : i)));
    const res = await getApi().Users.addCartItem({ productId, qty }); // upsert
    if (isError(res)) setItems(prev); else apply(res);
  }, [items, apply]);

  const remove = useCallback(async (productId: number) => {
    const prev = items;
    setItems((cur) => cur.filter((i) => i.productId !== productId));
    const res = await getApi().Users.removeCartItem(productId);
    if (isError(res)) setItems(prev); else apply(res);
  }, [items, apply]);

  const clear = useCallback(async () => {
    const prev = items;
    setItems([]);
    const res = await getApi().Users.setCart({ items: [] });          // full replacement
    if (isError(res)) setItems(prev); else apply(res);
  }, [items, apply]);

  const count = useMemo(() => items.reduce((s, i) => s + (i.qty ?? 0), 0), [items]);

  const value: CartContextValue = {
    items, count, loading, isInCart, qtyOf, add, setQty, remove, clear, reload,
  };
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within <CartProvider>');
  return ctx;
}
```

> The main rule: after each mutation, apply the server response as truth (`apply(res)`) and roll back to `prev` on `IError`. Optimistic updates — for instant UI, the server response — final synchronization.

---

## Step 3: Wrap the Application in the Provider

```tsx
// app/layout.tsx
import { CartProvider } from '@/app/context/CartContext';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <CartProvider>{children}</CartProvider>
      </body>
    </html>
  );
}
```

---

## Step 4: "Add to Cart" Button

```tsx
'use client';
import { useCart } from '@/app/context/CartContext';

export function AddToCartButton({ productId }: { productId: number }) {
  const { isInCart, qtyOf, add, remove } = useCart();
  return isInCart(productId) ? (
    <button data-testid="remove-from-cart" data-product-id={productId} onClick={() => remove(productId)}>
      In Cart ({qtyOf(productId)})
    </button>
  ) : (
    <button data-testid="add-to-cart" data-product-id={productId} onClick={() => add(productId, 1)}>
      Add to Cart
    </button>
  );
}
```

---

## Step 5: Cart Page (Loading Full Products)

The server only stores `productId` + `qty`. Full product data is loaded through `Products.getProductsByIds`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useCart } from '@/app/context/CartContext';
import { getProductsByIds } from '@/app/actions/products'; // Server Action (see below)

export function CartPage() {
  const { items, count, setQty, remove, clear } = useCart();
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    if (!items.length) { setProducts([]); return; }
    getProductsByIds(items.map((i) => i.productId)).then(setProducts);
  }, [items]);

  if (!items.length) return <p data-testid="cart-empty">Cart is empty</p>;

  return (
    <div data-testid="cart-root">
      <ul data-testid="cart-items">
        {items.map((item) => {
          const product = products.find((p) => p.id === item.productId);
          return (
            <li key={item.productId} data-testid="cart-item" data-product-id={item.productId}>
              <span data-testid="cart-item-title">{product?.localizeInfos?.title ?? `#${item.productId}`}</span>
              <button data-testid="cart-qty-decrease" onClick={() => setQty(item.productId, item.qty - 1)}>−</button>
              <span data-testid="cart-item-qty">{item.qty}</span>
              <button data-testid="cart-qty-increase" onClick={() => setQty(item.productId, item.qty + 1)}>+</button>
              <button data-testid="cart-item-remove" onClick={() => remove(item.productId)}>×</button>
            </li>
          );
        })}
      </ul>
      <div data-testid="cart-total">Items: {count}</div>
      <button onClick={clear}>Clear</button>
    </div>
  );
}
```

Server Action for loading products (public method — can be called from the server):

```typescript
// app/actions/products.ts
'use server';
import { getApi, isError } from '@/lib/oneentry';

export async function getProductsByIds(ids: number[]) {
  if (!ids.length) return [];
  const result = await getApi().Products.getProductsByIds(ids.join(','));
  return isError(result) ? [] : result;
}
```

> ⚠️ Do NOT take the total amount (money) from `cart.total` — this is the number of items. Calculate the price based on product attributes (`price`/`sale`) after loading, or through `Orders.previewOrder` at checkout (see [`rules/orders.md`](../../rules/orders.md)).

> 🔒 **Price Fixation at Checkout (SDK ≥ 1.0.154).** To ensure the price in the order matches the one shown in the cart, load products with the parameter `signPrice`: `Products.getProductsByIds(ids, langCode, { signPrice: '<order storage marker, e.g. "orders">' })` — each product will return with a `signedPrice` field (JWT with fixed price), which is passed to the order item: `products: [{ productId, quantity, signedPrice }]` (`IOrderProductData.signedPrice`). Note: `userQuery` is the third argument, so you need to explicitly pass the second one (`langCode`). The fixation and passing of `signedPrice` in the order — in the skill `/create-checkout`.

---

## Step 6: Merging Guest Cart upon Login (Optional)

After authorization, the SDK switches from `guestId` to user token — these are **different carts**. If you need to save the guest cart, merge it into the user cart immediately after `reDefine`:

```ts
// call ONCE immediately after successful login, before reloading the user cart
async function mergeGuestCartIntoUser(guestItems: { productId: number; qty: number }[]) {
  if (!guestItems.length) return;
  const userCart = await getApi().Users.getCart();
  if (isError(userCart)) return;
  // merge: sum qty by productId
  const map = new Map<number, number>();
  for (const i of [...userCart.items, ...guestItems]) {
    map.set(i.productId, (map.get(i.productId) ?? 0) + i.qty);
  }
  await getApi().Users.setCart({
    items: [...map.entries()].map(([productId, qty]) => ({ productId, qty })),
  });
}
```

> Read the guest cart through `getCart()` BEFORE `reDefine` (while the guest id is active), then after `reDefine` — merge and call `reload()` on the context.

---

## Important Details

```md
✅ A cart manager has been created on the server API. Key rules:

1. The cart on the server (Users.*) — cross-device, works for user and guest (guest id auto in the browser)
2. addCartItem({ productId, qty }) — UPSERT (sets qty), not increment
3. Each mutating method returns the updated cart — apply it as truth, rollback to prev on IError
4. The server only stores productId+qty — load full products through getProductsByIds
5. cart.total — number of items, NOT the amount of money; calculate the price based on attributes / previewOrder
6. After login, guest and user — different carts; if necessary, merge through setCart (Step 6)
7. On the server (SSR/Server Action), guest id is NOT auto — explicit setGuestId from cookie is needed (see 03-sdk-init.md)
```

---

## Step 7: Playwright E2E Tests

> Runs only if the user confirmed writing tests at the beginning of the session or requested writing a test later (see `feedback_playwright.md`).
> To set up Playwright — first `/setup-playwright`.

> ⚠️ Persistence is now **server-side**: after `reload()`, the cart is saved, as the guest id in `localStorage` (`oneentry_guest_id`) is stable and the server stores the cart under it. The test reload checks exactly this (not `persist:cart-slice`).

### 7.1 `data-testid` already in components (Steps 4–5)

`add-to-cart`, `remove-from-cart`, `cart-root`, `cart-items`, `cart-item`, `cart-item-qty`, `cart-qty-increase/decrease`, `cart-item-remove`, `cart-empty`, `cart-total`.

### 7.2 `.env.local` Parameters

```bash
# e2e cart
E2E_SHOP_PATH=/shop
E2E_CART_PATH=/cart
```

(Find paths as before: ask the user → fallback to Glob by `app/**/shop|catalog|cart/**/page.tsx`.)

### 7.3 `e2e/cart.spec.ts`

> ⚠️ Tests work with the real OneEntry project: the guest cart is created on the server under the auto guest id. In `beforeEach`, we clear `localStorage` (reset guest id → new empty cart).

```typescript
import { test, expect } from '@playwright/test';

const SHOP_PATH = process.env.E2E_SHOP_PATH || '/shop';
const CART_PATH = process.env.E2E_CART_PATH || '';

test.describe('Cart (server API, guest mode)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(SHOP_PATH);
    await page.evaluate(() => localStorage.clear()); // reset guest id → new cart
    await page.reload();
    await page.getByTestId('add-to-cart').first().waitFor({ timeout: 10_000 });
  });

  test('click "Add to Cart" adds product and changes button', async ({ page }) => {
    const addBtn = page.getByTestId('add-to-cart').first();
    const productId = await addBtn.getAttribute('data-product-id');
    await addBtn.click();
    await expect(
      page.locator(`[data-testid="remove-from-cart"][data-product-id="${productId}"]`),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('persistence: after reload, the cart is saved (server-side)', async ({ page }) => {
    const addBtn = page.getByTestId('add-to-cart').first();
    const productId = await addBtn.getAttribute('data-product-id');
    await addBtn.click();
    await expect(
      page.locator(`[data-testid="remove-from-cart"][data-product-id="${productId}"]`),
    ).toBeVisible({ timeout: 10_000 });

    await page.reload();
    // the cart was restored from the server under the same guest id
    await expect(
      page.locator(`[data-testid="remove-from-cart"][data-product-id="${productId}"]`),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('changing quantity: + increases, − decreases', async ({ page }) => {
    const addBtn = page.getByTestId('add-to-cart').first();
    const productId = await addBtn.getAttribute('data-product-id');
    await addBtn.click();
    if (CART_PATH) await page.goto(CART_PATH);

    const item = page.locator(`[data-testid="cart-item"][data-product-id="${productId}"]`);
    await expect(item).toBeVisible({ timeout: 10_000 });
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
    await expect(item).toBeVisible({ timeout: 10_000 });
    await item.getByTestId('cart-item-remove').click();
    await expect(item).toHaveCount(0);
    await expect(page.getByTestId('cart-empty')).toBeVisible();
  });
});
```

### 7.4 Report to the User

```
✅ e2e/cart.spec.ts created (server cart, guest mode)
✅ data-testid in AddToCartButton and CartPage
✅ .env.local updated (E2E_SHOP_PATH, E2E_CART_PATH)

Decisions made automatically (if applicable):
- Catalog path: {SHOP_PATH} — {specified / found via Glob}
- Cart path: {CART_PATH / empty — drawer} — {specified / found / not found}

Run: npm run test:e2e -- cart.spec.ts
```
