---
name: create-checkout
description: Create checkout page with OneEntry
---
# Create OneEntry Checkout Page

Creates a Server Action to retrieve shipping form data and the complete order checkout cycle.

---

## Step 1: Find the order storage marker

The shipping form is tied to the order storage (`formIdentifier`). The marker does not need to be known in advance — it is obtained dynamically from `getAllOrdersStorage()`.

If you want to check in advance — create a temporary script in `.claude/temp/`:

```js
// .claude/temp/check-checkout.mjs
import { defineOneEntry } from 'oneentry';
// URL and TOKEN from .env.local
const api = defineOneEntry(URL, { token: TOKEN });
const storages = await api.Orders.getAllOrdersStorage();
// The SDK normalizes the data: see identifier and formIdentifier
console.log(JSON.stringify(storages, null, 2));
```

```bash
node .claude/temp/check-checkout.mjs
rm .claude/temp/check-checkout.mjs
```

---

## Step 2: Create client utilities for checkout

File: `lib/checkout.ts`

```typescript
import { getApi, isError } from '@/lib/oneentry';

// Call from Client Component after reDefine()
export async function getCheckoutData(locale: string) {
  const storages = await getApi().Orders.getAllOrdersStorage();
  if (isError(storages) || !(storages as any[]).length) {
    return { error: 'No order storage found' };
  }

  const storage = (storages as any[])[0];
  const formIdentifier = storage.formIdentifier;

  const form = await getApi().Forms.getFormByMarker(formIdentifier, locale);
  if (isError(form)) return { error: (form as any).message };

  const attrs = Array.isArray((form as any).attributes)
    ? (form as any).attributes
    : Object.values((form as any).attributes || {});

  const formAttributes = (attrs as any[]).map((attr: any) => ({
    marker: attr.marker,
    type: attr.type,
    localizeInfos: attr.localizeInfos,
    position: attr.position,
    value: attr.value, // needed for timeInterval: contains available slots
  })).sort((a: any, b: any) => a.position - b.position);

  // Payment methods: from storage, otherwise fallback to all visible
  const linked = (storage.paymentAccountIdentifiers ?? []) as Array<{ identifier: string; localizeInfos?: { title?: string } }>
  let paymentAccounts = linked
  if (paymentAccounts.length === 0) {
    const all = await getApi().Payments.getAccounts()
    if (Array.isArray(all)) {
      paymentAccounts = (all as any[])
        .filter(a => a.isVisible && a.isUsed)
        .map(a => ({ identifier: a.identifier, localizeInfos: a.localizeInfos }))
    }
  }

  return {
    storageIdentifier: storage.identifier,
    formIdentifier,
    formAttributes,
    paymentAccounts, // render selection if length >= 2; auto-pick if length === 1
  };
}

export async function createOrder(
  storageMarker: string,
  formIdentifier: string,
  paymentAccountIdentifier: string,
  formData: { marker: string; value: string }[],
  products: { id: number; quantity: number }[],
) {
  const order = await getApi().Orders.createOrder(storageMarker, {
    formIdentifier,
    paymentAccountIdentifier,
    formData,
    products,
  } as any);

  if (isError(order)) return { error: (order as any).message };

  const session = await getApi().Payments.createSession((order as any).id, 'session', false) as any;
  if (isError(session)) return { error: session.message };

  return {
    orderId: (order as any).id,
    sessionUrl: session.url,
  };
}
```

---

## Step 3: Working with timeInterval on the client

The `timeInterval` field in the form = **list of available delivery slots** (not entered data).

**Value structure:**

```typescript
// value — array of pairs [startISO, endISO] in UTC
[
  ["2026-03-15T09:00:00.000Z", "2026-03-15T10:00:00.000Z"],
  ["2026-03-15T11:00:00.000Z", "2026-03-15T12:00:00.000Z"],
]
```

**Utilities for working with intervals:**

```typescript
// Parsing
function parseTimeIntervals(value: any): [string, string][] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is [string, string] => Array.isArray(item) && item.length === 2,
  );
}

// Slots for the selected date — filtering through UTC comparison
function filterIntervalsByDate(intervals: [string, string][], date: Date): [string, string][] {
  const startOfDay = new Date(date); startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(date); endOfDay.setUTCHours(23, 59, 59, 999);
  return intervals.filter(([start, end]) => {
    const iStart = new Date(start);
    const iEnd = new Date(end);
    return iStart < endOfDay && iEnd > startOfDay;
  });
}

// Unique available dates (comparing UTC date)
function getAvailableDates(intervals: [string, string][]): Set<string> {
  const dates = new Set<string>();
  intervals.forEach(([start]) => {
    const d = new Date(start);
    dates.add(`${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`);
  });
  return dates;
}

// Slot time — from UTC hours/minutes
function formatSlotTime(startISO: string): string {
  const d = new Date(startISO);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  return `${h}:${m === 0 ? '00' : m}`;
}
```

**Usage in the component:**

```typescript
const timeIntervalAttr = formAttributes.find((a) => a.type === 'timeInterval');
const intervals = timeIntervalAttr ? parseTimeIntervals(timeIntervalAttr.value) : [];
const availableDates = getAvailableDates(intervals);

// For react-calendar — disable unavailable dates:
function tileDisabled({ date, view }: { date: Date; view: string }) {
  if (view !== 'month') return false;
  const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
  return availableDates.size > 0 ? !availableDates.has(key) : false;
}

// Slots for the selected date:
const slots = selectedDate
  ? filterIntervalsByDate(intervals, selectedDate).map((interval) => ({
      time: formatSlotTime(interval[0]),
      interval, // [startISO, endISO] — keep for sending
    }))
  : [];
```

**Format for sending in the order form:**

```typescript
// The selected slot is wrapped in an array:
formData.push({
  marker: timeIntervalAttr.marker,
  type: 'timeInterval',
  value: [selectedInterval], // [[startISO, endISO]] — wrapping is mandatory!
});
```

> ⚠️ `value: [selectedInterval]` — not `value: selectedInterval`. The selected `[start, end]` is always wrapped in an array.

---

## Step 4: Auth-init in the checkout component

In the Client Component that calls `getCheckoutData`/`createOrder`, a useRef guard + hasActiveSession is mandatory:

```tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { reDefine, hasActiveSession } from '@/lib/oneentry';
import { getCheckoutData, createOrder } from '@/lib/checkout';

export default function CheckoutPage() {
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const init = async () => {
      const refreshToken = localStorage.getItem('refresh-token');
      if (!refreshToken) { /* redirect to login */ return; }
      // ⚠️ Check hasActiveSession before reDefine
      if (!hasActiveSession()) {
        await reDefine(refreshToken, 'en_US');
      }
      // now getCheckoutData/createOrder work
    };
    init();
  }, []);
}
```

---

## Step 5: Remind key rules

> Token handling rules: `.claude/rules/tokens.md`

```md
✅ Checkout flow created. Key rules:

1. getCheckoutData/createOrder — call from Client Component after reDefine()
2. Shipping form: formIdentifier is taken from storage, NOT hardcoded
3. timeInterval.value = available slots [[start, end], ...], NOT entered data
4. createSession is called through the same getApi() as createOrder
5. paymentAccountIdentifier — taken from storage.paymentAccountIdentifiers; if there are 0 — fallback to Payments.getAccounts() (isVisible && isUsed); if 2+ — must show selection to the user (radio/select); if 1 — auto-pick
6. useRef guard + hasActiveSession are mandatory in the component with auth-init
```

---

## Step 6: Playwright E2E tests

> Runs only if the user confirmed writing tests at the beginning of the session or requested writing a test later (see `feedback_playwright.md`).
> To set up Playwright — first `/setup-playwright`.

### 6.1 Add `data-testid` to components

For selector stability — add `data-testid` when generating the `CheckoutPage`:

```tsx
<form data-testid="checkout-form" onSubmit={handleSubmit}>
  {/* Dynamic fields from getFormByMarker(storage.formIdentifier) */}
  {formAttributes.map((attr) => (
    <div key={attr.marker}>
      <label htmlFor={attr.marker}>{attr.localizeInfos?.title}</label>
      <input
        id={attr.marker}
        data-testid={`checkout-field-${attr.marker}`}
        name={attr.marker}
        // type depends on attr.type
        required
      />
    </div>
  ))}

  {/* timeInterval — calendar and slots */}
  <div data-testid="checkout-time-interval">
    <div data-testid="checkout-date-picker">{/* react-calendar */}</div>
    <div data-testid="checkout-slots">
      {slots.map((s, i) => (
        <button
          key={i}
          type="button"
          data-testid="checkout-slot"
          data-slot-start={s.interval[0]}
          aria-pressed={selectedSlot === s.interval}
        >
          {s.time}
        </button>
      ))}
    </div>
  </div>

  {/* Payment selection — render if paymentAccounts.length >= 2 */}
  {paymentAccounts.length >= 2 && (
    <div data-testid="checkout-payment">
      {paymentAccounts.map((acc) => (
        <label key={acc.identifier}>
          <input
            type="radio"
            name="payment"
            value={acc.identifier}
            data-testid={`checkout-payment-${acc.identifier}`}
          />
          {acc.localizeInfos?.title || acc.identifier}
        </label>
      ))}
    </div>
  )}

  {error && <div data-testid="checkout-error" role="alert">{error}</div>}
  {success && <div data-testid="checkout-success" role="status">{success}</div>}

  <button type="submit" data-testid="checkout-submit">Checkout</button>
</form>
```

### 6.2 Gather test parameters and fill in `.env.local`

**Algorithm (execute step by step, do not ask in one list):**

1. **Checkout page path** — ask: "What is the path of the checkout page? (e.g., `/checkout`, `/cart/checkout`)".
   - Silent → Glob (`app/**/checkout/**/page.tsx`). Inform: "Found checkout at `{path}` — using it".
2. **Catalog path** (to add a product to the cart before checkout) — ask: "Path to the page with the product list, from where to click 'Add to Cart'? (e.g., `/shop`)".
   - Silent → Glob (`app/**/shop/**/page.tsx`, `app/**/products/**/page.tsx`).
3. **Test credentials** (checkout requires authorization through reDefine) — ask: "Provide the email and password of an existing OneEntry user. Needed to complete the full checkout flow. If you skip — most tests will become `test.skip`, leaving only the form rendering check on an unmounted session".
   - If the user provided values → **add** `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` to `.env.local`.
   - If silent → leave empty, inform: "Credentials not set — tests with authorized checkout will be skipped. Add `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` when a test user is available".
4. **Presence of timeInterval in the form** — check yourself through already known form data (in Step 1/2 you obtained `getCheckoutData` or through `/inspect-api forms`): if among `formAttributes` there is `type === 'timeInterval'` → the slot selection test is included; otherwise commented out. Inform: "The shipping form {has/does not have} the timeInterval field — the slot selection test is {enabled/disabled}".
5. **Number of payment methods** — check yourself: `storages[0].paymentAccountIdentifiers.length` (already available after Step 1). If `< 2` → the payment method selection test is commented out (UI does not render radio with one method). Inform.
6. **Fill in `.env.local`** (yourself):

```bash
# e2e checkout
E2E_CHECKOUT_PATH=/checkout
E2E_SHOP_PATH=/shop
E2E_TEST_EMAIL=
E2E_TEST_PASSWORD=
```

### 6.3 Create `e2e/checkout.spec.ts`

> ⚠️ Tests work with real OneEntry. The fields of the shipping form depend on `getFormByMarker(storage.formIdentifier)` — use `data-testid^="checkout-field-"` without binding to specific markers.

```typescript
import { test, expect } from '@playwright/test';

const CHECKOUT_PATH = process.env.E2E_CHECKOUT_PATH || '/checkout';
const SHOP_PATH = process.env.E2E_SHOP_PATH || '/shop';
const TEST_EMAIL = process.env.E2E_TEST_EMAIL || '';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || '';

async function ensureAuthorized(page: import('@playwright/test').Page) {
  // Check for refresh-token; if not present — try to log in via /login
  const hasToken = await page.evaluate(() => !!localStorage.getItem('refresh-token'));
  if (hasToken) return true;
  await page.goto('/login');
  // Use data-testid from /create-auth (if the form is there)
  const emailField = page.locator('[data-testid^="auth-field-"]').first();
  const passwordField = page.locator('input[type="password"]');
  if (!(await emailField.isVisible().catch(() => false))) return false;
  await emailField.fill(TEST_EMAIL);
  await passwordField.fill(TEST_PASSWORD);
  await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('auth-success')).toBeVisible({ timeout: 10_000 });
  return true;
}

async function addFirstProductToCart(page: import('@playwright/test').Page) {
  await page.goto(SHOP_PATH);
  await page.getByTestId('add-to-cart').first().waitFor({ timeout: 10_000 });
  await page.getByTestId('add-to-cart').first().click();
}

test.describe('Checkout', () => {
  test('checkout page renders shipping form', async ({ page }) => {
    test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'E2E_TEST_EMAIL/PASSWORD not set');

    const authed = await ensureAuthorized(page);
    test.skip(!authed, 'Failed to authorize — check credentials and /login');

    await addFirstProductToCart(page);
    await page.goto(CHECKOUT_PATH);

    await expect(page.getByTestId('checkout-form')).toBeVisible({ timeout: 10_000 });
    const fields = page.locator('[data-testid^="checkout-field-"]');
    expect(await fields.count()).toBeGreaterThan(0);
  });

  test('empty submission — browser validation blocks submit', async ({ page }) => {
    test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'E2E_TEST_EMAIL/PASSWORD not set');
    const authed = await ensureAuthorized(page);
    test.skip(!authed, 'Failed to authorize');

    await addFirstProductToCart(page);
    await page.goto(CHECKOUT_PATH);

    await page.getByTestId('checkout-form').waitFor();
    await page.getByTestId('checkout-submit').click();
    // Stay on the page — required fields do not allow submission
    await expect(page).toHaveURL(new RegExp(CHECKOUT_PATH));
  });

  // ⚠️ Uncomment if the form has the timeInterval field
  // test('selecting a time slot activates the slot button', async ({ page }) => {
  //   test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'credentials not set');
  //   const authed = await ensureAuthorized(page);
  //   test.skip(!authed);
  //   await addFirstProductToCart(page);
  //   await page.goto(CHECKOUT_PATH);
  //
  //   await expect(page.getByTestId('checkout-time-interval')).toBeVisible();
  //   const firstSlot = page.getByTestId('checkout-slot').first();
  //   await firstSlot.waitFor();
  //   await firstSlot.click();
  //   await expect(firstSlot).toHaveAttribute('aria-pressed', 'true');
  // });

  // ⚠️ Uncomment if storage.paymentAccountIdentifiers.length >= 2
  // test('selecting a payment method — radio switches', async ({ page }) => {
  //   test.skip(!TEST_EMAIL || !TEST_PASSWORD);
  //   const authed = await ensureAuthorized(page);
  //   test.skip(!authed);
  //   await addFirstProductToCart(page);
  //   await page.goto(CHECKOUT_PATH);
  //
  //   const payment = page.getByTestId('checkout-payment');
  //   await expect(payment).toBeVisible();
  //   const options = payment.locator('[data-testid^="checkout-payment-"]');
  //   expect(await options.count()).toBeGreaterThanOrEqual(2);
  //   await options.nth(1).check();
  //   await expect(options.nth(1)).toBeChecked();
  // });
});
```

### 6.4 Report to the user about the decisions made

Before completing the task — explicitly inform:

```
✅ e2e/checkout.spec.ts created
✅ data-testid added to CheckoutPage (form, slots, payment)
✅ .env.local updated (E2E_CHECKOUT_PATH, E2E_SHOP_PATH, E2E_TEST_EMAIL, E2E_TEST_PASSWORD)

Decisions made automatically:
- Checkout path: {CHECKOUT_PATH} — {user specified / found via Glob}
- Catalog path: {SHOP_PATH} — {user specified / found}
- Test credentials: {provided / empty → corresponding tests test.skip}
- timeInterval test: {enabled — the form has the timeInterval field / commented out — the field is absent}
- Payment selection test: {enabled — {N} payment methods / commented out — only {N} method}

Run: npm run test:e2e -- checkout.spec.ts
```

The complete flow with order creation (createOrder + createSession) is intentionally not included in the automated tests — it modifies data on the production OneEntry. Add a separate smoke test manually when needed.
