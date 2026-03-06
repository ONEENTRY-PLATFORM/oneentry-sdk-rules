<!-- META
type: skill
skillConfig: {"name":"create-subscription-events"}
-->

# Create Product Event Subscriptions

Creates subscriptions for product price and availability changes via OneEntry Events API. Users receive notifications when a product comes back in stock or the price changes.

> ⚠️ Requires an authenticated user. Events API only works after login (via `reDefine()` in Client Components or via `makeUserApi()` in Server Actions).

---

## Step 1: Find out event markers

Event markers are configured in OneEntry Admin → Events. Standard markers from a real project:

- `status_out_of_stock` — product went out of / came back in stock
- `product_price` — price changed

Confirm the real markers with the user or check in the admin panel.

---

## Step 2: Create the subscription hook

File: `app/api/hooks/useEvents.ts`

```typescript
'use client';

import { getApi, isError } from '@/lib/oneentry';

// Event markers — confirm with the user!
const EVENT_MARKERS = {
  stockStatus: 'status_out_of_stock',
  priceChange: 'product_price',
};

/**
 * Subscribe to product events (price and availability changes).
 * Call ONLY from Client Component after logIn + reDefine().
 */
export async function subscribeToProductEvents(productId: number): Promise<{
  stockSubscribed: boolean;
  priceSubscribed: boolean;
}> {
  const [stockResult, priceResult] = await Promise.all([
    getApi().Events.subscribeByMarker(EVENT_MARKERS.stockStatus, productId),
    getApi().Events.subscribeByMarker(EVENT_MARKERS.priceChange, productId),
  ]);

  return {
    stockSubscribed: !isError(stockResult) && stockResult === true,
    priceSubscribed: !isError(priceResult) && priceResult === true,
  };
}

/**
 * Unsubscribe from product events.
 */
export async function unsubscribeFromProductEvents(productId: number): Promise<{
  stockUnsubscribed: boolean;
  priceUnsubscribed: boolean;
}> {
  const [stockResult, priceResult] = await Promise.all([
    getApi().Events.unsubscribeByMarker(EVENT_MARKERS.stockStatus, productId),
    getApi().Events.unsubscribeByMarker(EVENT_MARKERS.priceChange, productId),
  ]);

  return {
    stockUnsubscribed: !isError(stockResult) && stockResult === true,
    priceUnsubscribed: !isError(priceResult) && priceResult === true,
  };
}

/**
 * Get all active user subscriptions.
 */
export async function getUserSubscriptions(offset = 0, limit = 30) {
  const result = await getApi().Events.getAllSubscriptions(offset, limit);
  if (isError(result)) return null;
  return result;
}
```

---

## Step 3: Subscribe button on product card

```tsx
// components/product/SubscribeButton.tsx
'use client';

import { useCallback, useContext, useState } from 'react';
import { AuthContext } from '@/app/store/providers/AuthContext'; // your auth context
import {
  subscribeToProductEvents,
  unsubscribeFromProductEvents,
} from '@/app/api/hooks/useEvents';

export function SubscribeButton({ productId }: { productId: number }) {
  const { isAuth } = useContext(AuthContext);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleToggle = useCallback(async () => {
    if (!isAuth) {
      // redirect to login or show dialog
      return;
    }

    setLoading(true);
    try {
      if (subscribed) {
        await unsubscribeFromProductEvents(productId);
        setSubscribed(false);
      } else {
        const result = await subscribeToProductEvents(productId);
        if (result.stockSubscribed || result.priceSubscribed) {
          setSubscribed(true);
        }
      }
    } catch (e) {
      console.error('Events subscription error:', e);
    } finally {
      setLoading(false);
    }
  }, [isAuth, subscribed, productId]);

  if (!isAuth) return null; // show only to authenticated users

  return (
    <button onClick={handleToggle} disabled={loading}>
      {loading
        ? 'Loading...'
        : subscribed
          ? 'Unsubscribe from notifications'
          : 'Notify when available'}
    </button>
  );
}
```

---

## Step 4: Integration with favorites button (optional)

In a real project, event subscriptions are triggered when adding to favorites:

```tsx
// When adding to favorites — subscribe to events
const handleAddToFavorites = async (product: IProductsEntity) => {
  dispatch(addFavorites(product.id));

  if (isAuth) {
    // Events work via getApi() since reDefine() was called after login
    const result = await subscribeToProductEvents(product.id);
    if (result.stockSubscribed) {
      toast('We will notify you when it is back in stock');
    }
  }
};

// When removing from favorites — unsubscribe
const handleRemoveFromFavorites = async (productId: number) => {
  dispatch(removeFavorites(productId));

  if (isAuth) {
    await unsubscribeFromProductEvents(productId);
  }
};
```

---

## Step 5: Server Action for getting subscriptions (optional)

If you need to show a list of subscriptions on the profile page — use `makeUserApi`:

```typescript
// app/actions/events.ts
'use server';

import { makeUserApi, isError } from '@/lib/oneentry';

export async function getUserEventSubscriptions(refreshToken: string) {
  const { api, getNewToken } = makeUserApi(refreshToken);
  const result = await api.Events.getAllSubscriptions() as any;

  if (isError(result)) return { error: result.message, items: [] };

  return {
    items: result.items ?? [],
    total: result.total ?? 0,
    newToken: getNewToken(),
  };
}
```

---

## Important details

```md
✅ Event subscriptions created. Key rules:

1. Events require authentication — call only after login
2. In Client Component: works via getApi() AFTER reDefine(refreshToken)
   In Server Action: use makeUserApi(refreshToken)
3. subscribeByMarker/unsubscribeByMarker return boolean (true = success)
4. Event markers ('status_out_of_stock', 'product_price') — confirm in OneEntry Admin
5. Multiple markers can be subscribed for one product — they are independent
6. getAllSubscriptions — for displaying the user's subscription list in profile
```
