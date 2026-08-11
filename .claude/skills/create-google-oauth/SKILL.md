---
name: create-google-oauth
description: Google OAuth authorization via OneEntry
---
# /create-google-oauth — Google OAuth authorization through OneEntry

---

## Step 0: Setting up Google Cloud Console — user instructions

**Before writing code**, provide the user with the following instructions and **wait for a response**:

---

> ### To set up Google OAuth, you need to complete several steps in Google Cloud Console:
>
> **1. Create a project (if you don't have one)**
> - Open [console.cloud.google.com](https://console.cloud.google.com)
> - Click on the project selector at the top → **New Project** → enter a name → **Create**
>
> **2. Enable Google+ API / OAuth**
> - On the left: **APIs & Services** → **OAuth consent screen**
> - Select **External** → **Create**
> - Fill in: App name, User support email, Developer contact email → **Save and Continue**
> - On the Scopes and Test users steps — just **Save and Continue**
>
> **3. Create an OAuth 2.0 client**
> - **APIs & Services** → **Credentials** → **+ Create Credentials** → **OAuth 2.0 Client ID**
> - Application type: **Web application**
> - Name: any (for example "My App Web")
> - **Authorized JavaScript origins**: add `http://localhost:3000`
> - **Authorized redirect URIs**: add `http://localhost:3000/auth/callback`
> - Click **Create**
>
> **4. Copy the data**
> - In the window that appears, copy **Client ID** and **Client Secret**
> - (Or open the created client and copy from there)
>
> ---
> **When ready, send me:**
> - `Client ID` (looks like `123456789-abc...apps.googleusercontent.com`)
> - `Client Secret` (looks like `GOCSPX-...`)
> - `Redirect URI` that you added (by default: `http://localhost:3000/auth/callback`)

---

**Wait for the user's response.** Do not write code until you receive all three values.

After the user provides the data — proceed to **Step 0.1**.

---

## Step 0.1: Get the data and fill in the files

When the user has sent `Client ID`, `Client Secret`, and `Redirect URI`:

### 1. Fill in `.env.local`

Read the current `.env.local` (or create it if it doesn't exist). Add / update the variables:

```env
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<Client ID from the user>
GOOGLE_CLIENT_SECRET=<Client Secret from the user>
NEXT_PUBLIC_APP_URL=<origin from Redirect URI, for example http://localhost:3000>
```

> `NEXT_PUBLIC_APP_URL` — only the origin without the path (`http://localhost:3000`, not `http://localhost:3000/auth/callback`).

> ### ⚠️ origin — only from env, never from request
>
> **Do not** construct `redirect_uri` from `request.url`, `headers()`, `request.headers.get('host')`
> or `window.location.origin`. When TLS termination occurs on a proxy (Vercel, Railway, Fly, nginx,
> Docker behind a load balancer) the application sees the internal request: `http://` instead of `https://`
> and/or the container's host (`0.0.0.0:3000`) → `redirect_uri_mismatch`, while the initial redirect
> passes and fails only during the exchange.
>
> Always `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback` — both in the redirect to Google and in the exchange.

### 2. Check the consistency of redirect_uri

At this step, check three places that are currently accessible:

| Place | Value |
| --- | --- |
| Google Cloud Console (Authorized redirect URIs) | what the user entered |
| `.env.local` → `NEXT_PUBLIC_APP_URL` + `/auth/callback` | `${NEXT_PUBLIC_APP_URL}/auth/callback` |
| `googleOAuthAction` in Server Action | `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback` |

If the redirect_uri from the user's response differs from `${APP_URL}/auth/callback` — inform them and clarify.

This is **not a complete** list: there is also a field in the OE admin panel and JavaScript origins in Google —
the canonical list of six items can be found in **Step 2**, check against it before the final verification.

### 3. Ensure that the callback page exists

Check for the existence of `src/app/auth/callback/page.tsx`. If it doesn't exist — create it (see Step 4 below).

### 4. Inform the user

After writing the files, say:

> `.env.local` has been updated. Google OAuth data is configured:
> - Client ID: `...first 20 characters...`
> - Redirect URI: `http://localhost:3000/auth/callback`
>
> ⚠️ Restart the dev server (`npm run dev`) so that Next.js picks up the new environment variables.

---

## Step 1: Get the provider marker and check env

```bash
/inspect-api auth-providers
```

Find the provider with `"type": "oauth"` and Google in the name. Remember:

- `identifier` — marker for `getAuthProviderByMarker(marker)`
- `config.oauthAuthUrl` — base URL for Google authorization
- `formIdentifier` — not used for OAuth (only for email authorization)

### Field "URL for OAuth Origin issuer" (OE admin panel)

The application's origin — scheme + host (+ port), **without path**: `https://myapp.com`. Do not confuse with
`oauthAuthUrl` (Google URL) and do not write the full `redirect_uri` with `/auth/callback` here.
It must match the origin of the `redirect_uri` — see all matching places in **Step 2**.

Suspect #1 when `redirect_uri_mismatch` occurs alongside env (error stages — Step 3),
check before `client_id`/`client_secret`. Common pitfalls: it remains `http://localhost:3000`
after moving to production; the full path is written. When changing domains, update manually.

Make sure that `.env.local` contains:

```env
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<client_id from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<secret from Google Cloud Console>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**⚠️ `client_id` in `.env.local` must match the client in Google Cloud Console,**
which has the registered `redirect_uri`. Mismatch → `redirect_uri_mismatch`.

---

## Step 2: Register the redirect URI in Google Cloud Console

In Google Cloud Console → **APIs & Services** → **Credentials** → the required OAuth 2.0 client:

- **Authorized JavaScript origins**: `http://localhost:3000`
- **Authorized redirect URIs**: `${NEXT_PUBLIC_APP_URL}/auth/callback`

### Canonical list: where origin and redirect_uri must match

This is the only complete list — Step 0.1 and Step 1 refer here. For `https://myapp.com`:

| # | Place | Value |
| --- | --- | --- |
| 1 | Google Cloud Console → Authorized redirect URIs | `https://myapp.com/auth/callback` |
| 2 | Google Cloud Console → Authorized JavaScript origins | `https://myapp.com` |
| 3 | OE admin panel → provider → URL for OAuth Origin issuer | `https://myapp.com` |
| 4 | `.env` → `NEXT_PUBLIC_APP_URL` | `https://myapp.com` |
| 5 | `handleGoogleLogin` (initial redirect, Step 5) | `${NEXT_PUBLIC_APP_URL}/auth/callback` |
| 6 | `googleOAuthAction` (code exchange, Step 3) | `${NEXT_PUBLIC_APP_URL}/auth/callback` |

5 and 6 match themselves if collected from `NEXT_PUBLIC_APP_URL`. Lines 1–4 are set manually —
when moving from dev to prod, update all four.

---

## Step 3: Server Action — exchange code for tokens

```typescript
// src/app/actions/auth.ts
'use server'

import { defineOneEntry } from 'oneentry'
import { isError } from '@/lib/oneentry'
import type { IAuthEntity } from 'oneentry/dist/auth-provider/authProvidersInterfaces'

export async function googleOAuthAction(
  code: string,
  deviceMetadata: string, // ← browser fingerprint from the callback page (Step 4)
): Promise<{ token: IAuthEntity } | { error: string }> {
  // An empty string will silently substitute the server fingerprint — the token will not refresh from the browser
  if (!deviceMetadata) return { error: 'deviceMetadata not passed from the callback page' }

  // Per-request instance: deviceMetadata in config, shared getApi()-singleton is not mutated
  const api = defineOneEntry(process.env.NEXT_PUBLIC_ONEENTRY_URL as string, {
    token: process.env.NEXT_PUBLIC_ONEENTRY_TOKEN as string,
    deviceMetadata, // ← refresh token will be tied to the browser fingerprint
  })

  const result = await api.AuthProvider.oauth('google_web', { // ← marker from step 1
    client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID as string,
    client_secret: process.env.GOOGLE_CLIENT_SECRET as string,     // ← server secret!
    code,
    grant_type: 'authorization_code',
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
  })

  if (isError(result)) {
    const msg = Array.isArray(result.message) ? result.message.join('; ') : result.message
    return { error: msg }
  }

  return { token: result as IAuthEntity }
}
```

**`oauth()` — Server Action** (not Client Component): `client_secret` must not reach the browser.
`oauth()` handles both login and registration — separate flows are not needed.

**Why `deviceMetadata` (SDK ≥ 1.0.155):** The API ties refresh tokens to the header
`x-device-metadata` (SDK sends it on every POST and on refresh). Without passing the browser
fingerprint, the server's `oauth()` will substitute the Node fingerprint — the issued refresh token
will not be updated from the browser: both refresh will break when the access token expires
(`login(token)` → `syncTokens()` → 401 → refresh 4xx), and session recovery when
the page is reloaded (`reDefine` → proactive refresh).

**Why a per-request instance instead of `setDeviceMetadata` on `getApi()`:** The `apiInstance` from
`src/lib/oneentry.ts` is a modular singleton shared by parallel requests. The pattern
`setDeviceMetadata(dm)` → `oauth()` → `setDeviceMetadata('')` — race condition: parallel
OAuth callbacks will overwrite each other's fingerprints. A short-lived local instance for one
stateless POST — a conscious exception to the rule "one instance through getApi()"
(`defineOneEntry` does not make network requests).

### Diagnostics: `oauth()` returned an error — read the ladder from top to bottom

Errors go through processing stages. Determine the stage **before** changing the code:

| Response | Stage | What to do |
| --- | --- | --- |
| `403 Permission data not found. Provide the permission for requested url` | pre-check rights **before** processing the request | The route `…/marker/{marker}/oauth` is not granted to the user group. The code here is irrelevant — go to the skill **`/admin-grant-permissions`** |
| `400 Invalid x-device-metadata format` | permission exists, but fingerprint is incorrect | `deviceMetadata` was not passed from the callback page or was collected manually — take only from `getDeviceMetadata()` (Step 4) |
| `redirect_uri_mismatch` | reached Google | Origin mismatch — check against the canonical list (Step 2), verify the field "URL for OAuth Origin issuer" (Step 1) and that the origin is not derived from the request (Step 0.1) |
| `400 We couldn't pass the oauth authentication with provided data…` | OneEntry chain fully traversed | The problem lies in the data itself: expired/reused `code` (it is one-time, ~10 minutes) or incorrect credentials — see models below |

**403 — tenant configuration, not code.** Permission is granted to a group (usually "Guest" = Default
User Group of the provider), not to the App Token, and **for each route separately**. It comes with any
parameters, even with a fake `code` — the permission is checked before the request body. Hence the cheap
test: a 403 changed to a 400 — the permission worked, no need to burn a real `code`.
⚠️ The same 403 can occur on `…/marker/{marker}/users/refresh` and logout — separate routes,
grant permission to them as well.

### Reference: two models for code exchange (only when analyzing errors)

**The code above works by default — do not change it when writing.** This section is needed if the exchange
fails or `client_secret` was not provided to you.

| | **Model A — credentials in OE** | **Model B — credentials in the application** |
| --- | --- | --- |
| Where `client_id` / `client_secret` are stored | in the provider settings in the OE admin panel | in the application's `.env` |
| What OE uses during the exchange | its admin settings, body is ignored | what was sent in the body |
| `GOOGLE_CLIENT_SECRET` in the application | not needed | required |

All 5 fields work with both settings (in Model A, the extra is ignored) — there is no need to determine the model in advance. If the secret is not available, send `client_id: ''`, `client_secret: ''`,
the rest as above: the type `IOauthData` requires all 5 keys, empty strings, not skipping.

⚠️ Do not try to extract `client_secret` from the provider settings: it is not in `config`
(`IAuthProvidersEntityConfig` — only TTL and `oauthAuthUrl`), and `getAuthProviderByMarker()`
works with the public token from the browser — the secret should not appear there. In Model A, it is not
needed at all, `''` is sufficient.

**Determine the model:** the provider card in the OE admin panel — filled Client ID/Secret =
Model A, empty = Model B. ⚠️ Do not iterate over the body: `code` is one-time, lives ~10 minutes,
each attempt — re-login in the browser.

⚠️ Trap for Model A: an incorrect `client_secret` in `.env` **does not give an error**, it is ignored.
A successful exchange does not confirm the correctness of env — the same configuration will break on a tenant with Model B.

---

## Step 4: Callback page

### Choice: client page `page.tsx` or route handler `route.ts`

`code` comes to `/auth/callback`. The choice of handler is **not cosmetic** — it determines
whether the refresh token will work.

| | **`page.tsx` (Client Component)** — by default | **`route.ts` (Route Handler)** |
| --- | --- | --- |
| Where the fingerprint comes from | `getApi().AuthProvider.getDeviceMetadata()` in the browser | **not available** — only the Node server fingerprint |
| Refresh token is tied to | the user's browser | the server process |
| Token update from the browser | works | **breaks**: refresh 4xx when the access token expires |
| Tokens go to | localStorage via `login(token)` | httpOnly cookie set by the server |
| Intermediate "Logging in..." screen | exists | no, redirects immediately |

**Use `page.tsx`** if the session lives in localStorage (standard SDK scenario) — only this way
`deviceMetadata` is taken from the browser (passed in Server Action — Step 3).

**`route.ts` — only for cookie sessions** with server-side refresh (Step 4.1): there the server itself stores
and updates the refresh token, not giving it to the client.

```tsx
// src/app/auth/callback/page.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth/AuthContext'
import { getApi } from '@/lib/oneentry'
import { googleOAuthAction } from '@/app/actions/auth'

export default function AuthCallbackPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { login } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const processed = useRef(false)

  useEffect(() => {
    if (processed.current) return
    processed.current = true

    const code = searchParams.get('code')
    const errorParam = searchParams.get('error')

    if (errorParam || !code) {
      setError(errorParam ? 'Authorization canceled' : 'Authorization code not received')
      setTimeout(() => router.push('/'), 2000)
      return
    }

    ;(async () => {
      // Browser fingerprint for tying the refresh token (SDK >= 1.0.155).
      // getDeviceMetadata() — public method of each module (AuthProvider, Users, ...),
      // it is NOT on the root object getApi().
      const deviceMetadata = getApi().AuthProvider.getDeviceMetadata()
      const result = await googleOAuthAction(code, deviceMetadata)
      if ('error' in result) {
        setError(result.error)
        setTimeout(() => router.push('/'), 3000)
        return
      }
      await login(result.token)
      router.push('/')
    })()
  }, [searchParams, router, login])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-500">{error}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p>Logging in...</p>
    </div>
  )
}
```

---

## Step 4.1: Save the provider marker — it is needed on both client and server

`refresh`/`logout` hit `/marker/{marker}/users/refresh`. For a Google user, the marker —
`google_web` (what was returned in Step 1), **not `email`**. Hardcoding `'email'` → 4xx on refresh → logout
when the access token first expires. The bug surfaces an hour after login, not at login —
which is why it easily reaches production.

### 1. localStorage — always do this

For proactive refresh in the browser: the SDK reads `auth.providerMarker`, see `tokens.md`.
It is saved in `login()` / AuthContext alongside the tokens:

```typescript
localStorage.setItem('authProviderMarker', MARKER) // MARKER — identifier from Step 1
```

### 2. httpOnly cookie — only if the project has server-side refresh/logout

**First, check if needed.** Grep `AuthProvider.refresh(` / `AuthProvider.logout(`: if all
calls are client-side — **skip this item**, the cookie is not needed. It is only needed when they are in Server
Action / route handler / middleware, where localStorage is not available. Set at the same time as
the refresh token: both during the OAuth exchange and during email login (`/create-auth`) — otherwise, a symmetric bug
for email users.

```typescript
// src/app/actions/auth.ts — inside googleOAuthAction after a successful exchange
import { cookies } from 'next/headers'

const cookieStore = await cookies()
cookieStore.set('authProviderMarker', MARKER, { // MARKER — identifier from Step 1
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
})
```

```typescript
// Server-side refresh — marker from cookie, NOT hardcoded 'email'
const marker = (await cookies()).get('authProviderMarker')?.value || 'email'
const result = await getApi().AuthProvider.refresh(marker, refreshToken)

// Server-side logout — the same marker, otherwise the session will not be terminated on the backend
await getApi().AuthProvider.logout(marker, refreshToken)
// and only after that clear the cookie:
;(await cookies()).delete('authProviderMarker')
```

`|| 'email'` — fallback only for sessions created before the cookie existed: for OAuth users
it is guaranteed to be incorrect.

**Checklist (cookie items — only if it is set):** marker is written to localStorage ✔,
in cookie during OAuth exchange ✔, during email login ✔, read in server-side refresh ✔ and logout ✔,
deleted on logout ✔.

---

## Step 5: Google button in Client Component

```tsx
// Client Component ('use client')
import { getApi, isError } from '@/lib/oneentry'

const handleGoogleLogin = async () => {
  const provider = await getApi().AuthProvider.getAuthProviderByMarker('google_web') // ← marker from step 1
  if (isError(provider)) return
  const baseUrl = provider.config.oauthAuthUrl // type is already string | null — no cast needed
  if (!baseUrl) return
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`
  window.location.href =
    `${baseUrl}` +
    `?client_id=${process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent('openid email profile')}` +
    `&access_type=offline` +
    `&prompt=consent`
}
```

**Why `baseUrl` from the provider, not hardcoded:**
`config.oauthAuthUrl` is stored in OneEntry settings and may differ for different providers
(Google iOS vs Google Web, etc.). Do not hardcode the URL.

---

## Conclusion: complete flow

```
Button → getAuthProviderByMarker → config.oauthAuthUrl + query-params → window.location.href
    ↓
Google OAuth page (user logs in)
    ↓
redirect_uri?code=XXX → /auth/callback → getApi().AuthProvider.getDeviceMetadata()
    ↓
googleOAuthAction(code, deviceMetadata) → oauth() on per-request instance with deviceMetadata
    ↓
IAuthEntity { accessToken, refreshToken } — refresh token tied to the browser fingerprint
    ↓
login(token) → AuthContext → syncTokens() → profile
    ↓
marker 'google_web' → localStorage (client-side refresh) + httpOnly cookie (server-side refresh/logout)
```

---

## Step 6: Playwright E2E tests

> Runs only if the user confirmed writing tests at the beginning of the session or requested writing a test later (see `feedback_playwright.md`).
> For setting up Playwright — first `/setup-playwright`.

### 6.1 Add `data-testid` to components

For selector stability — add `data-testid` to the Google login button and on the callback page:

```tsx
// Google login button (Client Component, Step 5)
<button
  data-testid="google-login-button"
  type="button"
  onClick={handleGoogleLogin}
>
  Sign in with Google
</button>

// src/app/auth/callback/page.tsx
<div data-testid="oauth-callback">
  {error
    ? <p data-testid="oauth-error" className="text-red-500">{error}</p>
    : <p data-testid="oauth-loading">Logging in...</p>}
</div>
```

### 6.2 Gather test parameters and fill in `.env.local`

**Algorithm (execute step by step, do not ask in one list):**

1. **Path to the page with the Google login button** — ask: "On which page is the Google login button located? (for example `/login`, `/auth`)".
   - If silent → find it yourself through Grep for `getTestId('google-login-button'|'google_web'|handleGoogleLogin` or `data-testid="google-login-button"` in `src/app/**`/`src/components/**`. Inform: "Found the button on `{path}` — using it".
2. **Provider marker** — take it from `/inspect-api auth-providers` (Step 1 of this skill) — provider with `"type": "oauth"` + Google. Inform: "Using marker `{identifier}` from `/inspect-api auth-providers`".
3. **Real OAuth authorization** — ask: "Do you need to test the full OAuth flow with a real Google account? (a test Google account will be required, headless mode is not suitable)".
   - By default (user is silent / refused) → **DO NOT** run real OAuth. We only check: click → redirect to `accounts.google.com`, callback with an error in the URL → error display. This covers 80% of UX scenarios without real credentials.
   - If yes → add `E2E_GOOGLE_TEST_EMAIL` / `E2E_GOOGLE_TEST_PASSWORD` to `.env.local` and uncomment the block `test.describe('Real OAuth')`. Inform the user: "The full OAuth flow is unstable in headless mode — Google detects automation. I recommend leaving only the redirect test".

**Example of filling in `.env.local` (do it yourself, do not ask the user to copy):**

```bash
# e2e google oauth — path to the page with the button
E2E_LOGIN_PATH=/login
# (optional) Test Google account for the full flow — ONLY ADD IF THE USER REQUESTED
# E2E_GOOGLE_TEST_EMAIL=
# E2E_GOOGLE_TEST_PASSWORD=
```

### 6.3 Create `e2e/google-oauth.spec.ts`

> ⚠️ The full OAuth flow with a real Google account is unstable in headless mode. By default, we test the redirect and error handling of the callback without real credentials.

```typescript
import { test, expect } from '@playwright/test';

const LOGIN_PATH = process.env.E2E_LOGIN_PATH || '/login';
const GOOGLE_EMAIL = process.env.E2E_GOOGLE_TEST_EMAIL || '';
const GOOGLE_PASSWORD = process.env.E2E_GOOGLE_TEST_PASSWORD || '';

test.describe('Google OAuth', () => {
  test('Google login button is visible on the login page', async ({ page }) => {
    await page.goto(LOGIN_PATH);
    await expect(page.getByTestId('google-login-button')).toBeVisible();
  });

  test('click redirects to accounts.google.com with the required query parameters', async ({ page }) => {
    await page.goto(LOGIN_PATH);

    // Catch the redirect to Google before full navigation (to avoid loading the real Google UI)
    const navigationPromise = page.waitForURL(/accounts\.google\.com/, { timeout: 10_000 });
    await page.getByTestId('google-login-button').click();
    await navigationPromise;

    const url = new URL(page.url());
    expect(url.hostname).toContain('accounts.google.com');
    expect(url.searchParams.get('client_id')).toBeTruthy();
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('redirect_uri')).toContain('/auth/callback');
    expect(url.searchParams.get('scope')).toContain('email');
  });

  test('callback without code — shows an error', async ({ page }) => {
    await page.goto('/auth/callback');
    await expect(page.getByTestId('oauth-error')).toBeVisible({ timeout: 5_000 });
  });

  test('callback with error in URL — shows an error', async ({ page }) => {
    await page.goto('/auth/callback?error=access_denied');
    await expect(page.getByTestId('oauth-error')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('oauth-error')).toContainText(/cancel|denied|error/i);
  });
});

// ⚠️ Real OAuth flow — Google detects headless automation, tests are unstable.
// Uncomment only if the user explicitly requested and added E2E_GOOGLE_TEST_EMAIL/PASSWORD.
// test.describe('Real OAuth (experimental)', () => {
//   test.skip(!GOOGLE_EMAIL || !GOOGLE_PASSWORD, 'E2E_GOOGLE_TEST_EMAIL/PASSWORD not set');
//   test('full flow: login via Google → return to site with refresh-token', async ({ page }) => {
//     await page.goto(LOGIN_PATH);
//     await page.getByTestId('google-login-button').click();
//     await page.waitForURL(/accounts\.google\.com/);
//     await page.getByRole('textbox', { name: /email/i }).fill(GOOGLE_EMAIL);
//     await page.getByRole('button', { name: /next|далее/i }).click();
//     await page.getByRole('textbox', { name: /password/i }).fill(GOOGLE_PASSWORD);
//     await page.getByRole('button', { name: /next|далее/i }).click();
//     // Return to /auth/callback → automatic redirect to /
//     await page.waitForURL(new RegExp(`^(?!.*accounts\\.google\\.com).*`), { timeout: 30_000 });
//     const token = await page.evaluate(() => localStorage.getItem('refresh-token'));
//     expect(token).toBeTruthy();
//   });
// });
```

### 6.4 Report to the user about the decisions made

Before completing the task — explicitly inform:

```
✅ e2e/google-oauth.spec.ts created
✅ data-testid added to the Google login button and on the callback page
✅ .env.local updated (E2E_LOGIN_PATH)

Automatically made decisions (if applicable):
- Path to the page with the button: {LOGIN_PATH} — {specified by the user / found through Grep for data-testid="google-login-button"}
- Provider marker: {identifier} — taken from /inspect-api auth-providers
- Real OAuth flow: test.describe('Real OAuth') left commented out.
  Reason: Google detects headless browsers and blocks automatic logins — tests are unstable.
  If a full flow is needed — add E2E_GOOGLE_TEST_EMAIL/PASSWORD and uncomment the block.
- Testing: (1) visibility of the button, (2) redirect to accounts.google.com with the correct query parameters,
  (3) callback without code — showing an error, (4) callback with error=access_denied — showing an error.

Run: npm run test:e2e -- google-oauth.spec.ts
```
