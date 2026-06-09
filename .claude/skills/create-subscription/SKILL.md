---
name: create-subscription
description: Create paid subscriptions flow — Subscriptions API (subscribe, cancel, recover), Stripe payment redirect
---
# Create Paid Subscriptions (Subscriptions API)

Creates a flow for paid subscriptions through the `Subscriptions` module of OneEntry: displaying available plans, subscribing with a payment redirect, canceling, and recovering.

> ⚠️ **All methods require an authorized user.** Call after `reDefine(refreshToken)` on the client, then `getApi().Subscriptions.*` from the Client Component. Without authorization, the server will return `IError`.

> ⚠️ This is NOT subscriptions for product events (availability/price) — for them, use `/create-subscription-events` (module `Events`). Here — **paid** subscriptions (billing through Stripe).

---

## Step 0: Get Subscription Markers

Plan markers are configured in OneEntry Admin. You can get a list of available ones directly from the SDK:

```ts
const markers = await getApi().Subscriptions.getAllSubscriptions()   // string[] — markers of all plans
```

> ⚠️ `getAllSubscriptions()` returns **only markers** (`string[]`), without names/prices. Keep the titles and prices of the plans in your own dictionary (or create them as entities in the admin panel and fetch separately). If there are no plans in the admin panel — create an entry in [`MISMATCH-LOG.md`](../../rules/mismatch-log.md) (section C.8 / Subscriptions).

```ts
// app/config/subscriptions.ts — mapping dictionary (markers are real from the admin panel)
export const SUBSCRIPTION_PLANS: Record<string, { title: string; priceLabel: string }> = {
  pro_monthly: { title: 'Pro (month)', priceLabel: '$9 / month' },
  pro_yearly:  { title: 'Pro (year)',   priceLabel: '$90 / year' },
};
```

---

## Step 1: Subscription Management Hook

File: `app/hooks/useSubscriptions.ts`

```typescript
'use client';

import { useCallback, useEffect, useState } from 'react';
import { getApi, isError, reDefine, hasActiveSession } from '@/lib/oneentry';

export function useSubscriptions(locale: string) {
  const [available, setAvailable] = useState<string[]>([]);
  const [active, setActive] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ⚠️ Subscriptions require a user session — restoring the token before calls
  const ensureSession = useCallback(async () => {
    if (hasActiveSession()) return;
    const refreshToken = localStorage.getItem('refresh-token');
    if (refreshToken) await reDefine(refreshToken, locale);
  }, [locale]);

  const load = useCallback(async () => {
    setLoading(true);
    await ensureSession();
    const [all, mine] = await Promise.all([
      getApi().Subscriptions.getAllSubscriptions(),
      getApi().Subscriptions.getActiveSubscriptions(),
    ]);
    if (!isError(all)) setAvailable(all);
    if (!isError(mine)) setActive(mine);
    setLoading(false);
  }, [ensureSession]);

  useEffect(() => { load(); }, [load]);

  // Subscribe → redirect to payment
  const subscribe = useCallback(async (marker: string) => {
    setError(null);
    await ensureSession();
    const result = await getApi().Subscriptions.subscribe({ marker });
    if (isError(result)) { setError(result.message); return; }
    // result: { id, amount, paymentUrl, status }
    if (result.paymentUrl) {
      window.location.href = result.paymentUrl;   // Stripe Checkout
    } else {
      await load();   // free/instant plan — just refresh the list
    }
  }, [ensureSession, load]);

  // Cancel subscription
  const cancel = useCallback(async (marker: string) => {
    setError(null);
    await ensureSession();
    const result = await getApi().Subscriptions.cancelSubscription({ marker });
    if (isError(result)) { setError(result.message); return; }
    await load();
  }, [ensureSession, load]);

  // Recover through Stripe Billing Portal
  const recover = useCallback(async (marker: string) => {
    setError(null);
    await ensureSession();
    const result = await getApi().Subscriptions.recoverSubscriptions({ marker });
    if (isError(result)) { setError(result.message); return; }
    await load();
  }, [ensureSession, load]);

  const isActive = useCallback((marker: string) => active.includes(marker), [active]);

  return { available, active, isActive, loading, error, subscribe, cancel, recover, reload: load };
}
```

---

## Step 2: Plans Component

File: `app/components/SubscriptionPlans.tsx`

```tsx
'use client';

import { useSubscriptions } from '@/app/hooks/useSubscriptions';
import { SUBSCRIPTION_PLANS } from '@/app/config/subscriptions';

export function SubscriptionPlans({ locale }: { locale: string }) {
  const { available, isActive, loading, error, subscribe, cancel } = useSubscriptions(locale);

  if (loading) return <p>Loading plans…</p>;
  if (error) return <p role="alert">{error}</p>;
  if (!available.length) return <p>Subscription plans are currently unavailable</p>;

  return (
    <ul data-testid="subscription-plans">
      {available.map((marker) => {
        const plan = SUBSCRIPTION_PLANS[marker] ?? { title: marker, priceLabel: '' };
        const activeNow = isActive(marker);
        return (
          <li key={marker} data-testid="subscription-plan" data-marker={marker}>
            <span>{plan.title}</span>
            <span>{plan.priceLabel}</span>
            {activeNow ? (
              <button data-testid="subscription-cancel" onClick={() => cancel(marker)}>
                Cancel
              </button>
            ) : (
              <button data-testid="subscription-subscribe" onClick={() => subscribe(marker)}>
                Subscribe
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
```

---

## Step 3: Handling Payment Return

`subscribe()` redirects to `paymentUrl` (Stripe Checkout). Set up `successUrl` / `cancelUrl` in the payment account admin panel (as for orders). On the success page — reload active subscriptions:

```tsx
// app/[locale]/subscription/success/page.tsx — Client Component
'use client';
import { useEffect } from 'react';
import { useSubscriptions } from '@/app/hooks/useSubscriptions';

export default function SuccessPage() {
  const { reload } = useSubscriptions('en_US');
  useEffect(() => { reload(); }, [reload]);   // subscription status will update after the payment webhook
  return <p>Thank you! The subscription will be activated after payment confirmation.</p>;
}
```

> Activation occurs **after** payment confirmation via webhook on the OneEntry side — `getActiveSubscriptions()` may not return the new marker immediately. If needed — make several repeated reads with an interval (like polling `paymentUrl` for orders in [`rules/orders.md`](../../rules/orders.md)).

---

## Important Details

```md
✅ Subscription flow created (Subscriptions API). Key rules:

1. All methods require a user session — ensureSession() (reDefine) before each call
2. getAllSubscriptions/getActiveSubscriptions return string[] MARKERS, not objects — keep names/prices in your dictionary or admin entities
3. subscribe() → { paymentUrl } → redirect to Stripe (like createSession for orders)
4. An active subscription will appear in getActiveSubscriptions() after the payment webhook — not immediately
5. recoverSubscriptions() opens the Stripe Billing Portal for recovery
6. Do not confuse with product event subscriptions (/create-subscription-events)
```
