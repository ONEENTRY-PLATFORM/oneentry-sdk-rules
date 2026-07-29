# Typical OneEntry Scenarios

## E-commerce

```typescript
// List of products
const products = await getApi().Products.getProducts()

// Product by ID
const product = await getApi().Products.getProductById(65)

// Filtering: price 100-500
const filtered = await getApi().Products.getProducts(
  [
    { attributeMarker: 'price', conditionMarker: 'mth', conditionValue: 100 },
    { attributeMarker: 'price', conditionMarker: 'lth', conditionValue: 500 },
  ]
)

// Order + payment session (call from client after reDefine)
const order = await getApi().Orders.createOrder('storage_marker', {
  formIdentifier, paymentAccountIdentifier, formData, products,
}) as any
if (isError(order)) return
const session = await getApi().Payments.createSession(order.id, 'session', false) as any
```

To create a product catalog, use the skill **`/create-product-list`** — it will create a Server Component with filtering through URL query params, pagination (load more), `FilterPanel` with price and color data from the API, and `ProductGrid` with remounting via `key`.

**Which method to use:**

| Scenario | Method |
| --- | --- |
| **Entire catalog** (all products of the project) | `getProducts(filters, locale, query)` |
| **Category products** (linked to the category page in OneEntry) | `getProductsByPageUrl(categoryUrl, filters, locale, query)` |

```typescript
// ✅ Entire catalog
const result = await getApi().Products.getProducts([], locale, { offset: 0, limit: 10 })

// ✅ Products of a specific category (pageUrl — marker, not URL-route!)
const result = await getApi().Products.getProductsByPageUrl('soft_toys', [], locale, { offset: 0, limit: 10 })
```

⚠️ **Do not use `getProductsByPageUrl` to display the entire catalog** — it will return only products linked to a specific catalog_page.

To create a single product page, use the skill **`/create-product-card`** — it will create a product page with `getProductById`, extracting attributes by type and marker, an image gallery, a price block, and a section for related products through `getRelatedProductsById`.

To create a user order list, use the skill **`/create-orders-list`** — it will create a Client Component with loading through all storages (`getAllOrdersStorage` + `getAllOrdersByMarker`), direct `getApi()` calls from the client, and client-side pagination.

To create a checkout page, use the skill **`/create-checkout`** — it will create a form with fields from the Forms API (`getFormByMarker` by `formIdentifier` storage), handling the `timeInterval` type field (delivery slots), direct `getApi()` calls for `createOrder` + `createSession`, and redirecting to the payment page.

To manage the cart (Redux slice + redux-persist, add/remove/quantity), use the skill **`/create-cart-manager`** — it will create a `CartSlice`, store with persistence, and `StoreProvider`.

For a favorites list (Redux slice + persist, stores only product IDs), use the skill **`/create-favorites`** — it will create a `FavoritesSlice`, a button, and a page with data loading from the API.

For the filter panel (price, color, availability + `FilterContext` + Apply/Reset), use the skill **`/create-filter-panel`**.

To subscribe to price and availability changes of a product, use the skill **`/create-subscription-events`** — `Events.subscribeByMarker` / `unsubscribeByMarker`.

## Authorization and Users

To create an authorization/registration form, use the skill **`/create-auth`** — it will create a Client Component with direct SDK calls (fingerprint!) and Server Actions only for `getAuthProviders`/`logout`. Fields are dynamic from the Forms API, correct structure of `authData`, token synchronization.

For the user profile page, use the skill **`/create-profile`** — fields from the Users API, data updating, handling token race condition.

For the order list page, use the skill **`/create-orders-list`** — loading through all storages, cancellation, repeat, client-side pagination.

For the language switcher, use the skill **`/create-locale-switcher`** — loads locales via `getLocales()`, builds links to the current page with a different locale segment.

For the search bar, use the skill **`/create-search`** — debounce 300ms, Server Action, dropdown of results.

## Creating Pages with Content from CMS

To create Next.js pages with data from OneEntry, use the skill **`/create-page`** — it will create a page file with `getPageByUrl`, `getBlocksByPageUrl`, and correct handling of `isError`.

Rules for working with pages, langCode, and `params` (Next.js 15+): `.claude/rules/nextjs-pages.md`.
