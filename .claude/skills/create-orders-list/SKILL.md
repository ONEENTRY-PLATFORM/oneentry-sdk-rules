---
name: create-orders-list
description: Create user orders list page
---
# User Orders List Page

Creates a Client Component with a list of orders: loading through all storages, cancellation, repeat, pagination.

---

## Step 1: Create client utilities for orders

> If `lib/orders.ts` already exists — read and supplement it, do not duplicate.

```typescript
// lib/orders.ts
import { getApi } from '@/lib/oneentry';
import type { IOrdersEntity, IOrderByMarkerEntity } from 'oneentry/dist/orders/ordersInterfaces';

/**
 * Loads ALL user orders through all storages.
 * Call from Client Component after reDefine().
 * storageIdToMarker is needed for cancelOrder (order.storageId → storageMarker).
 */
export async function loadAllOrders(): Promise<
  | { orders: IOrderByMarkerEntity[]; storageIdToMarker: Record<number, string> }
  | { error: string; statusCode?: number }
> {
  try {
    const storages = (await getApi().Orders.getAllOrdersStorage()) as IOrdersEntity[];

    const allOrders: IOrderByMarkerEntity[] = [];
    const storageIdToMarker: Record<number, string> = {};

    for (const storage of storages) {
      if (!storage.identifier) continue;
      storageIdToMarker[storage.id] = storage.identifier;
      try {
        const result = await getApi().Orders.getAllOrdersByMarker(storage.identifier);
        if (result && 'items' in result) {
          allOrders.push(...(result as any).items);
        }
      } catch {
        // skip unavailable storage
      }
    }

    return { orders: allOrders, storageIdToMarker };
  } catch (error: any) {
    return { error: error.message, statusCode: error.statusCode };
  }
}

/**
 * Cancels an order: updateOrderByMarkerAndId with statusMarker: 'canceled'.
 * storageMarker is obtained from storageIdToMarker[order.storageId].
 */
export async function cancelOrder(
  storageMarker: string,
  orderId: number,
  order: {
    formIdentifier: string;
    paymentAccountIdentifier: string;
    formData: { marker: string; type: string; value: any }[];
    products: { id: number; quantity: number }[];
  },
): Promise<void | { error: string; statusCode?: number }> {
  try {
    await getApi().Orders.updateOrderByMarkerAndId(storageMarker, orderId, {
      formIdentifier: order.formIdentifier,
      paymentAccountIdentifier: order.paymentAccountIdentifier,
      formData: order.formData,
      products: order.products.map((p) => ({ productId: p.id, quantity: p.quantity })),
      statusMarker: 'canceled',
    } as any);
  } catch (error: any) {
    return { error: error.message, statusCode: error.statusCode };
  }
}
```

---

## Step 2: Create the orders page component

### Key Principles

- `'use client'` + `useParams()` — NOT a server component
- `loadAllOrders` — one instance traverses all storages
- **Token race condition:** retry on 401 with the current `localStorage.getItem('refreshToken')`
- **storageIdToMarker** — mapping `storage.id → storage.identifier` for `cancelOrder`
- **previewImage** — can be an array or an object → normalize: `Array.isArray(img) ? img[0] : img`
- **Sorting** by `createdDate` in descending order (newest first)
- **Pagination** — client-side, through `visibleCount` + "Load more" button
- **Repeat order** — `addToCart` for each product from `order.products`

### app/[locale]/(account)/orders/page.tsx

```tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { reDefine, hasActiveSession } from '@/lib/oneentry';
import { loadAllOrders, cancelOrder } from '@/lib/orders';
import type { IOrderByMarkerEntity, IOrderProducts } from 'oneentry/dist/orders/ordersInterfaces';

const PAGE_SIZE = 10;

// Status markers depend on the project — replace with real ones from the admin panel
const STATUS_LABELS: Record<string, string> = {
  created: 'Created',
  inProgress: 'In Progress',
  completed: 'Completed',
  canceled: 'Canceled',
};

export default function OrdersPage() {
  const params = useParams();
  const locale = (params.locale as string) || 'en_US';

  // Protection against double execution in React StrictMode (dev)
  // Without it, two parallel refresh requests burn a one-time refresh token
  const initRef = useRef(false);

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<IOrderByMarkerEntity[]>([]);
  const [storageIdToMarker, setStorageIdToMarker] = useState<Record<number, string>>({});
  const [openOrders, setOpenOrders] = useState<Set<number>>(new Set());
  const [cancelingIds, setCancelingIds] = useState<Set<number>>(new Set());
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const init = async () => {
      const refreshToken = localStorage.getItem('refresh-token');
      if (!refreshToken) {
        setIsLoggedIn(false);
        setLoading(false);
        return;
      }
      // ⚠️ Check hasActiveSession before reDefine
      // Without checking — after login, the SDK is already authorized, reDefine will replace the instance
      // → the first request will return 401 → removeItem('refresh-token') → logout
      if (!hasActiveSession()) {
        await reDefine(refreshToken, 'en_US');
      }
      setIsLoggedIn(true);
      loadOrders();
    };
    init();
  }, []);

  const loadOrders = async () => {
    try {
      const result = await loadAllOrders();

      if ('error' in result) {
        // Logout ONLY on confirmed auth error
        if (result.statusCode === 401 || result.statusCode === 403) {
          localStorage.removeItem('refresh-token');
          setIsLoggedIn(false);
          window.dispatchEvent(new Event('auth-change'));
        }
        return;
      }

      setStorageIdToMarker(result.storageIdToMarker);

      // Sort: new orders first
      const sorted = [...result.orders].sort(
        (a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime(),
      );
      setOrders(sorted);
    } catch {
      // Network error — do not logout
    } finally {
      setLoading(false);
    }
  };

  const toggleOrder = (id: number) => {
    setOpenOrders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCancel = async (order: IOrderByMarkerEntity) => {
    // storageMarker is obtained from mapping by order.storageId
    const storageMarker = storageIdToMarker[order.storageId];
    if (!storageMarker) return;

    setCancelingIds((prev) => new Set(prev).add(order.id));
    try {
      const result = await cancelOrder(storageMarker, order.id, {
        formIdentifier: order.formIdentifier || '',
        paymentAccountIdentifier: order.paymentAccountIdentifier || '',
        formData: order.formData as { marker: string; type: string; value: any }[],
        products: order.products.map((p) => ({ id: p.id, quantity: p.quantity })),
      });

      if (!result || !('error' in result)) {
        // Update status locally without reloading
        setOrders((prev) =>
          prev.map((o) =>
            o.id === order.id ? { ...o, statusIdentifier: 'canceled' } : o,
          ),
        );
      }
    } finally {
      setCancelingIds((prev) => {
        const next = new Set(prev);
        next.delete(order.id);
        return next;
      });
    }
  };

  // Add order products to cart (pass addToCart from CartContext)
  const handleRepeat = (order: IOrderByMarkerEntity) => {
    order.products.forEach((p) => {
      // addToCart(p.id) — connect CartContext if needed
      console.log('repeat product', p.id);
    });
  };

  if (loading) return <div>Loading...</div>;

  if (!isLoggedIn) {
    return (
      <div>
        <p>Please log in to view your orders</p>
        {/* Show AuthForm in a modal or redirect here */}
      </div>
    );
  }

  const visibleOrders = orders.slice(0, visibleCount);
  const hasMore = visibleCount < orders.length;

  return (
    <div>
      {orders.length === 0 && <p>No orders yet</p>}

      {visibleOrders.map((order) => {
        const isOpen = openOrders.has(order.id);
        const isCanceled = order.statusIdentifier === 'canceled';
        const isCreated = order.statusIdentifier === 'created';

        return (
          <div key={`${order.storageId}-${order.id}`}>
            {/* Order row — click expands details */}
            <button onClick={() => toggleOrder(order.id)}>
              <span>{new Date(order.createdDate).toLocaleDateString()}</span>
              <span>{order.currency}{Number(order.totalSum).toFixed(2)}</span>
              <span>{STATUS_LABELS[order.statusIdentifier ?? ''] ?? order.statusIdentifier}</span>
            </button>

            {/* Expanded details */}
            {isOpen && (
              <div>
                {/* Products */}
                {order.products.map((product) => {
                  const imageUrl = getProductImage(product);
                  return (
                    <div key={product.id}>
                      {imageUrl && <img src={imageUrl} alt={product.title} />}
                      <div>{product.title}</div>
                      <div>x{product.quantity} — {order.currency}{Number(product.price).toFixed(2)}</div>
                    </div>
                  );
                })}

                {/* Order form fields */}
                {order.formData.map((field) => (
                  <div key={field.marker}>
                    <b>{field.marker}:</b> {String(field.value ?? '')}
                  </div>
                ))}

                <div><b>Total:</b> {order.currency}{Number(order.totalSum).toFixed(2)}</div>

                {/* Action buttons */}
                {isCanceled && (
                  <button onClick={() => handleRepeat(order)}>Repeat order</button>
                )}
                {isCreated && (
                  <>
                    <button
                      disabled={cancelingIds.has(order.id)}
                      onClick={() => handleCancel(order)}
                    >
                      {cancelingIds.has(order.id) ? 'Canceling...' : 'Cancel order'}
                    </button>
                    {order.paymentUrl && (
                      <a href={order.paymentUrl} target="_blank" rel="noopener noreferrer">
                        Go to pay
                      </a>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Client-side pagination */}
      {hasMore && (
        <button onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
          Load more
        </button>
      )}
    </div>
  );
}

/**
 * previewImage can be an array (type image) or an object (type file).
 * Normalize and take downloadLink.
 */
function getProductImage(product: IOrderProducts): string | null {
  const img = product.previewImage as any;
  if (!img) return null;
  const entry = Array.isArray(img) ? img[0] : img;
  return entry?.downloadLink || entry?.previewLink || null;
}
```

---

## Step 3: Recall key rules

✅ Orders page created. Key rules:

```md
1. loadAllOrders/cancelOrder — call from Client Component, getApi() after reDefine()
2. storageIdToMarker: storage.id → identifier — needed for cancelOrder
3. Logout ONLY on 401/403
4. previewImage can be an array or an object — normalize using Array.isArray()
5. Sort orders by createdDate in descending order
6. Client-side pagination through visibleCount — do not reload the list
7. cancelOrder updates status locally (setOrders), without reload
8. Repeat order: addToCart(p.id) for each product from order.products
9. statusIdentifier — marker, title only through STATUS_LABELS map (replace with real project markers)
10. paymentAccountLocalizeInfos — locale-keyed: `localizeInfos?.[locale] || paymentAccountIdentifier`
```

---

## Step 4: Playwright E2E tests

> Runs only if the user confirmed writing tests at the beginning of the session or requested writing a test later (see `feedback_playwright.md`).
> For Playwright setup — first `/setup-playwright`.

### 4.1 Add `data-testid` to the component

For selector stability — add `data-testid` when generating `app/[locale]/(account)/orders/page.tsx`:

```tsx
if (loading) return <div data-testid="orders-loading">Loading...</div>;

if (!isLoggedIn) {
  return (
    <div data-testid="orders-login-required">
      <p>Please log in to view your orders</p>
    </div>
  );
}

return (
  <div data-testid="orders-page">
    {orders.length === 0 && <p data-testid="orders-empty">No orders yet</p>}

    {visibleOrders.map((order) => (
      <div
        key={`${order.storageId}-${order.id}`}
        data-testid="order-item"
        data-order-id={order.id}
      >
        <button data-testid="order-toggle" onClick={() => toggleOrder(order.id)}>
          <span data-testid="order-date">{new Date(order.createdDate).toLocaleDateString()}</span>
          <span data-testid="order-total">{order.currency}{Number(order.totalSum).toFixed(2)}</span>
          <span data-testid="order-status">{STATUS_LABELS[order.statusIdentifier ?? ''] ?? order.statusIdentifier}</span>
        </button>

        {isOpen && (
          <div data-testid="order-details">
            {/* ... */}
            {isCreated && (
              <button
                data-testid="order-cancel-btn"
                disabled={cancelingIds.has(order.id)}
                onClick={() => handleCancel(order)}
              >
                {cancelingIds.has(order.id) ? 'Canceling...' : 'Cancel order'}
              </button>
            )}
            {isCanceled && (
              <button data-testid="order-repeat-btn" onClick={() => handleRepeat(order)}>Repeat order</button>
            )}
          </div>
        )}
      </div>
    ))}

    {hasMore && (
      <button data-testid="orders-load-more" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
        Load more
      </button>
    )}
  </div>
);
```

### 4.2 Gather test parameters and fill in `.env.local`

**Algorithm (perform step by step, do not ask in one list):**

1. **Path to the orders page** — ask: "What is the path to the orders page? (e.g., `/orders`, `/en_US/account/orders`)". 
   - Silent → find it yourself via Glob (`app/**/orders/**/page.tsx`, `app/**/account/**/orders/**/page.tsx`). Inform: "Found the orders page at `{path}` — using it".
2. **Path to the login page** — needed for redirect test to check that an unauthorized user sees the login block.
   - Ask: "Where is the login form located? (`/login`, `/auth`, etc.)". Silent → Glob by `app/**/login/**` / `app/**/auth/**` or Grep by `<AuthForm`. Inform what you found.
3. **Test credentials** (authorized user who has at least one order in OneEntry):
   - Ask: "Please provide the email and password of a test user who has at least one order. I will skip — tests for the order list/cancellation/pagination will be disabled through `test.skip`".
   - If the user provides values → **add** `E2E_TEST_EMAIL` and `E2E_TEST_PASSWORD` to `.env.local` (via Edit/Write), check that `.env.local` is in `.gitignore`.
   - If silent/refused → leave the variables empty with a comment. Inform: "Credentials not set — tests requiring authorization will be skipped through `test.skip`. Reason: without a test user with orders, the list/cancellation cannot be checked".
4. **Status marker 'created' / 'canceled'** — check yourself via `/inspect-api` (orders section or order statuses in the admin panel): real identifiers may differ. If they differ — update `STATUS_LABELS` in the generated code and constants in the spec file. Inform: "Status markers: created=`{value}`, canceled=`{value}` — substituted in tests".

**Example of filling in `.env.local` (do it yourself):**

```bash
# e2e orders
E2E_ORDERS_PATH=/orders
E2E_AUTH_PATH=/login
# user with existing orders
E2E_TEST_EMAIL=user@example.com
E2E_TEST_PASSWORD=user-password
```

### 4.3 Create `e2e/orders.spec.ts`

> ⚠️ Tests work with the real OneEntry project. A test user with existing orders is required — otherwise, pagination and cancellation cannot be checked.

```typescript
import { test, expect } from '@playwright/test';

const ORDERS_PATH = process.env.E2E_ORDERS_PATH || '/orders';
const AUTH_PATH = process.env.E2E_AUTH_PATH || '/login';
const TEST_EMAIL = process.env.E2E_TEST_EMAIL || '';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || '';

async function signIn(page: import('@playwright/test').Page) {
  await page.goto(AUTH_PATH);
  const fields = page.locator('[data-testid^="auth-field-"]');
  await fields.nth(0).fill(TEST_EMAIL);
  await fields.nth(1).fill(TEST_PASSWORD);
  await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('auth-success')).toBeVisible({ timeout: 10_000 });
}

test.describe('Orders Page', () => {
  test('without authorization shows "Please log in" block', async ({ page, context }) => {
    // Ensure no refresh-token
    await context.clearCookies();
    await page.addInitScript(() => window.localStorage.removeItem('refresh-token'));

    await page.goto(ORDERS_PATH);
    await expect(page.getByTestId('orders-login-required')).toBeVisible();
  });

  test.describe('Authorized user', () => {
    test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'E2E_TEST_EMAIL/PASSWORD not set');

    test.beforeEach(async ({ page }) => {
      await signIn(page);
      await page.goto(ORDERS_PATH);
      await expect(page.getByTestId('orders-page')).toBeVisible({ timeout: 10_000 });
    });

    test('renders list of orders (or empty-state)', async ({ page }) => {
      const items = page.getByTestId('order-item');
      const empty = page.getByTestId('orders-empty');
      const hasItems = await items.first().isVisible().catch(() => false);
      const hasEmpty = await empty.isVisible().catch(() => false);
      expect(hasItems || hasEmpty).toBe(true);
    });

    test('clicking on an order expands details', async ({ page }) => {
      const items = page.getByTestId('order-item');
      test.skip((await items.count()) === 0, 'User has no orders — nothing to expand');

      await items.first().getByTestId('order-toggle').click();
      await expect(items.first().getByTestId('order-details')).toBeVisible();
    });

    test('the "Load more" button loads the next page', async ({ page }) => {
      const loadMore = page.getByTestId('orders-load-more');
      test.skip(!(await loadMore.isVisible().catch(() => false)), 'Fewer orders than one page — Load more not shown');

      const before = await page.getByTestId('order-item').count();
      await loadMore.click();
      await expect.poll(async () => page.getByTestId('order-item').count(), { timeout: 5_000 })
        .toBeGreaterThan(before);
    });

    test('cancelling an order changes status to "canceled" without reload', async ({ page }) => {
      // Find the first order with status created (there is a cancel button)
      const cancelBtn = page.getByTestId('order-cancel-btn').first();
      test.skip(!(await cancelBtn.isVisible().catch(async () => {
        // need to expand details first
        const first = page.getByTestId('order-item').first();
        if (await first.isVisible()) await first.getByTestId('order-toggle').click();
        return cancelBtn.isVisible().catch(() => false);
      })), 'No orders with status "created" — nothing to cancel');

      const orderItem = cancelBtn.locator('xpath=ancestor::*[@data-testid="order-item"]').first();
      await cancelBtn.click();

      // The button goes into a disabled state — we expect that after the API response it will disappear / be replaced
      await expect.poll(async () => orderItem.getByTestId('order-status').innerText(), { timeout: 10_000 })
        .toMatch(/cancel/i);
    });
  });
});
```

### 4.4 Report to the user about the decisions made

Before completing the task — explicitly inform:

```
✅ e2e/orders.spec.ts created
✅ data-testid added to OrdersPage
✅ .env.local updated (E2E_ORDERS_PATH, E2E_AUTH_PATH, E2E_TEST_EMAIL, E2E_TEST_PASSWORD)

Decisions made automatically:
- Path to the orders page: {ORDERS_PATH} — {provided by user / found via Glob}
- Path to the login page: {AUTH_PATH} — {provided / found via Glob}
- Test credentials: {provided / left empty — tests for the authorized block will be test.skip}
- Status markers: created=`{value}`, canceled=`{value}` — from /inspect-api

Run: npm run test:e2e -- orders.spec.ts
```

If credentials are not set — tests for the authorized part are skipped, leaving only the test for redirecting unauthorized users.
