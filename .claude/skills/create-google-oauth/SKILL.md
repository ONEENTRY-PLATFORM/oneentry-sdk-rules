---
name: create-google-oauth
description: Google OAuth authorization via OneEntry
---
# /create-google-oauth — Google OAuth authorization via OneEntry

---

## Step 0: Setting up Google Cloud Console — user instructions

**Before writing code**, provide the user with the following instructions and **wait for a response**:

---

> ### To set up Google OAuth, you need to perform several steps in the Google Cloud Console:
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
> - Name: any (e.g., "My App Web")
> - **Authorized JavaScript origins**: add `http://localhost:3000`
> - **Authorized redirect URIs**: add `http://localhost:3000/auth/callback`
> - Click **Create**
>
> **4. Copy the data**
> - In the window that appears, copy **Client ID** and **Client Secret**
> - (Or open the created client and copy from there)
>
> ---
> **When you're ready, send me:**
> - `Client ID` (looks like `123456789-abc...apps.googleusercontent.com`)
> - `Client Secret` (looks like `GOCSPX-...`)
> - `Redirect URI` that you added (by default: `http://localhost:3000/auth/callback`)

---

**Wait for the user's response.** Do not write code until you receive all three values.

After the user provides the data — proceed to **Step 0.1**.

---

## Step 0.1: Get data and fill in files

When the user has sent `Client ID`, `Client Secret`, and `Redirect URI`:

### 1. Fill in `.env.local`

Read the current `.env.local` (or create it if it doesn't exist). Add/update the variables:

```env
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<Client ID from user>
GOOGLE_CLIENT_SECRET=<Client Secret from user>
NEXT_PUBLIC_APP_URL=<origin from Redirect URI, e.g., http://localhost:3000>
```

> `NEXT_PUBLIC_APP_URL` — only the origin without the path (`http://localhost:3000`, not `http://localhost:3000/auth/callback`).

### 2. Check the consistency of redirect_uri

`redirect_uri` must match exactly in **three places**:

| Place | Value |
| --- | --- |
| Google Cloud Console (Authorized redirect URIs) | what the user entered |
| `.env.local` → `NEXT_PUBLIC_APP_URL` + `/auth/callback` | `${NEXT_PUBLIC_APP_URL}/auth/callback` |
| `googleOAuthAction` in Server Action | `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback` |

If the redirect_uri from the user's response differs from `${APP_URL}/auth/callback` — inform them and clarify.

### 3. Ensure the callback page exists

Check for the presence of `app/auth/callback/page.tsx`. If it doesn't exist — create it (see Step 4 below).

### 4. Inform the user

After writing the files, say:

> `.env.local` updated. Google OAuth data configured:
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

Make sure that `.env.local` contains:

```env
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<client_id from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<secret from Google Cloud Console>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**⚠️ `client_id` in `.env.local` must match the client in Google Cloud Console,**
which has the registered `redirect_uri`. Mismatch → `redirect_uri_mismatch`.

---

## Step 2: Register redirect URI in Google Cloud Console

In Google Cloud Console → **APIs & Services** → **Credentials** → the required OAuth 2.0 client:

- **Authorized JavaScript origins**: `http://localhost:3000`
- **Authorized redirect URIs**: `${NEXT_PUBLIC_APP_URL}/auth/callback`

`redirect_uri` must match exactly in three places:

1. Google Cloud Console (Authorized redirect URIs)
2. `handleGoogleLogin` (initial redirect)
3. `googleOAuthAction` in Server Action (code exchange)

---

## Step 3: Server Action — exchange code for tokens

```typescript
// app/actions/auth.ts
'use server'

import { getApi, isError } from '@/lib/oneentry'
import type { IAuthEntity } from 'oneentry/dist/auth-provider/authProvidersInterfaces'

export async function googleOAuthAction(
  code: string,
): Promise<{ token: IAuthEntity } | { error: string }> {
  const result = await getApi().AuthProvider.oauth('google_web', { // ← marker from step 1
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

---

## Step 4: Callback page

```tsx
// app/auth/callback/page.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth/AuthContext'
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
      const result = await googleOAuthAction(code)
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

## Step 5: Google button in Client Component

```tsx
// Client Component ('use client')
import { getApi, isError } from '@/lib/oneentry'
import type { IAuthProvidersEntity } from 'oneentry/dist/auth-provider/authProvidersInterfaces'

const handleGoogleLogin = async () => {
  const provider = await getApi().AuthProvider.getAuthProviderByMarker('google_web') // ← marker from step 1
  if (isError(provider)) return
  const baseUrl = (provider as IAuthProvidersEntity & { config: { oauthAuthUrl: string | null } }).config.oauthAuthUrl
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

## Summary: full flow

```
Button → getAuthProviderByMarker → config.oauthAuthUrl + query-params → window.location.href
    ↓
Google OAuth page (user logs in)
    ↓
redirect_uri?code=XXX → /auth/callback
    ↓
googleOAuthAction(code) → AuthProvider.oauth() → IAuthEntity { accessToken, refreshToken }
    ↓
login(token) → AuthContext → syncTokens() → profile
```

---

## Step 6: Playwright E2E tests

> Runs only if the user confirmed writing tests at the beginning of the session or requested writing a test later (see `feedback_playwright.md`).
> To set up Playwright — first `/setup-playwright`.

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

// app/auth/callback/page.tsx
<div data-testid="oauth-callback">
  {error
    ? <p data-testid="oauth-error" className="text-red-500">{error}</p>
    : <p data-testid="oauth-loading">Logging in...</p>}
</div>
```

### 6.2 Gather test parameters and fill in `.env.local`

**Algorithm (execute step by step, do not ask in one list):**

1. **Path to the page with the Google login button** — ask: "On which page is the Google login button located? (e.g., `/login`, `/auth`)".
   - If they don't respond → find it yourself using Grep for `getTestId('google-login-button'|'google_web'|handleGoogleLogin` or `data-testid="google-login-button"` in `app/**`/`components/**`. Inform: "Found the button on `{path}` — using it".
2. **Provider marker** — take it from `/inspect-api auth-providers` (Step 1 of this skill) — provider with `"type": "oauth"` + Google. Inform: "Using marker `{identifier}` from `/inspect-api auth-providers`".
3. **Real OAuth authorization** — ask: "Do you need to test the full OAuth flow with a real Google account? (a test Google account will be required, headless mode is not suitable)".
   - By default (user is silent / refused) → **DO NOT** run real OAuth. We only check: click → redirect to `accounts.google.com`, callback with an error in the URL → show error. This covers 80% of UX scenarios without real credentials.
   - If yes → add `E2E_GOOGLE_TEST_EMAIL` / `E2E_GOOGLE_TEST_PASSWORD` to `.env.local` and uncomment the block `test.describe('Real OAuth')`. Inform the user: "The full OAuth flow is unstable in headless mode — Google detects automation. I recommend only testing the redirect".

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

// ⚠️ The real OAuth flow — Google detects headless automation, tests are unstable.
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
- Path to the page with the button: {LOGIN_PATH} — {specified by user / found via Grep by data-testid="google-login-button"}
- Provider marker: {identifier} — taken from /inspect-api auth-providers
- Real OAuth flow: test.describe('Real OAuth') left commented out.
  Reason: Google detects headless browsers and blocks automated logins — tests are unstable.
  If a full flow is needed — add E2E_GOOGLE_TEST_EMAIL/PASSWORD and uncomment the block.
- Testing: (1) visibility of the button, (2) redirect to accounts.google.com with correct query parameters,
  (3) callback without code — show error, (4) callback with error=access_denied — show error.

Run: npm run test:e2e -- google-oauth.spec.ts
```
