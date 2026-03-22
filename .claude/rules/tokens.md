<!-- META
type: rules
fileName: tokens.md
rulePaths: ["app/actions/**/*.ts","components/**/*.tsx"]
paths:
  - "app/actions/**/*.ts"
  - "components/**/*.tsx"
-->

# Authorization Tokens — OneEntry Rules

## saveFunction — automatic saving of refreshToken

`saveFunction` in the SDK config is a passive callback that the SDK automatically calls on each token rotation via `/refresh`. It allows you not to manually track token updates.

```typescript
// lib/oneentry.ts
const saveFunction = async (refreshToken: string) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('refresh-token', refreshToken)
  }
}

defineOneEntry(url, {
  token: appToken,
  auth: { saveFunction }, // ← SDK calls this on each /refresh
})
```

Thanks to `saveFunction`, the token is always up-to-date in `localStorage` — there is no need to return `newToken` from functions manually.

## Token Storage (Client)

```typescript
// After successful login (key with a hyphen!)
localStorage.setItem('refresh-token', result.refreshToken)

// After logout
localStorage.removeItem('refresh-token')
```

> `saveFunction` automatically updates `'refresh-token'` on each rotation — manual saving is only needed after the first login.

## reDefine — initializing user-auth session

In AuthContext during initialization: read `'refresh-token'` from localStorage, check `hasActiveSession`, call `reDefine`. Then all `getApi().Users.*`, `getApi().Orders.*`, etc. work automatically.

`reDefine` performs an eager refresh internally (calls `/refresh` immediately after creating the instance) so that the SDK has an access token before the first API call. The provider marker is taken from `localStorage.getItem('authProviderMarker')` — **must be saved upon login:**

```typescript
localStorage.setItem('authProviderMarker', AUTH_PROVIDER); // save in AuthForm after auth()
```

**`hasActiveSession` and `syncTokens` — must be exported from `lib/oneentry.ts`:**

```typescript
// lib/oneentry.ts
// ⚠️ CRITICAL: apiInstance — this is IDefineApi = { AuthProvider, Users, ... }
// It does NOT have a .state property! Check via apiInstance.AuthProvider.state
export function hasActiveSession(): boolean {
  const authProvider = apiInstance.AuthProvider as unknown as { state?: { accessToken?: string } };
  return !!authProvider?.state?.accessToken;
}

// Synchronizes both tokens directly in the current instance
// Use in login() instead of reDefine() — avoids 401 on the first request
export function syncTokens(accessToken: string, refreshToken: string): void {
  apiInstance.AuthProvider.setAccessToken(accessToken);
  apiInstance.AuthProvider.setRefreshToken(refreshToken);
}
```

> ❌ `(apiInstance as any).state?.accessToken` — always `undefined`, the SDK does not have `.state` at the top level!

**`syncTokens` in `login()` — mandatory pattern:**

```typescript
// ✅ CORRECT — in AuthContext login()
// Instead of hasActiveSession() + reDefine() use syncTokens
// Tokens are taken from the response of auth() / oauth() and immediately set in the current instance
const login = async (token: { accessToken: string; refreshToken: string }) => {
  localStorage.setItem('refresh-token', token.refreshToken)
  syncTokens(token.accessToken, token.refreshToken)  // ← without 401
  setIsAuth(true)
  await fetchUser()
}

// ❌ INCORRECT — reDefine() creates a new instance without accessToken
// → fetchUser() → GET /users/me → 401 → SDK retry → 200 (but 401 visible in devtools)
const login = async (token: ...) => {
  if (!hasActiveSession()) {
    await reDefine(token.refreshToken)  // new instance without accessToken!
  }
  await fetchUser()  // → 401 in the browser
}
```

**`reDefine` — only for initialization from localStorage on page load:**

```typescript
import { reDefine, hasActiveSession, syncTokens } from '@/lib/oneentry';

// useEffect on load — only here reDefine is needed
const refresh = localStorage.getItem('refresh-token')
if (!refresh) { setIsAuth(false); return }

if (!hasActiveSession()) {
  await reDefine(refresh)  // ← restoring session from localStorage
}
```

**Common mistake — using reDefine in login():**

```typescript
// ❌ INCORRECT — after auth() the SDK already has accessToken, reDefine resets it
if (!hasActiveSession()) {
  await reDefine(token.refreshToken) // creates a new instance without accessToken!
}
await fetchUser() // → 401

// ✅ CORRECT
syncTokens(token.accessToken, token.refreshToken)
await fetchUser() // → 200 immediately
```

## updateUserState — writing user.state to the server

After changing cart/favorites in Redux — synchronize with the server via Server Action:

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

> AuthContext calls `updateUserState` when `isAuth`, `user`, `productsInCart`, `favoritesIds` change.

## StrictMode — protection against double refresh

React StrictMode in dev runs `useEffect` twice. Two parallel calls to `reDefine` + the first API request → two `/refresh` → the second fails (refresh token is one-time) → logout.

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
    // ... loading data
  };
  init();
}, []);
```

## Race condition — logout only on confirmed 401/403

```typescript
// Client Component: logout only on confirmed auth error
const result = await getApi().Users.getUser()
if (isError(result) && (result as any).statusCode === 401) {
  localStorage.removeItem('refresh-token')
  window.dispatchEvent(new Event('auth-change'))
}
```
