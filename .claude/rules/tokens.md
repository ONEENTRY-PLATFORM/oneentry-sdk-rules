---
paths:
  - "app/actions/**/*.ts"
  - "src/app/actions/**/*.ts"
  - "components/**/*.tsx"
  - "src/components/**/*.tsx"
---
# Authorization Tokens — OneEntry Rules

## How the SDK Works with Tokens (SDK ≥ 1.0.152)

- `defineOneEntry(url, config)` only places `config.auth.refreshToken` in state — **there is no `/refresh` request when creating an instance**.
- **Proactive refresh on the first request:** if there is a `refreshToken` in state, no `accessToken`, and `customAuth` is not enabled, then **before** sending the request, the SDK calls `POST /users/refresh`, places both tokens in state, calls `saveFunction`, sets `Authorization`, and removes `x-guest-id`. The result: the first user-auth request goes as a clean pair `POST /refresh 200 → 200` — **without a spurious `401` in the console**.
- The reactive path `401 → refresh → retry` is preserved **only** for access token expiration in the middle of a session. If the proactive refresh has already failed, the reactive one does not start — there will be no second knowingly dead `/refresh`.
- Refresh **single-flight**: parallel requests from one instance share one internal refresh and do not consume a one-time token. Deduplication covers only the internal mechanism — **explicit** parallel `AuthProvider.refresh` calls are not deduplicated.
- `customAuth: true` disables both proactive and reactive refresh — a mode of complete manual token management; it does not participate in automatic session initialization.
- **Device Binding:** The API binds the refresh token to the `x-device-metadata` header (fingerprint); the SDK sends it on every POST and on `/refresh`. With SDK ≥ 1.0.155, the string can be overridden: `config.deviceMetadata` in `defineOneEntry` or `setDeviceMetadata(str)` on any module (`''` — reset to computed fingerprint); the actually sent string is returned by `getDeviceMetadata()`.

## saveFunction — Automatic Saving of refreshToken

`saveFunction` in the SDK config is a passive callback that the SDK automatically calls on each token rotation via `/refresh`. It allows you not to manually track token updates.

```typescript
// src/lib/oneentry.ts
const saveFunction = async (refreshToken: string) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('refresh-token', refreshToken)
  }
}

defineOneEntry(url, {
  token: appToken,
  auth: { saveFunction }, // ← SDK calls this on each successful /refresh
})
```

Thanks to `saveFunction`, the token is always current in `localStorage` — there is no need to return `newToken` from functions manually. **Important:** `saveFunction` is called **only on successful** refresh — on failure, the SDK does not touch the storage (see "Clearing Dead Token").

## Token Storage (Client)

```typescript
// After auth() (email login) manual saving is NOT needed —
// auth() itself places both tokens in state and calls saveFunction.

// After oauth() — manually (oauth tokens are NOT saved in state and saveFunction is not called):
localStorage.setItem('refresh-token', result.refreshToken)

// After logout
localStorage.removeItem('refresh-token')
```

> Key — with a hyphen: `'refresh-token'`. Further, `saveFunction` updates it automatically on each rotation.

## reDefine — Session Initialization from localStorage

`reDefine(refreshToken, langCode?)` is `defineOneEntry(url, { ..., auth: { refreshToken, saveFunction } })`, where `saveFunction` is closed from the module `src/lib/oneentry.ts` (the second parameter of the wrapper — language, see CLAUDE.md, section "SDK Initialization"). It itself **does not** refresh — it only places `refreshToken` in state; the access token will be obtained proactively before the first request. Therefore, the initialization pattern: `reDefine(refresh)` + `getUser()`, catching the dead token by **envelope** (not by `catch`) and clearing it.

```typescript
import { clearTokens, isError, reDefine } from '@/lib/oneentry';

const initRef = useRef(false);

useEffect(() => {
  if (initRef.current) return; // StrictMode guard
  initRef.current = true;

  const init = async () => {
    const refresh =
      typeof window !== 'undefined'
        ? localStorage.getItem('refresh-token')
        : null;
    if (!refresh) {
      setIsLoading(false);
      return;
    }
    try {
      // The first request will make a proactive /refresh (without 401),
      // saveFunction will save the rotated token in localStorage.
      reDefine(refresh);
      const res = await getApi().Users.getUser();
      if (isError(res)) {
        // isShell: true (default) — SDK does NOT throw, the error comes in an envelope.
        if (res.statusCode === 401 || res.statusCode === 403) {
          clearTokens(); // dead refresh token — clear it, otherwise 400 on each load
        }
        return;
      }
      setUser(res);
    } catch {
      clearTokens();
    } finally {
      setIsLoading(false);
    }
  };
  init();
}, []);
```

The provider marker is passed through `auth.providerMarker` (default in SDK — `'email'`): proactive refresh builds the URL `/marker/{providerMarker}/users/refresh` precisely from it. Taking from `localStorage.getItem('authProviderMarker')` with a fallback to `'email'` — **must be saved upon login:**

```typescript
localStorage.setItem('authProviderMarker', AUTH_PROVIDER); // save in AuthForm after auth()
```

### Clearing Dead Token — Application's Responsibility

On refresh failure, the SDK simply returns an error envelope / `false`; `saveFunction` is called **only on success**. The stale token remains in `localStorage`, and on each load, the pair `POST /refresh (400)` + the original request (401 envelope) is repeated — until the application itself clears the storage.

`isShell: true` (default) → the SDK returns an envelope, and **does not throw** — `try/catch` will not catch the dead token. Clear by response code:

**`removeItem` is not enough.** The dead refresh token also remains in the state of the live instance — the SDK continues to proactively call `/refresh` until the page is reloaded. `clearTokens` must **recreate the instance** with one app token and remove the provider marker:

```typescript
// src/lib/oneentry.ts
export function clearTokens(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem('refresh-token');
    localStorage.removeItem('authProviderMarker'); // otherwise the next /refresh will go with a foreign marker
  } catch {
    /* private mode / quota — instance reset below will still work */
  }
  // ← crucial: an instance with a dead token in state will otherwise continue proactive /refresh
  if (isOneEntryEnabled) {
    apiInstance = createInstance({ langCode: currentLang });
  }
}

// in any auth-dependent fetch (init, fetchUser):
if (isError(res) && (res.statusCode === 401 || res.statusCode === 403)) {
  clearTokens();
}
```

> `localStorage` throws in private mode and when the quota is exceeded — wrap in `try/catch`, otherwise the session reset will drop itself. The full content of `src/lib/oneentry.ts` — `.claude/rules/sdk-init.md`.

### Alternative: Explicit `AuthProvider.refresh` on Initialization

`AuthProvider.refresh(marker, token)` itself places both `accessToken` **and** `refreshToken` in state and calls `saveFunction` — after it, neither `syncTokens` nor manual `localStorage.setItem` are needed. It provides more explicit detection of a dead token (`/refresh 400 → clearTokens`, `getUser` is not even called), but this is an optional approach, not a necessity.

**Trap:** explicit `refresh()` goes through the same request pipeline. If the instance is created **with** `auth.refreshToken` (as in `reDefine`) and the access token is still absent, before the explicit `POST /refresh`, the proactive internal refresh will trigger with the same token from state — the token is rotated, and the explicit request will go with an already burned token → `400`. The application will call `clearTokens()` on this 400 during an active session. The explicit pattern is safe **only** on an instance created without `auth.refreshToken` (then the proactive refresh does not trigger).

## login() — What to Do After auth() / oauth()

**After `auth()` nothing needs to be synchronized:** `AuthProvider.auth()` itself places both tokens in the state of the current instance and calls `saveFunction` — `syncTokens` and manual `localStorage.setItem('refresh-token', ...)` after it are redundant. However, **`oauth()` does NOT save tokens in state** — you need to set them manually after it.

⚠️ **Trap of server `oauth()`:** if the code exchange is performed in a Server Action / route handler without passing the browser's fingerprint, the issued refresh token is bound to the server's Node fingerprint — the proactive `/refresh` from the browser will receive `400` → 401 envelope → `clearTokens()` will log out the active session. Correctly (SDK ≥ 1.0.155): in the browser, take the string `getApi().AuthProvider.getDeviceMetadata()`, pass it to the Server Action, and there create a per-request instance `defineOneEntry(url, { token, deviceMetadata })` before `oauth()` — then the token will refresh from the browser. See `.claude/rules/auth-provider.md` (OAuth section) and `/create-google-oauth`.

```typescript
// ✅ email login: auth() has already placed everything in state and saved the refresh token
const login = async () => {
  localStorage.setItem('authProviderMarker', AUTH_PROVIDER)
  setIsAuth(true)
  await fetchUser()
}

// ✅ oauth login: set tokens from the response in the current instance manually
const loginOAuth = async (token: { accessToken: string; refreshToken: string }) => {
  localStorage.setItem('refresh-token', token.refreshToken)
  syncTokens(token.accessToken, token.refreshToken) // setAccessToken + setRefreshToken
  setIsAuth(true)
  await fetchUser()
}

// ❌ REDUNDANT — reDefine() in login() creates a new instance without accessToken
// → SDK will proactively make an unnecessary /refresh and unnecessarily rotate just issued
//   token. There is no spurious 401 anymore (≥ 1.0.152), but this is an unnecessary round-trip.
const login = async (token: ...) => {
  if (!hasActiveSession()) {
    await reDefine(token.refreshToken)
  }
  await fetchUser()
}
```

`reDefine` is **only** for initialization from localStorage on page load, not for `login()`.

**`hasActiveSession` and `syncTokens` — export from `src/lib/oneentry.ts`:**

```typescript
// src/lib/oneentry.ts
// ⚠️ CRITICAL: apiInstance — this is IDefineApi = { AuthProvider, Users, ... }
// It does NOT have a .state property! Check through apiInstance.AuthProvider.state
export function hasActiveSession(): boolean {
  const authProvider = apiInstance.AuthProvider as unknown as { state?: { accessToken?: string } };
  return !!authProvider?.state?.accessToken;
}

// Directly sets both tokens in the current instance (needed after oauth())
export function syncTokens(accessToken: string, refreshToken: string): void {
  apiInstance.AuthProvider.setAccessToken(accessToken);
  apiInstance.AuthProvider.setRefreshToken(refreshToken);
}
```

> ❌ `(apiInstance as any).state?.accessToken` — always `undefined`, the SDK does not have `.state` at the top level!

## updateUserState — Writing user.state to the Server

After changing cart/favorites in Redux — synchronize with the server through Server Action:

```typescript
// src/app/api/server/users/updateUserState.ts
'use server';

import { getApi } from '@/lib/oneentry';
import type { IUserEntity } from 'oneentry';

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

## StrictMode — Protection Against Double auth Calls

React StrictMode in dev runs `useEffect` twice. Single-flight in the SDK deduplicates only **internal** refresh (proactive/reactive). Two parallel **explicit** `AuthProvider.refresh`/`auth` from double execution — these are two independent POSTs with one one-time token → the second `400` → log out. For the pattern `reDefine` + `getUser`, double execution does not burn the token (both requests will share one proactive refresh), but the guard should still be left: it eliminates unnecessary pairs of requests and races in `setState`.

**Always add `useRef` guard in components with auth-init:**

```typescript
const initRef = useRef(false);

useEffect(() => {
  if (initRef.current) return;  // StrictMode guard
  initRef.current = true;

  const init = async () => {
    const refresh = localStorage.getItem('refresh-token');
    if (refresh && !hasActiveSession()) {
      reDefine(refresh);
    }
    // ... loading data
  };
  init();
}, []);
```

## Race Condition — Log Out Only on Confirmed 401/403

The SDK (≥ 1.0.152) deduplicates simultaneous refreshes within one instance (single-flight) — the race of parallel requests from one `getApi()` no longer burns the token. However, between tabs/reloads (the fresh context reads the token from localStorage), a race is still possible — hence the rule remains:

```typescript
// Client Component: log out only on confirmed auth error
const result = await getApi().Users.getUser()
if (isError(result) && ((result as any).statusCode === 401 || (result as any).statusCode === 403)) {
  clearTokens()
  window.dispatchEvent(new Event('auth-change'))
}
```

> Related rules:
>
> - `.claude/rules/performance-rtk.md` — `pollingInterval` for `getMe`, the pattern `reDefine` within the RTK Query auth flow, protection against race condition when updating the token with parallel RTK requests.
