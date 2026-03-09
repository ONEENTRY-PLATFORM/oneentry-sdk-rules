<!-- META
type: skill
skillConfig: {"name":"create-auth"}
-->

# /create-auth - Create an authorization/registration form with OneEntry AuthProvider

---

## Step 1: Get real markers from the API

**DO NOT guess the markers.** First, get the list of providers and forms:

```bash
cat .env.local

# Authorization providers (the identifier field is the marker for auth/signUp/logout)
curl -s "https://<URL>/api/auth-providers?langCode=en_US" \
  -H "x-app-token: <TOKEN>" | python -m json.tool

# List of forms (the identifier field is the marker for getFormByMarker)
curl -s "https://<URL>/api/forms?langCode=en_US" \
  -H "x-app-token: <TOKEN>" | python -m json.tool
```

Or use `/inspect-api auth-providers` and `/inspect-api forms`.
What to look for in the response:

- `AuthProviders[].identifier` — provider marker (passed to `auth()`, `signUp()`, `logout()`)
- `AuthProviders[].formIdentifier` — registration form marker for this provider
- `Forms[].identifier` — form marker for `getFormByMarker()`

---

## Step 2: Clarify with the user

1. **What modes are needed?** (login / registration / password reset)
2. **Is synchronization of cart/favorites** needed after login?
   - If yes — AuthContext reads `user.state` and loads cart/favorites into Redux
   - For cross-device sync: polling `user.state` every N seconds (see below)
3. **Where to display the form?** (modal, separate page, drawer?)
4. **Is there a layout?** — if yes, copy exactly, change only the data

---

## Step 3: Create Server Actions

> **Important:** Call `auth()`, `signUp()`, `generateCode()` **directly from Client Component** (not through Server Action).
> The SDK passes the user's device fingerprint — if called on the server, `deviceInfo.browser` in the fingerprint will be server-based, not the user's actual browser.
> Through Server Action — only methods without fingerprint: `getAuthProviders`, `logout`, `logoutAll`.

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

### lib/getUserState.ts (synchronization after login — client utility)

> Needed only if the application stores cart/favorites and other data in `user.state`.
> If synchronization is not needed — skip this file.
> Called directly from Client Component (not Server Action — no `'use server'`).

```tsx
import { getApi, isError } from '@/lib/oneentry';
import type { IUserEntity } from 'oneentry/dist/users/usersInterfaces';

export async function getUserState(): Promise<
  { cart: Record<number, number>; favorites: number[] } | { error: string }
> {
  const user = await getApi().Users.getUser();
  if (isError(user)) return { error: user.message };
  return {
    cart: ((user as IUserEntity).state?.cart as Record<number, number>) || {},
    favorites: ((user as IUserEntity).state?.favorites as number[]) || [],
  };
}
```

---

## Step 4: Create the form component

### Key principles of the component

- The form is loaded via Server Action `getFormByMarker(formIdentifier, locale)`
- Fields are rendered **dynamically** from `form.attributes` — do not hardcode fields!
- `authData` — only `{ marker, value }`, filter out empty values
- `notificationData` — **DO NOT pass `phoneSMS`** (empty string → 400 error)
- After login, save `accessToken`, `refreshToken`, `authProviderMarker` in localStorage
- After login, call `getUserState` and dispatch `auth-state` event (if synchronization is needed)

### components/AuthForm.tsx

```tsx
'use client';

import { useState, useEffect } from 'react';
import { getFormByMarker } from '@/app/actions/forms';
import { logout } from '@/app/actions/auth';
import { getApi, isError } from '@/lib/oneentry';
import type { IAttributesSetsEntity } from 'oneentry/dist/attribute-sets/attributeSetsInterfaces';

interface AuthFormProps {
  authProviderMarker: string;  // provider marker — get it from getAuthProviders()
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

  // The displayed fields depend on the mode
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

  // Email for notificationData — searching dynamically
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

        localStorage.setItem('refresh-token', (result as any).refreshToken);

        // Synchronization of user.state (cart, favorites) — if needed
        // import { getUserState } from '@/lib/getUserState';
        // const stateResult = await getUserState();
        // if (!('error' in stateResult)) {
        //   localStorage.setItem('refresh-token', stateResult.newToken);
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
          // ⚠️ DO NOT pass phoneSMS — empty string causes 400
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
  const token = localStorage.getItem('refresh-token') || '';

  await logout(marker, token);

  localStorage.removeItem('refresh-token');

  // Notify other components (CartContext, FavoritesContext, etc.)
  window.dispatchEvent(new Event('auth-change'));
}
```

---

## Step 5: AuthContext with polling (cross-device sync)

If synchronization of cart/favorites between devices is needed — AuthContext polls `user.state` on a timer. When data is updated, the Redux store receives the current cart and favorites.

```typescript
// AuthContext — polling pattern through RTK Query (or direct setInterval)
const [trigger] = useLazyGetMeQuery({
  pollingInterval: isAuth ? 30000 : 0, // every 30 seconds only when authorized
});

// When receiving a new user — load state into Redux
useEffect(() => {
  if (!user?.state.cart || cartVersion > 0) return;
  user.state.cart.forEach((product) => {
    if (!productsInCart.find((p) => p.id === product.id)) {
      dispatch(addProductToCart(product));
    }
  });
  dispatch(setCartVersion(1));
}, [user, cartVersion]);
```

> Writing back to the server — through Server Action `updateUserState` when changing cart/favorites.
> Pattern: `.claude/rules/tokens.md` → section `updateUserState`.

---

## Step 6: Remind key rules

> Rules for storing and updating tokens: `.claude/rules/tokens.md`

```md
✅ Component created. Key rules:

1. authData — only { marker, value }, filter out empty strings
2. notificationData — DO NOT pass phoneSMS (empty string → 400)
3. formIdentifier is taken from provider.formIdentifier, not hardcoded
4. Fields are rendered dynamically from Forms API — do not hardcode <input>
5. After login, save 'refresh-token' in localStorage
6. auth/signUp/generateCode — ONLY directly from Client Component (device fingerprint!)
7. Cross-device sync: polling user.state every 30 seconds, writing through updateUserState Server Action
```
