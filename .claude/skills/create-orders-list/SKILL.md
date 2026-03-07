<!-- META
type: skill
skillConfig: {"name":"create-orders-list"}
-->

# User orders list page

Creates a Client Component with an orders list: loading through all storages, cancellation, repeat, pagination.

---

## Step 1: Create client utilities for orders

> If `lib/orders.ts` already exists — read and extend it, don't duplicate.

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
 * storageMarker comes from storageIdToMarker[order.storageId].
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

### Key principles

- `'use client'` + `useParams()` — NOT a Server Component
- `loadAllOrders` — one instance traverses all storages
- **Token race condition:** retry on 401 with current `localStorage.getItem('refreshToken')`
- **storageIdToMarker** — mapping `storage.id → storage.identifier` for `cancelOrder`
- **previewImage** — can be an array or object → normalize: `Array.isArray(img) ? img[0] : img`
- **Sort** by `createdDate` descending (newest first)
- **Pagination** — client-side, via `visibleCount` + "Load more" button
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

// Status markers depend on the project — replace with real ones from admin panel
const STATUS_LABELS: Record<string, string> = {
  created: 'Created',
  inProgress: 'In Progress',
  completed: 'Completed',
  canceled: 'Canceled',
};

export default function OrdersPage() {
  const params = useParams();
  const locale = (params.locale as string) || 'en_US';

  // Guard against double execution in React StrictMode (dev)
  // Without it, two parallel refresh requests burn the one-time refresh token
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
      // Without check — after login SDK is already authorized, reDefine replaces instance
      // → first request returns 401 → removeItem('refresh-token') → logout
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

      // Sort: newest orders first
      const sorted = [...result.orders].sort(
        (a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime(),
      );
      setOrders(sorted);
    } catch {
      // Network error — don't logout
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
    // storageMarker comes from the mapping by order.storageId
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
        {/* Show AuthForm in modal or redirect */}
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
            {/* Order row — click to expand details */}
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
 * previewImage can be an array (image type) or an object (file type).
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

## Step 3: Key rules reminder

✅ Orders page created. Key rules:

```md
1. loadAllOrders/cancelOrder — call from Client Component, getApi() after reDefine()
2. storageIdToMarker: storage.id → identifier — needed for cancelOrder
3. Logout ONLY on 401/403
4. previewImage can be array or object — normalize via Array.isArray()
5. Sort orders by createdDate descending
6. Client-side pagination via visibleCount — don't reload the list
7. cancelOrder updates status locally (setOrders), without reload
8. Repeat order: addToCart(p.id) for each product from order.products
9. statusIdentifier — marker, title only via STATUS_LABELS map (replace with real project markers)
10. paymentAccountLocalizeInfos — locale-keyed: `localizeInfos?.[locale] || paymentAccountIdentifier`
```
