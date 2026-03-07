<!-- META
type: skill
skillConfig: {"name":"create-checkout"}
-->

# Create OneEntry checkout page

Creates a Server Action for fetching delivery form data and a complete order creation flow.

---

## Step 1: Find the order storage marker

The delivery form is linked to the order storage (`formIdentifier`). The marker doesn't need to be known in advance — it's fetched dynamically from `getAllOrdersStorage()`.

If you need it in advance:

```bash
cat .env.local
curl -s "https://<URL>/api/content/orders/storage" \
  -H "x-app-token: <TOKEN>" | python -m json.tool
# Look for "identifier" and "formIdentifier" fields
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

  return {
    storageIdentifier: storage.identifier,
    formIdentifier,
    formAttributes,
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

The `timeInterval` field in the form = **list of available delivery slots** (not user-entered data).

**Value structure:**

```typescript
// value — array of [startISO, endISO] pairs in UTC
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

// Slots for selected date — filter via UTC comparison
function filterIntervalsByDate(intervals: [string, string][], date: Date): [string, string][] {
  const startOfDay = new Date(date); startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(date); endOfDay.setUTCHours(23, 59, 59, 999);
  return intervals.filter(([start, end]) => {
    const iStart = new Date(start);
    const iEnd = new Date(end);
    return iStart < endOfDay && iEnd > startOfDay;
  });
}

// Unique available dates (compare UTC date)
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

**Usage in component:**

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

// Slots for selected date:
const slots = selectedDate
  ? filterIntervalsByDate(intervals, selectedDate).map((interval) => ({
      time: formatSlotTime(interval[0]),
      interval, // [startISO, endISO] — save for submission
    }))
  : [];
```

**Format for submission in the order form:**

```typescript
// Selected slot is wrapped in an array:
formData.push({
  marker: timeIntervalAttr.marker,
  type: 'timeInterval',
  value: [selectedInterval], // [[startISO, endISO]] — wrapping is required!
});
```

> ⚠️ `value: [selectedInterval]` — not `value: selectedInterval`. The selected `[start, end]` is always wrapped in an array.

---

## Step 4: Auth-init in checkout component

In the Client Component that calls `getCheckoutData`/`createOrder`, useRef guard + hasActiveSession are required:

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

## Step 5: Key rules reminder

> Token rules: `.claude/rules/tokens.md`

```md
✅ Checkout flow created. Key rules:

1. getCheckoutData/createOrder — call from Client Component after reDefine()
2. Delivery form: formIdentifier comes from storage, NOT hardcoded
3. timeInterval.value = available slots [[start, end], ...], NOT user-entered data
4. createSession is called via the same getApi() as createOrder
5. paymentAccountIdentifier — ask the user or get from /inspect-api
6. useRef guard + hasActiveSession are required in the component with auth-init
```
