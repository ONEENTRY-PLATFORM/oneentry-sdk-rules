# Playwright E2E — OneEntry Rules

Rules for writing E2E tests for Next.js + OneEntry projects. Verified on a live project.

---

## `.env.local` in tests — load manually via `dotenv`

The Playwright runner **does not read** `.env.local` by itself (unlike the Next.js webServer, which starts inside the runner). `process.env.E2E_*` in specs will be `undefined`, all `test.skip(!ENV_VAR, ...)` will always skip tests.

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });  // ← must be before defineConfig

export default defineConfig({ /* ... */ });
```

```bash
npm install -D dotenv
```

**How to check that the variables have been picked up:** running `npx playwright test --reporter=list` will show `◇ injected env (N) from .env.local` from the dotenv-like runtime. If `N=0` — the path is incorrect or the file does not exist.

---

## Authorized tests with one user — serial

OneEntry uses a one-time refresh token (rotation via `saveFunction`). If two workers execute `AuthProvider.auth()` with the same user in parallel — one of them will receive a 401 on the subsequent `Users.getUser()`, and the test will fail due to a timeout on `waitForURL('**/profile')`.

```typescript
test.describe('Profile', () => {
  test.describe('authorized', () => {
    test.describe.configure({ mode: 'serial' });  // ← must be
    test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'E2E_TEST_EMAIL/PASSWORD are not set');

    test.beforeEach(async ({ page }) => {
      // login flow with TEST_EMAIL/TEST_PASSWORD
    });

    test('...', async () => { /* ... */ });
  });
});
```

> ⚠️ `mode: 'serial'` only applies **within the file**. If authorized tests are in different spec files (`auth.spec.ts:signin success` + `profile.spec.ts:authenticated`), they will still run in different workers in parallel. **Do not duplicate login tests between files** — leave one file responsible for the authorized flow.

**An alternative for complex cases** — `storageState` via global project setup, but for simple cases, serial is sufficient.

---

## `notFound()` in Server Component with `force-dynamic` — status 200, not 404

```tsx
// app/products/[id]/page.tsx
export const dynamic = 'force-dynamic';

export default async function Page({ params }) {
  const result = await getProductById(id);
  if ('error' in result) notFound();  // ← renders not-found UI, but HTTP 200
  // ...
}
```

```typescript
// ❌ WILL ALWAYS FAIL — force-dynamic pages return 200
test('non-existent id → 404', async ({ page }) => {
  const response = await page.goto('/products/999999');
  expect(response?.status()).toBe(404);
});

// ✅ CORRECT — check via UI: root testid disappears
test('non-existent id → not-found UI', async ({ page }) => {
  await page.goto('/products/999999');
  await expect(page.getByTestId('product-page')).toHaveCount(0);
  // or by the text of the not-found page, if it is custom:
  // await expect(page.getByRole('heading', { name: /not found/i })).toBeVisible();
});
```

---

## Strict mode violation — copy `getByRole` to the container

Playwright is strict by default: if `page.getByRole('link', { name: /login/i })` finds 2+ elements (in the navbar + in the placeholder) — it will fail with `strict mode violation`.

```typescript
// ❌ INCORRECT — two "Login" links
await expect(page.getByRole('link', { name: /login/i })).toHaveAttribute('href', '/auth');

// ✅ CORRECT — scope the search to the container via data-testid
const placeholder = page.getByTestId('profile-unauthorized');
await expect(placeholder.getByRole('link', { name: /login/i })).toHaveAttribute('href', '/auth');
```

For all root containers (forms, cards, pages) add `data-testid` — this is the only reliable way to scope the search.

---

## `data-testid` — conventions

- **Root container of the feature**: `data-testid="auth-form"`, `data-testid="product-page"`, `data-testid="filter-panel"`
- **Interactive elements inside**: `data-testid="auth-submit"`, `data-testid="filter-apply"`, `data-testid="add-to-cart"`
- **States and placeholders**: `data-testid="auth-error"`, `data-testid="catalog-empty"`, `data-testid="profile-unauthorized"`
- **Dynamic elements** — suffix marker: ``data-testid={`auth-field-${field.marker}`}``, `data-testid="product-card"` + `data-product-id={id}` attribute

Search by prefix: `page.locator('[data-testid^="auth-field-"]')` — all form fields, regardless of the marker.

---

## Timeouts — OneEntry API is slow on first load

Components like `AuthForm` / `ProfilePage` load the form schema via Server Action → `getFormByMarker` → OneEntry REST. On a cold dev server + first fetch = easily 5–20 seconds. Default Playwright timeouts (5s on expect, 30s on test) are insufficient.

**In `playwright.config.ts` — raise defaults centrally:**

```typescript
export default defineConfig({
  timeout: 60_000,                // overall timeout for one test
  expect: { timeout: 15_000 },    // each expect(...) by default
  use: {
    actionTimeout: 15_000,        // click / fill / etc
    navigationTimeout: 30_000,    // goto / waitForURL
  },
  webServer: { timeout: 120_000 }, // Next.js cold start
});
```

**In specific places with network requests — explicitly up to 30s:**

```typescript
// ❌ Fails on cold start — form does not load in time
await expect(page.getByTestId('auth-form')).toBeVisible({ timeout: 15_000 });
const fields = page.locator('[data-testid^="auth-field-"]');
await expect(fields).toHaveCount(2);  // default expect timeout 5s — too little

// ✅ Wait for both the form and the rendering of fields with a generous timeout
await expect(page.getByTestId('auth-form')).toBeVisible({ timeout: 30_000 });
await expect(fields).toHaveCount(2, { timeout: 30_000 });
```

**Typical places where increased timeout is needed:**

- `beforeEach` with `goto` + waiting for the form loaded from the OneEntry server
- Checking `toHaveCount(N)` on dynamic lists (form fields, product cards)
- `waitForURL('**/profile')` after `auth()` — SDK makes several requests (`/auth`, `/refresh`, `/users/me`)
- `getByTestId('auth-error')` after incorrect login — OneEntry may respond with a delay

**Rule of thumb:** if an element appears in response to a network request to OneEntry — set `timeout: 30_000`.

---

## env-driven fixtures with `test.skip`

Tests that depend on project data (real creds, product ids, markers) — via env with fallback to skip:

```typescript
const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? '';
const PRODUCT_ID = process.env.E2E_PRODUCT_ID ?? '14';  // fallback to known id

test.describe('Profile', () => {
  test.skip(!TEST_EMAIL, 'E2E_TEST_EMAIL is not set');
  // tests requiring a real user
});
```

> `test.skip(condition, reason)` at the describe level skips ALL tests in the describe when `condition=true`. Inside a single test — use `test.skip(!COND, ...)` in the test body before any actions.

---

## 🚨 Cleanup test data in OneEntry — DO NOT leave garbage in the project

OneEntry is not a disposable database; all entities created in tests (users, orders, reviews) remain in the client's real project. E2E must clean up after themselves.

### Users — unactivated cannot be deleted programmatically

After `AuthProvider.signUp()` with a provider that has `isCheckCode: true`, the account is created but **not activated** (`isActive: false`). SDK limitations (verified empirically):

- `Users.deleteUser()` goes to `/me/account`, `Users.archiveUser()` to `/me` — both require **user authorization**
- `AuthProvider.auth()` with an unactivated user returns **HTTP 401 `"User is not activated"`** — cannot log in, cannot obtain access token
- `ISignUpEntity` (response from `signUp()`) **does not contain** `accessToken`/`refreshToken` — only `{ id, identifier, isActive: false, ... }`
- In the SDK Users API, there is no `deleteUserById(id)` / admin-endpoint — only `/me`, `/me/account`, `/me/fcm-token`
- In the SDK Admins API — only reading the list of admins, no user deletion

**Conclusion: if the test did `signUp()` under a provider with `isCheckCode: true` — the user remains in the project forever, delete manually via the OneEntry admin panel.**

### Main rule: use an existing active user, DO NOT create new ones

For all tests that require authorization (profile, orders, favorites on the server, subscriptions), **log in with an existing active user** from `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD`. Do not create new ones via signUp for the test — they remain in the project.

```typescript
// ✅ Correct — active user from env, no signUp
test.beforeEach(async ({ page }) => {
  await page.goto('/auth');
  const fields = page.locator('[data-testid^="auth-field-"]');
  await fields.nth(0).fill(process.env.E2E_TEST_EMAIL!);
  await fields.nth(1).fill(process.env.E2E_TEST_PASSWORD!);
  await page.getByTestId('auth-submit').click();
  await page.waitForURL('**/profile');
});
```

This user is **part of the test infrastructure**, not garbage. They live in the project permanently and are reused.

### Rules for signup tests

1. **By default, signup tests SHOULD NOT submit the form** — only check the UI (mode switch, field set, validation). Example of an acceptable test:

   ```typescript
   test('switching signin → signup shows more fields', async ({ page }) => {
     // ⚠️ WITHOUT submit — only mode switch
     await page.getByTestId('auth-mode-signup').click();
     const fields = page.locator('[data-testid^="auth-field-"]');
     await expect(fields).toHaveCount(4);
   });
   ```

2. **Full signup flow is allowed only when `isCheckCode: false`** (provider does not require activation) — then you can immediately signin and `deleteUser()`:

   ```typescript
   test.afterEach(async () => {
     if (testUserEmail) {
       await cleanupTestUser({ email: testUserEmail, password: testUserPassword });
     }
   });
   ```

3. **When `isCheckCode: true`** — run the signup flow **only if there is a mock SMTP / test email service** + the activation code is automatically extracted (for example, via API mail-catcher). Without automatic activation — `test.skip` with the explanation "cannot clean up after activation".

4. **Test emails** — always with a random suffix to avoid overlapping with real users: `e2e-${Date.now()}-${Math.random().toString(36).slice(2,8)}@example.test`

### Helper `cleanupTestUser`

```typescript
// e2e/helpers/cleanupTestUser.ts
import { defineOneEntry } from 'oneentry';

export async function cleanupTestUser({
  email,
  password,
  providerMarker = 'email',
}: {
  email: string;
  password: string;
  providerMarker?: string;
}): Promise<{ ok: true } | { ok: false; step: 'login' | 'delete'; message: string }> {
  const api = defineOneEntry(process.env.NEXT_PUBLIC_ONEENTRY_URL!, {
    token: process.env.NEXT_PUBLIC_ONEENTRY_TOKEN!,
  });

  const authResult = await api.AuthProvider.auth(providerMarker, {
    authData: [
      { marker: 'email_reg', value: email },
      { marker: 'password_reg', value: password },
    ],
  });
  if ('statusCode' in authResult && (authResult.statusCode ?? 0) >= 400) {
    return { ok: false, step: 'login', message: String(authResult.message) };
  }

  const deleteResult = await api.Users.deleteUser();
  if (typeof deleteResult === 'object' && 'statusCode' in deleteResult && (deleteResult.statusCode ?? 0) >= 400) {
    return { ok: false, step: 'delete', message: String(deleteResult.message) };
  }
  return { ok: true };
}
```

**Used like this:**

```typescript
import { cleanupTestUser } from './helpers/cleanupTestUser';

test.describe('Registration (only isCheckCode: false provider)', () => {
  const testEmail = `e2e-${Date.now()}@example.test`;
  const testPassword = 'Test12345!';
  let created = false;

  test.afterAll(async () => {
    if (!created) return;
    const result = await cleanupTestUser({ email: testEmail, password: testPassword });
    if (!result.ok) console.warn(`Cleanup failed at ${result.step}: ${result.message}`);
  });

  test('full signup flow', async ({ page }) => {
    // ... fill + submit
    created = true;
    // ... assertions
  });
});
```

### Other entities

- **Orders** (`Orders.createOrder`): do NOT perform the full flow in E2E — leaves a record in the admin panel, no programmatic deletion. Check before `createOrder`: rendering the form, validation, amount calculation, presence of payment selection.
- **Reviews** (`FormData.postFormsData` for the review form): moderated in the admin panel. If you send — leave it as a documented trade-off or use a dedicated "e2e-review-form" with auto-reject.
- **Favorites / cart in user.state**: cleaned up via `Users.updateUser({ state: {} })` — safely.

---

## Running

```bash
npm run test:e2e              # headless
npm run test:e2e:ui           # interactive
npx playwright test foo.spec  # one file
npx playwright test --workers=1  # sequentially (debug parallel conflicts)
npx playwright test --grep "signin"  # by name
```

After a failure — `npm run test:e2e:report` will open an HTML report with traces, screenshots, and videos.
