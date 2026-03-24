<!-- META
type: skill
skillConfig: {"name":"create-google-oauth"}
-->

# /create-google-oauth — Google OAuth authorization via OneEntry

---

## Step 0: Setting up Google Cloud Console — user instructions

**Before writing code**, provide the user with the following instructions and **wait for a response**:

---

> ### To set up Google OAuth, you need to complete several steps in the Google Cloud Console:
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
> **When you're ready — send me:**
> - `Client ID` (looks like `123456789-abc...apps.googleusercontent.com`)
> - `Client Secret` (looks like `GOCSPX-...`)
> - `Redirect URI` that you added (by default: `http://localhost:3000/auth/callback`)

---

**Wait for the user's response.** Do not write code until you receive all three values.

After the user has provided the data — proceed to **Step 0.1**.

---

## Step 0.1: Get the data and fill in the files

When the user has sent `Client ID`, `Client Secret`, and `Redirect URI`:

### 1. Fill in `.env.local`

Read the current `.env.local` (or create it if it doesn't exist). Add/update the variables:

```env
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<Client ID from user>
GOOGLE_CLIENT_SECRET=<Client Secret from user>
NEXT_PUBLIC_APP_URL=<origin from Redirect URI, for example http://localhost:3000>
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

Ensure that `.env.local` contains:

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

## Summary: complete flow

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
