<!-- META
type: rules
fileName: tokens.md
rulePaths: ["app/actions/**/*.ts","components/**/*.tsx"]
paths:
  - "app/actions/**/*.ts"
  - "components/**/*.tsx"
-->

# Auth tokens — OneEntry Rules

## saveFunction — automatic refreshToken storage

`saveFunction` in the SDK config is a passive callback that the SDK calls automatically on every token rotation via `/refresh`. Eliminates the need to manually track token updates.

```typescript
// lib/oneentry.ts
const saveFunction = async (refreshToken: string) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('refresh-token', refreshToken)
  }
}

defineOneEntry(url, {
  token: appToken,
  auth: { saveFunction }, // ← SDK calls this on every /refresh
})
```

Thanks to `saveFunction`, the token in `localStorage` is always up to date — no need to manually return `newToken` from functions.

## Token storage (Client)

```typescript
// After successful login (note the hyphen in the key!)
localStorage.setItem('refresh-token', result.refreshToken)

// After logout
localStorage.removeItem('refresh-token')
```

> `saveFunction` updates `'refresh-token'` automatically on every rotation — manual save is only needed after the first login.

## reDefine — initializing the user-auth session

In AuthContext during initialization: read `'refresh-token'` from localStorage, check `hasActiveSession`, call `reDefine`. After that, all `getApi().Users.*`, `getApi().Orders.*`, etc. work automatically.

`reDefine` does an eager refresh internally (calls `/refresh` immediately after creating the instance) so the SDK has an access token before the first API call. The provider marker comes from `localStorage.getItem('authProviderMarker')` — **must be saved at login:**

```typescript
localStorage.setItem('authProviderMarker', AUTH_PROVIDER); // save in AuthForm after auth()
```

**`hasActiveSession` — must be exported from `lib/oneentry.ts`:**

```typescript
// lib/oneentry.ts
export function hasActiveSession(): boolean {
  const authProvider = apiInstance.AuthProvider as unknown as { state?: { accessToken?: string } };
  return !!authProvider?.state?.accessToken;
}
```

**Usage in components:**

```typescript
import { reDefine, hasActiveSession } from '@/lib/oneentry';

// ⚠️ ALWAYS check hasActiveSession() before reDefine
// Otherwise you'll replace a working instance (post-login) with a new one without an access token
// → first API request returns 401 → removeItem('refresh-token') → logout
const refresh = localStorage.getItem('refresh-token')
if (!refresh) { setIsAuth(false); return }

if (!hasActiveSession()) {
  await reDefine(refresh, langCode)
}
```

**Common mistake — calling reDefine without the check:**

```typescript
// ❌ WRONG — after login SDK is already authorized, reDefine will break the session
const refresh = localStorage.getItem('refresh-token')
if (refresh) await reDefine(refresh, 'en_US') // burns the token!

// ✅ CORRECT
if (refresh && !hasActiveSession()) await reDefine(refresh, 'en_US')
```

## updateUserState — writing user.state to the server

After changing cart/favorites in Redux — sync with the server via a Server Action:

```typescript
// app/api/server/users/updateUserState.ts
'use server';

import { getApi } from '@/lib/oneentry';
import type { IUserEntity } from 'oneentry/dist/users/usersInterfaces';

export async function updateUserState({
  cart,
  favorites,
  user,
}: {
  cart: any[];
  favorites: number[];
  user: IUserEntity;
}) {
  await getApi().Users.updateUser({
    formIdentifier: user.formIdentifier,
    formData: user.formData as any,
    state: { ...user.state, cart, favorites },
  });
}
```

> AuthContext calls `updateUserState` when `isAuth`, `user`, `productsInCart`, or `favoritesIds` change.

## StrictMode — protection against double refresh

React StrictMode in dev runs `useEffect` twice. Two parallel `reDefine` calls + first API request → two `/refresh` calls → the second one fails (refresh token is one-time) → logout.

**Always add a `useRef` guard in components with auth-init:**

```typescript
const initRef = useRef(false);

useEffect(() => {
  if (initRef.current) return;  // StrictMode guard
  initRef.current = true;

  const init = async () => {
    const refresh = localStorage.getItem('refresh-token');
    if (refresh && !hasActiveSession()) {
      await reDefine(refresh, 'en_US');
    }
    // ... load data
  };
  init();
}, []);
```

## Race condition — logout only on confirmed 401/403

```typescript
// Client Component: logout only on a confirmed auth error
const result = await getApi().Users.getUser()
if (isError(result) && (result as any).statusCode === 401) {
  localStorage.removeItem('refresh-token')
  window.dispatchEvent(new Event('auth-change'))
}
```
