---
name: create-subscription-events
description: Create product event subscription
---
# Create a subscription for product events

Creates a subscription for changes in price and stock status of a product via the OneEntry Events API. The user receives a notification when the product is back in stock or the price changes.

> ⚠️ Requires an authorized user. The Events API works only after login — call `reDefine(refreshToken)` before using it, then use `getApi()` directly from the Client Component.

---

## Step 1: Learn the event markers

Event markers are configured in OneEntry Admin → Events. Standard markers from a real project:

- `status_out_of_stock` — product out of stock / back in stock
- `product_price` — price changed

Clarify the actual markers with the user or check in the admin panel.

---

## Step 2: Create a hook for subscription

File: `app/api/hooks/useEvents.ts`

```typescript
'use client';

import { getApi, isError } from '@/lib/oneentry';

// Event markers — clarify with the user!
const EVENT_MARKERS = {
  stockStatus: 'status_out_of_stock',
  priceChange: 'product_price',
};

/**
 * Subscribe to product events (price and stock changes).
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
 * Get all active subscriptions of the user.
 */
export async function getUserSubscriptions(offset = 0, limit = 30) {
  const result = await getApi().Events.getAllSubscriptions(offset, limit);
  if (isError(result)) return null;
  return result;
}
```

---

## Step 3: Subscription button on the product card

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

  if (!isAuth) return null; // show only to authorized users

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

## Step 4: Integration with the favorites button (optional)

In a real project, the subscription to events is triggered when adding to favorites:

```tsx
// When adding to favorites — subscribe to events
const handleAddToFavorites = async (product: IProductsEntity) => {
  dispatch(addFavorites(product.id));

  if (isAuth) {
    // Events work through getApi() since reDefine() is called after login
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

## Step 5: Getting subscriptions (optional)

If you need to show the list of subscriptions on the profile page — use `getApi()` from the Client Component:

```typescript
// Call from Client Component after reDefine()
import { getApi, isError } from '@/lib/oneentry';

async function getUserEventSubscriptions() {
  const result = await getApi().Events.getAllSubscriptions() as any;
  if (isError(result)) return { items: [] };
  return { items: result.items ?? [], total: result.total ?? 0 };
}
```

---

## Important details

```md
✅ Events subscriptions created. Key rules:

1. Events require authorization — call only after login
2. Call through getApi() from Client Component AFTER reDefine(refreshToken)
3. subscribeByMarker/unsubscribeByMarker return boolean (true = success)
4. Event markers ('status_out_of_stock', 'product_price') — clarify in OneEntry Admin
5. You can subscribe to multiple markers for one product — they are independent
6. getAllSubscriptions — for displaying the user's subscription list in the profile
7. In components with auth-init: useRef guard + hasActiveSession before reDefine are mandatory
   (without guard — React StrictMode burns a one-time refresh token with a double call)
```

### Auth-init pattern (if there is no AuthContext)

If the component initializes authorization itself (not through AuthContext):

```tsx
import { useRef, useEffect } from 'react';
import { reDefine, hasActiveSession } from '@/lib/oneentry';

const initRef = useRef(false);

useEffect(() => {
  if (initRef.current) return;
  initRef.current = true;

  const init = async () => {
    const refreshToken = localStorage.getItem('refresh-token');
    if (refreshToken && !hasActiveSession()) {
      await reDefine(refreshToken, 'en_US');
    }
    // now subscribeToProductEvents/unsubscribeFromProductEvents work
  };
  init();
}, []);
```
