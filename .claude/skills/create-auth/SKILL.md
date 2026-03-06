<!-- META
type: skill
skillConfig: {"name":"create-auth"}
-->

# /create-auth - Create Auth/Registration Form with OneEntry AuthProvider

---

## Step 1: Get real markers from the API

**DON'T guess markers.** First get the list of providers and forms:

```bash
cat .env.local

# Auth providers (identifier field — marker for auth/signUp/logout)
curl -s "https://<URL>/api/auth-providers?langCode=en_US" \
  -H "x-app-token: <TOKEN>" | python -m json.tool

# Forms list (identifier field — marker for getFormByMarker)
curl -s "https://<URL>/api/forms?langCode=en_US" \
  -H "x-app-token: <TOKEN>" | python -m json.tool
```

Or use `/inspect-api auth-providers` and `/inspect-api forms`.
What to look at in the response:

- `AuthProviders[].identifier` — provider marker (passed to `auth()`, `signUp()`, `logout()`)
- `AuthProviders[].formIdentifier` — registration form marker for this provider
- `Forms[].identifier` — form marker for `getFormByMarker()`

---

## Step 2: Clarify with the user

1. **What modes are needed?** (sign in / sign up / password reset)
1. **Is cart/favorites sync needed** after login?
   - If yes — a `getUserState` Server Action will be needed (reads `user.state`)
1. **Where to display the form?** (modal, separate page, drawer?)
1. **Is there a layout?** — if yes, copy it exactly, only change data

---

## Step 3: Create Server Actions

> **Important:** `auth()`, `signUp()`, `generateCode()` — call **directly from Client Component** (not via Server Action).
> The SDK transmits the user's device fingerprint — if called on the server, `deviceInfo.browser` in the fingerprint will be server-side, not the real user's browser.
> Via Server Action — only methods without fingerprint: `getAuthProviders`, `logout`, `logoutAll`.

### app/actions/auth.ts

```typescript
'use server';

import { getApi, isError } from '@/lib/oneentry';

export async function getAuthProviders() {
  const providers = await getApi().AuthProvider.getAuthProviders();
  if (isError(providers)) return { error: providers.message, statusCode: providers.statusCode };
  return (providers as any[]).map((p: any) => ({
    identifier: p.identifier,
    formIdentifier: p.formIdentifier,
    title: p.localizeInfos?.title,
  }));
}

export async function logout(authProviderMarker: string, token: string) {
  const result = await getApi().AuthProvider.logout(authProviderMarker, token);
  if (isError(result)) return { error: result.message };
  return { success: true };
}
```

### app/actions/users.ts (getUserState — sync after login)

> Only needed if the app stores cart/favorites and other data in `user.state`.
> If sync is not needed — skip this file.

```typescript
'use server';

import { makeUserApi, isError } from '@/lib/oneentry';
import type { IUserEntity } from 'oneentry/dist/users/usersInterfaces';

// getUserState — ONE makeUserApi for both calls (getUser)
// Returns newToken — client MUST save it to localStorage
export async function getUserState(refreshToken: string): Promise<
  { cart: Record<number, number>; favorites: number[]; newToken: string } | { error: string }
> {
  const { api, getNewToken } = makeUserApi(refreshToken);
  const user = await api.Users.getUser();
  if (isError(user)) return { error: user.message };
  return {
    cart: ((user as IUserEntity).state?.cart as Record<number, number>) || {},
    favorites: ((user as IUserEntity).state?.favorites as number[]) || [],
    newToken: getNewToken(),
  };
}
```

---

## Step 4: Create the form component

### Key component principles

- Form is loaded via Server Action `getFormByMarker(formIdentifier, locale)`
- Fields are rendered **dynamically** from `form.attributes` — don't hardcode fields!
- `authData` — only `{ marker, value }`, filter out empty values
- `notificationData` — **do NOT pass `phoneSMS`** (empty string → 400 error)
- After login save `accessToken`, `refreshToken`, `authProviderMarker` to localStorage
- After login call `getUserState` and dispatch `auth-state` event (if sync is needed)

### components/AuthForm.tsx

```tsx
'use client';

import { useState, useEffect } from 'react';
import { getFormByMarker } from '@/app/actions/forms';
import { logout } from '@/app/actions/auth';
import { getApi, isError } from '@/lib/oneentry';
import type { IAttributesSetsEntity } from 'oneentry/dist/attribute-sets/attributeSetsInterfaces';

interface AuthFormProps {
  authProviderMarker: string;  // provider marker — get from getAuthProviders()
  formIdentifier: string;      // form marker — from provider.formIdentifier
  locale?: string;
  onSuccess?: () => void;
}

type Mode = 'signin' | 'signup' | 'reset';

export function AuthForm({ authProviderMarker, formIdentifier, locale = 'en_US', onSuccess }: AuthFormProps) {
  const [mode, setMode] = useState<Mode>('signin');
  const [fields, setFields] = useState<IAttributesSetsEntity[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [formLoading, setFormLoading] = useState(true);

  useEffect(() => {
    getFormByMarker(formIdentifier, locale).then((result) => {
      if ('error' in result) { setError(result.error || ''); return; }
      setFields(result.attributes as IAttributesSetsEntity[]);
      setFormLoading(false);
    });
  }, [formIdentifier, locale]);

  // Visible fields depend on mode
  const visibleFields = (): IAttributesSetsEntity[] => {
    if (mode === 'signup') return fields;
    // signin / reset — only login + password (or only login for reset)
    const loginField = fields.find(f =>
      f.marker.includes('email') || f.marker.includes('login') || f.marker.includes('phone')
    );
    const passwordField = fields.find(f => f.marker.includes('password'));
    if (mode === 'reset') return loginField ? [loginField] : [];
    return [loginField, passwordField].filter(Boolean) as IAttributesSetsEntity[];
  };

  // authData — only { marker, value }, only non-empty
  const buildAuthData = () =>
    fields
      .filter(f => {
        if (['phonePush', 'phoneSMS'].includes(f.marker)) return false;
        const v = values[f.marker];
        return v && v.trim() !== '';
      })
      .map(f => ({ marker: f.marker, value: values[f.marker] }));

  // Email for notificationData — find dynamically
  const getEmail = () => {
    const f = fields.find(f => f.marker.includes('email') || f.marker.includes('login'));
    return f ? values[f.marker] || '' : '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess(''); setLoading(true);

    try {
      if (mode === 'signin') {
        // ✅ Call directly (fingerprint = user's browser)
        const result = await getApi().AuthProvider.auth(authProviderMarker, { authData: buildAuthData() });
        if (isError(result)) { setError((result as any).message || 'Auth failed'); return; }

        localStorage.setItem('accessToken', (result as any).accessToken);
        localStorage.setItem('refreshToken', (result as any).refreshToken);
        localStorage.setItem('authProviderMarker', authProviderMarker);

        // Sync user.state (cart, favorites) — if needed
        // const stateResult = await getUserState((result as any).refreshToken);
        // if (!('error' in stateResult)) {
        //   localStorage.setItem('refreshToken', stateResult.newToken);
        //   window.dispatchEvent(new CustomEvent('auth-state', {
        //     detail: { cart: stateResult.cart, favorites: stateResult.favorites },
        //   }));
        // }

        setSuccess('Signed in!');
        setTimeout(() => onSuccess?.(), 1000);

      } else if (mode === 'signup') {
        // ✅ Call directly (fingerprint = user's browser)
        const result = await getApi().AuthProvider.signUp(authProviderMarker, {
          formIdentifier,
          authData: buildAuthData(),
          formData: [],
          // ⚠️ do NOT pass phoneSMS — empty string causes 400
          notificationData: { email: getEmail(), phonePush: [] },
        } as any);
        if (isError(result)) { setError((result as any).message || 'Registration failed'); return; }
        setSuccess('Account created! Check your email.');
        setTimeout(() => { setMode('signin'); setSuccess(''); }, 2000);

      } else if (mode === 'reset') {
        // ✅ generateCode — also with fingerprint, call directly
        const result = await getApi().AuthProvider.generateCode(authProviderMarker, getEmail(), 'password_reset');
        if (isError(result)) { setError((result as any).message || 'Reset failed'); return; }
        setSuccess('Reset code sent!');
        setTimeout(() => { setMode('signin'); setSuccess(''); }, 3000);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (formLoading) return <div>Loading...</div>;

  return (
    <form onSubmit={handleSubmit}>
      <h2>
        {mode === 'signin' && 'Sign in'}
        {mode === 'signup' && 'Create account'}
        {mode === 'reset' && 'Reset password'}
      </h2>

      {/* Fields — dynamically from Forms API */}
      {visibleFields().map((field) => {
        const isPassword = field.marker.includes('password');
        const isEmail = field.marker.includes('email') || field.marker.includes('login');
        return (
          <div key={field.marker}>
            <label htmlFor={field.marker}>
              {field.localizeInfos?.title || field.marker}
            </label>
            <input
              id={field.marker}
              type={isPassword ? 'password' : isEmail ? 'email' : 'text'}
              value={values[field.marker] || ''}
              onChange={(e) => setValues(prev => ({ ...prev, [field.marker]: e.target.value }))}
              required
            />
          </div>
        );
      })}

      {error && <div role="alert">{error}</div>}
      {success && <div role="status">{success}</div>}

      <button type="submit" disabled={loading}>
        {loading ? 'Loading...' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send code'}
      </button>

      {/* Mode switching */}
      {mode === 'signin' && (
        <>
          <button type="button" onClick={() => setMode('signup')}>Create account</button>
          <button type="button" onClick={() => setMode('reset')}>Forgot password?</button>
        </>
      )}
      {mode !== 'signin' && (
        <button type="button" onClick={() => setMode('signin')}>Back to sign in</button>
      )}
    </form>
  );
}
```

### Logout (call from any component)

```tsx
'use client';

import { logout } from '@/app/actions/auth';

async function handleLogout() {
  const marker = localStorage.getItem('authProviderMarker') || 'email';
  const token = localStorage.getItem('refreshToken') || '';

  await logout(marker, token);

  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('authProviderMarker');

  // Notify other components (CartContext, FavoritesContext, etc.)
  window.dispatchEvent(new Event('auth-change'));
}
```

---

## Step 5: Remind of key rules

> Token storage and update rules: `.claude/rules/tokens.md`

```md
✅ Component created. Key rules:

1. authData — only { marker, value }, filter out empty strings
1. notificationData — do NOT pass phoneSMS (empty string → 400)
1. formIdentifier comes from provider.formIdentifier, not hardcoded
1. Fields are rendered dynamically from Forms API — don't hardcode <input>
1. After login save accessToken + refreshToken + authProviderMarker to localStorage
1. getUserState burns refreshToken — call once, immediately update localStorage
1. Logout: save authProviderMarker at login, pass it to logout()
1. auth/signUp/generateCode — ONLY directly from Client Component (device fingerprint!), not via Server Action
```
