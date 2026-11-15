---
paths:
  - "components/**/*.tsx"
  - "src/components/**/*.tsx"
  - "app/**/*.ts"
  - "src/app/**/*.ts"
  - "app/**/*.tsx"
  - "src/app/**/*.tsx"
---
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

⚠️ Status markers are set in the **project admin panel** and are unique for each project.
**Do not hardcode** specific markers — obtain them via `getProductStatuses()` or `/inspect-api product-statuses`.

## ⚠️ validateMarker — "marker exists"

`ProductStatuses.validateMarker(marker)` returns `true` when a status with such a marker
**exists**, and `false` — when it does not, just as written in the JSDoc. Verified on js-sdk-tests
2026-10-30: `sold`/`sale` → `true`, `sold1` → `false`.

Platform builds before 2026-10-29 responded the other way around (`true` = marker is free, CMS-1069).
If the project is on an old build or the response is in doubt — check by list:

```typescript
// ✅ validateMarker — does the status exist?
const exists = await getApi().ProductStatuses.validateMarker('in_stock')

// ✅ Reliable on any platform build — by list
const statuses = await getApi().ProductStatuses.getProductStatuses(locale)
const existsInList = statuses.some(s => s.identifier === 'in_stock')
```

## ⚠️ Filtering by status — ONLY through IFilterParams body, not query

From v1.0.154 `statusMarker` **is no longer** included in the query type of listing methods: `getProducts` / `getProductsEmptyPage` / `getProductsByPageId` / `getProductsByPageUrl` accept `IProductsQueryBase` (`offset`, `limit`, `sortOrder`, `sortKey`, `signPrice`); `IProductsQuery` is just a deprecated alias of the same base. An object literal with `statusMarker` now gives a **TypeScript error** (excess property check). But this is just an additional safeguard: in pure JS or when passing query through an intermediate variable/casting TS, the extra field will pass — and the API still **silently ignores** it in the query. The status is filtered only by `statusMarker` in the `IFilterParams` record (body). In query types, `statusMarker` legally remains only in `getRelatedProductsById` (`IProductsRelatedQuery`) and `getProductsPriceByPageUrl` (`IProductsPriceQuery`) — there the endpoint actually supports it.

```ts
// ❌ DOES NOT FILTER — from 1.0.154 this is a TS error (statusMarker is not in IProductsQueryBase);
//    previously compiled and was silently ignored by the API
await api.Products.getProducts([], locale, { offset, limit, statusMarker: 'in_stock' })

// ✅ CORRECT — statusMarker in the IFilterParams record filters the entire request
await api.Products.getProducts(
  [{ attributeMarker: 'price', conditionMarker: 'mth', conditionValue: filters.minPrice - 0.01, statusMarker: 'in_stock' }],
  locale,
  { offset, limit },
)
```

`statusMarker` — a global body modifier: place it in any one record, and it filters all records, regardless of other filter conditions. If the user enabled "only in stock" without other filters — the body must still contain at least one record, otherwise there is nowhere to attach `statusMarker`. Use a catch-all condition that matches all rows:

```ts
// ✅ Filter only by status (without price/color): catch-all, so the status applies
body.push({ attributeMarker: 'price', conditionMarker: 'mth', conditionValue: -1, statusMarker: 'in_stock' })
```

**Check examples from skills before trusting them.** In old skills/examples, `query.statusMarker` is found — in types ≥ 1.0.154 it will not even compile, and in JS it silently does not filter. For JS cases, run a quick SDK call in `.claude/temp/` and count `statusIdentifier` in the response before applying the pattern.

## Example: list of products with statuses

```typescript
const statuses = await getApi().ProductStatuses.getProductStatuses(locale)
const statusMap = Object.fromEntries(statuses.map(s => [s.identifier, s.localizeInfos?.title ?? s.identifier]))

// In the component:
statusMap[product.statusIdentifier ?? ''] ?? product.statusIdentifier
```
