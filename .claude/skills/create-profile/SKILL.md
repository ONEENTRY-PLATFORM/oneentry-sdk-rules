<!-- META
type: skill
skillConfig: {"name":"create-profile"}
-->

# User Profile Page

Creates a Client Component with a profile form: fields from Users API, data update, token handling.

---

## Step 1: Create Server Actions

> If `app/actions/users.ts` already exists — read it and extend, do not duplicate.

```typescript
// app/actions/users.ts
'use server';

import { defineOneEntry } from 'oneentry';
import type { IUserEntity } from 'oneentry/dist/users/usersInterfaces';
import { getApi, isError } from '@/lib/oneentry';

const PROJECT_URL = process.env.NEXT_PUBLIC_ONEENTRY_URL as string;
const APP_TOKEN = process.env.NEXT_PUBLIC_ONEENTRY_TOKEN as string;

/**
 * IMPORTANT: each makeUserApi call consumes refreshToken via /refresh.
 * Never call makeUserApi twice with the same token — combine all calls
 * into a single instance.
 */
function makeUserApi(refreshToken: string) {
  let capturedToken = refreshToken;
  const api = defineOneEntry(PROJECT_URL, {
    token: APP_TOKEN,
    auth: {
      refreshToken,
      saveFunction: async (token: string) => { capturedToken = token; },
    },
    errors: { isShell: false },
  });
  return { api, getNewToken: () => capturedToken };
}

/**
 * Loads profile and form in ONE /refresh call.
 * Returns newToken — the client must update localStorage.
 */
export async function getUserProfile(
  refreshToken: string,
  locale: string = 'en_US',
): Promise<{
  formIdentifier: string;
  formData: Array<{ marker: string; type: string; value: any }>;
  formAttributes: Array<{
    marker: string;
    type: string;
    localizeInfos: any;
    validators: any;
    position: number;
  }>;
  newToken: string;
} | { error: string; statusCode?: number }> {
  const { api, getNewToken } = makeUserApi(refreshToken);
  try {
    const user = (await api.Users.getUser()) as IUserEntity;

    let formAttributes: any[] = [];
    // Registration form structure — profile fields (optional)
    const form = await getApi().Forms.getFormByMarker(user.formIdentifier, locale);
    if (!isError(form)) {
      const attrs = Array.isArray((form as any).attributes)
        ? (form as any).attributes
        : Object.values((form as any).attributes || {});
      formAttributes = (attrs as any[]).map((attr: any) => ({
        marker: attr.marker,
        type: attr.type,
        localizeInfos: attr.localizeInfos,
        validators: attr.validators,
        position: attr.position,
      }));
    }

    return {
      formIdentifier: user.formIdentifier,
      formData: (user.formData || []) as any[],
      formAttributes,
      newToken: getNewToken(),
    };
  } catch (err: any) {
    return { error: err.message || 'Failed to load profile', statusCode: err.statusCode };
  }
}

/**
 * Updates profile. ONE /refresh: getUser + updateUser in one instance.
 * password fields → authData (only if filled)
 * other fields → formData
 */
export async function updateUserProfile(
  refreshToken: string,
  formData: Array<{ marker: string; type: string; value: string }>,
  authData?: Array<{ marker: string; value: string }>,
): Promise<{ success: boolean; newToken: string } | { error: string }> {
  const { api, getNewToken } = makeUserApi(refreshToken);
  try {
    const user = (await api.Users.getUser()) as IUserEntity;
    await api.Users.updateUser({
      formIdentifier: user.formIdentifier,
      formData,
      ...(authData && authData.length > 0 ? { authData } : {}),
      state: user.state, // preserve state (cart, favorites)
    });
    return { success: true, newToken: getNewToken() };
  } catch (err: any) {
    return { error: err.message || 'Failed to update profile' };
  }
}
```

---

## Step 2: Create the profile page component

### Key principles

- `'use client'` — the page uses `localStorage` and `useParams`
- `useParams()` for `locale` — NOT `params` as a Promise (this is a Client Component!)
- **Token race condition:** on 401 — retry with the current `localStorage.getItem('refreshToken')`,
  log out ONLY on 401/403 after retry
- **Field separation:** fields with `password` in the name → `authData` (only if filled),
  others → `formData`
- **newToken:** update `localStorage.setItem('refreshToken', newToken)` after every response
- Sort fields by `position`

### Determining input type by marker

```typescript
function getInputType(marker: string): string {
  const m = marker.toLowerCase();
  if (m.includes('password')) return 'password';
  if (m.includes('email') || m.includes('login')) return 'email';
  if (m.includes('phone')) return 'tel';
  return 'text';
}
```

### app/[locale]/(account)/profile/page.tsx

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getUserProfile, updateUserProfile } from '@/app/actions/users';

type FormAttribute = {
  marker: string;
  type: string;
  localizeInfos: any;
  validators: any;
  position: number;
};

export default function ProfilePage() {
  const params = useParams();
  const locale = (params.locale as string) || 'en_US';

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formAttributes, setFormAttributes] = useState<FormAttribute[]>([]);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      setIsLoggedIn(false);
      setLoading(false);
      return;
    }
    setIsLoggedIn(true);
    loadProfile(refreshToken);
  }, []);

  const loadProfile = async (token: string) => {
    setLoading(true);
    try {
      let result = await getUserProfile(token, locale);

      // Race condition: another operation may have already updated the token
      if ('error' in result && result.statusCode === 401) {
        const currentToken = localStorage.getItem('refreshToken');
        if (currentToken && currentToken !== token) {
          result = await getUserProfile(currentToken, locale);
        }
      }

      if ('error' in result) {
        // Log out ONLY on confirmed auth error
        if (result.statusCode === 401 || result.statusCode === 403) {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          setIsLoggedIn(false);
          window.dispatchEvent(new Event('auth-change'));
        }
        return;
      }

      if (result.newToken) {
        localStorage.setItem('refreshToken', result.newToken);
      }

      setFormAttributes(result.formAttributes);

      const values: Record<string, string> = {};
      for (const field of result.formData) {
        values[field.marker] = String(field.value ?? '');
      }
      setFormValues(values);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const formData: Array<{ marker: string; type: string; value: string }> = [];
      const authData: Array<{ marker: string; value: string }> = [];

      for (const attr of formAttributes) {
        const value = formValues[attr.marker] ?? '';
        const isPasswordField = attr.marker.toLowerCase().includes('password');

        if (isPasswordField) {
          // Password — only if filled
          if (value.trim()) {
            authData.push({ marker: attr.marker, value });
          }
        } else {
          formData.push({ marker: attr.marker, type: attr.type, value });
        }
      }

      const result = await updateUserProfile(
        refreshToken,
        formData,
        authData.length ? authData : undefined,
      );

      if ('error' in result) {
        setError(result.error);
        return;
      }

      if (result.newToken) {
        localStorage.setItem('refreshToken', result.newToken);
      }

      setSuccess('Profile updated successfully');
      // Clear password fields after saving
      setFormValues((prev) => {
        const next = { ...prev };
        for (const attr of formAttributes) {
          if (attr.marker.toLowerCase().includes('password')) {
            next[attr.marker] = '';
          }
        }
        return next;
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div>Loading...</div>;

  if (!isLoggedIn) {
    return (
      <div>
        <p>Please log in to view your profile</p>
        {/* Show AuthForm in modal or redirect here */}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      {[...formAttributes]
        .sort((a, b) => a.position - b.position)
        .map((attr) => {
          const inputType = getInputType(attr.marker);
          const label = attr.localizeInfos?.title || attr.marker;
          const isPassword = inputType === 'password';

          return (
            <div key={attr.marker}>
              <label htmlFor={attr.marker}>
                {label}
                {isPassword && ' (leave blank to keep)'}
              </label>
              <input
                id={attr.marker}
                type={inputType}
                value={formValues[attr.marker] ?? ''}
                onChange={(e) =>
                  setFormValues((prev) => ({ ...prev, [attr.marker]: e.target.value }))
                }
                autoComplete={isPassword ? 'new-password' : attr.marker}
              />
            </div>
          );
        })}

      {error && <div role="alert">{error}</div>}
      {success && <div role="status">{success}</div>}

      <button type="submit" disabled={saving}>
        {saving ? 'Saving...' : 'Save'}
      </button>
    </form>
  );
}

function getInputType(marker: string): string {
  const m = marker.toLowerCase();
  if (m.includes('password')) return 'password';
  if (m.includes('email') || m.includes('login')) return 'email';
  if (m.includes('phone')) return 'tel';
  return 'text';
}
```

---

## Step 3: Reminder — key rules

> Token rules (makeUserApi, getNewToken, race condition): `.claude/rules/tokens.md`

✅ Profile page created. Key rules:

```md
1. 'use client' + useParams() — NOT a server component with await params
2. getUserProfile and updateUserProfile — Server Actions via makeUserApi
3. ONE makeUserApi per function — all calls through one instance
4. Retry on 401 with current localStorage.getItem('refreshToken')
5. Log out ONLY on 401/403 after retry
6. password fields → authData (only if filled), others → formData
7. Always update localStorage.setItem('refreshToken', result.newToken)
8. Never do removeItem('refreshToken') on data loading error
```
