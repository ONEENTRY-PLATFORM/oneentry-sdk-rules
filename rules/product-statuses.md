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

⚠️ Status markers are set in the **project admin panel** and are unique for each project.
**Do not hardcode** specific markers — get them via `getProductStatuses()` or `/inspect-api product-statuses`.

## Example: list of products with statuses

```typescript
const statuses = await getApi().ProductStatuses.getProductStatuses(locale)
const statusMap = Object.fromEntries(statuses.map(s => [s.identifier, s.localizeInfos?.title ?? s.identifier]))

// In the component:
statusMap[product.statusIdentifier ?? ''] ?? product.statusIdentifier
```
