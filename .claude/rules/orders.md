<!-- META
type: rules
fileName: orders.md
rulePaths: ["app/actions/**/*.ts","components/**/*.tsx"]
paths:
  - "app/actions/**/*.ts"
  - "components/**/*.tsx"
-->

# Orders & Payments — OneEntry Rules

## Response structures (critical — they differ!)

### getAllOrdersStorage → plain array

```ts
// Returns IOrdersEntity[] — array directly, NOT { items, total }
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
  "paymentAccountLocalizeInfos": { "en_US": "Cash", "ru_RU": "Наличные" },
  "products": [
    { "id": 2957, "title": "Cosmo", "price": 150, "quantity": 2, "sku": null, "previewImage": null }
  ],
  "paymentUrl": null,
  "isCompleted": null
}
```

⚠️ `totalSum` — **string** `"300.00"`, not a number. For display: `Number(order.totalSum).toFixed(2)`.

⚠️ `currency` — often an empty string `""`. **Do not hardcode `$`**. Pattern: `{order.currency || ''}{Number(order.totalSum).toFixed(2)}`. For products in the order, use the currency from the parent order — `IOrderProducts` has no currency field.

⚠️ `statusIdentifier` — marker only (`"inProgress"`), **status label is not available via SDK**. Build a map on the client:

```ts
// Markers depend on the project — check real values in the admin panel
const STATUS_LABELS: Record<string, string> = {
  created: 'Created',
  inProgress: 'In Progress',
  completed: 'Completed',
  canceled: 'Canceled',
}
// Display:
STATUS_LABELS[order.statusIdentifier ?? ''] ?? order.statusIdentifier
```

⚠️ `paymentAccountLocalizeInfos` — `Record<string, any>`, keys are locales: `{ "en_US": "Cash", "ru_RU": "Наличные" }`.
For display: `order.paymentAccountLocalizeInfos?.[locale] || order.paymentAccountIdentifier`

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

## Payments — createSession → paymentUrl

```ts
// After createOrder, get paymentUrl to redirect to Stripe
const session = await api.Payments.createSession(order.id, 'session', false)
// session.paymentUrl — payment link (Stripe Checkout URL)
```

```json
{
  "id": 1764,
  "identifier": "my-id",
  "paymentUrl": "https://paymewntlink.com",
  "updatedDate": "2024-06-21T09:53:28.898Z",
  "version": 10
}
```

**Full order + payment flow (call from client via getApi()):**

```ts
// Client Component — token already configured after reDefine()
async function createOrderAndSession(orderData: any) {
  const order = await getApi().Orders.createOrder(orderData.storageMarker, {
    formIdentifier: orderData.formIdentifier,
    paymentAccountIdentifier: orderData.paymentAccountIdentifier,
    formData: orderData.formData,
    products: orderData.products,
  }) as any
  if (isError(order)) return { error: order.message, statusCode: order.statusCode }

  const session = await getApi().Payments.createSession(order.id, 'session', false) as any
  if (isError(session)) return { error: session.message, statusCode: session.statusCode }

  return { paymentUrl: session.paymentUrl }
}
```

---

## Loading all orders (all storages, Client Component)

```ts
// Client Component — token already configured after reDefine()
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
