<!-- META
type: rules
fileName: server-actions.md
rulePaths: ["app/actions/**/*.ts"]
-->

# Server Actions — OneEntry Rules

## When to Use Server Actions

Server Actions are **one of the patterns**, not the only way to call the SDK. The choice depends on the type of operation:

| Operation | Recommended Approach | Reason |
| --- | --- | --- |
| Public data (Pages, Products, Menus) | Server Component directly / Server Action / Client Component | Depends on rendering strategy (SSR/SSG/CSR) |
| Authorization (auth, signUp, generateCode) | **Client Component directly** | ⚠️ The SDK passes the device fingerprint — on the client, the fingerprint is unique for each user device |
| User data (Orders, Users) | Client Component via `getApi()` after `reDefine()` | The token is managed by `saveFunction` automatically |
| Mutations (form submissions, order creation) | Server Action | Server-side validation |

## Mandatory (for Server Actions)

- Directive `'use server'` at the beginning of the file
- **Only `async function` exports** — Next.js prohibits exporting constants, types, and regular functions from `'use server'` files. Move them to a separate file (e.g., `src/lib/constants.ts`)

```typescript
// ❌ INCORRECT — error: Only async functions are allowed to be exported
'use server';
export const PAGE_SIZE = 10;

// ✅ CORRECT — constant in a separate file
// src/lib/constants.ts
export const PAGE_SIZE = 10;

// src/app/actions/products.ts
'use server';
import { PAGE_SIZE } from '@/lib/constants';
export async function loadProducts(...) { ... }
```

- Always check the result via `isError(result)`
- Return `{ error: string; statusCode?: number }` on error (needed for retry logic on the client)

## Public Methods (Forms, Pages, Products, Menus, Blocks)

> These methods can be called both from Server Component directly and from Client Component. Server Action is a convenient proxy but not mandatory.

```typescript
import { getApi, isError } from '@/lib/oneentry';

export async function myAction(...) {
  const result = await getApi().SomeModule.someMethod(...);
  if (isError(result)) return { error: result.message, statusCode: result.statusCode };
  return result;
}
```

## ⚠️ AuthProvider — NOT via Server Action

Methods `auth`, `signUp`, `generateCode`, `checkCode` **should be called directly from Client Component** — the SDK passes the device fingerprint. On the server, `deviceInfo.browser` will be `"Node.js/..."` instead of the user's actual browser.

```typescript
// ❌ INCORRECT — auth in Server Action
'use server';
export async function signIn(authData) {
  return await getApi().AuthProvider.auth('email', { authData }); // browser in fingerprint = Node.js
}

// ✅ CORRECT — auth from Client Component
'use client';
import { getApi, isError } from '@/lib/oneentry';
const result = await getApi().AuthProvider.auth('email', { authData }); // fingerprint = browser
```

> Detailed rules: `.claude/rules/auth-provider.md`

## User-authorized Methods (Orders, Users, Payments, Events)

Call **directly from Client Component** via `getApi()` — after `reDefine(refreshToken, locale)` has been called (usually in AuthContext during initialization):

```typescript
'use client';
import { getApi, isError } from '@/lib/oneentry';

// ✅ Direct call from client — token is already set up via reDefine()
const user = await getApi().Users.getUser();
if (isError(user)) return;

const orders = await getApi().Orders.getAllOrdersByMarker('storage');
```

## Methods and Their Recommended Approaches

| Methods | Approach | Type |
| --- | --- | --- |
| AuthProvider (auth, signUp, generateCode, checkCode) | **Client Component directly** | `getApi()` on the client |
| AuthProvider (getAuthProviders, getAuthProviderByMarker) | Server Component / Server Action / Client | `getApi()` |
| Pages, Products, Menus, Blocks | Server Component / Server Action / Client | `getApi()` |
| Forms (getFormByMarker) | Server Component / Server Action / Client | `getApi()` |
| FormData (postFormsData) | Server Action or Client Component | `getApi()` |
| Orders, Users, Payments, Events | Client Component | `getApi()` after `reDefine()` |

## Server Component Wrappers — An Alternative to Server Actions for Read Operations

For read operations in Server Components, it is more convenient to create regular async functions (not Server Actions) that return a standard response shape. This allows using Next.js cache and avoids the overhead of `'use server'`.

```typescript
// app/api/server/products/getProducts.ts — NOT a Server Action, just an async function
import { getApi, isError } from '@/lib/oneentry'
import type { IFilterParams } from 'oneentry/dist/products/productsInterfaces'

export const getProducts = async (filters?: IFilterParams[]) => {
  const data = await getApi().Products.getProducts(filters)
  if (isError(data)) return { isError: true, error: data, items: [], total: 0 }
  return { isError: false, items: data.items, total: data.total }
}

// Usage in Server Component (direct call, without 'use server'):
const { items, total, isError: hasError } = await getProducts(filters)
```

**When to Use Server Action vs. Wrapper:**

| Criterion              | Server Action `'use server'` | Server Component Wrapper |
|-----------------------|------------------------------|--------------------------|
| Who calls it          | Client Components, browser   | Only Server Components |
| Next.js cache         | Not cached                   | Works with `cache()`     |
| User auth             | Not applicable (client only) | Only public data        |
| Mutations             | Yes                          | No                       |

## Direct SDK Call from Client Component

The SDK is available on the client thanks to `NEXT_PUBLIC_*` environment variables. Acceptable cases:

- **Authorization** — must be on the client (fingerprint)
- **Dynamic data** — searching, filtering, loading based on user action
- **CSR strategy** — when SSR is not needed

```tsx
'use client';
import { getApi, isError } from '@/lib/oneentry';

// Search — client call
async function handleSearch(query: string) {
  const results = await getApi().Products.searchProducts({ name: query });
  if (isError(results)) return [];
  return results;
}
```
