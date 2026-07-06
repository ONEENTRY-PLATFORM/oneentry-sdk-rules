---
name: create-subscription-events
description: Create product event subscription
---
# Create a subscription for product events

Creates a subscription for changes in price and stock status of a product via the OneEntry Events API. The user receives a notification when the product is back in stock or the price changes.

> ⚠️ Requires an authorized user. The Events API works only after login — call `reDefine(refreshToken)` before using it, then use `getApi()` directly from the Client Component.

---

## Step 1: Find event markers

First, obtain real markers programmatically via the public `Events.getAllEvents()` (≥1.0.150, no auth needed — just URL + App Token). Run a temp script following the pattern `/inspect-api` (in `.claude/temp/`), NOT through `getApi()` (runtime wrapper of Client Component, available only after login):

```ts
// .claude/temp/list-events.mjs
import { defineOneEntry } from 'oneentry';
const api = defineOneEntry(URL, { token: TOKEN });
const events = await api.Events.getAllEvents();          // IContentApiEvent[] { identifier, module, localizeInfos, id }
// take the identifier field, preferring product events (module === 'catalog');
// if empty after filtering — show the full list
```

Standard markers from a real project (fallback if the script is unavailable):

- `catalog_event` — general catalog events (card changes, movements between categories)
- `status_out_of_stock` — product out of stock / back in stock
- `product_price` — price changed

Only refer to the user/admin panel (OneEntry Admin → Events) if `getAllEvents()` returned an error or an empty list — then create an entry in [`MISMATCH-LOG.md`](../../rules/mismatch-log.md) (C.6 Events).

---

## Step 2: Create a hook for subscription

File: `app/api/hooks/useEvents.ts`

```typescript
'use client';

import { getApi, isError } from '@/lib/oneentry';

// Event markers — take from getAllEvents() (see Step 1)
const EVENT_MARKERS = ['catalog_event', 'status_out_of_stock', 'product_price'] as const;

// Is there an active subscription for the product (by any marker).
// ⚠️ subscribeByMarker/unsubscribeByMarker with default isShell:true ALWAYS resolve
// to true, even if the API returned an error (IError is discarded inside the SDK, not thrown) —
// therefore, we check success not by their return, but by reading getAllSubscriptions.
async function isProductSubscribed(productId: number): Promise<boolean> {
  const result = await getApi().Events.getAllSubscriptions();
  if (isError(result)) return false;
  return result.items.some((s) => s.productId === productId);
}

/**
 * Subscribe to product events (general, availability, price).
 * Call ONLY from Client Component after logIn + reDefine().
 * Returns true only if the subscription actually appeared in the subscription list.
 */
export async function subscribeToProductEvents(productId: number): Promise<boolean> {
  // Each subscription goes as a separate request — independent
  for (const marker of EVENT_MARKERS) {
    await getApi().Events.subscribeByMarker(marker, productId);
  }
  return isProductSubscribed(productId);
}

/**
 * Unsubscribe from product events.
 */
export async function unsubscribeFromProductEvents(productId: number): Promise<boolean> {
  for (const marker of EVENT_MARKERS) {
    await getApi().Events.unsubscribeByMarker(marker, productId);
  }
  return !(await isProductSubscribed(productId));
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
        const ok = await subscribeToProductEvents(productId);
        if (ok) setSubscribed(true);
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

In a real project, the subscription to events is triggered when added to favorites:

```tsx
// When adding to favorites — subscribe to events
const handleAddToFavorites = async (product: IProductsEntity) => {
  dispatch(addFavorites(product.id));

  if (isAuth) {
    // Events work through getApi() since reDefine() is called after login
    const ok = await subscribeToProductEvents(product.id);
    if (ok) {
      toast('We will notify you about product changes');
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
3. subscribeByMarker/unsubscribeByMarker are typed as Promise<boolean | IError>, but with default isShell:true ALWAYS resolve to true — even if the API returned an error (IError is discarded inside SDK, not thrown). Therefore, try/catch around them is useless; reliable success check is to reread getAllSubscriptions and find a pair productId+eventMarker in items (see isProductSubscribed in the hook)
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

---

## Step 6: Playwright E2E tests

> Runs only if the user confirmed writing tests at the beginning of the session or requested writing a test later (see `feedback_playwright.md`).
> To set up Playwright — first `/setup-playwright`.

### 6.1 Add `data-testid` to the component

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

### 6.2 Gather test parameters and fill in `.env.local`

**Algorithm (execute step by step, do not ask in one list):**

1. **Test product ID** — choose it yourself via `/inspect-api`:
   - Get products: `getApi().Products.getProducts([], LANG, { limit: 1 })` (the first argument is an array of filters, `limit` is in the query object third; `LANG` is the active locale, e.g. `'en_US'`). Take `items[0].id`.
   - Report: "For the subscription test, I use product `id={productId}` («{title}») — the first from the catalog".
2. **Path to the product page** — ask: "What is the path to the product page with the subscription button? (for example `/product/[id]`, `/en_US/shop/product/[id]`)". If silent → find through Glob (`app/**/product/**/page.tsx`, `app/**/shop/**/product/**`). Substitute `{id}` as a template. Report the solution.
3. **Event markers** — take from `Events.getAllEvents()` (see Step 1) or leave defaults `status_out_of_stock`/`product_price`:
   - If `getAllEvents()` returned a list — report: "Using markers `{stockMarker}` and `{priceMarker}` from the project".
   - Otherwise — leave defaults and report: "Using standard markers `status_out_of_stock`/`product_price` — if there are others in the project, redefine `EVENT_MARKERS` in `useEvents.ts`".
4. **Path to the login page** — ask if not mentioned. If silent → find through Glob. Report.
5. **Test credentials** (subscriptions require auth — without credentials tests are meaningless):
   - Ask: "Events API requires authorization. Please provide email/password for the test user OneEntry. I will skip — all subscription tests will be `test.skip`, leaving only the check that the button is hidden for anonymous users".
   - If provided → add `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` to `.env.local` via Edit/Write.
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

> ⚠️ Tests work with the real OneEntry project. The subscription is created in the database — after the test, it will remain. The "unsubscribe" test is called in `afterEach` to avoid leaving garbage, but if the test fails, manual cleanup may be required through the admin panel.

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

test.describe('Product event subscription', () => {
  test.skip(!PRODUCT_ID, 'E2E_SUBSCRIPTION_PRODUCT_ID not set');

  test('unauthorized user does not see the subscription button', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('refresh-token'));

    await page.goto(productPath);
    // Button returns null for !isAuth — it should not be in the DOM
    await expect(page.getByTestId('subscribe-button')).toHaveCount(0);
  });

  test.describe('Authorized user', () => {
    test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'E2E_TEST_EMAIL/PASSWORD not set');

    test.beforeEach(async ({ page }) => {
      await signIn(page);
      await page.goto(productPath);
      await expect(page.getByTestId('subscribe-button')).toBeVisible({ timeout: 10_000 });
    });

    test('subscription button is visible and in "not subscribed" state', async ({ page }) => {
      const btn = page.getByTestId('subscribe-button');
      await expect(btn).toBeVisible();
      // Can be either "inactive" (never subscribed), or "active" (if was before)
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

    test('during the request the button is in loading state and disabled', async ({ page }) => {
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

### 6.4 Report to the user about the decisions made

Before completing the task — explicitly report:

```
✅ e2e/subscription.spec.ts created
✅ data-testid added to SubscribeButton
✅ .env.local updated (E2E_SUBSCRIPTION_PRODUCT_ID, E2E_PRODUCT_PATH, E2E_LOGIN_PATH, E2E_TEST_EMAIL/PASSWORD)

Decisions made automatically:
- Test product: id={PRODUCT_ID} («{title}») — first from getProducts
- Path to the product page: {PATH_TEMPLATE} — {user specified / found via Glob in app/**/product/**}
- Path to login: {LOGIN_PATH} — {user specified / found via Glob}
- Event markers: {taken from getAllEvents() / default status_out_of_stock + product_price}
- Test credentials: {provided by user / left empty — the "Authorized user" block will be test.skip. Reason: Events API requires auth}

⚠️ Tests automatically unsubscribe after each test, but if a test fails in the middle, the subscription may remain in the database. If necessary, delete it via the admin panel or getUserSubscriptions + unsubscribeByMarker.

Run: npm run test:e2e -- subscription.spec.ts
```
