<!-- META
type: rules
fileName: product-statuses.md
rulePaths: ["components/**/*.tsx","app/**/*.ts","app/**/*.tsx"]
paths:
  - "components/**/*.tsx"
  - "app/**/*.ts"
  - "app/**/*.tsx"
-->

# ProductStatuses — product statuses

## Status fields in IProductsEntity

```typescript
statusIdentifier: string | null;    // status marker, example: "in_stock"
statusLocalizeInfos: { title: string } | null;  // localized title
```

❌ `product.statusName` — **does not exist**. Not in types, Swagger, and real API.

## Correct access

```typescript
// Localized title for display
const statusLabel = product.statusLocalizeInfos?.title || ''

// Status check for logic
const inStock = product.statusIdentifier === 'in_stock'
```

## Get the list of statuses via SDK

```typescript
const statuses = await getApi().ProductStatuses.getProductStatuses(langCode)
// statuses[0].identifier — marker
// statuses[0].localizeInfos.title — title
```

⚠️ Status markers are set in the **project admin panel** and are unique to each project.
**Do not hardcode** specific markers — obtain them via `getProductStatuses()` or `/inspect-api product-statuses`.

## ⚠️ Filtering by status — ONLY through IFilterParams body, not IProductsQuery

The SDK sets `statusMarker` **both** in `IProductsQuery` (third argument of `Products.getProducts`), **and** in `IFilterParams` (records of the first argument — filter body). **The API only considers this field in the body.** In the query, it compiles without errors and is quietly ignored — the response still contains products of all statuses.

```ts
// ❌ DOES NOT FILTER — API ignores query.statusMarker
await api.Products.getProducts([], locale, { offset, limit, statusMarker: 'in_stock' })

// ✅ CORRECT — statusMarker in the IFilterParams record filters the entire request
await api.Products.getProducts(
  [{ attributeMarker: 'price', conditionMarker: 'mth', conditionValue: filters.minPrice - 0.01, statusMarker: 'in_stock' }],
  locale,
  { offset, limit },
)
```

`statusMarker` — global body modifier: place it in any one record, and it filters all records, regardless of other filter conditions. If the user enabled "only in stock" without other filters — the body must still contain at least one record, otherwise there is nowhere to attach `statusMarker`. Use a catch-all condition that matches all rows:

```ts
// ✅ Filter only by status (without price/color): catch-all to apply the status
body.push({ attributeMarker: 'price', conditionMarker: 'mth', conditionValue: -1, statusMarker: 'in_stock' })
```

**Check examples from skills before trusting them.** In some skills/examples, `query.statusMarker` is shown — this pattern is incorrect. Run a quick SDK call in `.claude/temp/` and count `statusIdentifier` in the response before applying the pattern.

## Example: list of products with statuses

```typescript
const statuses = await getApi().ProductStatuses.getProductStatuses(locale)
const statusMap = Object.fromEntries(statuses.map(s => [s.identifier, s.localizeInfos?.title ?? s.identifier]))

// In the component:
statusMap[product.statusIdentifier ?? ''] ?? product.statusIdentifier
```
