<!-- META
type: rules
fileName: orders.md
rulePaths: ["app/actions/**/*.ts","components/**/*.tsx"]
paths:
  - "app/actions/**/*.ts"
  - "components/**/*.tsx"
-->

# Orders & Payments — OneEntry Rules

## Response Structures (critical — they are different!)

### getAllOrdersStorage → plain array

```ts
// Returns IOrdersEntity[] — an array directly, NOT { items, total }
const storages = await api.Orders.getAllOrdersStorage()
// storages[0].identifier  — storage marker (needed for getAllOrdersByMarker)
// storages[0].formIdentifier — delivery form marker (needed for getFormByMarker)
// storages[0].paymentAccountIdentifiers — [{ identifier: "stripe" }, ...]
```

```json
[
  {
    "id": 1,
    "identifier": "my_order",
    "formIdentifier": "orderForm",
    "paymentAccountIdentifiers": [
      { "identifier": "cash" },
      { "identifier": "stripe" }
    ]
  }
]
```

### ⚠️ Choosing the order storage (storage) — UX rules

`getAllOrdersStorage()` returns an array. Each storage has its own `formIdentifier` (order form) and its own set of `paymentAccountIdentifiers` — they **may differ** between storages.

- **1 storage** — use automatically.
- **2+ storages** — **must** ask the user which to use (or let them choose in the UI). DO NOT hardcode `storages[0]` — different storages have different delivery fields and different payment methods, the user will get the wrong checkout.

If there are 2+ storages and the user did not specify — ask explicitly, rather than silently substituting the first.

### ⚠️ Choosing the payment method — UX rules

`storage.paymentAccountIdentifiers` — the source of available payment methods for the storage (configured in the OneEntry admin panel). Apply as follows:

- **0 linked accounts** — fallback to `Payments.getAccounts()` (all visible `isVisible && isUsed`). When creating an order, the server may reject an unlinked method — warn the user that the storage has no configured payment methods.
- **1 linked** — use it automatically, do not show a choice.
- **2+ linked** — **must** show ALL options in one block. DO NOT hardcode the first and do not hide options.

If the user did not make a choice in the form — by default, substitute the first from the list. Never send `createOrder` without `paymentAccountIdentifier`.

```ts
const accounts = storage.paymentAccountIdentifiers ?? []
const accountsToShow = accounts.length > 0
  ? accounts
  : await getApi().Payments.getAccounts().then(r => Array.isArray(r) ? r.filter(a => a.isVisible && a.isUsed) : [])

// In the UI: if accountsToShow.length >= 2 — render the choice
// By default, selected accountsToShow[0].identifier
```

### getAllOrdersByMarker → { items, total }

```ts
// Returns { items: IOrderByMarkerEntity[], total: number }
const result = await api.Orders.getAllOrdersByMarker(storage.identifier)
const orders = result.items  // ← NOT result directly!
const total = result.total
```

**Fields of each order item:**

```json
{
  "id": 418,
  "storageId": 1,
  "createdDate": "2026-01-28T16:02:08.865Z",
  "statusIdentifier": "inProgress",
  "statusLocalizeInfos": { "title": "In progress" },
  "fulfillmentStatusIdentifier": null,
  "fulfillmentStatusLocalizeInfos": null,
  "paymentStatusIdentifier": "inProgress-payment",
  "paymentStatusLocalizeInfos": { "title": "In progress" },
  "formIdentifier": "orderForm",
  "formData": [{ "marker": "order_name", "value": "Ivan", "type": "string" }],
  "totalSum": "300.00",
  "currency": "",
  "paymentAccountIdentifier": "cash",
  "paymentAccountLocalizeInfos": { "title": "Cash" },
  "products": [
    { "id": 2957, "title": "Cosmo", "price": 150, "quantity": 2, "sku": null, "previewImage": null }
  ],
  "paymentUrl": null,
  "isCompleted": null
}
```

⚠️ `totalSum` — **the type depends on the method**, and with v1.0.158 this is reflected in the types:

| Method | `totalSum` |
| --- | --- |
| `getOrderByMarkerAndId`, `getAllOrdersByMarker` (`IOrderByMarkerEntity`) | **string** `"300.00"` |
| `createOrder`, `updateOrderByMarkerAndId` (`IBaseOrdersEntity`) | **number** `285` (before 1.0.158 it was declared as a string — the type was incorrect) |

Safe for both: `Number(order.totalSum).toFixed(2)`. Direct comparison (`order.totalSum > 0`) on a string will yield incorrect results — cast explicitly.

⚠️ `currency` — often an empty string `""`. **Do not hardcode `$`**. Pattern: `{order.currency || ''}{Number(order.totalSum).toFixed(2)}`. For products in the order, use the currency of the parent order, as there is no currency field in `IOrderProducts`.

⚠️ `statusIdentifier` — only the marker of the order status. Statuses are set in the **project admin panel** — markers are unique for each project; do not hardcode either markers or their titles. Localized names are provided by the SDK in two ways:

```ts
// 1) On each order — statusLocalizeInfos (optional, may be absent on old orders):
order.statusLocalizeInfos?.title || order.statusIdentifier

// 2) Full list of storage statuses (tabs, filters) — getAllStatusesByStorageMarker:
const statuses = await api.Orders.getAllStatusesByStorageMarker(storage.identifier, locale) // IOrderStatus[] | IError
if (!isError(statuses)) {
  // identifier → title; in the UI filter by isUsed and sort by position;
  // default limit = 30 — pass a larger one if there are more statuses
  const titleByIdentifier = Object.fromEntries(
    statuses.map((s) => [s.identifier, s.localizeInfos?.title]),
  )
}
```

**Fields of `IOrderStatus` (declared with v1.0.158, all optional):**

| Field | What it provides |
| --- | --- |
| `axis` | "pipeline" of the status — for example `"payment"`. Allows separating payment statuses from fulfillment statuses without parsing markers as strings |
| `isFinalSuccess` | status — successful completion (order completed) |
| `isCancelFinal` | status — final cancellation |
| `isMapped` | status mapped to an external system |

Flags eliminate hardcoding markers in the UI: "show success badge" — this is `status.isFinalSuccess`, not `identifier === 'completed'`. Fields are optional — they may not be present in old projects, so the default is always "regular status".

### Three independent order statuses (v1.0.157)

In addition to the overall status (`statusIdentifier`), the order carries **fulfillment status** and **payment status** — both declared in `IOrderByMarkerEntity` starting with v1.0.157 (`getOrderByMarkerAndId`, `getAllOrdersByMarker`). Before this version, the API returned them, but with `validation.enabled` they were silently cut from the response, so they are usually absent in old code.

```ts
const order = await api.Orders.getOrderByMarkerAndId('my_order', 179)
if (!isError(order)) {
  order.statusIdentifier            // overall order status
  order.fulfillmentStatusIdentifier // delivery/fulfillment status — null until assigned
  order.paymentStatusIdentifier     // payment status, e.g. "inProgress-payment" — null until assigned
  // localized names — corresponding *LocalizeInfos?.title
  const paid = order.paymentStatusLocalizeInfos?.title ?? order.paymentStatusIdentifier ?? '—'
}
```

Markers for these statuses, like ordinary ones, are set in the project admin panel — do not hardcode. `null` means "status not yet assigned," not an error: the UI should degrade to a dash or hidden string. `IBaseOrdersEntity` (response from `createOrder` / `updateOrderByMarkerAndId`) with v1.0.157 returns `statusLocalizeInfos` — immediately after creating the order, the status name can be displayed without an additional request.

⚠️ `paymentAccountLocalizeInfos` — `{ title: string }`. For output:

```tsx
order.paymentAccountLocalizeInfos?.title || order.paymentAccountIdentifier
```

---

## createOrder — body structure

```ts
// formData accepts ONE object OR an array of objects
await api.Orders.createOrder(storage.identifier, {
  formIdentifier: storage.formIdentifier,        // from getAllOrdersStorage!
  paymentAccountIdentifier: 'stripe',            // from storage.paymentAccountIdentifiers[].identifier
  formData: [                                    // delivery form fields
    { marker: 'name', value: 'Ivan', type: 'string' }
  ],
  products: [
    // third optional field signedPrice — price fixation (see below)
    { productId: 123, quantity: 2 }
  ],
  // Optionally: coupon code from previewOrder (see below)
  // couponCode: 'SUMMER10',
  // Optionally: deduct N bonuses from the balance (see "Bonuses" below)
  // bonusAmount: 100,
})
```

### Price fixation (signPrice → signedPrice, SDK ≥ 1.0.154)

To ensure that the price shown in the catalog/cart does not change by the time of checkout: when requesting products, pass the query parameter `signPrice` with the value **of the order storage marker** (the same `storage.identifier` that goes as the first argument to `createOrder`) — the Products methods (`getProducts`, `getProductsByIds`, `getProductsByPageUrl`, etc.; also supports `getProductsPriceByPageUrl` → `IProductInfo.signedPrice`) and product methods of Blocks will return each product with the `signedPrice` field (a signed string token, valid for a limited time). Pass this string into the `products[]` element of the order: `{ productId, quantity, signedPrice }`. Without it, the order is considered at current prices.

⚠️ `previewOrder` **does not accept** `signedPrice` (its `products` — `{ productId?, quantity? }`) — fixation only applies in `createOrder` / `updateOrderByMarkerAndId`.

### Order without products (table reservation, booking, application)

`createOrder` is suitable not only for cart checkout. If a form of type `order` with an empty set of products is set up in the admin panel (for example, `booking_order` for table reservation, service application) — send `products: []`:

```ts
// app/actions/reservation.ts — 'use server'
await getApi().Orders.createOrder('booking_order', {
  formIdentifier: 'booking_order',                 // = storage marker, forms and storage match
  paymentAccountIdentifier: 'cash',                // if no payment is needed — still specify cash
  formData: payload.formData as IOrdersFormData[], // dates, guests, name, contact
  products: [],
})
```

`storage.identifier` and `storage.formIdentifier` may match (like `booking_order` → `booking_order`) — this is normal, in the admin panel the storage is linked to one form.

### Virtual product "delivery" — add before createOrder

The cost of delivery in OneEntry is a regular product with a fixed price and `productId`. On the front end — extract its id into a constant and add it to `products[]` before sending:

```ts
// app/utils/constants.ts
export const DELIVERY_PRODUCT_ID = 33; // ← find out via /inspect-api products, replace with your own

// when assembling the order
const orderProducts: IOrderProductData[] = cartProducts.map(p => ({
  productId: p.id,
  quantity: p.quantity ?? 1,
}));

if (!orderProducts.some(p => p.productId === DELIVERY_PRODUCT_ID)) {
  orderProducts.push({ productId: DELIVERY_PRODUCT_ID, quantity: 1 });
}
```

> If there is no delivery in the project — the constant is not needed. If there is — without it, `totalSum` will be calculated without delivery.

---

## previewOrder — coupon discount calculation BEFORE createOrder

`Orders.previewOrder` validates the coupon, calculates the discount, checks applicability without creating an order in the database. Use for UX "apply promo code" in the cart:

```ts
const preview = await getApi().Orders.previewOrder({
  products: [
    { productId: 123, quantity: 2 },
    { productId: DELIVERY_PRODUCT_ID, quantity: 1 },
  ],
  couponCode: 'SUMMER10',
})

if (isError(preview)) {
  // statusCode=400 → coupon does not exist or has expired
  // statusCode=200 + message → coupon exists, but is not applicable (MIN_CART_AMOUNT, applicability, maxAmount)
  return { ok: false, error: preview.message }
}

const { totalSum, totalSumWithDiscount, currency } = preview as IOrderPreviewResponse

// ⚠️ The server returned success, but the discount is zero → the coupon exists but did not work
// (for example, MIN_CART_AMOUNT not met or applicability did not intersect with the cart)
if (totalSumWithDiscount >= totalSum) {
  return { ok: false, error: 'Coupon does not apply to this cart' }
}

const discount = totalSum - totalSumWithDiscount
// Save { code, totalSum, totalSumWithDiscount, currency } — show "Discount" line at checkout
// and pass `couponCode` in createOrder
```

**Important:**

- `previewOrder` **does not apply** the coupon — it only calculates. To include the discount in the order, pass `couponCode` in `createOrder`.
- Applicability conditions (`applicability`, `maxAmount`, `MIN_CART_AMOUNT`) are set in the admin panel for each coupon — they are usually not passed to the front end, trust the server's response.
- If there are `selected: false` products in the cart (UX where the user checks specific products) — filter them before `previewOrder` and `createOrder`. The server calculates the discount based on what was actually sent in `products[]`.

See `.claude/rules/mismatch-log.md`: if coupons are not yet set up in the admin panel — item `C.7 Orders` (coupons / payment accounts / statuses) with coupon markers and their `applicability`.

---

## Bonuses in the order

Bonus balance is a separate entity from coupons (module `Discounts`). To allow the user to deduct bonuses at checkout:

```ts
// 1. Show available balance (⚠️ requires authorization)
const balance = await getApi().Discounts.getBonusBalance()   // { balance: number }
if (isError(balance)) return

// 2. Recalculate the order with deducting N bonuses — via previewOrder
const preview = await getApi().Orders.previewOrder({
  products: [{ productId: 123, quantity: 2 }],
  bonusAmount: 100,          // how many bonuses the user wants to deduct
  // couponCode: 'SUMMER10', // coupons and bonuses can be combined
})
if (isError(preview)) return

const { bonusApplied, totalDue, totalSum, totalSumWithDiscount } = preview as IOrderPreviewResponse
// bonusApplied — how many bonuses were actually applied (the server limits according to admin rules)
// totalDue     — total to be paid in cash AFTER discounts and bonuses

// 3. Pass bonusAmount in createOrder so the deduction is included in the order
await getApi().Orders.createOrder(storage.identifier, {
  formIdentifier: storage.formIdentifier,
  paymentAccountIdentifier: 'stripe',
  formData: [...],
  products: [{ productId: 123, quantity: 2 }],
  bonusAmount: 100,
})
```

**Important:**

- `bonusAmount` — this is a **request** for deduction. The server limits it according to admin rules (`maxBonusPaymentPercent`, `minBonusAmount`, `minOrderAmountForBonus`) — the actual deduction is seen in `bonusApplied`, and the amount to be paid in `totalDue`, do not calculate manually.
- Bonus limits are in `preview.discountConfig.settings` / `preview.discountConfig.bonus` — they are usually not passed to the front end, trust the response from `previewOrder`.
- History of accruals/deductions — `Discounts.getBonusHistory(type?, dateFrom?, dateTo?, ...)`.

---

## Split payment and discountConfig — getOrderByMarkerAndId

`getOrderByMarkerAndId(marker, id)` (unlike the list `getAllOrdersByMarker`) returns an extended order with the fields:

```ts
const order = await getApi().Orders.getOrderByMarkerAndId('my_order', 418) as IOrderByMarkerEntity
// order.discountConfig — details of discounts/bonuses (IOrderDiscountConfig | null)
// order.totalSumRaw    — amount before discounts (string)
// order.isPartial      — boolean | null: whether part has been paid (for split/staged payment)
// order.paymentStrategy — payment strategy (e.g. 'once')
// order.split          — configuration for staged (split) payment, if enabled
```

Staged payment (`order.split: IOrderSplit`):

```ts
// IOrderSplit = { completed: boolean, partial: boolean, stages: IOrderSplitStage[] }
// IOrderSplitStage = { marker, sessionId, productId, title, value, status }
if (order.split && !order.split.completed) {
  const pending = order.split.stages.filter((s) => s.status !== 'paid')
  // show the user the remaining stages and amounts (stage.value), statuses — stage.status
}
```

> Fields `bonusApplied` / `totalDue` / `couponCode` are on `IBaseOrdersEntity` (response create/update/preview). In `IOrderByMarkerEntity`, bonuses and totals are inside `discountConfig`, not at the top level.

---

## Refunds (refund requests)

Refund for an order — three methods (⚠️ user context):

```ts
// List of refund requests for the order
const refunds = await getApi().Orders.getRefunds(orderId)   // IRefundRequest[]

// Create a request: products — map productId → { quantity } to be refunded
const ok = await getApi().Orders.createRefundRequest(orderId, {
  products: {
    '123': { quantity: 1 },
    '456': { quantity: 2 },
  },
  note: 'The product did not fit',   // optional
})  // boolean

// Cancel a refund request
await getApi().Orders.cancelRefundRequest(orderId)  // boolean
```

**`IRefundRequest`** (key): `{ id, createdDate, status, amount, note, products, orderId, orderStorageId, userId }`. `status` — marker of the refund status (set in the admin panel, do not hardcode; there is no method for localized names of refund statuses in the SDK — if a title is needed, build a map `marker → name` on the client). `amount` — refund amount (number). `products` — map `productId → { quantity }`.

> If refunds are not yet set up in the admin panel (no refund statuses) — item `C.7 Orders` in `.claude/rules/mismatch-log.md`.

### Cancellation vs refund — which branch to show (verified with live API)

Order cancellation extinguishes its payment session, so the outcome depends on the session state:

- **Session `waiting` and not expired** → cancellation proceeds normally.
- **Refusal "Payment sessions … may have been paid"** = the session cannot be extinguished: it is **paid or expired** (Stripe checkout sessions live for 24 hours, `sessionTimeout` of the account is usually shorter). For a paid order, lead the user to **refund request**, not into a dead end "cancellation impossible".
- **`createRefundRequest` for an unpaid order** → `404 "You cannot refund uncompleted order"` — **normal** response (`isCompleted` not yet `true`), not a bug: show "order not paid", refund is not needed here.
- **Expired unpaid order** (session expired, payment not confirmed): both cancellation and refund are denied — from the client API this is a dead end, resolved by changing the order status in the admin panel.
- **Permissions:** route `/api/content/orders/{id}/refund` — a separate permission for user groups. `403 Permission data not found` on refund methods → grant permission to the group (skill `/admin-grant-permissions`); applies with a lag of up to ~5 minutes.

---

## Payments — paymentUrl

### createSession works for ALL payment methods

Experimentally verified: `createSession` returns HTTP 201 for Stripe, Cash, and other providers.

```ts
const session = await api.Payments.createSession(order.id, 'session', false) as any
// Stripe → session.paymentUrl = "https://checkout.stripe.com/..."  (URL exists)
// Cash   → session.paymentUrl = null   (offline, no redirect needed)
// PayPal → session.paymentUrl = null immediately, URL appears asynchronously
```

### ⚠️ getSessionByOrderId returns an ARRAY

```ts
const sessions = await api.Payments.getSessionByOrderId(order.id) as any
// sessions — ARRAY, not an object!
const session = Array.isArray(sessions) ? sessions[0] : sessions
// session.paymentUrl — URL (may be null if not ready yet)
// session.status — "waiting" | "paid" | ...
```

### ⚠️ Session forever `waiting`, `isCompleted` does not become `true`

If payment on the Stripe side **goes through** (test card, redirect to success), but the order session remains forever `waiting` and `order.isCompleted` is not set — the problem lies in the configuration of the payment account in the admin panel (Settings → Payments), not in the code:

- `successUrl` / `cancelUrl` of the account must point to **your** host (a common finding on new tenants — the demo stand template URLs remain);
- the connected Stripe account (`stripeAccountId`) must belong to your project — otherwise, the payment event goes to another project, and yours does not know about it.

Fix by reconnecting the Stripe account (go through onboarding again) and correcting the URLs in the admin panel; the actual account config is visible in the admin API — `GET /api/admin/payments/accounts` (rule `admin-api`). If after reconnecting the session still hangs `waiting` — this is webhook routing on the OneEntry cloud side, a question for their support.

Consequence for e2e: while the account is foreign, there are no paid orders in the project — a successful refund flow is unreplicable, and "non-cancellable" orders accumulate (see "Cancellation vs Refund").

### PayPal — asynchronous flow

For PayPal, `createSession` immediately returns `paymentUrl: null`.
OneEntry creates a payment session asynchronously — polling is needed via `getSessionByOrderId`:

**Full flow order + payment (call from the client via getApi()):**

```ts
// Client Component — after reDefine() the token is already set up
async function handleOrder(orderData: any) {
  const order = await getApi().Orders.createOrder(orderData.storageMarker, {
    formIdentifier: orderData.formIdentifier,
    paymentAccountIdentifier: orderData.paymentAccountIdentifier,
    formData: orderData.formData,
    products: orderData.products,
  }) as any
  if (isError(order)) return { error: order.message, statusCode: order.statusCode }

  // ⚠️ Both PayPal and Cash have type: "custom" — distinguish ONLY by identifier!
  const isStripe = orderData.selectedAccount?.type === 'stripe'
  const isOnline = isStripe || orderData.selectedAccount?.identifier === 'paypal' // whitelist

  let paymentUrl: string | null = order.paymentUrl ?? null

  if (isStripe && !paymentUrl) {
    // Stripe: createSession
    const session = await getApi().Payments.createSession(order.id, 'session', false) as any
    if (!isError(session)) paymentUrl = session.paymentUrl ?? null
  } else if (isOnline && !isStripe && !paymentUrl) {
    // PayPal and other online (NOT cash): polling getSessionByOrderId for up to 6 seconds
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 1500))
      const sessions = await getApi().Payments.getSessionByOrderId(order.id) as any
      const s = Array.isArray(sessions) ? sessions[0] : sessions
      if (!isError(s) && s?.paymentUrl) { paymentUrl = s.paymentUrl; break }
    }
  }
  // Cash (isOnline = false): paymentUrl remains null → show success screen

  if (paymentUrl) window.location.href = paymentUrl
  return { orderId: order.id }
}
```

**Determining the type of payment system:**

```ts
// ⚠️ IMPORTANT: type is unreliable — both PayPal and Cash have type: "custom".
// All gateways should be determined ONLY by identifier (selectedPayment).
const isStripe = selectedPayment === 'stripe'
// Whitelist online providers by identifier — expand when adding new gateways
const isOnline = selectedPayment === 'stripe' || selectedPayment === 'paypal'

// Cash and any other offline: isOnline = false → show success screen
// PayPal: isOnline = true, !isStripe → polling via getSessionByOrderId
// Stripe: isOnline = true, isStripe → createSession
```

---

## Loading all orders (all storages, Client Component)

```ts
// Client Component — after reDefine() the token is already set up
async function loadAllOrders() {
  const storages = await getApi().Orders.getAllOrdersStorage() as any
  if (isError(storages)) return { error: storages.message, statusCode: storages.statusCode }

  const allOrders: any[] = []
  for (const storage of storages) {
    const result = await getApi().Orders.getAllOrdersByMarker(storage.identifier) as any
    if (!isError(result) && result.items) {
      allOrders.push(...result.items.map((o: any) => ({ ...o, storageTitle: storage.localizeInfos?.title })))
    }
  }

  return { orders: allOrders }
}
```
