# Troubleshooting — request errors, environment, build

## Request Errors

### 401 Unauthorized — session not initialized

**Symptom:** Calls to `Users.*`, `Orders.*`, `Payments.*` return 401.

**Cause:** `reDefine(refreshToken)` was not called before accessing user-auth methods, or the session has expired.

**Solution:** Ensure that `reDefine(refreshToken, locale)` is called during initialization (e.g., in AuthContext) before any user-auth calls. `saveFunction` automatically updates the token in localStorage with each rotation.

> Pattern: `.claude/rules/tokens.md` | Skill: **`/create-orders-list`**

### 401 Unauthorized — token race condition

**Symptom:** User is logged in, navigates to the profile/orders page — and finds themselves logged out.

**Cause:** A parallel operation (CartContext, FavoritesContext) has already invalidated the same `refreshToken`. The new page reads the stale token from localStorage.

> SDK (≥ 1.0.152) deduplicates simultaneous refreshes within *one* instance of `getApi()` (single-flight) — a race of parallel requests on the same page no longer logs the user out. There remains a race between **tabs/reloads** (the fresh context takes the token from localStorage) — the rule below is relevant for it.

**Rule for all account pages:**

1. Server Action MUST return `statusCode` in the error object
2. On 401 — retry with `localStorage.getItem('refresh-token')` (the token may have been refreshed)
3. Log out ONLY on 401/403 AFTER retry
4. Never call `removeItem('refresh-token')` on data loading error

⚠️ Key — **with a hyphen**: `'refresh-token'`. This is the key under which `saveFunction` SDK writes the token (see `.claude/rules/tokens.md`). Accessing `'refreshToken'` will return `null` — the retry will go without a token, the dead token will not be cleared, and the session will break on the first 401.

> Skill: **`/create-profile`** (profile) and **`/create-orders-list`** (orders)

### 401 Unauthorized — invalid or expired token

A typical expired session. Redirect to `/login`.

> ⚠️ If the token expires too quickly — check the token lifetime in the OneEntry admin: `PROJECT_URL/users/auth-providers`.

### 403 Forbidden

**Cause 1:** insufficient permissions for the action (user group settings in the admin).

**Cause 2:** calling `AuthProvider.auth/signUp/generateCode` via Server Action → fingerprint (`x-device-metadata`) will be server-side, not browser-side, and the refresh token will be tied to the server. By default, move the call to Client Component. With SDK ≥ 1.0.155, server-side calls are allowed with the browser's fingerprint passed through `config.deviceMetadata` (per-request instance `defineOneEntry(url, { token, deviceMetadata })`); the main case is server-side OAuth code exchange. See `.claude/rules/sdk-init.md` → "Device metadata".

**Method distribution by context:**

- Public (Pages, Products, Menus, Forms) — any context (server or client)
- `AuthProvider.auth()`, `.signUp()`, `.generateCode()`, `.checkCode()` — **only Client Component** (fingerprint; server — only with passing `deviceMetadata`, ≥ 1.0.155)
- `AuthProvider.logout()`, `.logoutAll()`, `.getAuthProviders()` — any context
- `Users.*`, `Orders.*`, `Payments.*` — **only Client Component** after `reDefine()`

### 400 Bad Request — `notificationData.phoneSMS` is not allowed to be empty

An empty string `''` is rejected by the API validator. `phoneSMS` in the `INotificationData` type is optional (`phoneSMS?: string`) — if the user does not have a phone, **simply do not pass the field** (`as any` is not needed). The SDK itself removes `phoneSMS` from the body if an empty string `''` is received.

> Full signUp pattern: `.claude/rules/auth-provider.md`

### 400 Bad Request — `authData` with extra fields or empty values

`authData` must contain **only** `{ marker, value }`, without metadata from Forms API. Filter out empty values before sending.

```typescript
// ✅ CORRECT
const authData = formFields
  .filter(f => formValues[f.marker]?.trim())
  .map(f => ({ marker: f.marker, value: formValues[f.marker] }))
```

> Full auth pattern: `.claude/rules/auth-provider.md` | Skill: **`/create-auth`**

### 400 Bad Request — `Login or password values are missed` on `Users.updateUser`

The message is misleading: it comes for both `authData: []` and for a single login element. The password is NOT required when saving the profile — simply **do not pass the `authData` key at all** when the password is not changing. The full contract (`maximum 1 element — password`, `{ marker, value }` without `type`, login cannot be changed) — skill **`/create-profile`**.

### 404 Not Found

```typescript
const product = await getApi().Products.getProductById(id)
if (isError(product) && product.statusCode === 404) return <NotFound />
```

### 500 Server Error

**Cause:** calling `Users.*`, `Orders.*`, `Payments.*` via `getApi()` without prior `reDefine()`. These methods require user accessToken.

```typescript
// ❌ INCORRECT — reDefine() was not called, no user accessToken
const user = await getApi().Users.getUser();  // 500!

// ✅ CORRECT — reDefine() called before use (e.g., in AuthContext)
await reDefine(refreshToken, locale);
const user = await getApi().Users.getUser();
```

## Debugging Requests

Enable logging: `validation: { enabled: true, logErrors: true }` in the `defineOneEntry` config.

## Environment and Build

### 400 on `/_next/image` for CMS images with correct `remotePatterns` (dev)

**Symptom:** all `/_next/image?url=https://…oneentry.cloud/…` return `400 "url" parameter is not allowed`, although `remotePatterns` in `next.config` are correct; clearing caches and restarting do not help.

**Cause:** The SSRF protection of the Next optimizer (16+) resolves the image host with **all** DNS records and blocks the request if any are private. In networks with DNS64/NAT64, the resolver synthesizes an AAAA record `64:ff9b::/96` alongside the public A record → every remote image is blocked. Only a generalized 400 goes to the browser; the real reason is the line `⨯ upstream image … resolved to private ip` in the **stdout of the dev server** — when getting a 400 on images, first check there, rather than guessing from the config.

**Solution (dev-only, production retains protection):**

```typescript
// next.config.ts
images: { dangerouslyAllowLocalIP: process.env.NODE_ENV === 'development' }
```

### After deployment/rebuild, a section (menu, hero, list) disappeared — then "fixed itself"

**Cause:** Static pages (`force-static` / ISR) read CMS **only once — during `next build`**. The CI runner is usually far from the CMS and generates many pages in bulk → transient timeout/429; wrappers that "degrade without errors" turn a failure into an empty section, and it **gets baked into static**. Intermittently and in different sections — requests are independent. ISR later regenerates the page at runtime — hence "then it appeared".

**Mitigation:** a separate build profile in the fetch wrapper based on `process.env.NEXT_PHASE === 'phase-production-build'` — increased timeout (~30s), more retries with exponential backoff+jitter, limiting concurrency of requests to CMS, and mandatory `console.warn` on degradation after all retries (the CI log shows which section went empty). An alternative is fail-fast: drop `next build` on critical data unavailability + retry the CI job, then nothing empty gets deployed.
