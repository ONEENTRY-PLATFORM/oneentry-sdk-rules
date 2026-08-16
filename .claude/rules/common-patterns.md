# General SDK Usage Patterns

## Working with Markers

```typescript
// By ID — single product
const product = await getApi().Products.getProductById(123)
// By category page URL — list of products (IProductsResponse)
const catalog = await getApi().Products.getProductsByPageUrl('sneakers')
```

## Localization

`langCode?: string` — default `"en_US"`. Pass explicitly only in multilingual applications.

```typescript
const productEN = await getApi().Products.getProductById(123, 'en_US')
const productRU = await getApi().Products.getProductById(123, 'ru_RU')
```

## Pagination

`offset?: number` (default `0`), `limit?: number` (default `30`).

```typescript
const page1 = await getApi().Products.getProducts([], undefined, { offset: 0, limit: 20 })
const page2 = await getApi().Products.getProducts([], undefined, { offset: 20, limit: 20 })
```

## Filtering (`IFilterParams[]`)

```typescript
interface IFilterParams {
  attributeMarker: string                 // attribute name
  conditionMarker: string                 // "eq", "neq", "mth", "lth", "in", "nin", "exs", "nexs"
                                          // + with v1.0.161: "pat" (by pattern), "same" (exact value), "same_part" (exact part of value)
  conditionValue: number | string | null
}

// Price 100-500
const filters: IFilterParams[] = [
  { attributeMarker: "price", conditionMarker: "mth", conditionValue: 100 },
  { attributeMarker: "price", conditionMarker: "lth", conditionValue: 500 }
]
// filters — first positional argument (body)
const products = await getApi().Products.getProducts(filters)
```

## SSR/SSG Strategies (Next.js)

```tsx
// SSG — static generation
export async function generateStaticParams() {
  const products = await getApi().Products.getProducts([], undefined, { limit: 100 })
  if (isError(products)) return []
  return products.items.map(p => ({ id: String(p.id) }))
}

// ISR — incremental regeneration
export const revalidate = 3600 // 1 hour

// force-dynamic — disable SSG (only for cart/profile/orders)
export const dynamic = 'force-dynamic'
```

> Full rules for caching/streaming/parallelism: `.claude/rules/performance.md` + family of performance-* rules.

## user.state — Storage for Arbitrary User Data

`user.state` — an object of arbitrary form in `IUserEntity` for client data: cart, favorites, settings, viewing history.

**Critical Rules:**

1. **Always spread** `{ ...user.state, newField }` — do not overwrite other fields.
2. **`formIdentifier`** is taken from `user.formIdentifier` — do not hardcode.
3. **Call from client** via `getApi()` after `reDefine()` — token is managed by `saveFunction`.
4. **Before each write — fresh `getUser()`.** The cached object between read and write may be outdated (another code may have changed `cart`/`favorites`).

```typescript
// src/lib/userState.ts
import { getApi, isError } from '@/lib/oneentry';
import type { IUserEntity } from 'oneentry';

export async function getUserState() {
  const user = (await getApi().Users.getUser()) as IUserEntity;
  if (isError(user)) return { error: (user as any).message };
  return {
    cart: (user.state?.cart as Record<number, number>) || {},
    favorites: (user.state?.favorites as number[]) || [],
  };
}

// ✅ Fresh getUser → updateUser in one flow
export async function updateUserState(data: { cart?: Record<number, number>; favorites?: number[] }) {
  const user = (await getApi().Users.getUser()) as IUserEntity;
  if (isError(user)) return;
  await getApi().Users.updateUser({
    formIdentifier: user.formIdentifier,
    state: { ...user.state, ...data }, // spreading the current state
  });
}
```

**Typical State Structure:**

```typescript
user.state = {
  cart: { 42: 2, 17: 1 },      // { productId: quantity }
  favorites: [42, 17, 88],     // array of productId
  // any other fields
}
```

**Synchronization after login:** `getUserState()` from client after `reDefine()`. For local storage without server synchronization — `/create-cart-manager` and `/create-favorites`.

### Versioning for Single Initialization of Redux from Server State

Without the `version` flag, the effect will overwrite Redux on each re-render, destroying local user changes. The pattern (shown for one field — similarly for others):

```typescript
const [cartVersion, setCartVersion] = useState(0)

useEffect(() => {
  if (!user?.state.cart || cartVersion > 0) return // already initialized
  // cart — object { productId: quantity }, so we iterate over entries
  Object.entries(user.state.cart).forEach(([productId, quantity]: [string, any]) =>
    dispatch(addToCart({ productId: Number(productId), quantity }))
  )
  setCartVersion(1) // no longer reload from server
}, [user, cartVersion])

// Synchronization Redux → server only after initialization
useEffect(() => {
  if (!isAuth) return
  if (cartVersion === 0 && favoritesVersion === 0) return
  updateUserState({ cart: productsInCart, favorites: favoritesIds })
  // DO NOT pass user as a parameter — updateUserState itself gets fresh data
}, [isAuth, productsInCart, favoritesIds])
```

## RTK Query for Caching Read Requests

Use when the same data is needed by multiple Client Components (automatic deduplication + cache).

| Scenario | Approach |
| --- | --- |
| Server Component, one-time request | Direct `getApi()` |
| One Client Component, one-time request | Direct `getApi()` |
| Multiple Client Components read the same data | RTK Query (deduplication) |
| Polling (updating user state in real-time) | RTK Query with `pollingInterval` |

```typescript
// src/app/api/RTKApi.ts — skeleton
import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react'

export const oneEntryApi = createApi({
  reducerPath: 'oneEntryApi',
  baseQuery: fakeBaseQuery(),
  endpoints: (build) => ({
    getBlockByMarker: build.query<IBlockEntity, { marker: string; lang: string }>({
      queryFn: async ({ marker, lang }) => {
        const result = await getApi().Blocks.getBlockByMarker(marker, lang)
        if (isError(result)) return { error: result }
        return { data: result as IBlockEntity }
      },
    }),
    getMe: build.query<IUserEntity, void>({
      queryFn: async () => {
        const result = await getApi().Users.getUser()
        if (isError(result)) return { error: result }
        return { data: result as IUserEntity }
      },
    }),
  }),
})
```

**Polling for auth state** (poll only when `isAuth`):

```typescript
const { data: freshUser } = useGetMeQuery(undefined, {
  skip: !isAuth,
  pollingInterval: isAuth ? 3000 : 0,
})
```

> Full rules (skip patterns, `keepUnusedDataFor` by resource type, `pollingInterval ≥ 30 s`, when **not** to use RTK Query, optimistic updates): `.claude/rules/performance-rtk.md`.

## Parallel Requests

```typescript
async function loadPageData(productId: number) {
  const [product, relatedProducts, reviews] = await Promise.all([
    getApi().Products.getProductById(productId),
    getApi().Products.getRelatedProductsById(productId),
    // 2nd argument — formModuleConfigId; binding to product — via body (entityIdentifier)
    getApi().FormData.getFormsDataByMarker("reviews", 2, { entityIdentifier: productId }, 1)
  ])
  if (isError(product)) throw new Error("Product not found")
  return {
    product,
    // getRelatedProductsById → IProductsResponse; getFormsDataByMarker → { items, total }
    relatedProducts: isError(relatedProducts) ? [] : relatedProducts.items,
    reviews: isError(reviews) ? [] : reviews.items
  }
}
```
