---
name: create-favorites
description: Create favorites (wishlist) on the native server wishlist API (Users.getWishlist/addWishlistItem/...) — guest + user, cross-device sync, React Context
---
# Create Favorites (Server Wishlist API)

Creates a favorites list on the **native server API** OneEntry (`Users.getWishlist/setWishlist/addWishlistItem/removeWishlistItem`). The wishlist is stored on the server and synchronized between devices — for both authorized users and guests (by `guestId`). No Redux/redux-persist is used.

> ℹ️ **Server Wishlist vs Redux+localStorage.** The server version is cross-device and survives device changes. By default, we use the server API.

> ⚠️ Wishlist methods work for **user OR guest**. In the browser, the guest id is created automatically (`localStorage` key `oneentry_guest_id`) — no setup is needed. We manage favorites from the **Client Component** via `getApi()`. About guest mode — `.claude/rules/sdk-init.md`.

> If you have already done `/create-cart-manager` — the pattern is identical (Context + optimistic updates), the wishlist is simpler (only stores `productId`).

---

## Step 1: FavoritesContext — Provider

File: `app/context/FavoritesContext.tsx`

Wishlist from the server: `IWishlistResponse = { items: [{ productId, addedAt? }], total }`. Each mutating method returns the updated wishlist — we apply it as the truth.

```tsx
'use client';

import {
  createContext, useContext, useEffect, useState, useCallback,
} from 'react';
import { getApi, isError } from '@/lib/oneentry';

type FavoritesContextValue = {
  ids: number[];
  count: number;
  loading: boolean;
  isFavorite: (productId: number) => boolean;
  toggle: (productId: number) => Promise<void>;
  add: (productId: number) => Promise<void>;
  remove: (productId: number) => Promise<void>;
  clear: () => Promise<void>;
  reload: () => Promise<void>;
};

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  const apply = useCallback((res: unknown) => {
    const r = res as { items?: { productId: number }[] };
    if (!isError(res) && Array.isArray(r?.items)) {
      setIds(r.items.map((i) => i.productId));
    }
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await getApi().Users.getWishlist();
    apply(res);
    setLoading(false);
  }, [apply]);

  useEffect(() => { reload(); }, [reload]);

  const isFavorite = useCallback((productId: number) => ids.includes(productId), [ids]);

  const add = useCallback(async (productId: number) => {
    if (ids.includes(productId)) return;
    const prev = ids;
    setIds((cur) => [...cur, productId]);                       // optimistic
    const res = await getApi().Users.addWishlistItem({ productId });
    if (isError(res)) setIds(prev); else apply(res);           // rollback on error
  }, [ids, apply]);

  const remove = useCallback(async (productId: number) => {
    const prev = ids;
    setIds((cur) => cur.filter((id) => id !== productId));
    const res = await getApi().Users.removeWishlistItem(productId);
    if (isError(res)) setIds(prev); else apply(res);
  }, [ids, apply]);

  const toggle = useCallback(
    (productId: number) => (ids.includes(productId) ? remove(productId) : add(productId)),
    [ids, add, remove],
  );

  const clear = useCallback(async () => {
    const prev = ids;
    setIds([]);
    const res = await getApi().Users.setWishlist({ items: [] });
    if (isError(res)) setIds(prev); else apply(res);
  }, [ids, apply]);

  const value: FavoritesContextValue = {
    ids, count: ids.length, loading, isFavorite, toggle, add, remove, clear, reload,
  };
  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites must be used within <FavoritesProvider>');
  return ctx;
}
```

---

## Step 2: Wrap the application in the provider

```tsx
// app/layout.tsx
import { FavoritesProvider } from '@/app/context/FavoritesContext';
// (can be nested next to CartProvider)

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <FavoritesProvider>{children}</FavoritesProvider>
      </body>
    </html>
  );
}
```

---

## Step 3: Favorite Button

```tsx
'use client';
import { useFavorites } from '@/app/context/FavoritesContext';

export function FavoriteButton({ productId }: { productId: number }) {
  const { isFavorite, toggle } = useFavorites();
  const active = isFavorite(productId);
  return (
    <button
      data-testid="favorite-button"
      data-product-id={productId}
      aria-pressed={active}
      aria-label={active ? 'Remove from favorites' : 'Add to favorites'}
      onClick={() => toggle(productId)}
    >
      {active ? '♥' : '♡'}
    </button>
  );
}
```

---

## Step 4: Favorites Page (Loading Products)

The wishlist only stores `productId` — full data is loaded via `Products.getProductsByIds`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useFavorites } from '@/app/context/FavoritesContext';
import { getProductsByIds } from '@/app/actions/products'; // Server Action

export function FavoritesPage() {
  const { ids } = useFavorites();
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    if (!ids.length) { setProducts([]); return; }
    getProductsByIds(ids).then(setProducts);
  }, [ids]);

  if (!ids.length) return <p data-testid="favorites-empty">Favorites list is empty</p>;

  return (
    <div data-testid="favorites-root">
      <ul data-testid="favorites-list">
        {products.map((p) => (
          <li key={p.id} data-testid="favorite-item" data-product-id={p.id}>
            <span data-testid="favorite-item-title">{p.localizeInfos?.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

Server Action (if not yet created in `/create-cart-manager`):

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

---

## Step 5: Merging Guest Favorites Upon Login (Optional)

After authorization, guest and user have different wishlists. If necessary, merge immediately after `reDefine`:

```ts
async function mergeGuestWishlistIntoUser(guestIds: number[]) {
  if (!guestIds.length) return;
  const userWl = await getApi().Users.getWishlist();
  if (isError(userWl)) return;
  const merged = new Set<number>([...userWl.items.map((i) => i.productId), ...guestIds]);
  await getApi().Users.setWishlist({ items: [...merged].map((productId) => ({ productId })) });
}
```

> Read guest `productId` via `getWishlist()` BEFORE `reDefine`, then after `reDefine` — merge and call `reload()` on the context.

---

## Important Details

```md
✅ Favorites created on the server API. Key rules:

1. The wishlist on the server (Users.*) is cross-device, works for user and guest (guest id is auto in the browser)
2. Each mutating method returns the updated wishlist — apply as truth, rollback to prev on IError
3. Stores only productId — load full products via getProductsByIds
4. toggle is more convenient for the heart button; add/remove — for explicit actions
5. After login, guest and user have different wishlists; merge if necessary via setWishlist (Step 5)
6. On the server (SSR/Server Action), guest id is NOT auto — explicit setGuestId from cookie is needed (see `.claude/rules/sdk-init.md`)
```

---

## Step 6: Playwright E2E Tests

> Runs only if the user confirmed writing tests at the beginning of the session or requested writing a test later (see `feedback_playwright.md`).
> For Playwright setup — first `/setup-playwright`.

> ⚠️ Persistence is now **server-side**: after `reload()`, favorites are saved, as guest id in `localStorage` (`oneentry_guest_id`) is stable and the server stores the wishlist under it. The test reload checks this (not `persist:favorites-slice`).

### 6.1 `data-testid` already in components (Steps 3–4)

`favorite-button` (+`aria-pressed`), `favorites-root`, `favorites-list`, `favorite-item`, `favorites-empty`.

### 6.2 `.env.local` Parameters

```bash
# e2e favorites
E2E_SHOP_PATH=/shop
E2E_FAVORITES_PATH=/favorites
```

(Find paths as before: ask the user → fallback to Glob by `app/**/shop|catalog|favorites|wishlist/**/page.tsx`.)

### 6.3 `e2e/favorites.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

const SHOP_PATH = process.env.E2E_SHOP_PATH || '/shop';
const FAVORITES_PATH = process.env.E2E_FAVORITES_PATH || '';

test.describe('Favorites (server API, guest mode)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(SHOP_PATH);
    await page.evaluate(() => localStorage.clear()); // reset guest id → new wishlist
    await page.reload();
    await page.getByTestId('favorite-button').first().waitFor({ timeout: 10_000 });
  });

  test('click adds to favorites (aria-pressed)', async ({ page }) => {
    const btn = page.getByTestId('favorite-button').first();
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
  });

  test('re-click removes (toggle)', async ({ page }) => {
    const btn = page.getByTestId('favorite-button').first();
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'false', { timeout: 10_000 });
  });

  test('persistence: after reload favorites are saved (server-side)', async ({ page }) => {
    const btn = page.getByTestId('favorite-button').first();
    const productId = await btn.getAttribute('data-product-id');
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });

    await page.reload();
    const afterReload = page.locator(`[data-testid="favorite-button"][data-product-id="${productId}"]`);
    await expect(afterReload).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
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
});
```

### 6.4 Report to the user

```
✅ e2e/favorites.spec.ts created (server wishlist, guest mode)
✅ data-testid in FavoriteButton and FavoritesPage
✅ .env.local updated (E2E_SHOP_PATH, E2E_FAVORITES_PATH)

Decisions made automatically:
- Path with cards: {SHOP_PATH} — {specified / found via Glob+Grep}
- Path to favorites page: {FAVORITES_PATH / empty} — {specified / found / not found}

Run: npm run test:e2e -- favorites.spec.ts
```
