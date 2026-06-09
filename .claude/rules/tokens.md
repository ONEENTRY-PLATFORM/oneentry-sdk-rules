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
  auth: { saveFunction }, // ← SDK calls this on every /refresh
})
```

Thanks to `saveFunction`, the token is always up to date in `localStorage` — there is no need to return `newToken` from functions manually.

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

`reDefine` does **not** refresh when creating an instance — it only puts `refreshToken` in state. The SDK proactively gets the access token **before the first** user-auth request (SDK ≥ 1.0.152): if there is a `refreshToken` in state but no `accessToken`, the SDK first calls `/refresh`, then sends the request. The result: `reDefine(refresh)` + first `getApi().Users.*` → clean `200` **without** a spurious `401` in the console. The provider marker is taken from `localStorage.getItem('authProviderMarker')` — **must be saved upon login:**

```typescript
localStorage.setItem('authProviderMarker', AUTH_PROVIDER); // save in AuthForm after auth()
```

**`hasActiveSession` and `syncTokens` must be exported from `lib/oneentry.ts`:**

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

**`syncTokens` in `login()` — a mandatory pattern:**

```typescript
// ✅ CORRECT — in AuthContext login()
// Instead of hasActiveSession() + reDefine() use syncTokens
// Tokens are taken from the auth() / oauth() response and immediately set in the current instance
const login = async (token: { accessToken: string; refreshToken: string }) => {
  localStorage.setItem('refresh-token', token.refreshToken)
  syncTokens(token.accessToken, token.refreshToken)  // ← ready accessToken, without unnecessary /refresh
  setIsAuth(true)
  await fetchUser()
}

// ⚠️ WORSE — reDefine() creates a new instance without accessToken
// → The SDK proactively will make an unnecessary /refresh and unnecessarily rotate the freshly issued
//   token. No spurious 401 anymore (≥ 1.0.152), but this is an extra round-trip.
const login = async (token: ...) => {
  if (!hasActiveSession()) {
    await reDefine(token.refreshToken)  // new instance without accessToken
  }
  await fetchUser()
}
```

**`reDefine` — only for initialization from localStorage when the page loads:**

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
// ⚠️ REDUNDANT — after auth() the SDK has already received accessToken; reDefine resets it
// and forces the SDK to go to /refresh again (extra request, rotation of the fresh token)
if (!hasActiveSession()) {
  await reDefine(token.refreshToken) // new instance without accessToken
}
await fetchUser() // 200 (after proactive /refresh — but it's not needed here)

// ✅ BETTER — reuse tokens from the auth() response, without unnecessary /refresh
syncTokens(token.accessToken, token.refreshToken)
await fetchUser() // → 200 immediately, without calling /refresh
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

> AuthContext calls `updateUserState` when changing `isAuth`, `user`, `productsInCart`, `favoritesIds`.

## StrictMode — protection against double refresh

React StrictMode in dev runs `useEffect` twice. **Important:** single-flight in the SDK (≥ 1.0.152) deduplicates simultaneous refreshes within *one* instance, but `reDefine` creates a **new** instance with its own state each time — two consecutive `reDefine` will lead to two independent `/refresh`, the second will fail (refresh token is one-time) → logout. Therefore, `useRef` guard is still mandatory.

**Always add `useRef` guard in components with auth-init:**

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

The SDK (≥ 1.0.152) deduplicates simultaneous refreshes within one instance (single-flight) — a race of parallel requests from one `getApi()` no longer burns the token. But between tabs/reloads (fresh context reads the token from localStorage), a race is still possible — hence the rule remains:

```typescript
// Client Component: logout only on confirmed auth error
const result = await getApi().Users.getUser()
if (isError(result) && (result as any).statusCode === 401) {
  localStorage.removeItem('refresh-token')
  window.dispatchEvent(new Event('auth-change'))
}
```

> Related rules:
>
> - `.claude/rules/performance-rtk.md` — `pollingInterval` for `getMe`, `reDefine` pattern within RTK Query auth flow, protection against race condition when updating the token with parallel RTK requests.
