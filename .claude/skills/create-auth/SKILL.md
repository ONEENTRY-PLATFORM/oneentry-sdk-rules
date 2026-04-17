---
name: create-auth
description: Create authorization/registration form with OneEntry AuthProvider
---

# /create-auth - Create authorization/registration form with OneEntry AuthProvider

---

## Step 1: Get real markers from the API

**DO NOT guess the markers.** First, get the list of providers and forms:

Run `/inspect-api auth-providers` and `/inspect-api forms` — the skill uses the SDK and returns already normalized data.
What to look for in the response:

- `AuthProviders[].identifier` — provider marker (passed to `auth()`, `signUp()`, `logout()`)
- `AuthProviders[].formIdentifier` — registration form marker for this provider
- `Forms[].identifier` — form marker for `getFormByMarker()`

---

## Step 2: Clarify with the user

1. **What modes are needed?** (login / registration / password reset)
1. **Is cart/favorites synchronization needed** after login?
   - If yes — AuthContext reads `user.state` and loads cart/favorites into Redux
   - For cross-device sync: polling `user.state` every N seconds (see below)
1. **Where to show the form?** (modal, separate page, drawer?)
1. **Is there a layout?** — if yes, copy exactly, change only the data

---

## Step 3: Create Server Actions

> **Important:** Call `auth()`, `signUp()`, `generateCode()` **directly from Client Component** (not through Server Action).
> The SDK passes the user's device fingerprint — if called on the server, `deviceInfo.browser` in the fingerprint will be server-side, not the user's real browser.
> Through Server Action — only methods without fingerprint: `getAuthProviders`, `logout`, `logoutAll`.

### app/actions/auth.ts

```typescript
'use server';

import { getApi, isError } from '@/lib/oneentry';

export async function getAuthProviders() {
  const providers = await getApi().AuthProvider.getAuthProviders();
  if (isError(providers)) return { error: providers.message, statusCode: providers.statusCode };
  return (providers as IAuthProvidersEntity[]).map((p) => ({
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

- The form is loaded through Server Action `getFormByMarker(formIdentifier, locale)`
- Fields are rendered **dynamically** from `form.attributes` — do not hardcode fields!
- **🚨 Fields are routed by flags, DO NOT lump everything into `authData`:**
  - `authData` — **only login-credentials**: fields with `isLogin: true` + fields with `isPassword: true`
  - `formData` — profile fields (name, address, phone, etc.) in the form `{ marker, type, value }` — everything that is not a login-credential and not pure-notification
  - `notificationData.email` — value of the field with `isNotificationEmail: true` (fallback: value of the login field)
  - `notificationData.phonePush` — array with the value of the field with `isNotificationPhonePush: true` (skip if empty)
  - `notificationData.phoneSMS` — value of the field with `isNotificationPhoneSMS: true`; **DO NOT pass** if empty (empty string → 400)
  - ⚠️ `isSignUp: true` and `isSignUpRequired: true` — UI registration flags (visibility and necessity), NOT routing — such fields still go into `formData` if they are not `isLogin: true` and not `isPassword: true`
  - ⚠️ Password is determined ONLY by the flag `isPassword: true` and is always routed to `authData`. Do not use `additionalFields.type.value === 'password'` — this is outdated detection
  - ⚠️ `isSignUpRequired` — a standalone indicator of "required at registration", it is not related to `validators.requiredValidator.strict` (the validator checks format/length, not "required for signup")
- **🚨 `isCheckCode: true` → MUST add mode `'verify'` with a field for the code and call `activateUser()`**
- **🔄 In mode `'verify'` — MUST have a "Resend code" button** with a cooldown (`generateCode(marker, email, EVENT_REGISTRATION)`). Cooldown = `config.systemCodeTlsSec` of the provider (default 80 seconds). Starts immediately after `signUp()` and after each resend.
- **⚠️ `eventIdentifier` — DO NOT hardcode!** Get the real event marker from the admin panel (Events section). Extract it into a constant: `const EVENT_REGISTRATION = 'user_registration'` (check in the admin panel!)
- After login, save `accessToken`, `refreshToken`, `authProviderMarker` in localStorage
- After login, call `getUserState` and dispatch `auth-state` event (if synchronization is needed)

### components/AuthForm.tsx

```tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getFormByMarker } from '@/app/actions/forms';
import { logout } from '@/app/actions/auth';
import { getApi, isError } from '@/lib/oneentry';
import type { IFormAttribute } from 'oneentry/dist/forms/formsInterfaces';

// Cooldown between resend code requests (= config.systemCodeTlsSec of the provider)
const RESEND_COOLDOWN_SEC = 80;

// Event markers from OneEntry admin panel (Events section)
// ⚠️ DO NOT guess — check in the admin panel → Events
const EVENT_REGISTRATION = 'user_registration';   // ← check in the admin panel!
const EVENT_PASSWORD_RESET = 'password_reset';     // ← check in the admin panel!

interface AuthFormProps {
  authProviderMarker: string;  // provider marker — get from getAuthProviders()
  formIdentifier: string;      // form marker — from provider.formIdentifier
  isCheckCode: boolean;        // from provider — is code verification needed after registration
  locale?: string;
  onSuccess?: () => void;
}

// 🚨 'verify' — MANDATORY if isCheckCode: true for the provider
type Mode = 'signin' | 'signup' | 'verify' | 'reset';

export function AuthForm({ authProviderMarker, formIdentifier, isCheckCode, locale = 'en_US', onSuccess }: AuthFormProps) {
  const [mode, setMode] = useState<Mode>('signin');
  const [fields, setFields] = useState<IFormAttribute[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [verifyCode, setVerifyCode] = useState('');   // verification code
  const [verifyEmail, setVerifyEmail] = useState(''); // email for activateUser
  const [resendCooldown, setResendCooldown] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [formLoading, setFormLoading] = useState(true);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getFormByMarker(formIdentifier, locale).then((result) => {
      if ('error' in result) { setError(result.error || ''); return; }
      setFields(result.attributes as IFormAttribute[]);
      setFormLoading(false);
    });
  }, [formIdentifier, locale]);

  // 🔄 Cooldown timer for resending code
  const startCooldown = useCallback((seconds: number) => {
    setResendCooldown(seconds);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, []);

  // 🔄 Resend activation code
  const handleResendCode = async () => {
    if (resendCooldown > 0) return;
    setError('');
    // ✅ generateCode — directly from Client Component (fingerprint)
    const result = await getApi().AuthProvider.generateCode(
      authProviderMarker, verifyEmail, EVENT_REGISTRATION,
    );
    if (isError(result)) { setError(String(result.message) || 'Resend failed'); return; }
    setSuccess('Code resent!');
    startCooldown(RESEND_COOLDOWN_SEC);
  };

  // Visible fields depend on the mode
  // ⚠️ isSignUp / isSignUpRequired override isPureNotification for visibility
  // Example: phone_reg (isNotificationPhonePush + isSignUpRequired) MUST be shown in signup
  const visibleFields = (): IFormAttribute[] => {
    if (mode === 'signup') {
      return fields.filter(
        (f) => !isPureNotification(f) || f.isSignUp === true || f.isSignUpRequired === true,
      );
    }
    // signin / reset — only login + password (or only login for reset)
    // Searching by flags, not by marker name
    const loginField = fields.find((f) => f.isLogin === true);
    const passwordField = fields.find((f) => f.isPassword === true);
    if (mode === 'reset') return loginField ? [loginField] : [];
    return [loginField, passwordField].filter(Boolean) as IFormAttribute[];
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
        if (isError(result)) { setError(String(result.message)); return; }

        const authResult = result as IAuthEntity;
        localStorage.setItem('refresh-token', authResult.refreshToken);

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
        } as ISignUpData);
        if (isError(result)) { setError(String(result.message)); return; }

        // 🚨 isCheckCode: true → switch to code verification mode
        if (isCheckCode) {
          setVerifyEmail(getEmail());
          setSuccess('Account created! Enter the verification code sent to your email.');
          startCooldown(RESEND_COOLDOWN_SEC);
          setMode('verify');
        } else {
          setSuccess('Account created!');
          setTimeout(() => { setMode('signin'); setSuccess(''); }, 2000);
        }

      } else if (mode === 'verify') {
        // 🚨 activateUser — call directly (fingerprint = user's browser)
        const result = await getApi().AuthProvider.activateUser(
          authProviderMarker,
          verifyEmail,
          verifyCode,
        );
        if (isError(result)) { setError(String(result.message) || 'Verification failed'); return; }
        setSuccess('Account activated! You can now sign in.');
        setVerifyCode('');
        setTimeout(() => { setMode('signin'); setSuccess(''); }, 2000);

      } else if (mode === 'reset') {
        // ✅ generateCode — also with fingerprint, call directly
        const result = await getApi().AuthProvider.generateCode(authProviderMarker, getEmail(), EVENT_PASSWORD_RESET);
        if (isError(result)) { setError(String(result.message) || 'Reset failed'); return; }
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
        {mode === 'verify' && 'Enter verification code'}
        {mode === 'reset' && 'Reset password'}
      </h2>

      {/* Verify mode — field for code + resend button */}
      {mode === 'verify' ? (
        <div>
          <label htmlFor="verify-code">Verification code</label>
          <input
            id="verify-code"
            type="text"
            inputMode="numeric"
            value={verifyCode}
            onChange={(e) => setVerifyCode(e.target.value)}
            required
          />
          {/* 🔄 Resend code with cooldown */}
          <button
            type="button"
            onClick={handleResendCode}
            disabled={resendCooldown > 0}
          >
            {resendCooldown > 0
              ? `Resend code in ${resendCooldown}s`
              : 'Resend code'}
          </button>
        </div>
      ) : (
        /* Fields — dynamically from Forms API */
        visibleFields().map((field) => {
          // Input type determined by field flags, not by marker name
          const isPassword = field.isPassword === true;
          const isEmail =
            field.isLogin === true ||
            field.isNotificationEmail === true ||
            field.marker.includes('email');
          // Requirement for registration — by isSignUpRequired, not by validator
          const isRequired =
            mode === 'signup'
              ? field.isSignUpRequired === true || field.isLogin === true || isPassword
              : true;
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
                required={isRequired}
              />
            </div>
          );
        })
      )}

      {error && <div role="alert">{error}</div>}
      {success && <div role="status">{success}</div>}

      <button type="submit" disabled={loading}>
        {loading ? 'Loading...' :
          mode === 'signin' ? 'Sign in' :
          mode === 'signup' ? 'Create account' :
          mode === 'verify' ? 'Verify code' :
          'Send code'}
      </button>

      {/* Mode switches */}
      {mode === 'signin' && (
        <>
          <button type="button" onClick={() => setMode('signup')}>Create account</button>
          <button type="button" onClick={() => setMode('reset')}>Forgot password?</button>
        </>
      )}
      {mode !== 'signin' && mode !== 'verify' && (
        <button type="button" onClick={() => setMode('signin')}>Back to sign in</button>
      )}
      {mode === 'verify' && (
        <button type="button" onClick={() => setMode('signup')}>Back to registration</button>
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

If cart/favorites synchronization between devices is needed — AuthContext polls `user.state` on a timer. When data is updated, the Redux store receives the current cart and favorites.

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

> Writing back to the server — through Server Action `updateUserState` when cart/favorites change.
> Pattern: `.claude/rules/tokens.md` → section `updateUserState`.

---

## Step 6: Remind key rules

> Rules for storing and updating tokens: `.claude/rules/tokens.md`

```md
✅ Component created. Key rules:

1. authData — only { marker, value }, filter out empty strings
2. Field routing — by flags: authData = isLogin || isPassword; formData — everything else (profile); notificationData — by isNotification*
3. Password is determined by isPassword: true (NOT by additionalFields.type.value === 'password' — this is an outdated method)
4. Visibility in signup — isSignUp === true || isSignUpRequired === true; required in signup — ONLY isSignUpRequired (validator remains a separate format validator)
5. notificationData — DO NOT pass phoneSMS (empty string → 400)
6. formIdentifier is taken from provider.formIdentifier, not hardcoded
7. Fields are rendered dynamically from Forms API — do not hardcode <input>
8. After login, save 'refresh-token' in localStorage
9. auth/signUp/generateCode/activateUser — ONLY directly from Client Component (device fingerprint!)
10. 🚨 isCheckCode: true → MUST add mode 'verify' with code field + activateUser(marker, email, code)
11. 🔄 In verify mode — MUST have a "Resend code" button with cooldown (generateCode + config.systemCodeTlsSec)
12. ⚠️ eventIdentifier for generateCode/checkCode/changePassword — get from admin panel (Events section), DO NOT hardcode without checking
13. Cross-device sync: polling user.state every 30 seconds, writing through updateUserState Server Action
```

---

## Step 7: Playwright E2E tests

> Runs only if the user confirmed writing tests at the beginning of the session or requested writing a test later (see `feedback_playwright.md`).
> To set up Playwright — first `/setup-playwright`.

### 7.1 Add `data-testid` to the component

For selector stability — add `data-testid` when generating `AuthForm.tsx`:

```tsx
<form data-testid="auth-form" onSubmit={handleSubmit}>
  <h2 data-testid="auth-form-title">...</h2>
  {/* in map by visibleFields: */}
  <input data-testid={`auth-field-${field.marker}`} ... />
  {/* in verify mode: */}
  <input data-testid="auth-verify-code" ... />
  <button data-testid="auth-resend-code" ...>...</button>
  {error && <div data-testid="auth-error" role="alert">{error}</div>}
  {success && <div data-testid="auth-success" role="status">{success}</div>}
  <button data-testid="auth-submit" type="submit">...</button>
  {/* mode switches: */}
  <button data-testid="auth-mode-signup">Create account</button>
  <button data-testid="auth-mode-reset">Forgot password?</button>
  <button data-testid="auth-mode-signin">Back to sign in</button>
</form>
```

### 7.2 Collect test parameters and fill `.env.local`

**Algorithm (execute step by step, do not ask in one list):**

1. **Path to the login page** — ask: "Where is the login form located? (path to the page, e.g., `/login`, `/auth`, or the name of the trigger component that opens the modal)".
   - If the user is silent/does not know → find it yourself through Glob (`app/**/login/**`, `app/**/auth/**`) and/or Grep for `<AuthForm`. Inform: "Found the form at `{path}` — using it. If incorrect, tell me where to open."
2. **Test credentials** (existing user in OneEntry):
   - Ask: "Please provide the email and password of an existing test user for successful login verification. I will skip — the successful signin check will be disabled (`test.skip`), other tests will work."
   - If the user provides values → **add** `E2E_TEST_EMAIL` and `E2E_TEST_PASSWORD` to `.env.local` (through Edit/Write), add these keys to `.gitignore` if the file is not in it.
   - If the user is silent/refuses → leave the variables empty in `.env.local` with a placeholder comment. Inform: "Credentials not set — the test `signin: successful login` will be skipped through `test.skip`. Add values to `.env.local` when there is a test user."
3. **`isCheckCode` of the provider** — check yourself through the already running `/inspect-api auth-providers` from Step 1. If `true` → uncomment the block `test.describe('Account activation')` in `e2e/auth.spec.ts`. Inform the user: "For provider `{marker}` `isCheckCode: true` — enabling the account activation test."

**Example of filling `.env.local` (do it yourself, do not ask the user to copy):**

```bash
# e2e credentials — existing OneEntry user for signin check
E2E_TEST_EMAIL=user@example.com
E2E_TEST_PASSWORD=user-password
```

If values are not provided — leave them empty:

```bash
E2E_TEST_EMAIL=
E2E_TEST_PASSWORD=
```

### 7.3 Create `e2e/auth.spec.ts`

> ⚠️ Tests work with the real OneEntry project — provider and form markers are taken from `/inspect-api`. Replace `/login` with the real path, `TEST_EMAIL`/`TEST_PASSWORD` — with real credentials (through `process.env`, do not hardcode).

```typescript
import { test, expect } from '@playwright/test';

const TEST_EMAIL = process.env.E2E_TEST_EMAIL || '';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || '';
const AUTH_PATH = '/login'; // ← replace with the real path

test.describe('Authorization', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(AUTH_PATH);
    await expect(page.getByTestId('auth-form')).toBeVisible();
  });

  test('form loads fields from Forms API (signin by default)', async ({ page }) => {
    // After getFormByMarker in signin there should be 2 fields: login-credential + password
    const fields = page.locator('[data-testid^="auth-field-"]');
    await expect(fields).toHaveCount(2);
    // One of the inputs should be password
    await expect(page.locator('input[type="password"]')).toHaveCount(1);
  });

  test('signin: empty form — shows browser validation', async ({ page }) => {
    await page.getByTestId('auth-submit').click();
    // required fields do not allow form submission — stay on the page
    await expect(page).toHaveURL(new RegExp(AUTH_PATH));
  });

  test('signin: incorrect data — error from API', async ({ page }) => {
    const fields = page.locator('[data-testid^="auth-field-"]');
    await fields.nth(0).fill('nonexistent@example.com');
    await fields.nth(1).fill('wrong-password-12345');
    await page.getByTestId('auth-submit').click();
    await expect(page.getByTestId('auth-error')).toBeVisible({ timeout: 10_000 });
  });

  test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'E2E_TEST_EMAIL/PASSWORD not set');
  test('signin: successful login saves refresh-token', async ({ page }) => {
    const fields = page.locator('[data-testid^="auth-field-"]');
    await fields.nth(0).fill(TEST_EMAIL);
    await fields.nth(1).fill(TEST_PASSWORD);
    await page.getByTestId('auth-submit').click();

    await expect(page.getByTestId('auth-success')).toBeVisible({ timeout: 10_000 });

    const token = await page.evaluate(() => localStorage.getItem('refresh-token'));
    expect(token).toBeTruthy();
  });

  test('switching signin → signup shows more fields', async ({ page }) => {
    const signinFieldsCount = await page.locator('[data-testid^="auth-field-"]').count();
    await page.getByTestId('auth-mode-signup').click();
    await expect(page.getByTestId('auth-form-title')).toContainText(/create account|регистрац/i);
    const signupFieldsCount = await page.locator('[data-testid^="auth-field-"]').count();
    expect(signupFieldsCount).toBeGreaterThanOrEqual(signinFieldsCount);
  });

  test('switching signin → reset leaves only login field', async ({ page }) => {
    await page.getByTestId('auth-mode-reset').click();
    await expect(page.locator('[data-testid^="auth-field-"]')).toHaveCount(1);
    // In password reset there should be no password
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
  });
});

// ⚠️ Uncomment only if the provider has isCheckCode: true (otherwise there is no verify mode)
// test.describe('Account activation (isCheckCode: true)', () => {
//   test('after signup the code input form appears with resend button', async ({ page }) => {
//     await page.goto(AUTH_PATH);
//     await page.getByTestId('auth-mode-signup').click();
//
//     // Fill all signup fields with random email
//     const fields = page.locator('[data-testid^="auth-field-"]');
//     const count = await fields.count();
//     const rand = Math.random().toString(36).slice(2, 10);
//     for (let i = 0; i < count; i++) {
//       const testId = await fields.nth(i).getAttribute('data-testid');
//       const marker = testId?.replace('auth-field-', '') ?? '';
//       if (marker.includes('email') || marker.includes('login'))
//         await fields.nth(i).fill(`e2e-${rand}@example.com`);
//       else if ((await fields.nth(i).getAttribute('type')) === 'password')
//         await fields.nth(i).fill('Test12345!');
//       else await fields.nth(i).fill(`E2E ${rand}`);
//     }
//     await page.getByTestId('auth-submit').click();
//
//     await expect(page.getByTestId('auth-verify-code')).toBeVisible({ timeout: 10_000 });
//     await expect(page.getByTestId('auth-resend-code')).toBeVisible();
//     // cooldown is immediately active — button disabled
//     await expect(page.getByTestId('auth-resend-code')).toBeDisabled();
//   });
// });
```

### 7.4 Report to the user about the decisions made

Before completing the task — explicitly inform:

```
✅ e2e/auth.spec.ts created
✅ data-testid added to AuthForm
✅ .env.local updated (E2E_TEST_EMAIL / E2E_TEST_PASSWORD)

Decisions made automatically (if applicable):
- Path to the login form: {AUTH_PATH} — {specified by user / found through Glob search in app/**}
- Test credentials: {provided by user / left empty — the successful signin test will be test.skip. Reason: user did not provide a test user}
- isCheckCode: {true → "Account activation" block uncommented / false → block commented}

Run: npm run test:e2e -- auth.spec.ts
```

If credentials are not set — the successful login test is skipped (`test.skip`), other tests work with any configuration.
