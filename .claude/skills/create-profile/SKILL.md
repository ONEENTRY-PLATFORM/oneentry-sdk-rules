---
name: create-profile
description: Create user profile page
---
# User Profile Page

Creates a Client Component with a profile form: fields from the Users API, data update, token handling.

---

## Step 1: Create client utilities for the profile

> If `lib/profile.ts` already exists — read and supplement, do not duplicate.

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
  authData?: Array<{ marker: string; value: string }>,
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
- `useParams()` for `locale` — NOT `params` as Promise (this is a Client Component!)
- **Token race condition:** on 401 — retry with the current `localStorage.getItem('refreshToken')`,
  log out ONLY on 401/403 after retry
- **Field separation:** fields with `isPassword: true` → `authData` (only if filled),
  others → `formData`. Do not rely on the marker name — use the flag
- **newToken:** after each response update `localStorage.setItem('refreshToken', newToken)`
- Sort fields by `position`

### Input Type Definition

The type `password` — by the flag `isPassword`. For email/phone — by the flags `isLogin` / `isNotificationEmail` / `isNotificationPhoneSMS` / `isNotificationPhonePush`; the marker name is the last fallback.

```typescript
type FieldFlags = {
  isPassword?: boolean | null;
  isLogin?: boolean | null;
  isNotificationEmail?: boolean | null;
  isNotificationPhoneSMS?: boolean | null;
  isNotificationPhonePush?: boolean | null;
};

function getInputType(attr: FieldFlags & { marker: string }): string {
  if (attr.isPassword === true) return 'password';
  if (attr.isNotificationEmail === true || attr.isLogin === true) return 'email';
  if (attr.isNotificationPhoneSMS === true || attr.isNotificationPhonePush === true) return 'tel';
  // Last fallback — by marker name
  const m = attr.marker.toLowerCase();
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
import type { IFormAttribute } from 'oneentry/dist/forms/formsInterfaces';

export default function ProfilePage() {
  const params = useParams();
  const locale = (params.locale as string) || 'en_US';

  // Protection against double execution in React StrictMode (dev)
  const initRef = useRef(false);

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formAttributes, setFormAttributes] = useState<IFormAttribute[]>([]);
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

        if (attr.isPassword === true) {
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
      // Clear password fields after saving (by isPassword flag, not by marker name)
      setFormValues((prev) => {
        const next = { ...prev };
        for (const attr of formAttributes) {
          if (attr.isPassword === true) {
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
          const inputType = getInputType(attr);
          const label = attr.localizeInfos?.title || attr.marker;
          const isPassword = attr.isPassword === true;

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

function getInputType(attr: IFormAttribute): string {
  if (attr.isPassword === true) return 'password';
  if (attr.isNotificationEmail === true || attr.isLogin === true) return 'email';
  if (attr.isNotificationPhoneSMS === true || attr.isNotificationPhonePush === true) return 'tel';
  const m = attr.marker.toLowerCase();
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
4. Fields with isPassword: true → authData (only if filled), others → formData (do not rely on marker name)
5. Never do removeItem('refreshToken') on data loading error
```

---

## Step 4: Playwright E2E tests

> Runs only if the user confirmed writing tests at the beginning of the session or requested writing a test later (see `feedback_playwright.md`).
> For Playwright setup — first `/setup-playwright`.

### 4.1 Add `data-testid` to the component

For selector stability — add `data-testid` when generating the profile page:

```tsx
// Loading / unauthorized / form states
if (loading) return <div data-testid="profile-loading">Loading...</div>;

if (!isLoggedIn) {
  return (
    <div data-testid="profile-unauthorized">
      <p>Please log in to view your profile</p>
    </div>
  );
}

return (
  <form data-testid="profile-form" onSubmit={handleSubmit}>
    {[...formAttributes].sort(...).map((attr) => (
      <div key={attr.marker}>
        <label htmlFor={attr.marker}>...</label>
        <input
          data-testid={`profile-field-${attr.marker}`}
          id={attr.marker}
          type={inputType}
          value={formValues[attr.marker] ?? ''}
          onChange={...}
        />
      </div>
    ))}

    {error && <div data-testid="profile-error" role="alert">{error}</div>}
    {success && <div data-testid="profile-success" role="status">{success}</div>}

    <button data-testid="profile-submit" type="submit" disabled={saving}>
      {saving ? 'Saving...' : 'Save'}
    </button>
  </form>
);
```

### 4.2 Gather test parameters and fill `.env.local`

**Algorithm (execute step by step, do not ask in one list):**

1. **Profile page path** — ask: "Where is the profile page located? (e.g., `/profile`, `/account`, `/en_US/profile`)".
   - Silent → find it yourself via Glob (`app/**/profile/**/page.tsx`, `app/**/account/**/page.tsx`). Inform: "Found the profile page at `{path}` — using it. If incorrect, please provide the actual path."
2. **Login page path** (needed for redirect check) — ask if not mentioned. Silent → find it yourself via Glob (`app/**/login/**`, `app/**/auth/**`). Inform the solution.
3. **Test credentials** (existing authorized OneEntry user) — **mandatory for most profile tests**:
   - Ask: "Please provide the email and password of an existing test user — the checks for loading and editing the profile will be performed on it. If skipped — only the test 'unauthorized user shows placeholder' will work."
   - If the user provides values → **add** `E2E_TEST_EMAIL` and `E2E_TEST_PASSWORD` to `.env.local` (via Edit/Write). If `.env.local` is not in `.gitignore` — add it yourself.
   - If the user is silent/refuses → leave the variables empty. Inform: "Credentials not set — profile editing tests will be `test.skip`. Add values to `.env.local` when there is a test user."
4. **Field marker for editing** — choose yourself: take the first non-password attribute from `user.formIdentifier` of the form via the already running `/inspect-api forms` (e.g., `name`, `first_name`). Inform: "Using field `{marker}` for the editing test — the first non-password field of the profile form."

**Example `.env.local`:**

```bash
# e2e credentials — existing OneEntry user for profile tests
E2E_TEST_EMAIL=user@example.com
E2E_TEST_PASSWORD=user-password
E2E_PROFILE_PATH=/profile
E2E_LOGIN_PATH=/login
E2E_PROFILE_EDIT_FIELD=name
```

### 4.3 Create `e2e/profile.spec.ts`

> ⚠️ Tests work with the real OneEntry project. For authorized tests, the helper `signIn()` is used, which fills the AuthForm with real credentials and waits for the `refresh-token` to be saved.

```typescript
import { test, expect, Page } from '@playwright/test';

const TEST_EMAIL = process.env.E2E_TEST_EMAIL || '';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || '';
const PROFILE_PATH = process.env.E2E_PROFILE_PATH || '/profile';
const LOGIN_PATH = process.env.E2E_LOGIN_PATH || '/login';
const EDIT_FIELD = process.env.E2E_PROFILE_EDIT_FIELD || 'name';

// Helper — logs in through AuthForm (uses data-testid from /create-auth)
async function signIn(page: Page) {
  await page.goto(LOGIN_PATH);
  const fields = page.locator('[data-testid^="auth-field-"]');
  await fields.first().waitFor();
  await fields.nth(0).fill(TEST_EMAIL);
  await fields.nth(1).fill(TEST_PASSWORD);
  await page.getByTestId('auth-submit').click();
  await expect.poll(async () => page.evaluate(() => localStorage.getItem('refresh-token')), {
    timeout: 10_000,
  }).toBeTruthy();
}

test.describe('Profile Page', () => {
  test('unauthorized user sees placeholder', async ({ page }) => {
    // Clear possible refresh-token before transition
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('refresh-token'));

    await page.goto(PROFILE_PATH);
    await expect(page.getByTestId('profile-unauthorized')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('profile-form')).not.toBeVisible();
  });

  test.describe('Authorized user', () => {
    test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'E2E_TEST_EMAIL/PASSWORD not set');

    test.beforeEach(async ({ page }) => {
      await signIn(page);
    });

    test('profile form loads and shows fields', async ({ page }) => {
      await page.goto(PROFILE_PATH);
      await expect(page.getByTestId('profile-form')).toBeVisible({ timeout: 10_000 });
      const fields = page.locator('[data-testid^="profile-field-"]');
      expect(await fields.count()).toBeGreaterThan(0);
    });

    test(`editing field "${EDIT_FIELD}" is saved`, async ({ page }) => {
      await page.goto(PROFILE_PATH);
      const field = page.getByTestId(`profile-field-${EDIT_FIELD}`);
      await field.waitFor({ timeout: 10_000 });

      const newValue = `E2E ${Date.now()}`;
      await field.fill(newValue);
      await page.getByTestId('profile-submit').click();

      await expect(page.getByTestId('profile-success')).toBeVisible({ timeout: 10_000 });

      // Reload the page — the value should be saved on the server
      await page.reload();
      await expect(page.getByTestId(`profile-field-${EDIT_FIELD}`)).toHaveValue(newValue, {
        timeout: 10_000,
      });
    });

    test('isPassword fields — empty string is not sent (do not break the account)', async ({ page }) => {
      await page.goto(PROFILE_PATH);
      await page.getByTestId('profile-form').waitFor();

      const passwordInputs = page.locator('input[type="password"][data-testid^="profile-field-"]');
      const pwCount = await passwordInputs.count();
      test.skip(pwCount === 0, 'There are no password fields in the profile form');

      // Do not touch password, save — there should be no error
      await page.getByTestId('profile-submit').click();
      await expect(page.getByTestId('profile-success')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId('profile-error')).not.toBeVisible();
    });
  });
});
```

### 4.4 Report to the user about the decisions made

Before completing the task — explicitly inform:

```
✅ e2e/profile.spec.ts created
✅ data-testid added to ProfilePage
✅ .env.local updated (E2E_PROFILE_PATH, E2E_LOGIN_PATH, E2E_PROFILE_EDIT_FIELD, E2E_TEST_EMAIL/PASSWORD)

Decisions made automatically:
- Profile path: {PROFILE_PATH} — {provided by user / found via Glob in app/**/profile/**}
- Login path: {LOGIN_PATH} — {provided by user / found via Glob}
- Field for editing test: {EDIT_FIELD} — first non-password field of the profile form (from /inspect-api forms)
- Test credentials: {provided by user / left empty — the "Authorized user" block will be test.skip. Reason: user did not provide a test user}

Run: npm run test:e2e -- profile.spec.ts
```

If credentials are not set — editing tests will be skipped (`test.skip`), leaving only the unauthorized user redirect test.
