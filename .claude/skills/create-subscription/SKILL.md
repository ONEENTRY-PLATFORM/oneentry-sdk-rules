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
// SDK ≥ 1.0.157 — ISubscriptionEntity[], plan objects (previously was string[] markers)
const plans = await getApi().Subscriptions.getAllSubscriptions()
// [{ id, identifier, localizeInfos: { title }, productIds, periodInDays, paymentAccountId, isUsed }]
```

> ⚠️ **Breaking (v1.0.157):** `getAllSubscriptions()` returns `ISubscriptionEntity[]`, not `string[]`. The old code `markers.map(m => ...)` now receives objects — the marker is in `identifier`, the name in `localizeInfos.title`, and the duration in `periodInDays`. `getActiveSubscriptions()` **has not changed** — it still returns `string[]` markers, so activity is checked as `activeMarkers.includes(plan.identifier)`.

**There is no price in the response** — `ISubscriptionEntity` describes the plan (name, period, composition of `productIds`, payment account), but not the amount. Keep the prices in your own dictionary or create them as entities in the admin panel. The name and period can already be taken from the API — there is no need to duplicate them in the dictionary.

```ts
// app/config/subscriptions.ts — only what is not in the API (real markers from the admin panel)
export const SUBSCRIPTION_PRICES: Record<string, string> = {
  pro_monthly: '$9 / month',
  pro_yearly:  '$90 / year',
};
```

> If there are no plans in the admin panel — create an entry in `MISMATCH-LOG.md` (rule `.claude/rules/mismatch-log.md`, section C.8 / Subscriptions).

---

## Step 1: Subscription Management Hook

File: `app/hooks/useSubscriptions.ts`

```typescript
'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ISubscriptionEntity } from 'oneentry/dist/subscriptions/subscriptionsInterfaces';
import { getApi, isError, reDefine, hasActiveSession } from '@/lib/oneentry';

export function useSubscriptions(locale: string) {
  // v1.0.157: plans — ISubscriptionEntity objects; active — still markers
  const [available, setAvailable] = useState<ISubscriptionEntity[]>([]);
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
  // ⚠️ v1.0.157: the method actually returns IError on API refusal (previously always true).
  // Check strictly `!== true` — the error object is also truthy.
  const cancel = useCallback(async (marker: string) => {
    setError(null);
    await ensureSession();
    const result = await getApi().Subscriptions.cancelSubscription({ marker });
    if (result !== true) {
      setError(isError(result) ? result.message : 'Failed to cancel subscription');
      return;
    }
    await load();
  }, [ensureSession, load]);

  // Recover through Stripe Billing Portal
  const recover = useCallback(async (marker: string) => {
    setError(null);
    await ensureSession();
    const result = await getApi().Subscriptions.recoverSubscriptions({ marker });
    if (result !== true) {
      setError(isError(result) ? result.message : 'Failed to recover subscription');
      return;
    }
    await load();
  }, [ensureSession, load]);

  const isActive = useCallback((marker: string) => active.includes(marker), [active]);

  return { available, active, isActive, loading, error, subscribe, cancel, recover, reload: load };
}
```

---

## Step 2: Component with Plans

File: `app/components/SubscriptionPlans.tsx`

```tsx
'use client';

import { useSubscriptions } from '@/app/hooks/useSubscriptions';
import { SUBSCRIPTION_PRICES } from '@/app/config/subscriptions';

export function SubscriptionPlans({ locale }: { locale: string }) {
  const { available, isActive, loading, error, subscribe, cancel } = useSubscriptions(locale);

  if (loading) return <p>Loading plans…</p>;
  if (error) return <p role="alert">{error}</p>;
  if (!available.length) return <p>Subscription plans are currently unavailable</p>;

  return (
    <ul data-testid="subscription-plans">
      {available.map((plan) => {
        const marker = plan.identifier;
        const activeNow = isActive(marker);
        return (
          <li key={plan.id} data-testid="subscription-plan" data-marker={marker}>
            {/* name and period — from API, price — from your dictionary */}
            <span>{plan.localizeInfos?.title || marker}</span>
            <span>{plan.periodInDays} days</span>
            <span>{SUBSCRIPTION_PRICES[marker] ?? ''}</span>
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

> Activation occurs **after** payment confirmation via webhook on the OneEntry side — `getActiveSubscriptions()` may return a new marker not instantly. If needed — make several repeated reads with an interval (like polling `paymentUrl` for orders in `.claude/rules/orders.md`).

---

## Important Details

```md
✅ Subscription flow created (Subscriptions API). Key rules:

1. All methods require a user session — ensureSession() (reDefine) before each call
2. getAllSubscriptions() → ISubscriptionEntity[] (v1.0.157, previously string[]): marker = identifier, name = localizeInfos.title, duration = periodInDays. There is NO price in the response — keep it in your dictionary or admin entities
3. getActiveSubscriptions() still returns string[] MARKERS — check against plan.identifier
4. subscribe() → { paymentUrl } → redirect to Stripe (like createSession for orders)
5. An active subscription will appear in getActiveSubscriptions() after the payment webhook — not instantly
6. cancelSubscription/recoverSubscriptions from v1.0.157 indeed return IError on API refusal (previously silently responded true). Check the result strictly: `if (result !== true)`, not `if (result)`
7. recoverSubscriptions({ marker }) sends a request for recovery (via Stripe Billing Portal on the OneEntry side) — the redirect URL is NOT returned; after success, just reload getActiveSubscriptions()
8. Do not confuse with Events subscriptions for products (/create-subscription-events)
```
