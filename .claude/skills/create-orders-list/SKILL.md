<!-- META
type: skill
skillConfig: {"name":"create-orders-list"}
-->

# User Orders List Page

Creates a Client Component with an orders list: loading through all storages, cancellation, repeat, pagination.

---

## Step 1: Create Server Actions

> If `app/actions/orders.ts` already exists — read and extend it, don't duplicate.

```typescript
// app/actions/orders.ts
'use server';

import { defineOneEntry } from 'oneentry';
import type { IOrdersEntity, IOrderByMarkerEntity } from 'oneentry/dist/orders/ordersInterfaces';

const PROJECT_URL = process.env.NEXT_PUBLIC_ONEENTRY_URL as string;
const APP_TOKEN = process.env.NEXT_PUBLIC_ONEENTRY_TOKEN as string;

/**
 * IMPORTANT: each makeUserApi call consumes refreshToken via /refresh.
 * Combine all calls in one instance.
 */
function makeUserApi(refreshToken: string) {
  let capturedToken = refreshToken;
  const api = defineOneEntry(PROJECT_URL, {
    token: APP_TOKEN,
    auth: {
      refreshToken,
      saveFunction: async (token: string) => { capturedToken = token; },
    },
    errors: { isShell: false },
  });
  return { api, getNewToken: () => capturedToken };
}

/**
 * Loads ALL user orders through all storages — ONE /refresh call.
 * storageIdToMarker is needed for cancelOrder (order.storageId → storageMarker).
 */
export async function loadAllOrders(refreshToken: string): Promise<
  | { orders: IOrderByMarkerEntity[]; storageIdToMarker: Record<number, string>; newToken: string }
  | { error: string; statusCode?: number }
> {
  const { api, getNewToken } = makeUserApi(refreshToken);
  try {
    const storages = (await api.Orders.getAllOrdersStorage()) as IOrdersEntity[];

    const allOrders: IOrderByMarkerEntity[] = [];
    const storageIdToMarker: Record<number, string> = {};

    for (const storage of storages) {
      if (!storage.identifier) continue;
      storageIdToMarker[storage.id] = storage.identifier;
      try {
        const result = await api.Orders.getAllOrdersByMarker(storage.identifier);
        if (result && 'items' in result) {
          allOrders.push(...(result as any).items);
        }
      } catch {
        // skip unavailable storage
      }
    }

    return { orders: allOrders, storageIdToMarker, newToken: getNewToken() };
  } catch (error: any) {
    return { error: error.message, statusCode: error.statusCode };
  }
}

/**
 * Cancel an order: updateOrderByMarkerAndId with statusMarker: 'canceled'.
 * storageMarker is obtained from storageIdToMarker[order.storageId].
 */
export async function cancelOrder(
  refreshToken: string,
  storageMarker: string,
  orderId: number,
  order: {
    formIdentifier: string;
    paymentAccountIdentifier: string;
    formData: { marker: string; type: string; value: any }[];
    products: { id: number; quantity: number }[];
  },
): Promise<{ newToken: string } | { error: string; statusCode?: number }> {
  const { api, getNewToken } = makeUserApi(refreshToken);
  try {
    await api.Orders.updateOrderByMarkerAndId(storageMarker, orderId, {
      formIdentifier: order.formIdentifier,
      paymentAccountIdentifier: order.paymentAccountIdentifier,
      formData: order.formData,
      products: order.products.map((p) => ({ productId: p.id, quantity: p.quantity })),
      statusMarker: 'canceled',
    } as any);
    return { newToken: getNewToken() };
  } catch (error: any) {
    return { error: error.message, statusCode: error.statusCode };
  }
}
```

---

## Step 2: Create the orders page component

### Key principles

- `'use client'` + `useParams()` — NOT a server component
- `loadAllOrders` — one instance traverses all storages
- **Token race condition:** retry on 401 with current `localStorage.getItem('refreshToken')`
- **storageIdToMarker** — mapping `storage.id → storage.identifier` for `cancelOrder`
- **previewImage** — may be array or object → normalize: `Array.isArray(img) ? img[0] : img`
- **Sort** by `createdDate` descending (newest first)
- **Pagination** — client-side, via `visibleCount` + "Load more" button
- **Repeat order** — `addToCart` for each product from `order.products`

### app/[locale]/(account)/orders/page.tsx

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { loadAllOrders, cancelOrder } from '@/app/actions/orders';
import type { IOrderByMarkerEntity, IOrderProducts } from 'oneentry/dist/orders/ordersInterfaces';

const PAGE_SIZE = 10;

export default function OrdersPage() {
  const params = useParams();
  const locale = (params.locale as string) || 'en_US';

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<IOrderByMarkerEntity[]>([]);
  const [storageIdToMarker, setStorageIdToMarker] = useState<Record<number, string>>({});
  const [openOrders, setOpenOrders] = useState<Set<number>>(new Set());
  const [cancelingIds, setCancelingIds] = useState<Set<number>>(new Set());
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      setIsLoggedIn(false);
      setLoading(false);
      return;
    }
    setIsLoggedIn(true);
    loadOrders(refreshToken);
  }, []);

  const loadOrders = async (token: string) => {
    try {
      let result = await loadAllOrders(token);

      // Race condition: another operation may have already updated the token
      if ('error' in result && result.statusCode === 401) {
        const currentToken = localStorage.getItem('refreshToken');
        if (currentToken && currentToken !== token) {
          result = await loadAllOrders(currentToken);
        }
      }

      if ('error' in result) {
        // Log out ONLY on confirmed auth error
        if (result.statusCode === 401 || result.statusCode === 403) {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          setIsLoggedIn(false);
          window.dispatchEvent(new Event('auth-change'));
        }
        return;
      }

      if (result.newToken) {
        localStorage.setItem('refreshToken', result.newToken);
      }

      setStorageIdToMarker(result.storageIdToMarker);

      // Sort: newest orders first
      const sorted = [...result.orders].sort(
        (a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime(),
      );
      setOrders(sorted);
    } catch {
      // Network error — don't log out
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
    const token = localStorage.getItem('refreshToken');
    if (!token) return;

    // storageMarker obtained from mapping by order.storageId
    const storageMarker = storageIdToMarker[order.storageId];
    if (!storageMarker) return;

    setCancelingIds((prev) => new Set(prev).add(order.id));
    try {
      const result = await cancelOrder(token, storageMarker, order.id, {
        formIdentifier: order.formIdentifier || '',
        paymentAccountIdentifier: order.paymentAccountIdentifier || '',
        formData: order.formData as { marker: string; type: string; value: any }[],
        products: order.products.map((p) => ({ id: p.id, quantity: p.quantity })),
      });

      if ('newToken' in result) {
        localStorage.setItem('refreshToken', result.newToken);
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
        {/* Show AuthForm in modal or redirect here */}
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
              <span>${Number(order.totalSum).toFixed(2)}</span>
              <span>{order.statusIdentifier}</span>
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
                      <div>x{product.quantity} — ${Number(product.price).toFixed(2)}</div>
                    </div>
                  );
                })}

                {/* Order form fields */}
                {order.formData.map((field) => (
                  <div key={field.marker}>
                    <b>{field.marker}:</b> {String(field.value ?? '')}
                  </div>
                ))}

                <div><b>Total:</b> ${Number(order.totalSum).toFixed(2)}</div>

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
 * previewImage may be an array (image type) or object (file type).
 * Normalize and get downloadLink.
 */
function getProductImage(product: IOrderProducts): string | null {
  const img = product.previewImage as any;
  if (!img) return null;
  const entry = Array.isArray(img) ? img[0] : img;
  return entry?.downloadLink || entry?.previewLink || null;
}
```

---

## Step 3: Remind of key rules

✅ Orders page created. Key rules:

```md
1. loadAllOrders — ONE makeUserApi for all storages (one /refresh)
2. storageIdToMarker: storage.id → identifier — needed for cancelOrder
3. Retry on 401 with current localStorage.getItem('refreshToken')
4. Log out ONLY on 401/403 after retry
5. previewImage may be array or object — normalize via Array.isArray()
6. Sort orders by createdDate descending
7. Client-side pagination via visibleCount — don't reload the list
8. cancelOrder updates status locally (setOrders), no reload
9. Repeat order: addToCart(p.id) for each product from order.products
```
