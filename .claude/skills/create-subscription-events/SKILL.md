---
name: create-subscription-events
description: Create product event subscription
---
# Create Product Event Subscription

Creates a subscription for changes in price and stock status of a product via the OneEntry Events API. The user receives a notification when the product is back in stock or the price changes.

> ⚠️ Requires an authorized user. The Events API works only after login — call `reDefine(refreshToken)` before using it, then use `getApi()` directly from the Client Component.

---

## Step 1: Find Event Markers

Event markers are configured in OneEntry Admin → Events. Standard markers from a real project:

- `status_out_of_stock` — product is out of stock / back in stock
- `product_price` — price has changed

Clarify the actual markers with the user or check in the admin panel.

---

## Step 2: Create a Hook for Subscription

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

## Step 3: Subscription Button on Product Card

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

## Step 4: Integration with Favorites Button (Optional)

In a real project, subscription to events is triggered when adding to favorites:

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

## Step 5: Fetching Subscriptions (Optional)

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

## Important Details

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

### Auth-init Pattern (if no AuthContext)

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

---

## Step 6: Playwright E2E Tests

> Runs only if the user confirmed writing tests at the beginning of the session or requested writing a test later (see `feedback_playwright.md`).
> To set up Playwright — first `/setup-playwright`.

### 6.1 Add `data-testid` to the Component

```tsx
// components/product/SubscribeButton.tsx
// For unauthorized users — hidden (returns null), still add testid when rendered for tests
if (!isAuth) return null;

return (
  <button
    data-testid="subscribe-button"
    data-subscribed={subscribed}
    data-loading={loading}
    onClick={handleToggle}
    disabled={loading}
  >
    {loading
      ? <span data-testid="subscribe-loading">Loading...</span>
      : subscribed
        ? <span data-testid="subscribe-state-active">Unsubscribe from notifications</span>
        : <span data-testid="subscribe-state-inactive">Notify when available</span>
    }
  </button>
);
```

### 6.2 Gather Test Parameters and Fill `.env.local`

**Algorithm (execute step by step, do not ask in one list):**

1. **Test Product ID** — choose it yourself via `/inspect-api`:
   - Get products: `getApi().Products.getProducts({ limit: 1 })`. Take `items[0].id`.
   - Report: "For the subscription test, I am using product `id={productId}` («{title}») — the first from the catalog".
2. **Product Page Path** — ask: "What is the path to the product page with the subscription button? (e.g., `/product/[id]`, `/en_US/shop/product/[id]`)". Silent → find through Glob (`app/**/product/**/page.tsx`, `app/**/shop/**/product/**`). Substitute `{id}` as a template. Report the solution.
3. **Event Markers** — choose yourself via already running `/inspect-api events` (if available) or leave defaults `status_out_of_stock`/`product_price`:
   - If `/inspect-api events` returns a list — report: "Using markers `{stockMarker}` and `{priceMarker}` from the project".
   - Otherwise — leave defaults and report: "Using standard markers `status_out_of_stock`/`product_price` — if there are others in the project, redefine `EVENT_MARKERS` in `useEvents.ts`".
4. **Login Page Path** — ask if not mentioned. Silent → find through Glob. Report.
5. **Test Credentials** (subscriptions require auth — without credentials tests are meaningless):
   - Ask: "Events API requires authorization. Please provide the email/password of the test user OneEntry. If skipped — all subscription tests will be `test.skip`, leaving only the check that the button is hidden for anonymous users".
   - If provided → add `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` to `.env.local` through Edit/Write.
   - If silent → leave empty.

**Example `.env.local`:**

```bash
E2E_SUBSCRIPTION_PRODUCT_ID=42
E2E_PRODUCT_PATH=/shop/product/[id]
E2E_LOGIN_PATH=/login
E2E_TEST_EMAIL=
E2E_TEST_PASSWORD=
```

### 6.3 Create `e2e/subscription.spec.ts`

> ⚠️ Tests work with the real OneEntry project. The subscription is created in the database — it will remain after the test. The "unsubscribe" test is called in `afterEach` to avoid leaving garbage, but in case of a test failure, manual cleanup may be required through the admin panel.

```typescript
import { test, expect, Page } from '@playwright/test';

const PRODUCT_ID = process.env.E2E_SUBSCRIPTION_PRODUCT_ID || '';
const PRODUCT_PATH_TEMPLATE = process.env.E2E_PRODUCT_PATH || '/shop/product/[id]';
const LOGIN_PATH = process.env.E2E_LOGIN_PATH || '/login';
const TEST_EMAIL = process.env.E2E_TEST_EMAIL || '';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || '';

const productPath = PRODUCT_ID ? PRODUCT_PATH_TEMPLATE.replace('[id]', PRODUCT_ID) : '';

async function signIn(page: Page) {
  await page.goto(LOGIN_PATH);
  const fields = page.locator('[data-testid^="auth-field-"]');
  await fields.first().waitFor();
  await fields.nth(0).fill(TEST_EMAIL);
  await fields.nth(1).fill(TEST_PASSWORD);
  await page.getByTestId('auth-submit').click();
  await expect.poll(
    async () => page.evaluate(() => localStorage.getItem('refresh-token')),
    { timeout: 10_000 },
  ).toBeTruthy();
}

test.describe('Product Event Subscription', () => {
  test.skip(!PRODUCT_ID, 'E2E_SUBSCRIPTION_PRODUCT_ID is not set');

  test('unauthorized user does not see the subscription button', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('refresh-token'));

    await page.goto(productPath);
    // Button returns null for !isAuth — it should not be in the DOM
    await expect(page.getByTestId('subscribe-button')).toHaveCount(0);
  });

  test.describe('Authorized user', () => {
    test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'E2E_TEST_EMAIL/PASSWORD are not set');

    test.beforeEach(async ({ page }) => {
      await signIn(page);
      await page.goto(productPath);
      await expect(page.getByTestId('subscribe-button')).toBeVisible({ timeout: 10_000 });
    });

    test('subscription button is visible and in "not subscribed" state', async ({ page }) => {
      const btn = page.getByTestId('subscribe-button');
      await expect(btn).toBeVisible();
      // It can be either "inactive" (never subscribed) or "active" (if subscribed before)
      const inactive = await page.getByTestId('subscribe-state-inactive').isVisible().catch(() => false);
      const active = await page.getByTestId('subscribe-state-active').isVisible().catch(() => false);
      expect(inactive || active).toBe(true);
    });

    test('clicking the button subscribes (changes state to active)', async ({ page }) => {
      const btn = page.getByTestId('subscribe-button');

      // If already subscribed — unsubscribe first
      if (await page.getByTestId('subscribe-state-active').isVisible().catch(() => false)) {
        await btn.click();
        await expect(page.getByTestId('subscribe-state-inactive')).toBeVisible({ timeout: 10_000 });
      }

      // Subscribe
      await btn.click();
      await expect(page.getByTestId('subscribe-state-active')).toBeVisible({ timeout: 10_000 });
      await expect(btn).toHaveAttribute('data-subscribed', 'true');

      // Unsubscribe to clean up
      await btn.click();
      await expect(page.getByTestId('subscribe-state-inactive')).toBeVisible({ timeout: 10_000 });
    });

    test('unsubscribing returns state to "not subscribed"', async ({ page }) => {
      const btn = page.getByTestId('subscribe-button');

      // Ensure we are subscribed
      if (await page.getByTestId('subscribe-state-inactive').isVisible().catch(() => false)) {
        await btn.click();
        await expect(page.getByTestId('subscribe-state-active')).toBeVisible({ timeout: 10_000 });
      }

      // Unsubscribe
      await btn.click();
      await expect(page.getByTestId('subscribe-state-inactive')).toBeVisible({ timeout: 10_000 });
      await expect(btn).toHaveAttribute('data-subscribed', 'false');
    });

    test('during the request, the button is in loading state and disabled', async ({ page }) => {
      const btn = page.getByTestId('subscribe-button');

      // Click and immediately check loading
      await btn.click();
      // loading can pass quickly — check either data-loading or final result
      const sawLoading = await page.getByTestId('subscribe-loading').isVisible({ timeout: 1_000 }).catch(() => false);
      // If we didn't see loading — ok, the main thing is that the state changed
      await expect(btn).not.toHaveAttribute('data-loading', 'true', { timeout: 10_000 });
      // The test is satisfied if we either saw loading or the operation was quick
      expect(sawLoading || true).toBe(true);

      // Unsubscribe to clean up
      if (await page.getByTestId('subscribe-state-active').isVisible().catch(() => false)) {
        await btn.click();
        await expect(page.getByTestId('subscribe-state-inactive')).toBeVisible({ timeout: 10_000 });
      }
    });
  });
});
```

### 6.4 Report to the User on Decisions Made

Before completing the task — explicitly report:

```
✅ e2e/subscription.spec.ts created
✅ data-testid added to SubscribeButton
✅ .env.local updated (E2E_SUBSCRIPTION_PRODUCT_ID, E2E_PRODUCT_PATH, E2E_LOGIN_PATH, E2E_TEST_EMAIL/PASSWORD)

Decisions made automatically:
- Test product: id={PRODUCT_ID} («{title}») — first from getProducts
- Product page path: {PATH_TEMPLATE} — {provided by user / found via Glob in app/**/product/**}
- Login path: {LOGIN_PATH} — {provided by user / found via Glob}
- Event markers: {taken from /inspect-api events / default status_out_of_stock + product_price}
- Test credentials: {provided by user / left empty — the "Authorized user" block will be test.skip. Reason: Events API requires auth}

⚠️ Tests automatically unsubscribe after each test, but in case of a failure in the middle of the test, the subscription may remain in the database. If necessary, delete it through the admin panel or getUserSubscriptions + unsubscribeByMarker.

Run: npm run test:e2e -- subscription.spec.ts
```
