<!-- META
type: skill
skillConfig: {"name":"create-checkout"}
-->

# Create OneEntry Checkout Page

Creates a Server Action for getting delivery form data and the full order placement flow.

---

## Step 1: Find out the order storage marker

The delivery form is tied to the order storage (`formIdentifier`). The marker doesn't need to be known in advance — it's retrieved dynamically from `getAllOrdersStorage()`.

If you need to know it in advance:

```bash
cat .env.local
curl -s "https://<URL>/api/content/orders/storage" \
  -H "x-app-token: <TOKEN>" | python -m json.tool
# Look at the "identifier" and "formIdentifier" fields
```

---

## Step 2: Create a Server Action for checkout data

File: `app/actions/orders.ts`

```typescript
'use server';

import { getApi, makeUserApi, isError } from '@/lib/oneentry';

// ⚠️ ONE makeUserApi for all user-auth calls in the function!
// Each call burns refreshToken via /refresh
export async function getCheckoutData(refreshToken: string, locale: string) {
  const { api: userApi } = makeUserApi(refreshToken);

  const storages = await userApi.Orders.getAllOrdersStorage();
  if (isError(storages) || !storages.length) {
    return { error: 'No order storage found' };
  }

  const storage = storages[0];
  const formIdentifier = storage.formIdentifier;

  // Form — public API, use getApi()
  const form = await getApi().Forms.getFormByMarker(formIdentifier, locale);
  if (isError(form)) return { error: form.message };

  const attrs = Array.isArray(form.attributes)
    ? form.attributes
    : Object.values(form.attributes || {});

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
  refreshToken: string,
  storageMarker: string,
  formIdentifier: string,
  paymentAccountIdentifier: string,
  formData: { marker: string; value: string }[],
  products: { id: number; quantity: number }[],
) {
  // ⚠️ One instance for createOrder + createSession
  const { api, getNewToken } = makeUserApi(refreshToken);

  const order = await api.Orders.createOrder(storageMarker, {
    formIdentifier,
    paymentAccountIdentifier,
    formData,
    products,
  } as any);

  if (isError(order)) return { error: order.message };

  const session = await api.Payments.createSession(order.id, 'session', false) as any;
  if (isError(session)) return { error: session.message };

  return {
    orderId: order.id,
    sessionUrl: session.url,
    newToken: getNewToken(),
  };
}
```

---

## Step 3: Working with timeInterval on the client

The `timeInterval` field in the form = **list of available delivery slots** (not entered data).

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

**Format for submission in order form:**

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

## Step 4: Remind of key rules

> Token rules (makeUserApi, getNewToken): `.claude/rules/tokens.md`

```md
✅ Checkout flow created. Key rules:

1. makeUserApi — ONE instance for all calls (getAllOrdersStorage + createOrder + createSession)
2. Delivery form: formIdentifier comes from storage, NOT hardcoded
3. timeInterval.value = available slots [[start, end], ...], NOT entered data
4. createSession is called via the same api instance as createOrder
5. Save getNewToken() back to localStorage after successful order
6. paymentAccountIdentifier — ask the user or get from /inspect-api
```
