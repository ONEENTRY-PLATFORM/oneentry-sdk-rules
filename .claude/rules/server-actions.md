<!-- META
type: rules
fileName: server-actions.md
rulePaths: ["app/actions/**/*.ts"]
-->

# Server Actions — OneEntry Rules

## When to use Server Actions

Server Actions are **one of the patterns**, not the only way to call the SDK. The choice depends on the operation type:

| Operation | Recommended approach | Reason |
| --- | --- | --- |
| Public data (Pages, Products, Menus) | Server Component directly / Server Action / Client Component | Depends on rendering strategy (SSR/SSG/CSR) |
| Authentication (auth, signUp, generateCode) | **Client Component directly** | ⚠️ SDK transmits device fingerprint — on the client it's unique to the user's device |
| User data (Orders, Users) | Server Action with `makeUserApi()` | Token security, server-side logic |
| Mutations (form submission, order creation) | Server Action | Server-side validation |

## Required (for Server Actions)

- `'use server'` directive at the top of the file
- **Only `async function` exports** — Next.js forbids exporting constants, types, and regular functions from `'use server'` files. Move them to a separate file (e.g. `src/lib/constants.ts`)

```typescript
// ❌ WRONG — error: Only async functions are allowed to be exported
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

## Public methods (Forms, Pages, Products, Menus, Blocks)

> These methods can be called from Server Components directly, Client Components, or Server Actions. A Server Action is a convenient proxy, but not required.

```typescript
import { getApi, isError } from '@/lib/oneentry';

export async function myAction(...) {
  const result = await getApi().SomeModule.someMethod(...);
  if (isError(result)) return { error: result.message, statusCode: result.statusCode };
  return result;
}
```

## ⚠️ AuthProvider — NOT via Server Action

Methods `auth`, `signUp`, `generateCode`, `checkCode` **must be called from Client Component directly** — the SDK transmits device fingerprint. On the server `deviceInfo.browser` will be `"Node.js/..."` instead of the real user's browser.

```typescript
// ❌ WRONG — auth in Server Action
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

## User-authorized methods (Orders, Users, Payments, etc.)

```typescript
import { makeUserApi, isError } from '@/lib/oneentry';

// ⚠️ ONE makeUserApi for all calls in the function!
// Each call burns refreshToken via /refresh → second call → 401
export async function myUserAction(refreshToken: string, ...) {
  const { api, getNewToken } = makeUserApi(refreshToken);

  const result = await api.Users.getUser();
  if (isError(result)) return { error: result.message, statusCode: result.statusCode };

  // If a second call is needed — use the same api, don't create a new makeUserApi!
  const orders = await api.Orders.getAllOrdersByMarker('storage');
  if (isError(orders)) return { error: orders.message, statusCode: orders.statusCode };

  return { ...result, newToken: getNewToken() }; // ← always return the new token!
}
```

## Methods and their recommended approaches

| Methods | Approach | Type |
| --- | --- | --- |
| AuthProvider (auth, signUp, generateCode, checkCode) | **Client Component directly** | `getApi()` on client |
| AuthProvider (getAuthProviders, getAuthProviderByMarker) | Server Component / Server Action / Client | `getApi()` |
| Pages, Products, Menus, Blocks | Server Component / Server Action / Client | `getApi()` |
| Forms (getFormByMarker) | Server Component / Server Action / Client | `getApi()` |
| FormData (postFormsData) | Server Action or Client Component | `getApi()` |
| Orders, Users, Payments, Events | Server Action | `makeUserApi()` |

## Direct SDK call from Client Component

The SDK is available on the client thanks to `NEXT_PUBLIC_*` environment variables. Valid use cases:

- **Authentication** — must be on the client (fingerprint)
- **Dynamic data** — search, filtering, loading on user action
- **CSR strategy** — when SSR is not needed

```tsx
'use client';
import { getApi, isError } from '@/lib/oneentry';

// Search — client-side call
async function handleSearch(query: string) {
  const results = await getApi().Products.searchProducts({ name: query });
  if (isError(results)) return [];
  return results;
}
```
