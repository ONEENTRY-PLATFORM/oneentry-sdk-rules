---
name: create-profile
description: Create user profile page
---
# User Profile Page

Creates a Client Component with a profile form: fields from the Users API, data update, token handling.

---

## Step 1: Create client utilities for the profile

> If `lib/profile.ts` already exists — read and supplement it, do not duplicate.

```typescript
// lib/profile.ts
import { getApi, isError } from '@/lib/oneentry';
import type { IUserEntity } from 'oneentry/dist/users/usersInterfaces';

// Call from Client Component after reDefine()
export async function getUserProfile(locale: string = 'en_US'): Promise<{
  formIdentifier: string;
  formData: Array<{ marker: string; type: string; value: any }>;
  formAttributes: Array<{
    marker: string;
    type: string;
    localizeInfos: any;
    validators: any;
    position: number;
  }>;
} | { error: string; statusCode?: number }> {
  try {
    const user = (await getApi().Users.getUser()) as IUserEntity;

    let formAttributes: any[] = [];
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
    };
  } catch (err: any) {
    return { error: err.message || 'Failed to load profile', statusCode: err.statusCode };
  }
}

// password fields → authData (only if filled), others → formData
export async function updateUserProfile(
  formData: Array<{ marker: string; type: string; value: string }>,
  authData?: Array<{ marker: string; value: string }> ,
): Promise<{ success: boolean } | { error: string }> {
  try {
    const user = (await getApi().Users.getUser()) as IUserEntity;
    await getApi().Users.updateUser({
      formIdentifier: user.formIdentifier,
      formData,
      ...(authData && authData.length > 0 ? { authData } : {}),
      state: user.state, // save state (cart, favorites)
    });
    return { success: true };
  } catch (err: any) {
    return { error: err.message || 'Failed to update profile' };
  }
}
```

---

## Step 2: Create the profile page component

### Key Principles

- `'use client'` — the page uses `localStorage` and `useParams`
- `useParams()` for `locale` — NOT `params` as a Promise (this is a Client Component!)
- **Token race condition:** on 401 — retry with the current `localStorage.getItem('refreshToken')`,
  log out ONLY on 401/403 after retry
- **Field separation:** fields with `password` in the name → `authData` (only if filled),
  others → `formData`
- **newToken:** after each response update `localStorage.setItem('refreshToken', newToken)`
- Sort fields by `position`

### Determine input type by marker

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

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { reDefine, hasActiveSession } from '@/lib/oneentry';
import { getUserProfile, updateUserProfile } from '@/lib/profile';

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

  // Protection against double execution in React StrictMode (dev)
  const initRef = useRef(false);

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formAttributes, setFormAttributes] = useState<FormAttribute[]>([]);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const init = async () => {
      const refreshToken = localStorage.getItem('refresh-token');
      if (!refreshToken) {
        setIsLoggedIn(false);
        setLoading(false);
        return;
      }
      // ⚠️ Check hasActiveSession before reDefine
      // Without checking — after login reDefine will replace the working instance → 401 → log out
      if (!hasActiveSession()) {
        await reDefine(refreshToken, locale);
      }
      setIsLoggedIn(true);
      loadProfile();
    };
    init();
  }, []);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const result = await getUserProfile(locale);

      if ('error' in result) {
        // Log out ONLY on confirmed auth error
        if (result.statusCode === 401 || result.statusCode === 403) {
          localStorage.removeItem('refresh-token');
          setIsLoggedIn(false);
          window.dispatchEvent(new Event('auth-change'));
        }
        return;
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
        formData,
        authData.length ? authData : undefined,
      );

      if ('error' in result) {
        setError(result.error);
        return;
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
        {/* Show AuthForm in a modal or redirect here */}
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

## Step 3: Recall key rules

> Token handling rules: `.claude/rules/tokens.md`

✅ Profile page created. Key rules:

```md
1. 'use client' + useParams() — NOT a server component with await params
2. getUserProfile and updateUserProfile — client utilities via getApi() after reDefine()
3. Log out ONLY on 401/403
4. password fields → authData (only if filled), others → formData
5. Never do removeItem('refreshToken') on data loading error
```
