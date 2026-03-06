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
  "paymentAccountLocalizeInfos": { "title": "Cash" },
  "products": [
    { "id": 2957, "title": "Cosmo", "price": 150, "quantity": 2, "sku": null, "previewImage": null }
  ],
  "paymentUrl": null,
  "isCompleted": null
}
```

⚠️ `totalSum` is a **string** `"300.00"`, not a number. For display: `Number(order.totalSum).toFixed(2)`.

---

## createOrder — body structure

```ts
// formData accepts ONE object OR array of objects
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
// After createOrder get paymentUrl for redirect to Stripe
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

**Full order + payment flow (one makeUserApi!):**

```ts
export async function createOrderAndSession(refreshToken: string, orderData: any) {
  const { api, getNewToken } = makeUserApi(refreshToken)

  const order = await api.Orders.createOrder(orderData.storageMarker, {
    formIdentifier: orderData.formIdentifier,
    paymentAccountIdentifier: orderData.paymentAccountIdentifier,
    formData: orderData.formData,
    products: orderData.products,
  }) as any
  if (isError(order)) return { error: order.message, statusCode: order.statusCode }

  const session = await api.Payments.createSession(order.id, 'session', false) as any
  if (isError(session)) return { error: session.message, statusCode: session.statusCode }

  return { paymentUrl: session.paymentUrl, newToken: getNewToken() }
}
```

---

## Loading all orders (all storages, one makeUserApi)

```ts
export async function loadAllOrders(refreshToken: string) {
  const { api, getNewToken } = makeUserApi(refreshToken)

  const storages = await api.Orders.getAllOrdersStorage() as any
  if (isError(storages)) return { error: storages.message, statusCode: storages.statusCode }

  const allOrders: any[] = []
  for (const storage of storages) {
    const result = await api.Orders.getAllOrdersByMarker(storage.identifier) as any
    if (!isError(result) && result.items) {
      allOrders.push(...result.items.map((o: any) => ({ ...o, storageTitle: storage.localizeInfos?.title })))
    }
  }

  return { orders: allOrders, newToken: getNewToken() }
}
```
