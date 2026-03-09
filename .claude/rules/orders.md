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

⚠️ `totalSum` — **string** `"300.00"`, not a number. For display: `Number(order.totalSum).toFixed(2)`.

⚠️ `currency` — often an empty string `""`. **Do not hardcode `$`**. Pattern: `{order.currency || ''}{Number(order.totalSum).toFixed(2)}`. For products in the order, use the currency of the parent order, as there is no currency field in `IOrderProducts`.

⚠️ `statusIdentifier` — only the order status marker. Order statuses are set in the **project admin panel** — markers are unique for each project, do not hardcode. The title cannot be obtained via SDK — build a map on the client side:

```ts
// Markers — real ones from your project (find out through admin panel)
const STATUS_LABELS: Record<string, string> = {
  myStatus1: 'Label 1',
  myStatus2: 'Label 2',
}
// Output:
STATUS_LABELS[order.statusIdentifier ?? ''] ?? order.statusIdentifier
```

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
    { productId: 123, quantity: 2 }
  ]
})
```

---

## Payments — paymentUrl

### createSession works for ALL payment methods

Experimentally verified: `createSession` returns HTTP 201 for Stripe, Cash, and other providers.

```ts
const session = await api.Payments.createSession(order.id, 'session', false) as any
// Stripe → session.paymentUrl = "https://checkout.stripe.com/..."  (URL exists)
// Cash   → session.paymentUrl = null   (offline, redirect not needed)
// PayPal → session.paymentUrl = null immediately, URL appears asynchronously
```

### ⚠️ getSessionByOrderId returns an ARRAY

```ts
const sessions = await api.Payments.getSessionByOrderId(order.id) as any
// sessions — an ARRAY, not an object!
const session = Array.isArray(sessions) ? sessions[0] : sessions
// session.paymentUrl — URL (may be null if not ready yet)
// session.status — "waiting" | "paid" | ...
```

### PayPal — asynchronous flow

For PayPal, `createSession` returns `paymentUrl: null` immediately.
OneEntry creates a payment session asynchronously — polling is needed via `getSessionByOrderId`:

**Full flow order + payment (call from client via getApi()):**

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

**Determining the payment system type:**

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
