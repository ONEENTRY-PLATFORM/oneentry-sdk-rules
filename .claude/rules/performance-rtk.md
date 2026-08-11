---
paths:
  - "**/RTKApi.ts"
  - "**/RTKApi.tsx"
  - "store/**/*.ts"
  - "src/store/**/*.ts"
  - "app/store/**/*.ts"
  - "src/app/store/**/*.ts"
  - "components/**/*.tsx"
  - "src/components/**/*.tsx"
---
# Performance: RTK Query — OneEntry Rules

Rules for OneEntry-based applications using Redux Toolkit Query as a client-side caching layer. Covers polling, deduplication, `skip` patterns, and tuning `keepUnusedDataFor` to prevent OneEntry endpoints from overwhelming the network on every mount.

Applicable to projects using `@reduxjs/toolkit/query/react` with `createApi` + `fakeBaseQuery()` on top of the OneEntry SDK.

## ⚠️ `pollingInterval` ≥ 30 seconds

A `pollingInterval` of a few seconds on each logged-in tab = dozens of round-trips to OneEntry per minute per user. Almost never justified.

```typescript
// ❌ INCORRECT — polling 3s = ~20 requests/min/tab just for `getMe`
const [trigger] = useLazyGetMeQuery({ pollingInterval: isAuth ? 3000 : 0 });

// ✅ CORRECT — 60s is more than enough for keepalive session probing
const [trigger] = useLazyGetMeQuery({ pollingInterval: isAuth ? 60000 : 0 });
```

**Recommendations:**

| Scenario | Recommended Interval |
| --- | --- |
| Keepalive session (`getMe`, token probing) | `60000` (1 min) or more |
| Order status during checkout | `5000–10000` (only during active step) |
| Overall data freshness | Do not poll — use `refetchOnFocus` / `refetchOnReconnect` |
| Real-time (chat, notifications) | Use Events API / WebSocket instead of polling |

If polling seems necessary, first ask yourself: will `refetchOnFocus: true` on the root API solve the same problem more cheaply?

## RTK Query deduplicates itself — do not interfere

`useGetAuthProvidersQuery('')`, called from 3 different mounted components, makes **one** network request — the cache key (`'getAuthProviders' + serialized arg`) is shared. Three subscribers, one fetch.

```tsx
// ❌ INCORRECT — manual "avoid duplicate" logic in components
const ComponentA = () => {
  const dispatch = useAppDispatch();
  useEffect(() => {
    if (!alreadyFetched) dispatch(RTKApi.endpoints.getAuthProviders.initiate(''));
  }, []);
  // …
};

// ✅ CORRECT — just call the hook; dedup is handled by RTK Query
const ComponentA = () => {
  const { data } = useGetAuthProvidersQuery('');
  // …
};

const ComponentB = () => {
  const { data } = useGetAuthProvidersQuery('');   // same cache entry, no extra fetch
  // …
};
```

**Important:** deduplication only works with **deep equality** of arguments. `useGetX({ id: 1 })` and `useGetX({ id: 1, extra: undefined })` may yield different cache keys depending on the RTK version — pass minimal canonical argument objects.

## ⚠️ `skip` requests until they are needed

`useGet*Query` makes a request **on mount** by default. Components that mount eagerly (popups, always present in the DOM, subscriptions in the header) should gate the request via `skip` until the data is actually needed.

```tsx
// ❌ INCORRECT — `getMe` triggers on every page load, even for guests
const NavItemProfile = () => {
  const { isAuth } = useContext(AuthContext);
  const { data: menu } = useGetMenuByMarkerQuery({ marker: 'user_menu' });
  // …
};

// ✅ CORRECT — skip until authorized
const NavItemProfile = () => {
  const { isAuth } = useContext(AuthContext);
  const { data: menu } = useGetMenuByMarkerQuery(
    { marker: 'user_menu' },
    { skip: !isAuth }
  );
  // …
};

// ✅ CORRECT — skip for the popup while it is closed
const CartPopup = () => {
  const isOpen = open && component === 'CartPopup';
  const cartIds = useAppSelector(selectCartIds);
  const { data } = useGetProductsByIdsQuery(
    { ids: cartIds },
    { skip: !isOpen || cartIds.length === 0 }
  );
  // …
};
```

### `skip` Combinations Cheat Sheet

| Component State | `skip` Expression |
| --- | --- |
| Renders inside a popup | `!isOpen` |
| Authorization needed | `!isAuth` |
| ID needed from URL / store | `!id` (or `!id || id <= 0`) |
| Called after another request | `!previousQuery.data` |
| Both | `!isOpen || !isAuth` |

## ⚠️ Do not use RTK Query for data needed only during SSR

RTK Query lives in the Redux store on the client. Calling from a Server Component hydrates the store on the first render — each visitor refetches data on mount, even if SSR has already delivered HTML.

```tsx
// ❌ INCORRECT — server component with RTK Query
// src/app/page.tsx
const Page = async () => {
  const { data } = useGetProductsQuery({ … });   // hook won't even run on the server
};

// ✅ CORRECT — server fetcher with React `cache()` + `unstable_cache`
// src/app/api/server/products/getProducts.ts
import { unstable_cache } from 'next/cache';
import { cache } from 'react';

const impl = unstable_cache(
  async (…) => { … },
  ['oneentry-getProducts'],
  { revalidate: 60, tags: ['oneentry', 'oneentry-products'] }
);
export const getProducts = cache(async (…) => impl(…));

// src/app/page.tsx
import { getProducts } from '@/app/api/server/products/getProducts';
const Page = async () => {
  const data = await getProducts(…);
  // …
};
```

> See the full pattern `unstable_cache + cache()` in `.claude/rules/performance.md`.

RTK Query is for client data that is loaded after user interaction (opening a popup, switching a filter, searching as you type), with `isLoading` / `isError` rendered in the UI.

## `keepUnusedDataFor` — configure for data volatility

Defaults to 60 seconds. Long-lived data (menus, attribute sets, authentication providers) benefit from a longer TTL — when a subscriber is unmounted and remounted within the window, hitting the cache is free.

```typescript
// RTKApi.ts
export const RTKApi = createApi({
  reducerPath: 'api',
  baseQuery: fakeBaseQuery(),
  keepUnusedDataFor: 300,                              // global default — 5 min
  tagTypes: ['Products', 'Pages', 'Blocks', 'Forms', 'Orders', 'User', …],
  endpoints: (build) => ({
    getAuthProviders: build.query<…, string>({
      queryFn: async () => { … },
      keepUnusedDataFor: 3600,                         // 1 hr — authentication providers change rarely
    }),
    getMenuByMarker: build.query<…, { marker: string }>({
      queryFn: async ({ marker }) => { … },
      keepUnusedDataFor: 600,                          // 10 min
    }),
    getProducts: build.query<…, { … }>({
      queryFn: async (args) => { … },
      providesTags: ['Products'],
      keepUnusedDataFor: 300,                          // 5 min — listings change more frequently
    }),
    getMe: build.query<…, string>({
      queryFn: async () => { … },
      providesTags: ['User'],
      keepUnusedDataFor: 60,                           // 1 min — user state may have changed
    }),
  }),
});
```

### TTL by Resource Family

| Resource | `keepUnusedDataFor` |
| --- | --- |
| AuthProviders, locales, attribute sets | `3600` (1 hr) |
| Menus, pages, forms (`getFormByMarker`) | `600` (10 min) |
| Products, blocks, listings | `300` (5 min) |
| User profile, orders, sessions | `60` (1 min) |
| Payment sessions, order updates | `60` or less |

## `tagTypes` + `providesTags` / `invalidatesTags`

Every query that returns data that the user can change via another query must declare `providesTags`. Every mutation that changes this data must declare `invalidatesTags`. RTK Query will automatically refetch affected queries.

```typescript
// ❌ INCORRECT — order list remains stale after creating a new order
createOrder: build.mutation<Order, OrderInput>({
  queryFn: async (body) => { … },
}),

getOrders: build.query<Order[], void>({
  queryFn: async () => { … },
}),

// ✅ CORRECT — createOrder invalidates the order list
createOrder: build.mutation<Order, OrderInput>({
  queryFn: async (body) => { … },
  invalidatesTags: ['Orders'],
}),

getOrders: build.query<Order[], void>({
  queryFn: async () => { … },
  providesTags: ['Orders'],
}),
```

**Granular tags** for invalidation by specific id:

```typescript
getOrderById: build.query<Order, { id: number }>({
  queryFn: async ({ id }) => { … },
  providesTags: (_result, _err, { id }) => [{ type: 'Orders', id }],
}),

updateOrder: build.mutation<Order, { id: number; body: OrderUpdate }>({
  queryFn: async ({ id, body }) => { … },
  invalidatesTags: (_result, _err, { id }) => [{ type: 'Orders', id }],   // only this order will be refetched
}),
```

## Mutations with `onQueryStarted` for optimistic updates

For UI elements where a round-trip would feel like lag (cart quantity, favorite toggle), use optimistic updates instead of waiting for the server response.

```typescript
toggleFavorite: build.mutation<void, { productId: number; favorite: boolean }>({
  queryFn: async ({ productId, favorite }) => { … },
  async onQueryStarted({ productId, favorite }, { dispatch, queryFulfilled }) {
    const patch = dispatch(
      RTKApi.util.updateQueryData('getFavorites', undefined, (draft) => {
        if (favorite) draft.push(productId);
        else draft.splice(draft.findIndex((id) => id === productId), 1);
      })
    );
    try {
      await queryFulfilled;
    } catch {
      patch.undo();   // rollback on error
    }
  },
}),
```

## Anti-patterns

- **`pollingInterval: 1000` for "live" data** — use Events API subscriptions instead of polling.
- **`refetchOnMountOrArgChange: true` on every query** — devalues `keepUnusedDataFor`. Apply only when data staleness is more important than network costs.
- **Duplicating RTK Query state in local component state** — rerenders on every fetch, breaks deduplication. Read directly from the hook.
- **Calling `dispatch(endpoints.x.initiate(...))` in `useEffect`** — use the hook (`useGet*Query`). Manual `initiate` bypasses React's subscription tracking and leads to subscription leaks.
- **Multiple instances of `createApi`** — each has its own cache. Combine into a single `RTKApi`.

## Checklist Before Commit

- [ ] All `pollingInterval` values ≥ 30,000 ms (shorter ones justified with a comment).
- [ ] Every eagerly mounting query has the option `{ skip: <gate> }`.
- [ ] No RTK Query hooks in Server Components — server data goes through fetchers with `unstable_cache + cache()`.
- [ ] Endpoints declare `keepUnusedDataFor`, configured for resource volatility (defaults for OneEntry rarely fit).
- [ ] Mutations declare `invalidatesTags`; queries declare `providesTags` for any data that these mutations change.
- [ ] Optimistic updates (`onQueryStarted` + `updateQueryData` + `patch.undo()`) are used for cart / favorites / similar UI sensitive to latency.

> Related rules: `.claude/rules/performance.md` (server caching via `unstable_cache`), `.claude/rules/performance-popups.md` (skip requests inside closed popups), `.claude/rules/tokens.md` (`reDefine` + auth flow RTK Query).
